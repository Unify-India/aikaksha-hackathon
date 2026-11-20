/**
 * Single-payload exam creation contract.
 * Source of truth: docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §3.1 — keep in sync with the server.
 *
 * Not re-exported from `shared/models/index.ts` on purpose: `ExamStatus`, `QuestionType` and
 * `NegativeMarkingRule` here are string unions that clash with the enums in `core/config/app.constants.ts`.
 */

export type ExamStatus = 'draft' | 'upcoming' | 'live';
export type QuestionType = 'MCQ' | 'Numeric' | 'Short Text' | 'Subjective';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type NegativeMarkingRule = 'none' | '1/4' | '1/3' | '1/2' | 'full' | 'custom';

export interface IOptionContent {
  id: string;
  text: string;
  imageUrl?: string;
}

export interface ILocalizedContent {
  text: string;
  options?: IOptionContent[];
  explanation?: string;
  audioUrl?: string;
}

export interface IQuestionItemPayload {
  id?: string;
  type: QuestionType;
  marks: number;
  negativeMarks?: number;
  subject: string;
  topic: string;
  subtopic?: string;
  difficulty: DifficultyLevel;
  classLevel?: string;
  examPattern?: string;
  en: ILocalizedContent;
  hi?: ILocalizedContent;
  correctOptionId?: string;
  answer?: string | number;
  explanation?: string;
}

export interface IExamParamsPayload {
  title: string;
  batchId: string;
  subject: string;
  duration: number;
  targetQuestions: number;
  defaultMarks: number;
  defaultNegativeMarks?: number;
  negativeRule?: NegativeMarkingRule;
  date: string;
  startTime: string;
  endTime: string;
  languages?: string[];
  primaryLanguage?: string;
  classLevel?: string;
  examPattern?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  isSubjective?: boolean;
  status?: ExamStatus;
}

export interface ICreateCompleteExamRequest {
  examParams: IExamParamsPayload;
  questions: IQuestionItemPayload[];
}

/** POST /api/exams/create-complete success body (guide §4.1). */
export interface ICreateCompleteExamRawResponse {
  success: boolean;
  examId: string;
  totalQuestions: number;
  totalMarks: number;
  status: string;
  createdAt: string;
}

export interface ICreateCompleteExamResponse extends ICreateCompleteExamRawResponse {
  status: 'draft' | 'upcoming';
  /** Derived on the client: the student exam link. */
  studentUrl: string;
}

/** Error body for every non-2xx response (guide §4.2). */
export interface IApiErrorResponse {
  error: string;
  message: string;
  details?: { field: string; issue: string }[];
  timestamp?: string;
}

/** What the teacher asked for: a full exam or a post-class Daily Practice Problem set. */
export type ExamIntakeIntent = 'CREATE_EXAM' | 'AUTO_DPP';

/** Inputs question generation needs that `IExamParamsPayload` does not carry. */
export interface IQuestionGenerationParams {
  intent: ExamIntakeIntent;
  topic: string;
  subtopics: string[];
  difficulty: DifficultyLevel;
  questionType: QuestionType;
}

/** Output of the Voice Copilot intake conversation. */
export interface IExamIntakeResult {
  examParams: IExamParamsPayload;
  generation: IQuestionGenerationParams;
}
