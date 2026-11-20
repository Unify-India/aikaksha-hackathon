import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import type { IBaseQuestion, IExam, IExamQuestion, IOption, ExamStatus } from '../../types/index.js';
import { stripForStudent, sha256Canonical } from '../../utils/security.js';
import { resolveKolkataTimeWindow } from '../../utils/time.js';
import { generateQuestions, type Difficulty } from '../../prompts/question-generation.prompt.js';
import { auditQuestions, summariseAudit } from '../../prompts/solver-audit.prompt.js';
import { buildAutoDppIntent, DPP_QUESTION_COUNT } from '../../prompts/auto-dpp.prompt.js';
import { negativeMarksFor, type NegativeRule } from '../../types/voice-intent.js';

export interface ResolveTeacherContextResult {
  teacherId: string;
  tenantId?: string;
  batches: Array<{
    id: string;
    name: string;
    subject: string;
    classLevel?: string;
    targetExam?: string;
    studentCount?: number;
  }>;
  subjects: string[];
}

export interface CreateExamInput {
  title: string;
  subject: string;
  duration: number; // in minutes
  batchId?: string;
  totalMarks?: number;
  targetQuestions?: number;
  defaultMarks?: number;
  defaultNegativeMarks?: number;
  startTimestampMs?: number;
  endTimestampMs?: number;
  isSubjective?: boolean;
  languages?: string[];
  primaryLanguage?: string;
  classLevel?: string;
  examPattern?: string;
}

export interface CreateExamResult {
  examId: string;
  status: 'draft';
  exam: IExam;
}

export interface GenerateQuestionsInput {
  examId: string;
  subject: string;
  topic?: string;
  /** Optional subtopics, one per batch of ≤5. Empty -> Gemini plans them. */
  subtopics?: string[];
  count: number;
  difficulty?: string;
  languages?: string[];
  requestId?: string;
}

export interface GenerateQuestionsResult {
  examId: string;
  generatedCount: number;
  /** How many were asked for; generatedCount < requestedCount means some were dropped (shortfall). */
  requestedCount?: number;
  requestId?: string;
  questions: Array<Omit<IExamQuestion, 'correctOptionId' | 'answer' | 'explanation'>>;
}

export interface AuditQuestionBatchInput {
  examId: string;
}

export interface AuditQuestionBatchResult {
  examId: string;
  score: number;
  passed: boolean;
  flags: string[];
  contentHash: string;
  confirmationToken: string;
  questionCount: number;
}

export interface FinalizeAndPublishExamInput {
  examId: string;
  confirmationToken: string;
  contentHash: string;
  status?: 'upcoming' | 'live';
}

export interface FinalizeAndPublishExamResult {
  success: boolean;
  examId: string;
  status: 'upcoming' | 'live';
  contentHash: string;
  publishedAt: string;
}

export interface CreateAutoDppInput {
  /** What the teacher taught, e.g. "Taught projectile motion at an angle — Class 12 JEE". Preferred. */
  sentence?: string;
  /** Plain topic; used when no sentence is given. */
  topic?: string;
  batchId?: string;
  subject?: string;
  count?: number;
  difficulty?: string;
  requestId?: string;
}

export interface CreateAutoDppResult {
  examId: string;
  title: string;
  topic: string;
  subtopic?: string;
  batchId: string;
  /** 'upcoming' when published; 'draft' when the audit flagged questions and a teacher must review. */
  status: 'upcoming' | 'draft';
  published: boolean;
  totalQuestions: number;
  totalMarks: number;
  auditScore: number;
  auditFlags: string[];
  contentHash: string;
  confirmationToken: string;
}

/**
 * Tool 1: resolve_teacher_context
 * Resolves teacher batches, allowed subjects, and institute context.
 */
