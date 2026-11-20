/**
 * Teacher-only view of a draft for Exam Studio / Review Gate: full questions (WITH keys and
 * explanations) plus the audit result. Never mount this on a student route.
 */
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import type { IExam, IExamQuestion } from '../../types/index.js';

export interface TeacherDraftView {
  exam: {
    id: string;
    title: string;
    subject: string;
    status: string;
    duration: number;
    totalQuestions: number;
    totalMarks: number;
    defaultMarks: number;
    defaultNegativeMarks: number;
    startTimestampMs?: number;
    endTimestampMs?: number;
    examPattern?: string;
    batchId?: string;
  };
  questions: IExamQuestion[];
  audit: {
    score?: number;
    status?: string;
    flags: string[];
    details: unknown[];
    contentHash?: string;
    /** Present only while the exam is an unpublished draft; needed by finalize_and_publish_exam. */
    confirmationToken?: string;
  };
}

export async function getTeacherDraft(teacherId: string, examId: string): Promise<TeacherDraftView> {
  const ref = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Exam ${examId} not found`);
  const exam = snap.data() as IExam & {
    auditScore?: number;
    auditStatus?: string;
    auditFlags?: string[];
    auditDetails?: unknown[];
    confirmationToken?: string | null;
  };
  if (exam.teacherId !== teacherId) throw new Error('Teacher ownership mismatch');

  const drafts = await ref.collection('draft_questions').get();
  const questions = drafts.docs
    .map((d) => d.data() as IExamQuestion)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  return {
    exam: {
      id: examId,
      title: exam.title,
      subject: exam.subject,
      status: exam.status,
      duration: exam.duration,
      totalQuestions: questions.length,
      totalMarks: questions.reduce((s, q) => s + (q.marks ?? 0), 0),
      defaultMarks: exam.defaultMarks,
      defaultNegativeMarks: exam.defaultNegativeMarks,
      ...(exam.startTimestampMs !== undefined && { startTimestampMs: exam.startTimestampMs }),
      ...(exam.endTimestampMs !== undefined && { endTimestampMs: exam.endTimestampMs }),
      ...(exam.examPattern && { examPattern: exam.examPattern }),
      ...(exam.batchId && { batchId: exam.batchId }),
    },
    questions,
    audit: {
      ...(exam.auditScore !== undefined && { score: exam.auditScore }),
      ...(exam.auditStatus && { status: exam.auditStatus }),
      flags: exam.auditFlags ?? [],
      details: exam.auditDetails ?? [],
      ...(exam.draftHash && { contentHash: exam.draftHash }),
      ...(exam.status === 'draft' && exam.confirmationToken && { confirmationToken: exam.confirmationToken }),
    },
  };
}
