/**
 * Single-shot exam creation: POST /api/exams/create-complete (and /api/tools/create_complete_exam).
 * Spec: docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md
 *
 * The UI sends { examParams, questions } in one request. The server validates everything,
 * then writes the exam atomically (all or nothing):
 *   master_exams/{examId}                       exam metadata (+ draftHash)
 *   master_exams/{examId}/draft_questions/{qId} full questions (so audit / Review Gate still work)
 *   exam_questions/{examId}                     { questions: [...] } WITHOUT answers (student route reads this)
 *   answerKey/{examId}                          { keys: { [qId]: answer + explanation } } teacher/server only
 */
import * as crypto from 'crypto';
import { z } from 'zod';
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import { checkMcq } from '../../prompts/question-checks.js';
import type { IExam, IExamQuestion, IExplanation, IQuestionContent } from '../../types/index.js';
import { sha256Canonical, stripForStudent } from '../../utils/security.js';
import { resolveTeacherContext } from './examTools.js';

export const IST_OFFSET = '+05:30';
const REQUESTS_COLLECTION = 'exam_create_requests';

// ---------------------------------------------------------------------------
// Request schema (shape only; business rules are checked in validateCompleteExam)
// ---------------------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const OptionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string(),
  imageUrl: z.string().optional(),
});

const LocalizedSchema = z.object({
  text: z.string(),
  options: z.array(OptionSchema).optional(),
  explanation: z.string().optional(),
  audioUrl: z.string().optional(),
});

const QuestionSchema = z.object({
  id: z.string().trim().min(1).optional(),
  type: z.enum(['MCQ', 'Numeric', 'Short Text', 'Subjective']).default('MCQ'),
  marks: z.number().optional(),
  negativeMarks: z.number().optional(),
  subject: z.string().optional(),
  topic: z.string(),
  subtopic: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  classLevel: z.string().optional(),
  examPattern: z.string().optional(),
  en: LocalizedSchema,
  hi: LocalizedSchema.optional(),
  correctOptionId: z.string().optional(),
  answer: z.union([z.string(), z.number()]).optional(),
  explanation: z.string().optional(),
});

const ExamParamsSchema = z.object({
  title: z.string(),
  batchId: z.string(),
  subject: z.string(),
  duration: z.number().default(45),
  targetQuestions: z.number().optional(),
  defaultMarks: z.number().default(4),
  defaultNegativeMarks: z.number().default(1),
  negativeRule: z.enum(['none', '1/4', '1/3', '1/2', 'full', 'custom']).default('1/4'),
  date: z.string().optional(),
  startTime: z.string().default('10:00'),
  endTime: z.string().optional(),
  languages: z.array(z.string()).default(['en']),
  primaryLanguage: z.string().default('en'),
  classLevel: z.string().default('Class 12'),
  examPattern: z.string().default('NEET'),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  isSubjective: z.boolean().default(false),
  status: z.enum(['draft', 'upcoming']).default('draft'),
});

export const CreateCompleteExamSchema = z.object({
  examParams: ExamParamsSchema,
  questions: z.array(QuestionSchema),
});

export type CreateCompleteExamRequest = z.input<typeof CreateCompleteExamSchema>;

export interface ValidationDetail {
  field: string;
  issue: string;
}

export interface ValidatedExam {
  params: z.output<typeof ExamParamsSchema> & { date: string; endTime: string; targetQuestions: number };
  questions: IExamQuestion[];
  startTimestampMs: number;
  endTimestampMs: number;
  totalMarks: number;
}

export type ValidationResult = { ok: true; value: ValidatedExam } | { ok: false; message: string; details: ValidationDetail[] };

// ---------------------------------------------------------------------------
// Validation (pure: no Firestore, unit-tested)
// ---------------------------------------------------------------------------

