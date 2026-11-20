export enum ExamStatus {
  Draft = 'draft',
  Validated = 'validated',
  PublishPendingConfirmation = 'publish_pending_confirmation',
  Upcoming = 'upcoming',
  Live = 'live',
  Open = 'open',
  Closed = 'closed',
}

export enum QuestionType {
  MCQ = 'MCQ',
  Numeric = 'Numeric',
  ShortText = 'Short Text',
  Subjective = 'Subjective',
}

export enum NegativeMarkingRule {
  None = 'none',
  Half = '1/2',
  OneThird = '1/3',
  OneQuarter = '1/4',
}

export enum ExamPatternPreset {
  CBSE = 'CBSE',
  NEET = 'NEET',
  JEE = 'JEE',
  ICSE = 'ICSE',
  BPSC = 'BPSC',
  Custom = 'Custom',
}

export const EXAM_CONSTANTS = {
  DEFAULT_DURATION_MINUTES: 60,
  DEFAULT_TARGET_QUESTIONS: 10,
  DEFAULT_MARKS: 4,
  MAX_MARKS: 20,
  MIN_MARKS: 1,
  DEFAULT_NEGATIVE_RULE: NegativeMarkingRule.None,
  DEFAULT_PRIMARY_LANGUAGE: 'en',
  SUPPORTED_LANGUAGES: ['en', 'hi'] as const,
  GEMINI_DEFAULT_MODEL: 'gemini-2.5-flash',
  MAX_QUESTIONS_PER_GEMINI_CALL: 15,
  MIN_OPTIONS_COUNT: 2,
  MAX_OPTIONS_COUNT: 5,
} as const;

export function computeNegativeMarks(marks: number, rule: NegativeMarkingRule): number {
  switch (rule) {
    case NegativeMarkingRule.Half:
      return marks * 0.5;
    case NegativeMarkingRule.OneThird:
      return Number((marks / 3).toFixed(2));
    case NegativeMarkingRule.OneQuarter:
      return marks * 0.25;
    case NegativeMarkingRule.None:
    default:
      return 0;
  }
}
