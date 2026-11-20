import { effectiveMarks, IQuestionResult, ISheetEvaluation } from '../models/evaluation.models';

/** Below this AI confidence an answer (or a sheet's handwriting) needs a teacher's check. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.9;

/** An answer needs review until the teacher overrides its marks or accepts the AI's marks. */
export function isAnswerFlagged(q: IQuestionResult): boolean {
  return q.confidence < REVIEW_CONFIDENCE_THRESHOLD && q.teacherOverride === undefined && !q.teacherVerified;
}

/** The whole sheet's handwriting was hard to read and the teacher hasn't checked it yet. */
export function isHandwritingFlagged(sheet: ISheetEvaluation): boolean {
  return sheet.ocrConfidence > 0 && sheet.ocrConfidence < REVIEW_CONFIDENCE_THRESHOLD && !sheet.ocrVerified;
}

/**
 * Recomputes totals and the review flag from per-question results (never trust a model's own sums).
 * Clearing every flag moves a sheet from 'needs_review' to 'graded' — never to 'approved'
 * (final sign-off stays with the teacher in the Evaluation Cockpit).
 */
export function summariseSheet(sheet: ISheetEvaluation): ISheetEvaluation {
  const totalAwarded = sheet.questions.reduce((sum, q) => sum + effectiveMarks(q), 0);
  const needsReview = sheet.questions.some(isAnswerFlagged) || isHandwritingFlagged(sheet);
  const status =
    sheet.status === 'graded' || sheet.status === 'needs_review'
      ? needsReview
        ? 'needs_review'
        : 'graded'
      : sheet.status;
  return { ...sheet, totalAwarded, needsReview, status };
}