/** Validates the payload against the guide's rules and normalises it into stored questions. */
export function validateCompleteExam(body: unknown, now: Date = new Date()): ValidationResult {
  const parsed = CreateCompleteExamSchema.safeParse(body);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', issue: i.message }));
    return { ok: false, message: `Invalid request: ${details[0]?.field} ${details[0]?.issue}`, details };
  }

  const { examParams: p, questions: rawQuestions } = parsed.data;
  const details: ValidationDetail[] = [];
  const fail = (field: string, issue: string) => details.push({ field, issue });

  // --- examParams -----------------------------------------------------------
  const title = p.title.trim();
  if (title.length < 5 || title.length > 120) fail('examParams.title', 'title must be 5–120 characters');
  if (!p.batchId.trim()) fail('examParams.batchId', 'batchId is required');
  if (!p.subject.trim()) fail('examParams.subject', 'subject is required');
  if (!Number.isInteger(p.duration) || p.duration < 5 || p.duration > 360) {
    fail('examParams.duration', 'duration must be an integer between 5 and 360 minutes');
  }
  if (p.defaultMarks < 1 || p.defaultMarks > 20) fail('examParams.defaultMarks', 'defaultMarks must be 1–20');
  if (p.defaultNegativeMarks < 0 || p.defaultNegativeMarks > p.defaultMarks) {
    fail('examParams.defaultNegativeMarks', 'defaultNegativeMarks must be between 0 and defaultMarks');
  }
  if (rawQuestions.length === 0) fail('questions', 'at least one question is required');
  if (rawQuestions.length > 200) fail('questions', 'at most 200 questions are allowed');
  const targetQuestions = p.targetQuestions ?? rawQuestions.length;
  if (targetQuestions !== rawQuestions.length) {
    fail('examParams.targetQuestions', `targetQuestions (${targetQuestions}) must equal questions.length (${rawQuestions.length})`);
  }
  if (p.languages.length === 0) fail('examParams.languages', 'at least one language is required');
  if (!p.languages.includes(p.primaryLanguage)) fail('examParams.primaryLanguage', 'primaryLanguage must be one of languages');

  // --- schedule (Asia/Kolkata) -------------------------------------------------
  const date = p.date ?? istDateString(now);
  let startTimestampMs = NaN;
  let endTimestampMs = NaN;
  let endTime = p.endTime ?? '';
  if (!YMD.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00${IST_OFFSET}`)) || !isRealDate(date)) {
    fail('examParams.date', 'date must be a real date in YYYY-MM-DD format');
  } else if (!HHMM.test(p.startTime)) {
    fail('examParams.startTime', 'startTime must be HH:mm (24-hour)');
  } else {
    startTimestampMs = Date.parse(`${date}T${p.startTime}:00${IST_OFFSET}`);
    if (p.endTime === undefined) {
      endTimestampMs = startTimestampMs + p.duration * 60_000;
      endTime = istTimeString(new Date(endTimestampMs));
      if (istDateString(new Date(endTimestampMs)) !== date) fail('examParams.endTime', 'exam must end on the same day');
    } else if (!HHMM.test(p.endTime)) {
      fail('examParams.endTime', 'endTime must be HH:mm (24-hour)');
    } else {
      endTimestampMs = Date.parse(`${date}T${p.endTime}:00${IST_OFFSET}`);
      if (endTimestampMs <= startTimestampMs) fail('examParams.endTime', 'endTime must be after startTime');
      else if (endTimestampMs - startTimestampMs < p.duration * 60_000) {
        fail('examParams.endTime', `the window (startTime–endTime) must be at least the duration (${p.duration} min)`);
      }
    }
  }

  // --- questions --------------------------------------------------------------
  const seenIds = new Set<string>();
  const questions: IExamQuestion[] = rawQuestions.map((q, i) => {
    const at = `questions[${i}]`;
    const marks = q.marks ?? p.defaultMarks;
    const negativeMarks = q.negativeMarks ?? p.defaultNegativeMarks;
    const id = q.id ?? `q-${String(i + 1).padStart(2, '0')}`;

    if (seenIds.has(id)) fail(`${at}.id`, `duplicate question id "${id}"`);
    seenIds.add(id);
    if (!Number.isInteger(marks) || marks < 1 || marks > 20) fail(`${at}.marks`, 'marks must be an integer between 1 and 20');
    if (negativeMarks < 0 || negativeMarks > marks) {
      fail(`${at}.negativeMarks`, `negativeMarks (${negativeMarks}) must be between 0 and marks (${marks})`);
    }
    if (!q.topic.trim()) fail(`${at}.topic`, 'topic is required');
    if (!q.en.text.trim()) fail(`${at}.en.text`, 'question text is required');

    let warnings: string[] = [];
    if (q.type === 'MCQ') {
      const options = q.en.options ?? [];
      if (!q.correctOptionId) fail(`${at}.correctOptionId`, 'correctOptionId is required for MCQ');
      const check = checkMcq(
        { stem: q.en.text, options, ...(q.correctOptionId && { correctOptionId: q.correctOptionId }), explanation: q.explanation ?? q.en.explanation ?? '' },
        { requireKey: Boolean(q.correctOptionId) },
      );
      for (const f of check.fatal) {
        if (f === 'EMPTY_STEM') continue; // already reported above
        fail(f === 'CORRECT_OPTION_NOT_IN_OPTIONS' ? `${at}.correctOptionId` : `${at}.en.options`, mcqIssue(f));
      }
      warnings = check.warnings;
    } else if (q.type === 'Numeric' || q.type === 'Short Text') {
      if (q.answer === undefined || q.answer === '') fail(`${at}.answer`, `answer is required for ${q.type}`);
    }

    return toStoredQuestion(q, { id, marks, negativeMarks, subject: q.subject?.trim() || p.subject, warnings });
  });

  if (details.length > 0) {
    const first = details[0]!;
    return { ok: false, message: `${first.field}: ${first.issue}`, details };
  }

  return {
    ok: true,
    value: {
      params: { ...p, title, date, endTime, targetQuestions },
      questions,
      startTimestampMs,
      endTimestampMs,
      totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    },
  };
}

/**
 * Builds the stored question. Explanations are moved OUT of en/hi into the top-level
 * `explanation` object, because stripForStudent only removes top-level answer fields.
 */
function toStoredQuestion(
  q: z.output<typeof QuestionSchema>,
  extra: { id: string; marks: number; negativeMarks: number; subject: string; warnings: string[] },
): IExamQuestion {
  const content = (c: z.output<typeof LocalizedSchema>): IQuestionContent => ({
    text: c.text,
    ...(c.options && { options: c.options.map((o) => ({ id: o.id, text: o.text, ...(o.imageUrl && { imageUrl: o.imageUrl }) })) }),
    ...(c.audioUrl && { audioUrl: c.audioUrl }),
  });
  const explanation: IExplanation = {};
  const en = q.explanation ?? q.en.explanation;
  if (en) explanation.en = en;
  if (q.hi?.explanation) explanation.hi = q.hi.explanation;

  return {
    id: extra.id,
    type: q.type,
    marks: extra.marks,
    negativeMarks: extra.negativeMarks,
    subject: extra.subject,
    topic: q.topic.trim(),
    ...(q.subtopic && { subtopic: q.subtopic }),
    difficulty: q.difficulty,
    ...(q.classLevel && { classLevel: q.classLevel }),
    ...(q.examPattern && { examPattern: q.examPattern }),
    en: content(q.en),
    ...(q.hi && { hi: content(q.hi) }),
    ...(q.correctOptionId && { correctOptionId: q.correctOptionId }),
    ...(q.answer !== undefined && { answer: q.answer }),
    ...((explanation.en || explanation.hi) && { explanation }),
    ...(extra.warnings.length > 0 && { validationWarnings: extra.warnings }),
  };
}

function mcqIssue(code: string): string {
  if (code === 'CORRECT_OPTION_NOT_IN_OPTIONS') return 'correctOptionId does not match any option id';
  if (code.startsWith('OPTION_COUNT')) return 'MCQ needs 2 to 5 options';
  if (code === 'DUPLICATE_OPTION_ID') return 'option ids must be unique';
  if (code === 'EMPTY_OPTION') return 'options must not be empty';
  if (code === 'DUPLICATE_OPTION_TEXT') return 'two options have the same text';
  return code;
}

function istDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function istTimeString(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

function isRealDate(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

// ---------------------------------------------------------------------------
// Firestore write
// ---------------------------------------------------------------------------

export class CreateExamError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ValidationDetail[],
  ) {
    super(message);
    this.name = 'CreateExamError';
  }
}

export interface CreateCompleteExamResult {
  success: true;
  examId: string;
  totalQuestions: number;
  totalMarks: number;
  status: 'draft' | 'upcoming';
  createdAt: string;
}

/**
 * Validates, checks batch access and idempotency, then writes everything in one batch.
 * Throws CreateExamError (400 / 403 / 409) for the caller to turn into an HTTP response.
 */
export async function createCompleteExam(
  auth: { teacherId: string; tenantId?: string },
  body: unknown,
  requestId?: string,
): Promise<CreateCompleteExamResult> {
  const result = validateCompleteExam(body);
  if (!result.ok) throw new CreateExamError(400, 'VALIDATION_FAILED', result.message, result.details);
  const { params, questions, startTimestampMs, endTimestampMs, totalMarks } = result.value;

  // Batch must belong to this teacher (403).
  const context = await resolveTeacherContext(auth.teacherId, auth.tenantId);
  if (!context.batches.some((b) => b.id === params.batchId)) {
    throw new CreateExamError(
      403,
      'FORBIDDEN',
      `Teacher ${auth.teacherId} is not authorized for batch ${params.batchId}` + (auth.tenantId ? ` in tenant ${auth.tenantId}` : ''),
    );
  }

  // Idempotency (409): the same X-Request-ID can only create one exam.
  const requestRef = requestId ? db.collection(REQUESTS_COLLECTION).doc(requestId) : undefined;
  if (requestRef) {
    try {
      await requestRef.create({ teacherId: auth.teacherId, status: 'processing', createdAt: new Date().toISOString() });
    } catch {
      throw new CreateExamError(409, 'IDEMPOTENCY_CONFLICT', 'An exam creation request with this Request ID is already in progress or completed');
    }
  }

  const examId = `exam_${Date.now()}_${crypto.randomBytes(3).toString('hex').slice(0, 5)}`;
  const nowIso = new Date().toISOString();
  const stripped = questions.map((q) => stripForStudent(q));
  const draftHash = sha256Canonical(stripped);

  const exam: IExam & Record<string, unknown> = {
    id: examId,
    title: params.title,
    totalMarks,
    duration: params.duration,
    subject: params.subject,
    class: params.classLevel,
    status: params.status,
    teacherId: auth.teacherId,
    ...(auth.tenantId && { tenantId: auth.tenantId }),
    batchId: params.batchId,
    createdAt: nowIso,
    updatedAt: nowIso,
    date: params.date,
    endDate: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
    startTimestampMs,
    endTimestampMs,
    totalQuestions: questions.length,
    targetQuestions: params.targetQuestions,
    allowedAttempts: 1,
    defaultMarks: params.defaultMarks,
    defaultNegativeMarks: params.defaultNegativeMarks,
    negativeRule: params.negativeRule,
    languages: params.languages,
    primaryLanguage: params.primaryLanguage,
    examPattern: params.examPattern,
    shuffleQuestions: params.shuffleQuestions,
    shuffleOptions: params.shuffleOptions,
    isSubjective: params.isSubjective,
    draftHash,
    source: 'create-complete',
    ...(requestId && { requestId }),
    ...(params.status === 'upcoming' && { publishedAt: nowIso }),
  };

  const masterRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const keys: Record<string, unknown> = {};
  for (const q of questions) {
    keys[q.id!] = {
      questionId: q.id,
      ...(q.correctOptionId && { correctOptionId: q.correctOptionId }),
      ...(q.answer !== undefined && { answer: q.answer }),
      ...(q.explanation && { explanation: q.explanation }),
      marks: q.marks,
      negativeMarks: q.negativeMarks ?? 0,
    };
  }

  const batch = db.batch();
  batch.set(masterRef, exam);
  for (const q of questions) batch.set(masterRef.collection('draft_questions').doc(q.id!), { ...q, teacherId: auth.teacherId, examId });
  batch.set(db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId), { examId, questions: stripped, updatedAt: nowIso });
  batch.set(db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId), { examId, teacherId: auth.teacherId, keys, updatedAt: nowIso });
  if (requestRef) batch.update(requestRef, { status: 'completed', examId, completedAt: nowIso });

  try {
    await batch.commit();
  } catch (err) {
    // Free the request id so the client can retry after a failed write.
    if (requestRef) await requestRef.delete().catch(() => undefined);
    throw err;
  }

  return {
    success: true,
    examId,
    totalQuestions: questions.length,
    totalMarks,
    status: params.status,
    createdAt: nowIso,
  };
}
