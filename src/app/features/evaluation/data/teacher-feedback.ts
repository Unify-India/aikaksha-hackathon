import { IMarkingScheme, ISheetEvaluation, effectiveMarks, questionLabel } from '../models/evaluation.models';

/*
 * Learning from teachers ("supervised" by their approvals and corrections).
 *
 * Every teacher decision is already saved on the sheets: an override (correction), a Review Gate
 * "Approve AI mark" (confirmation), or a whole sheet approved (all its other marks confirmed).
 * These become examples Gemini sees when grading the next sheets of the same question paper,
 * so it converges on this teacher's marking standard. No model training job, no extra cost.
 */

export interface ITeacherDecision {
  questionId: string;
  label: string;
  studentAnswer: string;
  aiMarks: number;
  teacherMarks: number;
  max: number;
  /** corrected = teacher changed the AI's mark; confirmed = teacher kept it. */
  kind: 'corrected' | 'confirmed';
  /** Only confirmations the teacher explicitly checked (Review Gate) are used as examples. */
  explicit: boolean;
}

export interface ILearningStats {
  /** Answers a teacher has checked (corrected or confirmed). */
  checked: number;
  /** Of those, how many kept the AI's mark. */
  agreed: number;
  /** 0–100, or null when nothing has been checked yet. */
  agreementPercent: number | null;
  corrections: number;
}

const MAX_EXAMPLES_PER_QUESTION = 3;
const MAX_EXAMPLES_TOTAL = 40;
const MAX_ANSWER_CHARS = 160;

/** Every teacher decision recorded on the given sheets. */
export function collectDecisions(sheets: ISheetEvaluation[], scheme: IMarkingScheme | null): ITeacherDecision[] {
  const questions = new Map(scheme?.questions.map((q) => [q.id, q]) ?? []);
  const decisions: ITeacherDecision[] = [];
  for (const sheet of sheets) {
    const approved = sheet.status === 'approved';
    for (const q of sheet.questions) {
      const corrected = q.teacherOverride !== undefined && q.teacherOverride !== q.awarded;
      const checked = corrected || q.teacherVerified || approved;
      if (!checked) continue;
      decisions.push({
        questionId: q.questionId,
        label: questionLabel(questions.get(q.questionId), q.questionId),
        studentAnswer: q.studentAnswer,
        aiMarks: q.awarded,
        teacherMarks: effectiveMarks(q),
        max: q.max,
        kind: corrected ? 'corrected' : 'confirmed',
        explicit: corrected || !!q.teacherVerified,
      });
    }
  }
  return decisions;
}

export function learningStats(decisions: ITeacherDecision[]): ILearningStats {
  const corrections = decisions.filter((d) => d.kind === 'corrected').length;
  const checked = decisions.length;
  const agreed = checked - corrections;
  return {
    checked,
    agreed,
    agreementPercent: checked ? Math.round((agreed / checked) * 100) : null,
    corrections,
  };
}

/**
 * Picks the most useful examples for the prompt: every correction first (they teach the most),
 * then explicitly checked confirmations, capped per question and overall to keep requests small.
 */
export function pickExamples(decisions: ITeacherDecision[]): ITeacherDecision[] {
  const useful = decisions.filter((d) => d.kind === 'corrected' || d.explicit);
  const ordered = [...useful.filter((d) => d.kind === 'corrected'), ...useful.filter((d) => d.kind === 'confirmed')];
  const perQuestion = new Map<string, number>();
  const picked: ITeacherDecision[] = [];
  for (const d of ordered) {
    const n = perQuestion.get(d.questionId) ?? 0;
    if (n >= MAX_EXAMPLES_PER_QUESTION || !d.studentAnswer.trim()) continue;
    perQuestion.set(d.questionId, n + 1);
    picked.push(d);
    if (picked.length >= MAX_EXAMPLES_TOTAL) break;
  }
  return picked;
}

/** Prompt section that teaches Gemini this teacher's standard. Empty string when there is nothing to learn yet. */
export function teacherExamplesPrompt(examples: ITeacherDecision[]): string {
  if (!examples.length) return '';
  const lines = examples.map((e) => {
    const answer = e.studentAnswer.length > MAX_ANSWER_CHARS ? `${e.studentAnswer.slice(0, MAX_ANSWER_CHARS)}…` : e.studentAnswer;
    return e.kind === 'corrected'
      ? `- ${e.label} (max ${e.max}): student wrote "${answer}". AI gave ${e.aiMarks}; the TEACHER CORRECTED it to ${e.teacherMarks}.`
      : `- ${e.label} (max ${e.max}): student wrote "${answer}". AI gave ${e.aiMarks}; the teacher CONFIRMED ${e.teacherMarks}.`;
  });
  return [
    "This teacher's past decisions on other students' answers to this paper. Follow the same marking standard",
    '(how strict, how much partial credit) when the work is similar. Grade the current student independently on their own work.',
    ...lines,
  ].join('\n');
}

export interface IAccuracyEstimate {
  /** 0–100 headline accuracy, or null when nothing has been graded yet. */
  percent: number | null;
  /** Answers whose correctness a teacher decided (kept = right, changed = wrong). */
  measured: number;
  /** Of the measured answers, the share the teacher kept (0–100), or null if none. */
  measuredPercent: number | null;
  /** Answers not yet checked by a teacher — counted at the AI's own confidence. */
  estimated: number;
  /** Average AI confidence on the unchecked answers (0–100), or null if none. */
  estimatedPercent: number | null;
  /** Answers below the 90% review threshold that no teacher has checked yet. */
  lowConfidence: number;
  /** Every answer ever flagged for review (AI confidence below 90%), including ones since checked. */
  flagged: number;
}

/**
 * Dynamic AI accuracy for a set of graded sheets.
 * Teacher-checked answers count as the truth (kept = 1, corrected = 0); unchecked answers count at
 * Gemini's self-reported confidence. As teachers review, the score moves from "estimated" to "measured".
 */
export function accuracyEstimate(sheets: ISheetEvaluation[]): IAccuracyEstimate {
  let measured = 0;
  let measuredRight = 0;
  let estimated = 0;
  let estimatedSum = 0;
  let lowConfidence = 0;
  let flagged = 0;
  for (const sheet of sheets) {
    if (!['graded', 'needs_review', 'approved'].includes(sheet.status)) continue;
    const approved = sheet.status === 'approved';
    for (const q of sheet.questions) {
      if (q.confidence < 0.9) flagged++;
      const corrected = q.teacherOverride !== undefined && q.teacherOverride !== q.awarded;
      if (corrected || q.teacherVerified || approved) {
        measured++;
        if (!corrected) measuredRight++;
      } else {
        estimated++;
        estimatedSum += q.confidence;
        if (q.confidence < 0.9) lowConfidence++;
      }
    }
  }
  const total = measured + estimated;
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    percent: total ? pct((measuredRight + estimatedSum) / total) : null,
    measured,
    measuredPercent: measured ? pct(measuredRight / measured) : null,
    estimated,
    estimatedPercent: estimated ? pct(estimatedSum / estimated) : null,
    lowConfidence,
    flagged,
  };
}
