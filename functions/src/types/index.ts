export enum QuestionType {
  MCQ = 'MCQ',
  Numeric = 'Numeric',
  ShortText = 'Short Text',
  Subjective = 'Subjective',
}

export interface IOption {
  id: string; // e.g. 'opt1', 'opt2' or 'A', 'B'
  text: string;
}

export interface IQuestionContent {
  text: string;
  options?: IOption[];
}

export interface IExplanation {
  en?: string;
  hi?: string;
}

export interface IBaseQuestion {
  id?: string;
  type: QuestionType | string;
  marks: number;
  negativeMarks?: number;
  subject: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  classLevel?: string;
  examPattern?: string;
  teacherId?: string;
  createdAt?: string;
  updatedAt?: string;

  en?: IQuestionContent;
  hi?: IQuestionContent;

  examId?: string;
  sectionId?: string;
  [langCode: string]: unknown;
}

export interface IExamQuestion extends IBaseQuestion {
  correctOptionId?: string;
  answer?: string | number;
  explanation?: IExplanation;
}

export interface IExamSection {
  id: string;
  name: string;
  instructions?: string;
  defaultMarks: number;
  defaultNegativeMarks: number;
}

export interface IExamOMRConfig {
  optionsCount?: number;
  hasOptOutOption?: boolean;
  penalizeBlankAnswers?: boolean;
  omrMode?: 'standard' | 'bpsc' | 'custom';
  multiSelect?: boolean;
}

export type ExamStatus = 'draft' | 'live' | 'upcoming' | 'past' | 'under-review' | 'open';

export interface IExam {
  id?: string;
  title: string;
  totalMarks: number;
  duration: number; // in minutes
  subject: string;
  class?: string;
  difficulty?: string;
  status: ExamStatus;
  questions?: IExamQuestion[];
  teacherId: string;
  batchId?: string;
  createdAt: string;
  updatedAt?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  totalQuestions: number;
  targetQuestions: number;
  allowedAttempts: number;
  defaultMarks: number;
  defaultNegativeMarks: number;
  negativeMarks?: number;
  startTimestampMs?: number;
  endTimestampMs?: number;
  languages: string[];
  primaryLanguage: string;
  examPattern?: string;
  hasSections?: boolean;
  sections?: IExamSection[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  isSubjective?: boolean;
  omrConfig?: IExamOMRConfig;
  draftHash?: string;
  confirmationRef?: string;
}

export interface IAnswerKeyItem {
  questionId: string;
  correctOptionId?: string;
  answer?: string | number;
  explanation?: IExplanation;
  marks: number;
  negativeMarks?: number;
}

export interface ITeacherReviewGateAssignment {
  gateId: string;
  examId: string;
  teacherId: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  draftHash: string;
  createdAt: string;
  confirmedAt?: string;
  reviewNotes?: string;
}

export interface IMCPToolCall<T = unknown> {
  tool: string;
  input: T;
  callerUid?: string;
  timestamp?: number;
}
