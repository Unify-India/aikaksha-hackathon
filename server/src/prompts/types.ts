/**
 * TEMPORARY server-side mirror of the Angular models this module needs.
 *
 * The server cannot import from `src/app`, and `server/src/contracts.ts` (Sandeep) has not
 * landed yet. Once it does, delete this file and import these types from `../contracts.js`.
 *
 * Shapes follow `src/app/shared/models/voice-agent.model.ts` and `exam.model.ts`, including the
 * planned changes from docs/IMPLEMENTATION_PLAN.md ("Shared Reference"): `AUTO_DPP` action and
 * `dateText` slot.
 */

export type NegativeRule = 'none' | '1/2' | '1/3' | '1/4';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionTypeValue = 'MCQ' | 'Numeric' | 'Short Text' | 'Subjective';
export type OptionId = 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5';

export interface IVoiceIntent {
  rawTranscript: string;
  detectedAction:
    | 'CREATE_EXAM'
    | 'AUTO_DPP'
    | 'EDIT_QUESTIONS'
    | 'PUBLISH_EXAM'
    | 'EVALUATE_SUBMISSION'
    | 'UNKNOWN';
  confidence: number;
  extractedSlots: {
    title?: string;
    batchName?: string;
    batchId?: string;
    subject?: string;
    topic?: string;
    subtopic?: string;
    questionCount?: number;
    durationMinutes?: number;
    marksPerQuestion?: number;
    negativeRule?: NegativeRule;
    questionType?: QuestionTypeValue;
    difficulty?: Difficulty;
    /** Relative or absolute date words as spoken ("tomorrow", "next Monday", "21 Nov"). */
    dateText?: string;
    /** Filled by the server (`resolveSchedule`), never by the model. */
    scheduledDate?: string;
    startTime?: string;
    endTime?: string;
    examPattern?: string;
  };
  missingRequiredSlots: string[];
  isComplete: boolean;
}

export interface IOptionContent {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface ILocalizedQuestionContent {
  text: string;
  options?: IOptionContent[];
  explanation?: string;
  audioUrl?: string;
}

export interface IExamQuestion {
  id: string;
  type: QuestionTypeValue;
  marks: number;
  negativeMarks: number;
  subject: string;
  topic: string;
  subtopic?: string;
  difficulty: Difficulty;
  classLevel?: string;
  examPattern?: string;
  en?: ILocalizedQuestionContent;
  hi?: ILocalizedQuestionContent;
  correctOptionId?: string;
  answer?: string | number;
  explanation?: string;
  isAiGenerated?: boolean;
  validationWarnings?: string[];
}
