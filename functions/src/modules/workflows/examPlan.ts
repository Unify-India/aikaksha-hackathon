/**
 * Turns the teacher's intent (+ any values the UI sends explicitly, e.g. edited slot chips)
 * into a complete exam plan for the pipeline, or reports exactly what is still missing.
 * Pure: no Gemini, no Firestore.
 *
 * Owner: Sakshi.
 */
import { DEFAULT_TIMEZONE, resolveSchedule, ScheduleError, type ResolvedSchedule } from '../../utils/schedule.js';
import { negativeMarksFor, type Difficulty, type IVoiceIntent, type NegativeRule } from '../../types/voice-intent.js';

/** Values the UI may send alongside (or instead of) a transcript. They win over the intent. */
export interface WorkflowOverrides {
  title?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  batchId?: string;
  count?: number;
  duration?: number;
  difficulty?: Difficulty;
  marks?: number;
  negativeRule?: NegativeRule;
  examPattern?: string;
  dateText?: string;
  startTime?: string;
  endTime?: string;
}

export interface BatchRef {
  id: string;
  name: string;
  classLevel?: string;
  targetExam?: string;
}

export interface ExamPlan {
  title: string;
  subject: string;
  topic: string;
  subtopics: string[];
  batchId: string;
  classLevel?: string;
  examPattern?: string;
  count: number;
  durationMinutes: number;
  difficulty: Difficulty;
  marks: number;
  negativeRule: NegativeRule;
  negativeMarks: number;
  /** Absent only for legacy calls without a transcript or schedule (create_exam then defaults to now + 1 h). */
  schedule?: ResolvedSchedule;
}

export type PlanResult =
  | { ok: true; plan: ExamPlan }
  | { ok: false; missingRequiredSlots: string[]; message: string };

export const MAX_QUESTIONS = 15;
const LEGACY_DEFAULT_TOPIC = 'Electrostatics';

/**
 * @param intent    from extractIntent, or undefined for legacy calls that send fields directly
 * @param overrides explicit values from the request body
 * @param batches   the teacher's batches (resolve_teacher_context)
 */
export function planExam(
  intent: IVoiceIntent | undefined,
  overrides: WorkflowOverrides,
  batches: BatchRef[],
  nowIso: string,
  timezone: string = DEFAULT_TIMEZONE,
): PlanResult {
  if (intent && intent.detectedAction !== 'CREATE_EXAM' && !hasCoreOverrides(overrides)) {
    const message =
      intent.detectedAction === 'AUTO_DPP'
        ? 'This sounds like a practice set (Auto DPP). Use the Auto DPP flow instead.'
        : 'Sorry, I could not understand that as an exam request.';
    return { ok: false, missingRequiredSlots: [], message };
  }

  const s = intent?.extractedSlots ?? {};
  const pick = <T>(override: T | undefined, fromIntent: T | undefined) => (override !== undefined ? override : fromIntent);

  const subject = pick(overrides.subject, s.subject);
  const topic = pick(overrides.topic, s.topic);
  const subtopic = pick(overrides.subtopic, s.subtopic);
  const count = pick(overrides.count, s.questionCount);
  const duration = pick(overrides.duration, s.durationMinutes);
  const marks = pick(overrides.marks, s.marksPerQuestion);
  const examPattern = pick(overrides.examPattern, s.examPattern);
  const dateText = pick(overrides.dateText, s.dateText);
  const startTime = pick(overrides.startTime, s.startTime);
  const endTime = pick(overrides.endTime, s.endTime);

  // Batch: explicit id > id from intent > name match > the teacher's only batch.
  const byName = s.batchName ? findBatchByName(batches, s.batchName) : undefined;
  const batch =
    batches.find((b) => b.id === (overrides.batchId ?? s.batchId)) ??
    byName ??
    (overrides.batchId === undefined && !s.batchName && batches.length === 1 ? batches[0] : undefined);
  const batchId = overrides.batchId ?? batch?.id;

  const missing: string[] = [];
  const legacy = intent === undefined;

  if (!legacy) {
    if (!subject) missing.push('subject');
    if (!topic) missing.push('topic');
    if (!count) missing.push('questionCount');
    if (!batchId) missing.push('batchName');
    if (!dateText) missing.push('dateText');
    if (!startTime) missing.push('startTime');
    if (duration === undefined && endTime === undefined) missing.push('durationMinutes');
  }
  if (missing.length > 0) {
    const batchHint = s.batchName && !batch ? ` (batch "${s.batchName}" was not found)` : '';
    return { ok: false, missingRequiredSlots: missing, message: `Missing: ${missing.join(', ')}${batchHint}` };
  }

  // Schedule (server-side, never the model). Legacy calls without date/time skip it.
  let schedule: ResolvedSchedule | undefined;
  if (dateText || startTime) {
    try {
      schedule = resolveSchedule(
        {
          extractedSlots: {
            ...(dateText && { dateText }),
            ...(startTime && { startTime }),
            ...(endTime && { endTime }),
            ...(duration !== undefined && { durationMinutes: duration }),
          },
        },
        nowIso,
        timezone,
      );
    } catch (err) {
      if (err instanceof ScheduleError) return { ok: false, missingRequiredSlots: [], message: `${err.code}: ${err.message}` };
      throw err;
    }
  }

  const finalMarks = marks ?? 4;
  const pattern = examPattern ?? batch?.targetExam;
  const negativeRule: NegativeRule =
    overrides.negativeRule ?? s.negativeRule ?? (pattern === 'NEET' || pattern === 'JEE' ? '1/4' : 'none');
  const finalTopic = topic ?? LEGACY_DEFAULT_TOPIC;
  const durationMinutes =
    duration ?? (schedule ? Math.round((schedule.endTimestampMs - schedule.startTimestampMs) / 60_000) : 45);

  return {
    ok: true,
    plan: {
      title: overrides.title ?? s.title ?? `${pattern ? `${pattern} Practice: ` : ''}${finalTopic}`,
      subject: subject ?? 'Physics',
      topic: finalTopic,
      subtopics: subtopic ? [subtopic] : [],
      batchId: batchId ?? 'batch-lakshya-2026',
      ...(batch?.classLevel && { classLevel: batch.classLevel }),
      ...(pattern && { examPattern: pattern }),
      count: Math.min(Math.max(1, count ?? 5), MAX_QUESTIONS),
      durationMinutes,
      difficulty: pick(overrides.difficulty, s.difficulty) ?? 'medium',
      marks: finalMarks,
      negativeRule,
      negativeMarks: negativeMarksFor(finalMarks, negativeRule),
      ...(schedule && { schedule }),
    },
  };
}

function hasCoreOverrides(o: WorkflowOverrides): boolean {
  return Boolean(o.topic && o.subject);
}

/** "Lakshya 2026" matches batch name "Lakshya 2026" or id "batch-lakshya-2026". */
export function findBatchByName(batches: BatchRef[], spoken: string): BatchRef | undefined {
  const norm = (x: string) => x.toLowerCase().replace(/^batch[\s-]*/, '').replace(/[^a-z0-9]+/g, '');
  const want = norm(spoken);
  if (!want) return undefined;
  return batches.find((b) => norm(b.name) === want || norm(b.id) === want);
}
