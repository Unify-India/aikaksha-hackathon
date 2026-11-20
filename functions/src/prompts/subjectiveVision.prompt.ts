import { Type } from '@google/genai';

/**
 * Normalized 2D bounding box [ymin, xmin, ymax, xmax] scaled 0 to 1000.
 * Used for high-precision SVG red-pen overlay on client side.
 */
export type BoundingBox2D = [number, number, number, number];

export interface IRubricStepItem {
  stepId: string;
  stepTitle: string;
  expectedContent: string;
  maxMarks: number;
}

export interface ISubjectiveStepEvaluation {
  stepId: string;
  stepTitle: string;
  awardedMarks: number;
  maxMarks: number;
  reasoning: string;
  confidence: number; // 0.0 - 1.0
  pageNumber: number;
  box_2d: BoundingBox2D; // [ymin, xmin, ymax, xmax] 0-1000
  needsReview: boolean;
  studentDerivationSnippets?: string;
}

export interface ISubjectiveVisionEvaluationResult {
  submissionId: string;
  examId?: string;
  questionId?: string;
  totalMarksAwarded: number;
  maxPossibleMarks: number;
  ocrConfidence: number; // 0.0 - 1.0
  needsReview: boolean; // Flagged if overall or any step confidence < 0.70
  steps: ISubjectiveStepEvaluation[];
  overallPedagogicalFeedback: string;
  penColorRecommendation?: string; // e.g. '#EF4444' for red pen overlay
}

export const subjectiveVisionSchema = {
  type: Type.OBJECT,
  properties: {
    totalMarksAwarded: {
      type: Type.NUMBER,
      description: 'Sum of marks awarded across all rubric steps.',
    },
    ocrConfidence: {
      type: Type.NUMBER,
      description: 'Confidence in handwriting OCR legibility (0.0 to 1.0).',
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stepId: {
            type: Type.STRING,
            description: 'The unique rubric step ID matching the provided rubric.',
          },
          stepTitle: {
            type: Type.STRING,
            description: 'Title of the grading step.',
          },
          awardedMarks: {
            type: Type.NUMBER,
            description: 'Marks awarded for this specific step (0 <= awardedMarks <= maxMarks). Partial marks allowed (e.g. 1.5).',
          },
          maxMarks: {
            type: Type.NUMBER,
            description: 'Maximum marks possible for this step.',
          },
          reasoning: {
            type: Type.STRING,
            description: 'Constructive pedagogical justification explaining what the student got right, partial errors, or missed terms.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Model confidence in grading this step (0.0 to 1.0).',
          },
          pageNumber: {
            type: Type.INTEGER,
            description: '1-indexed page number of the student sheet where this step evidence appears.',
          },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Normalized bounding box [ymin, xmin, ymax, xmax] on a scale of 0 to 1000 pinpointing the handwritten evidence on the sheet.',
          },
          studentDerivationSnippets: {
            type: Type.STRING,
            description: 'Transcribed handwritten snippet or formula found at the box coordinates.',
          },
        },
        required: [
          'stepId',
          'stepTitle',
          'awardedMarks',
          'maxMarks',
          'reasoning',
          'confidence',
          'pageNumber',
          'box_2d',
        ],
      },
      description: 'Step-by-step breakdown according to the rubric.',
    },
    overallPedagogicalFeedback: {
      type: Type.STRING,
      description: 'Comprehensive constructive guidance for the student explaining conceptual gaps or commendable steps.',
    },
  },
  required: ['totalMarksAwarded', 'ocrConfidence', 'steps', 'overallPedagogicalFeedback'],
};

export const SUBJECTIVE_VISION_SYSTEM_INSTRUCTION = `You are a Senior CBSE & IIT-JEE Subjective Answer Sheet Evaluator and Multimodal Vision Grading Agent.

You evaluate handwritten student answer sheets (provided as raw PDF or image base64) with granular, step-by-step rubric criteria.

CORE OBJECTIVES:
1. Pedagogical Rubric Grading:
   - For every rubric step, strictly verify mathematical steps, boundary conditions, free-body diagrams, and algebraic substitution.
   - Award partial marks according to student work (e.g. correct formula setup gets marks even if final arithmetic has an error).
   - If a step is completely missing or mathematically invalid, award 0 with clear reasoning.
2. Handwriting OCR Guidelines:
   - Carefully interpret Indian cursive, messy numerals, cancellations, scratched-out work, and subscript/superscript ambiguities.
   - Ignore struck-through / crossed-out equations.
   - Rate your overall OCR legibility confidence in 'ocrConfidence' (0.0 to 1.0).
3. Coordinate Localization (box_2d):
   - For each evaluated rubric step, you MUST locate the student's handwritten work on the sheet.
   - Return 'box_2d' as a 4-element array: [ymin, xmin, ymax, xmax] normalized between 0 and 1000.
     - 0 represents top/left edge, 1000 represents bottom/right edge.
   - For example: [240, 110, 390, 890] indicates the student's derivation of Gauss's Law in the upper-third of the page.
   - This box is rendered in the Angular frontend as an SVG red-pen callout and review box.
4. Uncertainty & Review Flagging:
   - If handwriting is unreadable, ambiguous, or your step confidence is below 0.70, state the uncertainty explicitly.
`;