export async function resolveTeacherContext(
  teacherId: string,
  tenantId?: string,
): Promise<ResolveTeacherContextResult> {
  const batchesSnapshot = await db
    .collection(FIRESTORE_COLLECTIONS.BATCHES)
    .where('teacherId', '==', teacherId)
    .limit(20)
    .get();

  let batches = batchesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: (data.name as string) || doc.id,
      subject: (data.subject as string) || 'Physics',
      classLevel: data.classLevel as string | undefined,
      targetExam: data.targetExam as string | undefined,
      studentCount: data.studentCount as number | undefined,
    };
  });

  // If no batches exist yet in this environment, provide the seeded fallback batch
  if (batches.length === 0) {
    batches = [
      {
        id: 'batch-lakshya-2026',
        name: 'Lakshya 2026',
        subject: 'Physics',
        classLevel: 'Class 12',
        targetExam: 'NEET',
        studentCount: 45,
      },
    ];
  }

  const subjects = Array.from(new Set(batches.map((b) => b.subject).concat(['Physics', 'Chemistry', 'Mathematics', 'Biology'])));

  return {
    teacherId,
    tenantId,
    batches,
    subjects,
  };
}

/**
 * Tool 2: create_exam
 * Validates marking scheme, time-locks, and writes draft exam to master_exams.
 */
