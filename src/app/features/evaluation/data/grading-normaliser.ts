import {
  Box2d,
  IEvidenceRegion,
  IMarkingScheme,
  IMarkingSchemeQuestion,
  IQuestionResult,
  QuestionVerdict,
} from '../models/evaluation.models';
import type { IRawDraftScheme, IRawGrading } from './gemini-prompts';

/*
 * Turns raw Gemini JSON into trusted data. The model's numbers are treated as suggestions:
 * marks are clamped to the scheme, MCQs are scored against the key here, totals are recomputed,
 * and malformed boxes are dropped. Pure functions — reusable on the server.
 */

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);
const toHalf = (value: number) => Math.round(value * 2) / 2;
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function normaliseOption(option: string | null | undefined): string | null {
  const match = option?.toLowerCase().match(/[a-e]/);
  return match ? match[0] : null;
}

function verdictFor(awarded: number, max: number, attempted: boolean): QuestionVerdict {
  if (!attempted) return 'not_attempted';
  if (awarded >= max) return 'correct';
  return awarded <= 0 ? 'wrong' : 'partial';
}

type RawEvidence = { page?: number; box_2d?: number[] }[] | undefined;

function validEvidence(evidence: RawEvidence, pageCount: number): IEvidenceRegion[] {
  return (evidence ?? []).flatMap((region) => {
    const page = num(region?.page, 0);
    const box = region?.box_2d;
    if (!Number.isInteger(page) || page < 1 || page > pageCount || !Array.isArray(box) || box.length !== 4) return [];
    const [ymin, xmin, ymax, xmax] = box.map((v) => clamp(Math.round(num(v, -1)), 0, 1000));
    if (ymax - ymin < 5 || xmax - xmin < 5) return [];
    return [{ page, box_2d: [ymin, xmin, ymax, xmax] as Box2d }];
  });
}

/** Builds one trusted result per scheme question from Gemini's raw grading. */
export function normaliseGrading(
  raw: IRawGrading,
  scheme: IMarkingScheme,
  pageCount: number,
): { questions: IQuestionResult[]; ocrConfidence: number } {
  const byId = new Map((raw.questions ?? []).filter((q) => q?.questionId).map((q) => [q.questionId as string, q]));

  const questions = scheme.questions.map((q): IQuestionResult => {
    const r = byId.get(q.id);
    if (!r) {
      return {
        questionId: q.id,
        verdict: 'not_attempted',
        awarded: 0,
        max: q.maxMarks,
        studentAnswer: '',
        feedback: 'Gemini did not report this question — please check the sheet.',
        confidence: 0.3,
        steps: q.steps.map((s) => ({ stepId: s.id, awarded: 0, max: s.marks, reasoning: 'Not reported.' })),
        evidence: [],
      };
    }

    const attempted = r.attempted !== false;
    const confidence = clamp(num(r.confidence, 0.5), 0, 1);
    const evidence = attempted ? validEvidence(r.evidence, pageCount) : [];
    const base = {
      questionId: q.id,
      max: q.maxMarks,
      studentAnswer: (r.studentAnswer ?? '').slice(0, 400),
      feedback: r.feedback ?? '',
      confidence,
      evidence,
    };

    if (q.type === 'mcq') {
      const chosen = normaliseOption(r.chosenOption);
      const correct = normaliseOption(q.correctOption);
      const awarded = attempted && chosen !== null && chosen === correct ? q.maxMarks : 0;
      return {
        ...base,
        studentAnswer: base.studentAnswer || (chosen ? `Marked (${chosen})` : ''),
        verdict: verdictFor(awarded, q.maxMarks, attempted && chosen !== null),
        awarded,
        steps: [],
      };
    }

    const rawSteps = new Map((r.steps ?? []).filter((s) => s?.stepId).map((s) => [s.stepId as string, s]));
    const steps = q.steps.map((s) => {
      const rs = rawSteps.get(s.id);
      return {
        stepId: s.id,
        awarded: attempted ? clamp(toHalf(num(rs?.awarded, 0)), 0, s.marks) : 0,
        max: s.marks,
        reasoning: rs?.reasoning ?? (attempted ? 'No reasoning given.' : 'Not attempted.'),
      };
    });
    const awarded = clamp(steps.reduce((sum, s) => sum + s.awarded, 0), 0, q.maxMarks);
    return { ...base, verdict: verdictFor(awarded, q.maxMarks, attempted), awarded, steps };
  });

  return { questions, ocrConfidence: clamp(num(raw.ocrConfidence, 0.5), 0, 1) };
}

/** Turns Gemini's drafted scheme into a valid IMarkingScheme (ids, step totals, option letters). */
export function normaliseDraftScheme(raw: IRawDraftScheme, id: string, questionPaperChecksum: string): IMarkingScheme {
  const seen = new Set<string>();
  const questions: IMarkingSchemeQuestion[] = (raw.questions ?? []).map((q, index) => {
    const section = (q.section ?? '').trim().toUpperCase().slice(0, 3);
    const number = String(q.number ?? index + 1).trim() || String(index + 1);
    let qid = `${section}${number}`.replace(/[^A-Za-z0-9]/g, '') || `Q${index + 1}`;
    while (seen.has(qid)) qid = `${qid}_`;
    seen.add(qid);

    const maxMarks = Math.max(toHalf(num(q.maxMarks, 1)), 0.5);
    if (q.type === 'mcq') {
      return {
        id: qid,
        number,
        section: section || undefined,
        type: 'mcq',
        questionText: q.questionText ?? '',
        maxMarks,
        correctOption: normaliseOption(q.correctOption) ?? undefined,
        steps: [],
      };
    }

    let steps = (q.steps ?? [])
      .map((s) => ({ description: s.description ?? '', marks: Math.max(toHalf(num(s.marks, 0)), 0) }))
      .filter((s) => s.marks > 0);
    const sum = steps.reduce((total, s) => total + s.marks, 0);
    if (steps.length === 0 || sum > maxMarks) {
      steps = [{ description: 'Complete, correct answer', marks: maxMarks }];
    } else if (sum < maxMarks) {
      const last = steps[steps.length - 1];
      steps = [...steps.slice(0, -1), { ...last, marks: last.marks + (maxMarks - sum) }];
    }

    return {
      id: qid,
      number,
      section: section || undefined,
      type: 'subjective',
      questionText: q.questionText ?? '',
      maxMarks,
      modelAnswer: q.modelAnswer ?? undefined,
      steps: steps.map((s, i) => ({ id: `${qid}-${i + 1}`, description: s.description, marks: s.marks })),
    };
  });

  return {
    id,
    title: raw.title?.trim() || 'Drafted marking scheme',
    subject: raw.subject?.trim() || 'Unknown subject',
    classLevel: raw.classLevel?.trim() || undefined,
    source: 'question_paper',
    questionPaperChecksum,
    status: 'draft',
    totalMarks: questions.reduce((sum, q) => sum + q.maxMarks, 0),
    questions,
  };
}
