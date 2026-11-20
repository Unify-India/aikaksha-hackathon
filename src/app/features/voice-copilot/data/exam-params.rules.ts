import { IBatch } from '../../../shared/models';
import {
  DifficultyLevel,
  ExamIntakeIntent,
  IExamIntakeResult,
  IExamParamsPayload,
  NegativeMarkingRule,
  QuestionType,
} from '../../../shared/models/exam-creation.model';

/**
 * Pure rules for the voice intake: what the agent has collected (draft), what we can default,
 * what is still missing, and whether the result is a valid `IExamParamsPayload`.
 *
 * The agent never decides completeness — these functions do, and their verdict is sent back to
 * the agent as the tool response so it knows what to ask next.
 */

/** Fields the agent may set through `update_exam_draft`. */
export interface IExamDraft {
  intent?: ExamIntakeIntent;
  batchId?: string;
  subject?: string;
  topic?: string;
  subtopics?: string[];
  difficulty?: DifficultyLevel;
  questionType?: QuestionType;
  targetQuestions?: number;
  duration?: number;
  date?: string;
  startTime?: string;
  endTime?: string;
  defaultMarks?: number;
  defaultNegativeMarks?: number;
  negativeRule?: NegativeMarkingRule;
  title?: string;
}

export interface IRulesContext {
  /** Today in the institute timezone, `YYYY-MM-DD`. */
  today: string;
  /** Current time in the institute timezone, `HH:mm`; used to reject a start time that has already passed today. */
  nowTime?: string;
  batches: readonly IBatch[];
}

export interface IFieldIssue {
  field: string;
  issue: string;
}

export interface IDraftEvaluation {
  examParams: Partial<IExamParamsPayload>;
  generation: Partial<IExamIntakeResult['generation']>;
  /** Fields filled by a default rather than by the teacher (shown as "default" in the UI). */
  defaulted: string[];
  /** Fields only the teacher can supply. Ordered by the order the agent should ask them. */
  missing: string[];
  invalid: IFieldIssue[];
  complete: boolean;
  result: IExamIntakeResult | null;
}

/** The teacher must give these (unless a default applies, e.g. DPP date = today). */
export const REQUIRED_FIELDS = ['topic', 'batchId', 'subject', 'targetQuestions', 'date', 'startTime', 'duration'] as const;

export const DPP_QUESTION_RANGE = { min: 5, max: 10, default: 7 } as const;
/** Exams never default the duration: the teacher must state it (or give both start and end time). */
const DPP_DEFAULT_DURATION = 20;

