import { IExamQuestion } from './exam.model';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export interface ITeacherReviewGateAssignment {
  id: string;
  examId: string;
  teacherId: string;
  teacherName: string;
  batchId: string;
  batchName: string;
  status: ReviewStatus;
  totalQuestions: number;
  approvedQuestionsCount: number;
  rejectedQuestionsCount: number;
  contentHash: string;
  draftVersion: number;
  createdAt: string;
  reviewedAt?: string;
  teacherNotes?: string;
}

export interface IGeneratedDppItem {
  id: string;
  examId: string;
  question: IExamQuestion;
  status: ReviewStatus;
  aiConfidenceScore: number; // 0.0 - 1.0
  flaggedReasons?: string[];
  suggestedModifications?: Partial<IExamQuestion>;
  isReviewed: boolean;
}
