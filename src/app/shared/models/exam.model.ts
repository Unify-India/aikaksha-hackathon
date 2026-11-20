import { ExamStatus, NegativeMarkingRule, QuestionType } from '../../core/config/app.constants';

export { ExamStatus, NegativeMarkingRule, QuestionType };

export interface IOptionContent {
  id: string; // 'opt1' | 'opt2' | 'opt3' | 'opt4' | 'opt5'
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
  type: QuestionType;
  marks: number;
  negativeMarks: number;
  subject: string;
  topic: string;
  subtopic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  classLevel?: string;
  examPattern?: string;
  en?: ILocalizedQuestionContent;
  hi?: ILocalizedQuestionContent;
  correctOptionId?: string; // 'opt1' - 'opt5' (Server/Answer-Key authoritative, stripped in student payload)
  answer?: string | number; // For Numeric / Short Text
  explanation?: string;
  isAiGenerated?: boolean;
  validationWarnings?: string[];
}

export interface IExamOMRConfig {
  preset: 'standard' | 'bpsc' | 'custom';
  optionsPerQuestion: number;
  hasRollNumber: boolean;
  hasBatchCode: boolean;
  hasTestId: boolean;
  customColumnsCount?: number;
}

export interface IExamSection {
  id: string;
  name: string;
  description?: string;
  questionIds: string[];
  totalMarks?: number;
  isOptionalSection?: boolean;
}

export interface IExam {
  id: string;
  title: string;
  batchId: string;
  duration: number; // in minutes
  targetQuestions: number;
  defaultMarks: number;
  negativeRule?: NegativeMarkingRule;
  defaultNegativeMarks?: number;
  allowedAttempts?: number;
  date: string; // ISO date 'YYYY-MM-DD'
  endDate?: string;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  startTimestampMs: number;
  endTimestampMs: number;
  languages: string[];
  primaryLanguage: string;
  subject: string;
  classLevel?: string;
  examPattern?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  hasSections?: boolean;
  sections?: IExamSection[];
  omrConfig?: IExamOMRConfig;
  status: ExamStatus;
  // Metadata & Security Partition
  createdByTeacherRef: string;
  tenantId: string;
  contentHash?: string;
  draftVersion?: number;
  totalMarks?: number;
  questionCount?: number;
  createdAt?: string;
  updatedAt?: string;
}