const DIFFICULTIES: readonly DifficultyLevel[] = ['easy', 'medium', 'hard'];
const QUESTION_TYPES: readonly QuestionType[] = ['MCQ', 'Numeric', 'Short Text', 'Subjective'];
const NEGATIVE_RULES: readonly NegativeMarkingRule[] = ['none', '1/4', '1/3', '1/2', 'full', 'custom'];
const INTENTS: readonly ExamIntakeIntent[] = ['CREATE_EXAM', 'AUTO_DPP'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Competitive patterns use +4/−1 (the "1/4" rule); boards use 1 mark and no negative marking. */
export function markingForPattern(pattern: string | undefined): {
  defaultMarks: number;
  defaultNegativeMarks: number;
  negativeRule: NegativeMarkingRule;
} {
  return /neet|jee/i.test(pattern ?? '')
    ? { defaultMarks: 4, defaultNegativeMarks: 1, negativeRule: '1/4' }
    : { defaultMarks: 1, defaultNegativeMarks: 0, negativeRule: 'none' };
}

/** `HH:mm` + minutes → `HH:mm`, or null when the result would cross midnight. */
export function addMinutes(time: string, minutes: number): string | null {
  if (!TIME_RE.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "10:00"–"11:00" → 60; undefined unless both are valid and end is after start. */
function windowMinutes(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end || !TIME_RE.test(start) || !TIME_RE.test(end)) return undefined;
  const minutes = minutesOf(end) - minutesOf(start);
  return minutes > 0 ? minutes : undefined;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isRealDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

/** `YYYY-MM-DD` for `now` in `timeZone`. */
/** `HH:mm` (24-hour) for `now` in `timeZone`. */
export function timeInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

export function dateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Language-subject papers (Hindi, Sanskrit) are written in Hindi; everything else in English. */
export function contentLanguage(subject: string | undefined): 'en' | 'hi' {
  return /^(hindi|sanskrit)\b/i.test(subject?.trim() ?? '') ? 'hi' : 'en';
}

function buildTitle(intent: ExamIntakeIntent, pattern: string | undefined, classLevel: string | undefined, subject: string, topic: string): string {
  const prefix = [pattern, classLevel, subject].filter(Boolean).join(' ');
  const suffix = intent === 'AUTO_DPP' ? 'Daily Practice Problems' : 'Practice Test';
  return `${prefix}: ${topic} — ${suffix}`.slice(0, 120);
}

/** Merge defaults into the draft, then report what is missing or invalid. */
export function evaluateDraft(draft: IExamDraft, ctx: IRulesContext): IDraftEvaluation {
  const intent = draft.intent ?? 'CREATE_EXAM';
  const isDpp = intent === 'AUTO_DPP';
  const batch = ctx.batches.find((b) => b.id === draft.batchId);
  const defaulted: string[] = [];

  const pick = <T>(field: string, given: T | undefined, fallback: T | undefined): T | undefined => {
    if (given !== undefined) return given;
    if (fallback !== undefined) defaulted.push(field);
    return fallback;
  };

  const subject = draft.subject;
  const language = contentLanguage(subject);
  // Stated by the teacher, or implied by their start and end time; only a DPP falls back to a default.
  const duration = draft.duration ?? windowMinutes(draft.startTime, draft.endTime) ?? pick('duration', undefined, isDpp ? DPP_DEFAULT_DURATION : undefined);
  const targetQuestions = pick('targetQuestions', draft.targetQuestions, isDpp ? DPP_QUESTION_RANGE.default : undefined);
  const date = pick('date', draft.date, isDpp ? ctx.today : undefined);
  const marking = markingForPattern(batch?.examPattern);
  const defaultMarks = pick('defaultMarks', draft.defaultMarks, marking.defaultMarks);
  const defaultNegativeMarks = pick('defaultNegativeMarks', draft.defaultNegativeMarks, marking.defaultNegativeMarks);
  const negativeRule = pick('negativeRule', draft.negativeRule, marking.negativeRule);
  const endTime = pick(
    'endTime',
    draft.endTime,
    draft.startTime && duration !== undefined ? (addMinutes(draft.startTime, duration) ?? undefined) : undefined,
  );
  const title = pick(
    'title',
    draft.title,
    subject && draft.topic ? buildTitle(intent, batch?.examPattern, batch?.classLevel, subject, draft.topic) : undefined,
  );

  const examParams: Partial<IExamParamsPayload> = {
    title,
    batchId: draft.batchId,
    subject,
    duration,
    targetQuestions,
    defaultMarks,
    defaultNegativeMarks,
    negativeRule,
    date,
    startTime: draft.startTime,
    endTime,
    languages: [language],
    primaryLanguage: language,
    classLevel: batch?.classLevel,
    examPattern: batch?.examPattern,
    shuffleQuestions: true,
    shuffleOptions: true,
    isSubjective: draft.questionType === 'Subjective',
    status: 'draft',
  };
  const generation: Partial<IExamIntakeResult['generation']> = {
    intent,
    topic: draft.topic,
    subtopics: draft.subtopics ?? [],
    difficulty: pick('difficulty', draft.difficulty, 'medium'),
    questionType: pick('questionType', draft.questionType, 'MCQ'),
  };

  const values: Record<(typeof REQUIRED_FIELDS)[number], unknown> = {
    topic: draft.topic,
    batchId: draft.batchId,
    subject,
    targetQuestions,
    date,
    startTime: draft.startTime,
    duration,
  };
  const missing = REQUIRED_FIELDS.filter((f) => values[f] === undefined || values[f] === '');
  const invalid = validate(examParams, intent, ctx).filter((i) => !missing.includes(i.field as (typeof REQUIRED_FIELDS)[number]));

  const complete = missing.length === 0 && invalid.length === 0;
  return {
    examParams,
    generation,
    defaulted,
    missing,
    invalid,
    complete,
    result: complete
      ? { examParams: examParams as IExamParamsPayload, generation: generation as IExamIntakeResult['generation'] }
      : null,
  };
}

/** Constraints from docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §3.2, checked only for fields that are present. */
export function validate(p: Partial<IExamParamsPayload>, intent: ExamIntakeIntent, ctx: IRulesContext): IFieldIssue[] {
  const issues: IFieldIssue[] = [];
  const add = (field: string, issue: string) => issues.push({ field, issue });
  const isInt = (n: number | undefined, min: number, max: number) => n !== undefined && Number.isInteger(n) && n >= min && n <= max;

  if (p.batchId !== undefined && !ctx.batches.some((b) => b.id === p.batchId)) {
    add('batchId', `Unknown batch. Choose one of: ${ctx.batches.map((b) => b.id).join(', ')}`);
  }
  if (p.title !== undefined && (p.title.trim().length < 5 || p.title.length > 120)) add('title', 'Title must be 5–120 characters');
  if (p.duration !== undefined && !isInt(p.duration, 5, 360)) add('duration', 'Duration must be a whole number of minutes between 5 and 360');
  if (p.targetQuestions !== undefined) {
    const [min, max] = intent === 'AUTO_DPP' ? [DPP_QUESTION_RANGE.min, DPP_QUESTION_RANGE.max] : [1, 200];
    if (!isInt(p.targetQuestions, min, max)) add('targetQuestions', `Number of questions must be between ${min} and ${max}`);
  }
  if (p.defaultMarks !== undefined && !(p.defaultMarks >= 1 && p.defaultMarks <= 20)) add('defaultMarks', 'Marks per question must be between 1 and 20');
  if (
    p.defaultNegativeMarks !== undefined &&
    p.defaultMarks !== undefined &&
    !(p.defaultNegativeMarks >= 0 && p.defaultNegativeMarks <= p.defaultMarks)
  ) {
    add('defaultNegativeMarks', 'Negative marks must be between 0 and the marks per question');
  }
  if (p.date !== undefined) {
    if (!isRealDate(p.date)) add('date', 'Date must be a real calendar date in YYYY-MM-DD');
    else if (p.date < ctx.today) add('date', `Date is in the past (today is ${ctx.today})`);
    else if (p.date === ctx.today && ctx.nowTime && p.startTime && TIME_RE.test(p.startTime) && p.startTime <= ctx.nowTime) {
      add('startTime', `Start time ${p.startTime} has already passed today (it is now ${ctx.nowTime})`);
    }
  }
  if (p.startTime !== undefined && !TIME_RE.test(p.startTime)) add('startTime', 'Start time must be 24-hour HH:mm');
  if (p.endTime !== undefined && !TIME_RE.test(p.endTime)) add('endTime', 'End time must be 24-hour HH:mm');
  if (p.startTime && p.endTime && TIME_RE.test(p.startTime) && TIME_RE.test(p.endTime)) {
    const window = minutesOf(p.endTime) - minutesOf(p.startTime);
    if (window <= 0) add('endTime', 'End time must be after start time (same day)');
    else if (p.duration !== undefined && window < p.duration) add('endTime', `The exam window (${window} min) is shorter than the duration (${p.duration} min)`);
  }
  if (p.startTime && !p.endTime && p.duration !== undefined && TIME_RE.test(p.startTime)) {
    add('startTime', 'Start time plus duration runs past midnight');
  }
  return issues;
}

/** `YYYY-MM-DD` + n days (calendar arithmetic, no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Sunday, 22 November 2026": what the agent reads back, so a wrong date is audible. */
export function spokenDate(date: string | undefined): string | undefined {
  if (!date || !isRealDate(date)) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/**
 * Turn untrusted tool-call arguments into a typed draft patch, dropping anything malformed.
 * A `relativeDay` (0 = today, 1 = tomorrow, …) wins over `date`: the date is resolved here, not by the LLM.
 */
export function sanitizeDraftArgs(args: unknown, today?: string): IExamDraft {
  if (!args || typeof args !== 'object') return {};
  const a = args as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === 'string' && (a[k] as string).trim() ? (a[k] as string).trim() : undefined);
  const num = (k: string) => {
    const raw = a[k];
    const v = typeof raw === 'string' ? (raw.trim() ? Number(raw) : NaN) : raw;
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  };
  const oneOf = <T extends string>(k: string, allowed: readonly T[]) => {
    const v = str(k);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  };
  const relativeDay = num('relativeDay');
  const date =
    today && relativeDay !== undefined && Number.isInteger(relativeDay) && relativeDay >= 0 && relativeDay <= 366
      ? addDays(today, relativeDay)
      : str('date');
  const subtopics = Array.isArray(a['subtopics'])
    ? (a['subtopics'] as unknown[]).filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim())
    : undefined;

  const patch: IExamDraft = {
    intent: oneOf('intent', INTENTS),
    batchId: str('batchId'),
    subject: str('subject'),
    topic: str('topic'),
    subtopics,
    difficulty: oneOf('difficulty', DIFFICULTIES),
    questionType: oneOf('questionType', QUESTION_TYPES),
    targetQuestions: num('targetQuestions'),
    duration: num('duration'),
    date,
    startTime: str('startTime'),
    endTime: str('endTime'),
    defaultMarks: num('defaultMarks'),
    defaultNegativeMarks: num('defaultNegativeMarks'),
    negativeRule: oneOf('negativeRule', NEGATIVE_RULES),
    title: str('title'),
  };
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as IExamDraft;
}

/** True when `text` names the batch through one of its aliases (case, punctuation and spacing ignored). */
export function mentionsBatch(text: string, aliases: readonly string[]): boolean {
  const norm = (v: string) => ` ${v.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const haystack = norm(text);
  return aliases.some((alias) => haystack.includes(norm(alias)));
}

/** What the model needs to decide its next utterance. */
export function toolVerdict(ev: IDraftEvaluation): Record<string, unknown> {
  const nextStep = ev.missing.length ? 'ask_missing' : ev.invalid.length ? 'fix_invalid' : 'confirm';
  const p = ev.examParams;
  return {
    nextStep,
    missing: ev.missing,
    invalid: ev.invalid,
    summary: {
      intent: ev.generation.intent,
      title: p.title,
      batchId: p.batchId,
      classLevel: p.classLevel,
      subject: p.subject,
      topic: ev.generation.topic,
      targetQuestions: p.targetQuestions,
      date: p.date,
      dateSpoken: spokenDate(p.date),
      startTime: p.startTime,
      endTime: p.endTime,
      duration: p.duration,
      marking: p.defaultMarks !== undefined ? `+${p.defaultMarks} / -${p.defaultNegativeMarks ?? 0}` : undefined,
    },
    defaulted: ev.defaulted,
  };
}
