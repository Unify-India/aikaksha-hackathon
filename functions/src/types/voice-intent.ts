/**
 * Voice/typed intent shapes shared by intent extraction, scheduling and the workflow.
 * Mirrors src/app/shared/models/voice-agent.model.ts (Angular), plus the plan's additions:
 * the AUTO_DPP action and the `dateText` slot (docs/IMPLEMENTATION_PLAN.md, "Shared Reference").
 */

export type NegativeRule = 'none' | '1/2' | '1/3' | '1/4';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionTypeValue = 'MCQ' | 'Numeric' | 'Short Text' | 'Subjective';

export interface IVoiceIntent {
  rawTranscript: string;
  detectedAction: 'CREATE_EXAM' | 'AUTO_DPP' | 'EDIT_QUESTIONS' | 'PUBLISH_EXAM' | 'EVALUATE_SUBMISSION' | 'UNKNOWN';
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

/** Negative marks per wrong answer for a rule, e.g. 4 marks with '1/4' -> 1. */
export function negativeMarksFor(marks: number, rule: NegativeRule | undefined): number {
  switch (rule) {
    case '1/2':
      return marks / 2;
    case '1/3':
      return Number((marks / 3).toFixed(2));
    case '1/4':
      return marks / 4;
    default:
      return 0;
  }
}
