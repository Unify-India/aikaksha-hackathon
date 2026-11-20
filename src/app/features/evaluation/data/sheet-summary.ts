import { effectiveMarks, ISheetEvaluation } from '../models/evaluation.models';

export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

/** Recomputes totals and the review flag from per-question results (never trust a model's own sums). */
export function summariseSheet(sheet: ISheetEvaluation): ISheetEvaluation {
  const totalAwarded = sheet.questions.reduce((sum, q) => sum + effectiveMarks(q), 0);
  const needsReview =
    sheet.questions.some((q) => q.confidence < REVIEW_CONFIDENCE_THRESHOLD && q.teacherOverride === undefined) ||
    (sheet.ocrConfidence > 0 && sheet.ocrConfidence < REVIEW_CONFIDENCE_THRESHOLD);
  return { ...sheet, totalAwarded, needsReview };
}
