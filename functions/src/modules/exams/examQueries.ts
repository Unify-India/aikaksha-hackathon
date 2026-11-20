import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import { IExamDetailView, IExamSummaryView, sortNewestFirst, toExamDetail, toExamSummary } from './examViews.js';

export class ExamAccessError extends Error {
  constructor(
    readonly code: 'EXAM_NOT_FOUND' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

const MAX_EXAMS = 200;

/**
 * The teacher's exams, newest first. Filters on teacherId only and sorts in memory, so no
 * composite (teacherId, createdAt) index is required.
 */
export async function listTeacherExams(teacherId: string): Promise<IExamSummaryView[]> {
  const snap = await db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).where('teacherId', '==', teacherId).limit(MAX_EXAMS).get();
  return sortNewestFirst(snap.docs.map((doc) => toExamSummary(doc.id, doc.data())));
}

/** One exam with every question merged with its answer key. Teacher-only: checks ownership. */
export async function getTeacherExam(teacherId: string, examId: string): Promise<IExamDetailView> {
  const [examSnap, questionsSnap, answerKeySnap] = await Promise.all([
    db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId).get(),
    db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId).get(),
    db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId).get(),
  ]);
  if (!examSnap.exists) throw new ExamAccessError('EXAM_NOT_FOUND', `Exam ${examId} not found`);
  const exam = examSnap.data() ?? {};
  if (exam['teacherId'] !== teacherId) throw new ExamAccessError('FORBIDDEN', `Exam ${examId} belongs to another teacher`);
  return toExamDetail(examId, exam, questionsSnap.data() ?? {}, answerKeySnap.data() ?? {});
}
