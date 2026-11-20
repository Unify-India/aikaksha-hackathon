/**
 * Workflow B — answer-sheet evaluation data shapes.
 *
 * These mirror `server/src/evaluation/evaluation.types.ts`. When the shared
 * `api.contracts.ts` lands, move these into it and re-export from here.
 */

/** Gemini bounding box: [ymin, xmin, ymax, xmax], each scaled 0–1000 relative to the page. */
export type Box2d = [ymin: number, xmin: number, ymax: number, xmax: number];

export type EvalQuestionType = 'mcq' | 'subjective';

/** One scoring step inside a written answer (e.g. "Correct substitution x = a tanθ" → 1 mark). */
export interface IMarkingStep {
  id: string;
  description: string;
  marks: number;
}

export interface IMarkingSchemeQuestion {
  /** Stable id, e.g. "B2" or "C8". */
  id: string;
  /** Label as printed on the paper, e.g. "8" or "2(i)". */
  number: string;
  section?: string;
  type: EvalQuestionType;
  questionText: string;
  maxMarks: number;
  /** MCQ only: the correct option label as printed, e.g. "b". */
  correctOption?: string;
  /** Subjective only: a short worked model answer. */
  modelAnswer?: string;
  /** Subjective only: step-wise marks that add up to maxMarks. */
  steps: IMarkingStep[];
}

export type MarkingSchemeSource = 'workflow_a_exam' | 'question_paper';
/** draft = uploaded, Gemini still drafting · pending = drafted, waiting for teacher approval · approved = ready for grading. */
export type MarkingSchemeStatus = 'draft' | 'pending' | 'approved';

export interface IMarkingScheme {
  id: string;
  title: string;
  subject: string;
  classLevel?: string;
  source: MarkingSchemeSource;
  /** Set when source is 'workflow_a_exam'. */
  examId?: string;
  /** SHA-256 of the uploaded question paper, when source is 'question_paper'. */
  questionPaperChecksum?: string;
  status: MarkingSchemeStatus;
  totalMarks: number;
  questions: IMarkingSchemeQuestion[];
  /** Storage path of the uploaded question paper PDF, when saved. */
  filePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Where on the sheet the evidence for an answer sits. */
export interface IEvidenceRegion {
  /** 1-based page number in the uploaded file. */
  page: number;
  box_2d: Box2d;
}

export interface IStepResult {
  stepId: string;
  awarded: number;
  max: number;
  reasoning: string;
}

export type QuestionVerdict = 'correct' | 'partial' | 'wrong' | 'not_attempted';

export interface IQuestionResult {
  questionId: string;
  verdict: QuestionVerdict;
  /** Marks the AI awarded (0..max). */
  awarded: number;
  max: number;
  /** Short transcription of what the student wrote (handwriting read by Gemini). */
  studentAnswer: string;
  /** One or two sentences of feedback for the teacher. */
  feedback: string;
  /** 0–1. Below 0.70 the question is flagged for teacher review. */
  confidence: number;
  steps: IStepResult[];
  /** Usually one region; a long answer can span pages. Empty if not found on the sheet. */
  evidence: IEvidenceRegion[];
  /** Marks set by the teacher in the cockpit, overriding `awarded`. */
  teacherOverride?: number;
  /** The teacher checked a low-confidence answer and accepted the AI's marks (Review Gate). */
  teacherVerified?: boolean;
}

export type SheetStatus = 'queued' | 'grading' | 'graded' | 'needs_review' | 'approved' | 'failed';

export interface ISheetEvaluation {
  submissionId: string;
  jobId: string;
  schemeId: string;
  /** Anonymised label shown in the UI, e.g. "Student A". Real names are never displayed. */
  studentLabel: string;
  fileName: string;
  mimeType: string;
  pageCount: number;
  /** SHA-256 of the original uploaded bytes (proves the original was never modified). */
  checksum: string;
  status: SheetStatus;
  questions: IQuestionResult[];
  totalAwarded: number;
  totalMax: number;
  /** 0–1 overall handwriting-reading confidence. */
  ocrConfidence: number;
  needsReview: boolean;
  /** The teacher checked a sheet whose overall handwriting confidence was low. */
  ocrVerified?: boolean;
  error?: string;
  approvedAt?: string;
  /** Storage path of the original (renamed) PDF, when saved. */
  filePath?: string;
  updatedAt?: string;
}

/** Status stored in Firestore for a student's paper. */
export type StoredSheetStatus = 'draft' | 'in_progress' | 'graded' | 'approved' | 'failed';

/** Maps the screen's detailed sheet status onto the stored status. */
export function toStoredSheetStatus(status: SheetStatus): StoredSheetStatus {
  switch (status) {
    case 'queued':
      return 'draft';
    case 'grading':
      return 'in_progress';
    case 'graded':
    case 'needs_review':
      return 'graded';
    default:
      return status;
  }
}

/**
 * The teacher's original pen marks on a sheet, read separately from grading.
 * Used only to measure how often the AI agrees with the teacher — never shown to Gemini while grading.
 */
export interface ITeacherReferenceMarks {
  submissionId: string;
  totalAwarded?: number;
  perQuestion: Record<string, number>;
}

export interface IGradingJob {
  id: string;
  schemeId: string;
  createdAt: string;
  sheets: ISheetEvaluation[];
}

/** Live progress events for the grading tool chain (same shape family as Workflow A's RunEvent). */
export type EvaluationTool =
  | 'draft_marking_scheme'
  | 'apply_teacher_feedback'
  | 'prepare_pages'
  | 'grade_answer_sheet'
  | 'flag_for_review';

export type EvaluationRunEvent =
  | { type: 'tool_started'; tool: EvaluationTool; submissionId?: string; at: number }
  | {
      type: 'tool_finished';
      tool: EvaluationTool;
      submissionId?: string;
      durationMs: number;
      summary: string;
    }
  | { type: 'tool_failed'; tool: EvaluationTool; submissionId?: string; error: string }
  | { type: 'sheet_updated'; sheet: ISheetEvaluation }
  | { type: 'scheme_drafted'; scheme: IMarkingScheme }
  | { type: 'run_completed'; jobId: string };

/** Marks that count for a question: the teacher's override if set, else the AI's. */
export function effectiveMarks(result: IQuestionResult): number {
  return result.teacherOverride ?? result.awarded;
}

/** Verdict that matches the marks that count (a teacher override can turn ✓ into ✗ and vice versa). */
export function effectiveVerdict(result: IQuestionResult): QuestionVerdict {
  if (result.teacherOverride === undefined) return result.verdict;
  if (result.teacherOverride >= result.max) return 'correct';
  return result.teacherOverride <= 0 ? 'wrong' : 'partial';
}

/** Human label for a question, unique across sections: "B·Q2", or "Q2" when the paper has no sections. */
export function questionLabel(question: Pick<IMarkingSchemeQuestion, 'number' | 'section'> | undefined, fallbackId: string): string {
  if (!question) return fallbackId;
  return question.section ? `${question.section}·Q${question.number}` : `Q${question.number}`;
}
