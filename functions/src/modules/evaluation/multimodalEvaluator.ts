import * as crypto from 'crypto';
import { generateStructuredJson } from '../../providers/gemini.provider.js';
import {
  BoundingBox2D,
  IRubricStepItem,
  ISubjectiveStepEvaluation,
  SUBJECTIVE_VISION_SYSTEM_INSTRUCTION,
  subjectiveVisionSchema,
} from '../../prompts/subjectiveVision.prompt.js';

export interface IEvaluationSheetPayload {
  submissionId: string;
  examId?: string;
  questionId?: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';
  fileBase64: string; // Base64-encoded raw file bytes
  rubricSteps: IRubricStepItem[];
  modelAnswer?: string;
}

export interface IEvaluationResponse {
  submissionId: string;
  examId?: string;
  questionId?: string;
  sha256Checksum: string;
  totalMarksAwarded: number;
  maxPossibleMarks: number;
  ocrConfidence: number;
  needsReview: boolean;
  steps: ISubjectiveStepEvaluation[];
  overallFeedback: string;
  evaluatedAt: string;
}

/**
 * Computes SHA-256 checksum of raw base64 or buffer to ensure immutable original verification.
 */
export function computeSha256Checksum(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    // If base64 string, hash the decoded binary representation
    const buffer = Buffer.from(data, 'base64');
    hash.update(buffer);
  } else {
    hash.update(data);
  }
  return hash.digest('hex');
}

/**
 * Evaluates handwritten student answer sheet (PDF or image) using Gemini Multimodal Vision API.
 */
export async function evaluateStudentAnswerSheet(
  payload: IEvaluationSheetPayload
): Promise<IEvaluationResponse> {
  const { submissionId, examId, questionId, mimeType, fileBase64, rubricSteps, modelAnswer } = payload;

  if (!fileBase64) {
    throw new Error('fileBase64 content is required for multimodal vision evaluation');
  }

  if (!rubricSteps || rubricSteps.length === 0) {
    throw new Error('At least one rubric step is required');
  }

  // 1. Compute SHA-256 integrity checksum of original immutable file
  const sha256Checksum = computeSha256Checksum(fileBase64);

  // 2. Prepare prompt with rubric breakdown
  const rubricText = rubricSteps
    .map(
      (step, idx) =>
        `Step ${idx + 1} [ID: ${step.stepId}]: "${step.stepTitle}" (Max Marks: ${step.maxMarks})\nExpected Criteria: ${step.expectedContent}`
    )
    .join('\n\n');

  const prompt = `Please evaluate the attached student answer sheet against the following rubric steps:

RUBRIC STEPS:
${rubricText}

${modelAnswer ? `MODEL / BENCHMARK DERIVATION REFERENCE:\n${modelAnswer}\n` : ''}

CRITICAL INSTRUCTIONS:
- Trace the student's handwritten steps directly on the sheet.
- For each step, determine the awarded marks (0 to maxMarks) and explain your reasoning.
- Provide normalized box_2d [ymin, xmin, ymax, xmax] coordinates (0 to 1000) locating the evidence on the sheet.
- Estimate your confidence (0.0 to 1.0) for each step and overall handwriting OCR.
- Produce the output strictly matching the provided JSON schema.`;

  // 3. Call Gemini 2.5 Flash with multimodal inlineData
  const rawResult = await generateStructuredJson<{
    totalMarksAwarded: number;
    ocrConfidence: number;
    steps: Array<{
      stepId: string;
      stepTitle: string;
      awardedMarks: number;
      maxMarks: number;
      reasoning: string;
      confidence: number;
      pageNumber: number;
      box_2d: BoundingBox2D;
      studentDerivationSnippets?: string;
    }>;
    overallPedagogicalFeedback: string;
  }>({
    model: 'gemini-2.5-flash',
    systemInstruction: SUBJECTIVE_VISION_SYSTEM_INSTRUCTION,
    prompt,
    schema: subjectiveVisionSchema,
    inlineDataParts: [
      {
        mimeType,
        data: fileBase64,
      },
    ],
    temperature: 0.15,
    thinkingBudget: 1536,
  });

  // 4. Calculate thresholding & teacher-in-the-loop review gating
  const CONFIDENCE_REVIEW_THRESHOLD = 0.70;
  let hasLowConfidenceStep = false;
  let maxPossibleMarks = 0;

  const processedSteps: ISubjectiveStepEvaluation[] = (rawResult.steps || []).map((s) => {
    maxPossibleMarks += s.maxMarks;
    const isStepUncertain = (s.confidence ?? 1.0) < CONFIDENCE_REVIEW_THRESHOLD;
    if (isStepUncertain) {
      hasLowConfidenceStep = true;
    }

    // Ensure box_2d coordinates are clamped within 0-1000
    const clampedBox: BoundingBox2D = Array.isArray(s.box_2d) && s.box_2d.length === 4
      ? [
          Math.max(0, Math.min(1000, Math.round(s.box_2d[0]))),
          Math.max(0, Math.min(1000, Math.round(s.box_2d[1]))),
          Math.max(0, Math.min(1000, Math.round(s.box_2d[2]))),
          Math.max(0, Math.min(1000, Math.round(s.box_2d[3]))),
        ]
      : [0, 0, 1000, 1000];

    return {
      stepId: s.stepId,
      stepTitle: s.stepTitle,
      awardedMarks: s.awardedMarks,
      maxMarks: s.maxMarks,
      reasoning: s.reasoning,
      confidence: s.confidence,
      pageNumber: s.pageNumber || 1,
      box_2d: clampedBox,
      needsReview: isStepUncertain,
      studentDerivationSnippets: s.studentDerivationSnippets,
    };
  });

  const overallOcrConfidence = rawResult.ocrConfidence ?? 0.85;
  const needsReview = hasLowConfidenceStep || overallOcrConfidence < CONFIDENCE_REVIEW_THRESHOLD;

  return {
    submissionId,
    examId,
    questionId,
    sha256Checksum,
    totalMarksAwarded: rawResult.totalMarksAwarded,
    maxPossibleMarks: maxPossibleMarks > 0 ? maxPossibleMarks : 20,
    ocrConfidence: overallOcrConfidence,
    needsReview,
    steps: processedSteps,
    overallFeedback: rawResult.overallPedagogicalFeedback,
    evaluatedAt: new Date().toISOString(),
  };
}