export async function createExam(
  teacherId: string,
  input: CreateExamInput,
): Promise<CreateExamResult> {
  if (!input.title || typeof input.title !== 'string') {
    throw new Error('Exam title is required');
  }

  const durationMin = Math.max(5, input.duration || 45);
  const nowMs = Date.now();
  const startMs = input.startTimestampMs ?? (nowMs + 3600 * 1000);
  const endMs = input.endTimestampMs ?? (startMs + durationMin * 60 * 1000);

  if (startMs >= endMs) {
    throw new Error('startTimestampMs must be strictly earlier than endTimestampMs');
  }

  const defaultMarks = input.defaultMarks ?? 4;
  const defaultNegativeMarks = input.defaultNegativeMarks ?? 1;

  if (defaultNegativeMarks < 0 || defaultMarks <= 0) {
    throw new Error('Invalid marking scheme: marks must be > 0 and negative marks must be >= 0');
  }

  const examId = `exam_${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();

  const newExam: IExam = {
    id: examId,
    title: input.title.trim(),
    totalMarks: input.totalMarks ?? 0,
    duration: durationMin,
    subject: input.subject || 'Physics',
    class: input.classLevel || 'Class 12',
    status: 'draft',
    teacherId,
    batchId: input.batchId || 'batch-lakshya-2026',
    createdAt: nowIso,
    updatedAt: nowIso,
    totalQuestions: 0,
    targetQuestions: input.targetQuestions || 10,
    allowedAttempts: 1,
    defaultMarks,
    defaultNegativeMarks,
    languages: input.languages || ['en'],
    primaryLanguage: input.primaryLanguage || 'en',
    startTimestampMs: startMs,
    endTimestampMs: endMs,
    startTime: new Date(startMs).toLocaleTimeString('en-IN', { hour12: false }),
    endTime: new Date(endMs).toLocaleTimeString('en-IN', { hour12: false }),
    isSubjective: input.isSubjective ?? false,
    examPattern: input.examPattern || 'NEET',
  };

  await db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId).set(newExam);

  logger.info(`Draft exam created: ${examId} by teacher ${teacherId}`);

  return {
    examId,
    status: 'draft',
    exam: newExam,
  };
}

/**
 * Tool 3: generate_and_attach_questions
 * Generates questions, saves stripped questions to exam_questions subcollection/doc,
 * and confidential answer keys to answer_keys.
 * Implements idempotency via requestId.
 */
export async function generateAndAttachQuestions(
  teacherId: string,
  input: GenerateQuestionsInput,
): Promise<GenerateQuestionsResult> {
  const { examId, subject, topic = 'Electrostatics and Current Electricity', count = 5, requestId } = input;

  const masterRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const masterSnap = await masterRef.get();

  if (!masterSnap.exists) {
    throw new Error(`Exam draft ${examId} not found`);
  }

  const examData = masterSnap.data() as IExam;
  if (examData.teacherId !== teacherId) {
    throw new Error('Teacher ownership mismatch: unauthorized access to exam draft');
  }

  // Idempotency check: if requestId exists and already processed, return existing questions
  if (requestId && examData.confirmationRef === requestId) {
    logger.info(`Idempotent call detected for requestId ${requestId} on exam ${examId}`);
    const existingSnap = await masterRef.collection('draft_questions').get();
    const existingQuestions = existingSnap.docs.map((d) => stripForStudent(d.data() as IExamQuestion));
    return {
      examId,
      generatedCount: existingQuestions.length,
      requestId,
      questions: existingQuestions,
    };
  }

  const questionCount = Math.min(Math.max(1, count), 15);

  // Real Gemini generation: parallel batches of ≤5, validated and de-duplicated.
  const generated = await generateQuestions({
    subject,
    topic,
    subtopics: input.subtopics ?? [],
    count: questionCount,
    difficulty: toDifficulty(input.difficulty),
    marks: examData.defaultMarks || 4,
    negativeMarks: examData.defaultNegativeMarks ?? 1,
    ...(examData.examPattern && { examPattern: examData.examPattern }),
    ...(examData.class && { classLevel: examData.class }),
  });

  if (generated.length === 0) {
    throw new Error('GENERATION_FAILED: Gemini produced no valid questions; please retry');
  }
  if (generated.length < questionCount) {
    logger.warn(`Question shortfall for exam ${examId}: ${generated.length}/${questionCount}`);
  }

  const generatedList: IExamQuestion[] = generated.map((q) => ({ ...q, teacherId, examId }));

  // Atomically persist draft questions in Firestore
  const batch = db.batch();

  // Clear old drafts first so a regenerate with fewer questions leaves no stale ones behind
  const oldDrafts = await masterRef.collection('draft_questions').get();
  for (const doc of oldDrafts.docs) batch.delete(doc.ref);

  for (const q of generatedList) {
    const qRef = masterRef.collection('draft_questions').doc(q.id!);
    batch.set(qRef, q);
  }

  // Update master exam summary
  batch.update(masterRef, {
    totalQuestions: generatedList.length,
    totalMarks: generatedList.length * (examData.defaultMarks || 4),
    confirmationRef: requestId || null,
    updatedAt: new Date().toISOString(),
  });

  await batch.commit();

  logger.info(`Generated and attached ${generatedList.length} questions for exam ${examId}`);

  return {
    examId,
    generatedCount: generatedList.length,
    requestedCount: questionCount,
    requestId,
    questions: generatedList.map((q) => stripForStudent(q)),
  };
}

function toDifficulty(value: string | undefined): Difficulty {
  const v = (value ?? '').toLowerCase();
  if (v === 'easy') return 'easy';
  if (v === 'hard' || v === 'tough' || v === 'difficult') return 'hard';
  return 'medium';
}

/**
 * Tool 4: audit_question_batch
 * Performs solver pass and LaTeX validation. Computes contentHash = sha256(canonicalJson(questions))
 * and issues a single-use confirmationToken.
 */
export async function auditQuestionBatch(
  teacherId: string,
  input: AuditQuestionBatchInput,
): Promise<AuditQuestionBatchResult> {
  const { examId } = input;

  const masterRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const masterSnap = await masterRef.get();

  if (!masterSnap.exists) {
    throw new Error(`Exam ${examId} not found`);
  }

  const examData = masterSnap.data() as IExam;
  if (examData.teacherId !== teacherId) {
    throw new Error('Teacher ownership mismatch for audit');
  }

  const questionsSnap = await masterRef.collection('draft_questions').get();
  if (questionsSnap.empty) {
    throw new Error(`No draft questions found for exam ${examId} to audit`);
  }

  const questions = questionsSnap.docs.map((d) => d.data() as IExamQuestion);

  // Compute canonical hash of stripped questions
  const strippedQuestions = questions.map((q) => stripForStudent(q));
  const contentHash = sha256Canonical(strippedQuestions);

  // Blind solver pass: Gemini sees only the stripped questions, never the key.
  // (stripForStudent's Omit<> type loses field types because of IBaseQuestion's index signature;
  // the runtime shape is a question minus the key, which auditQuestions re-checks with assertBlind.)
  const auditItems = await auditQuestions(strippedQuestions as IBaseQuestion[]);
  const keyById = new Map(questions.map((q) => [q.id ?? '', q.correctOptionId]));
  const { score, flags, details } = summariseAudit(auditItems, keyById);
  const passed = flags.length === 0;

  // Generate single-use confirmation token. Issued even when flagged:
  // the teacher sees the flags at the Review Gate and decides.
  const confirmationToken = `conf_${crypto.randomBytes(16).toString('hex')}`;

  // Store token and expected hash on master exam doc for validation at publish time
  await masterRef.update({
    draftHash: contentHash,
    confirmationToken,
    auditScore: score,
    auditStatus: passed ? 'PASSED' : 'FLAGGED',
    auditFlags: flags,
    auditDetails: details,
    updatedAt: new Date().toISOString(),
  });

  logger.info(
    `Audited exam ${examId}: score=${score}, flags=${flags.length}, contentHash=${contentHash.slice(0, 8)}..., token=${confirmationToken.slice(0, 10)}...`,
  );

  return {
    examId,
    score,
    passed,
    flags,
    contentHash,
    confirmationToken,
    questionCount: questions.length,
  };
}

/**
 * Tool 5: finalize_and_publish_exam
 * Requires valid matching confirmationToken and contentHash.
 * Partitions data into:
 *  - master_exams: status='upcoming', answers removed
 *  - exam_questions: questions with answers STRIPPED (safe for students)
 *  - answer_keys: confidential answer keys and explanations (teacher-only)
 * Single-use token is invalidated; subsequent attempts return 409 conflict.
 */
export async function finalizeAndPublishExam(
  teacherId: string,
  input: FinalizeAndPublishExamInput,
): Promise<FinalizeAndPublishExamResult> {
  const { examId, confirmationToken, contentHash, status = 'upcoming' } = input;

  if (!confirmationToken || !contentHash) {
    throw new Error('Missing confirmationToken or contentHash for exam publication');
  }

  const masterRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const masterSnap = await masterRef.get();

  if (!masterSnap.exists) {
    throw new Error(`Exam ${examId} not found`);
  }

  const examData = masterSnap.data() as IExam & { confirmationToken?: string; auditStatus?: string };
  if (examData.teacherId !== teacherId) {
    throw new Error('Teacher ownership mismatch');
  }

  // Idempotency / Single-use token enforcement
  if (examData.status === 'upcoming' || examData.status === 'live') {
    throw new Error('IDEMPOTENCY_CONFLICT: Exam is already finalized and published');
  }

  if (!examData.confirmationToken || examData.confirmationToken !== confirmationToken) {
    throw new Error('INVALID_TOKEN: Confirmation token is invalid or has already been used');
  }

  if (examData.draftHash !== contentHash) {
    throw new Error('HASH_MISMATCH: Content has changed since audit was performed');
  }

  const draftQuestionsSnap = await masterRef.collection('draft_questions').get();
  if (draftQuestionsSnap.empty) {
    throw new Error(`No draft questions attached to exam ${examId}`);
  }

  const fullQuestions = draftQuestionsSnap.docs.map((d) => d.data() as IExamQuestion);

  // Recalculate hash to verify invariant
  const verifiedHash = sha256Canonical(fullQuestions.map((q) => stripForStudent(q)));
  if (verifiedHash !== contentHash) {
    throw new Error('CONTENT_TAMPERED: Canonical hash does not match questions');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  // 1. Invalidate single-use token and update master_exams
  batch.update(masterRef, {
    status,
    confirmationToken: null, // Invalidate token immediately
    draftHash: contentHash,
    publishedAt: nowIso,
    updatedAt: nowIso,
  });

  // 2. exam_questions: stripped of answers (student safe)
  const examQuestionsRef = db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId);
  const strippedForStorage = fullQuestions.map((q) => stripForStudent(q));
  batch.set(examQuestionsRef, {
    examId,
    questions: strippedForStorage,
    updatedAt: nowIso,
  });

  // 3. answer_keys: confidential, teacher-only
  const answerKeysRef = db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId);
  const keysMap: Record<string, unknown> = {};
  for (const q of fullQuestions) {
    keysMap[q.id!] = {
      questionId: q.id,
      correctOptionId: q.correctOptionId,
      answer: q.answer,
      explanation: q.explanation,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
    };
  }
  batch.set(answerKeysRef, {
    examId,
    teacherId,
    keys: keysMap,
    updatedAt: nowIso,
  });

  await batch.commit();

  logger.info(`Exam ${examId} successfully published with status ${status}. Partitioning enforced.`);

  return {
    success: true,
    examId,
    status,
    contentHash,
    publishedAt: nowIso,
  };
}

/**
 * Tool 6: create_auto_dpp
 * Autonomous Daily Practice Problem creation pipeline:
 * From the teacher's sentence ("Taught projectile motion at an angle — Class 12 JEE"), Gemini maps the
 * lesson to the syllabus (buildAutoDppIntent), then 10 questions are generated and blind-audited.
 * Published automatically only if the audit passes; otherwise left as a draft for the teacher to review.
 */
export async function createAutoDpp(
  teacherId: string,
  input: CreateAutoDppInput,
): Promise<CreateAutoDppResult> {
  const { batchId = 'batch-lakshya-2026', requestId } = input;

  // Step 0: understand what was taught (sentence preferred; plain topic still accepted)
  let subject = input.subject ?? 'Physics';
  let topic = input.topic?.trim() ?? '';
  let subtopic: string | undefined;
  let examPattern: string | undefined;
  let difficulty = input.difficulty;
  let negativeRule: NegativeRule = '1/4';
  if (input.sentence?.trim()) {
    const intent = await buildAutoDppIntent(input.sentence, batchId);
    const s = intent.extractedSlots;
    subject = input.subject ?? s.subject ?? subject;
    topic = s.topic ?? topic;
    subtopic = s.subtopic;
    examPattern = s.examPattern;
    difficulty = difficulty ?? s.difficulty;
    negativeRule = s.negativeRule ?? 'none';
  }
  if (!topic) throw new Error('Auto DPP needs a sentence or a topic');

  const count = Math.min(Math.max(1, input.count ?? DPP_QUESTION_COUNT), 15);
  const marks = 4;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
  const title = `DPP: ${subtopic ?? topic} (${dateStr})`;

  // Step 1: Create Draft Exam
  const examResult = await createExam(teacherId, {
    title,
    subject,
    duration: 30,
    batchId,
    targetQuestions: count,
    defaultMarks: marks,
    defaultNegativeMarks: negativeMarksFor(marks, negativeRule),
    examPattern: examPattern ?? 'Practice',
  });

  const examId = examResult.examId;

  // Step 2: Generate & Attach Questions
  const generated = await generateAndAttachQuestions(teacherId, {
    examId,
    subject,
    topic,
    ...(subtopic && { subtopics: [subtopic] }),
    count,
    ...(difficulty && { difficulty }),
    requestId,
  });

  // Step 3: Solver Audit Pass
  const auditResult = await auditQuestionBatch(teacherId, { examId });

  // Step 4: Publish only if the audit is clean; flagged sets wait for teacher review.
  const published = auditResult.passed;
  if (published) {
    await finalizeAndPublishExam(teacherId, {
      examId,
      confirmationToken: auditResult.confirmationToken,
      contentHash: auditResult.contentHash,
      status: 'upcoming',
    });
  }

  // Log to teaching_log collection as specified in IMPLEMENTATION_PLAN.md
  await db.collection('teaching_log').add({
    type: 'AUTO_DPP',
    examId,
    teacherId,
    topic,
    ...(subtopic && { subtopic }),
    batchId,
    published,
    createdAt: new Date().toISOString(),
  });

  logger.info(`Auto DPP ${published ? 'published' : 'held for review'}: ${examId} for "${subtopic ?? topic}" (score ${auditResult.score})`);

  return {
    examId,
    title,
    topic,
    ...(subtopic && { subtopic }),
    batchId,
    status: published ? 'upcoming' : 'draft',
    published,
    totalQuestions: generated.generatedCount,
    totalMarks: generated.generatedCount * marks,
    auditScore: auditResult.score,
    auditFlags: auditResult.flags,
    contentHash: auditResult.contentHash,
    confirmationToken: auditResult.confirmationToken,
  };
}

export interface CreateAndSegregateExamResult {
  success: true;
  examId: string;
  totalQuestions: number;
  totalMarks: number;
  status: string;
  createdAt: string;
}

/**
 * Tool / Direct Pipeline: create_complete_exam
 * Creates an exam and partitions it atomically across master_exams, exam_questions, and answerKey.
 * Validates inputs, calculates metrics, derives timestamps in Asia/Kolkata,
 * normalizes question & option IDs, strips student answers, and commits everything via db.batch().
 */
export async function createAndSegregateExam(
  teacherId: string,
  payload: any,
): Promise<CreateAndSegregateExamResult> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: expected an object containing examParams and questions');
  }

  // Support case-insensitive examParams / examparams / exam_params / params
  const rawParams =
    payload.examParams ||
    payload.examparams ||
    payload.ExamParams ||
    payload.exam_params ||
    payload.params ||
    payload;

  // Support questions / question / Questions / Question
  let rawQuestions =
    payload.questions ||
    payload.question ||
    payload.Questions ||
    payload.Question ||
    rawParams.questions ||
    rawParams.question;

  if (!rawQuestions && Array.isArray(payload)) {
    rawQuestions = payload;
  }

  let questionsList: any[] = [];
  if (Array.isArray(rawQuestions)) {
    questionsList = rawQuestions;
  } else if (rawQuestions && typeof rawQuestions === 'object') {
    if (Array.isArray(rawQuestions.questions)) {
      questionsList = rawQuestions.questions;
    } else if (Array.isArray(rawQuestions.items)) {
      questionsList = rawQuestions.items;
    } else {
      questionsList = Object.values(rawQuestions);
    }
  }

  // Validate required fields (title, subject, duration, questions array non-empty)
  const title = (rawParams.title || '').trim();
  if (!title) {
    throw new Error('Exam title is required');
  }

  const subject = (rawParams.subject || '').trim();
  if (!subject) {
    throw new Error('Exam subject is required');
  }

  const duration = Number(rawParams.duration);
  if (!duration || duration <= 0 || isNaN(duration)) {
    throw new Error('Valid exam duration in minutes is required');
  }

  if (!Array.isArray(questionsList) || questionsList.length === 0) {
    throw new Error('Questions array must not be empty');
  }

  // Generate unique examId (e.g. exam_${crypto.randomUUID().slice(0, 8)})
  const examId = rawParams.id || rawParams.examId || `exam_${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();

  // Derive timestamps: startTimestampMs, endTimestampMs using Asia/Kolkata if not passed
  let startTimestampMs = Number(rawParams.startTimestampMs);
  let endTimestampMs = Number(rawParams.endTimestampMs);
  let startTime = rawParams.startTime;
  let endTime = rawParams.endTime;
  let date = rawParams.date;
  let endDate = rawParams.endDate;

  if (!startTimestampMs || !endTimestampMs) {
    const timeWindow = resolveKolkataTimeWindow({
      dateText: rawParams.date || rawParams.dateText || 'today',
      startTime: rawParams.startTime,
      endTime: rawParams.endTime,
      durationMinutes: duration,
    });
    if (!startTimestampMs) {
      startTimestampMs = timeWindow.startTimestampMs;
    }
    if (!endTimestampMs) {
      endTimestampMs = timeWindow.endTimestampMs;
    }
    if (!startTime) {
      startTime = timeWindow.startTime;
    }
    if (!endTime) {
      endTime = timeWindow.endTime;
    }
    if (!date) {
      date = timeWindow.date;
    }
    if (!endDate) {
      endDate = timeWindow.endDate;
    }
  }

  if (startTimestampMs >= endTimestampMs) {
    endTimestampMs = startTimestampMs + duration * 60 * 1000;
  }

  const defaultMarks = rawParams.defaultMarks !== undefined ? Number(rawParams.defaultMarks) : 4;
  const defaultNegativeMarks =
    rawParams.defaultNegativeMarks !== undefined ? Number(rawParams.defaultNegativeMarks) : 1;

  // Process questions: ensure valid question ID & normalize option IDs (opt1..opt4)
  const fullQuestions: IExamQuestion[] = [];
  const answerKeyMap: Record<string, any> = {};

  for (let index = 0; index < questionsList.length; index++) {
    const q = questionsList[index];
    const qId = q.id || q.questionId || `q_${index + 1}_${crypto.randomUUID().slice(0, 6)}`;

    const rawOptions = q.en?.options || q.options || [];
    const normalizedOptions: IOption[] = [];
    const optionIdMap: Record<string, string> = {};

    if (Array.isArray(rawOptions)) {
      rawOptions.forEach((opt: any, optIdx: number) => {
        const newOptId = `opt${optIdx + 1}`;
        let text = '';
        if (typeof opt === 'string') {
          text = opt;
        } else if (opt && typeof opt === 'object') {
          text = opt.text || opt.value || opt.label || '';
          if (opt.id) {
            optionIdMap[String(opt.id).toLowerCase()] = newOptId;
          }
        }
        optionIdMap[String.fromCharCode(65 + optIdx).toLowerCase()] = newOptId;
        optionIdMap[String(optIdx)] = newOptId;
        optionIdMap[String(optIdx + 1)] = newOptId;
        optionIdMap[newOptId.toLowerCase()] = newOptId;

        normalizedOptions.push({
          id: newOptId,
          text,
        });
      });
    }

    const rawCorrect = String(
      q.correctOptionId ||
      q.correct_option_id ||
      q.correctOption ||
      q.correct_option ||
      q.answer ||
      q.correctAnswer ||
      ''
    ).trim();

    let correctOptionId: string | undefined = undefined;
    if (rawCorrect) {
      const mapped = optionIdMap[rawCorrect.toLowerCase()];
      if (mapped) {
        correctOptionId = mapped;
      } else {
        const found = normalizedOptions.find(
          (o) => o.text.trim().toLowerCase() === rawCorrect.toLowerCase()
        );
        correctOptionId = found ? found.id : rawCorrect;
      }
    } else if (normalizedOptions.length > 0) {
      correctOptionId = 'opt1';
    }

    let explanation: { en?: string; hi?: string } | undefined = undefined;
    if (typeof q.explanation === 'string') {
      explanation = { en: q.explanation };
    } else if (q.explanation && typeof q.explanation === 'object') {
      explanation = {
        en: q.explanation.en || q.explanation.text || '',
        hi: q.explanation.hi || '',
      };
    }

    const qMarks = Number(q.marks) || defaultMarks;
    const qNegMarks = q.negativeMarks !== undefined ? Number(q.negativeMarks) : defaultNegativeMarks;
    const questionText = q.text || q.question || q.questionText || q.en?.text || '';

    const fullQuestion: IExamQuestion = {
      id: qId,
      type: q.type || (normalizedOptions.length > 0 ? 'MCQ' : 'Subjective'),
      marks: qMarks,
      negativeMarks: qNegMarks,
      subject: q.subject || subject,
      topic: q.topic || rawParams.topic || 'General',
      subtopic: q.subtopic || '',
      difficulty: q.difficulty || rawParams.difficulty || 'medium',
      teacherId,
      examId,
      en: {
        text: questionText,
        options: normalizedOptions.length > 0 ? normalizedOptions : undefined,
      },
      options: normalizedOptions.length > 0 ? normalizedOptions : undefined,
      correctOptionId,
      answer: q.answer || correctOptionId,
      explanation,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    fullQuestions.push(fullQuestion);

    answerKeyMap[qId] = {
      questionId: qId,
      correctOptionId,
      answer: q.answer || correctOptionId,
      explanation,
      marks: qMarks,
      negativeMarks: qNegMarks,
    };
  }

  // Calculate totalMarks and totalQuestions
  const totalQuestions = fullQuestions.length;
  const calculatedMarks = fullQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
  const totalMarks = Number(rawParams.totalMarks) || calculatedMarks;
  const status: ExamStatus =
    rawParams.status === 'draft' ? 'draft' : (rawParams.status || 'upcoming');

  // Partition into 3 distinct Firestore targets:
  // a) master_exams/{examId}
  const masterRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const strippedQuestions = fullQuestions.map((q) => stripForStudent(q));
  const contentHash = sha256Canonical(strippedQuestions);

  const masterExamData: IExam = {
    id: examId,
    title,
    subject,
    duration,
    totalMarks,
    totalQuestions,
    targetQuestions: Number(rawParams.targetQuestions) || totalQuestions,
    status,
    questions: [], // Cleared to enforce isolation
    teacherId,
    batchId: rawParams.batchId || 'batch-lakshya-2026',
    class: rawParams.classLevel || rawParams.class || 'Class 12',
    difficulty: rawParams.difficulty || 'medium',
    allowedAttempts: Number(rawParams.allowedAttempts) || 1,
    defaultMarks,
    defaultNegativeMarks,
    negativeMarks: defaultNegativeMarks,
    startTimestampMs,
    endTimestampMs,
    startTime: startTime || '',
    endTime: endTime || '',
    date: date || '',
    endDate: endDate || '',
    languages: rawParams.languages || ['en'],
    primaryLanguage: rawParams.primaryLanguage || 'en',
    examPattern: rawParams.examPattern || 'NEET',
    isSubjective: rawParams.isSubjective ?? false,
    draftHash: contentHash,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // b) exam_questions/{examId} + items/{qId}
  const examQuestionsRef = db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId);
  const examQuestionsData = {
    examId,
    questions: strippedQuestions,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // c) answerKey/{examId}
  const answerKeyRef = db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId);
  const answerKeyData = {
    examId,
    teacherId,
    keys: answerKeyMap,
    ...answerKeyMap,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Atomic batch write
  const batch = db.batch();
  batch.set(masterRef, masterExamData);
  batch.set(examQuestionsRef, examQuestionsData);
  for (const sq of strippedQuestions) {
    const itemId = (sq.id as string) || `q_${crypto.randomUUID().slice(0, 8)}`;
    const itemRef = examQuestionsRef.collection('items').doc(itemId);
    batch.set(itemRef, sq);
  }
  batch.set(answerKeyRef, answerKeyData);

  await batch.commit();

  logger.info(
    `Successfully created and segregated exam ${examId}: ${totalQuestions} questions, ${totalMarks} marks, status=${status}`
  );

  return {
    success: true,
    examId,
    totalQuestions,
    totalMarks,
    status,
    createdAt: nowIso,
  };
}
