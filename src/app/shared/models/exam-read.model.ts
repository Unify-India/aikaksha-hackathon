/**
 * Teacher read models returned by GET /api/exams and GET /api/exams/:examId.
 * Mirrors functions/src/modules/exams/examViews.ts; keep the two in sync.
 */

export interface IStudioExam {
  id: string;
  title: string;
  subject: string;
  status: string;
  batchId: string;
  classLevel: string;
  examPattern: string;
  totalQuestions: number;
  totalMarks: number;
  duration: number;
  defaultMarks: number;
  defaultNegativeMarks: number;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface IStudioQuestion {
  id: string;
  type: string;
  marks: number;
  negativeMarks: number;
  topic: string;
  subtopic: string;
  difficulty: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  answer?: string;
  explanation?: string;
}

export interface IStudioExamDetail {
  exam: IStudioExam;
  questions: IStudioQuestion[];
}
