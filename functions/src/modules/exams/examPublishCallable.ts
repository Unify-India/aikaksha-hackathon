import * as functions from 'firebase-functions/v1';
import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { DEPLOYMENT_REGION, FIRESTORE_COLLECTIONS } from '../../config/index.js';
import { db } from '../../config/firebase.js';
import type { IExam, IExamQuestion, IAnswerKeyItem } from '../../types/index.js';

interface ExamPublishPayload {
  examId: string;
  expectedDraftHash: string;
  targetStatus?: 'upcoming' | 'live';
}

/**
 * Calculates SHA-256 hash of question list and essential exam properties.
 */
export function computeDraftHash(examData: Partial<IExam>, questions: IExamQuestion[]): string {
  const contentToHash = {
    title: examData.title,
    batchId: examData.batchId,
    duration: examData.duration,
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      en: q.en,
      hi: q.hi,
      correctOptionId: q.correctOptionId,
      answer: q.answer,
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(contentToHash)).digest('hex');
}

/**
 * Human-in-the-loop publish callable verifying SHA-256 draft hash,
 * enforcing 3-way partition:
 * 1. master_exams/{examId} (stripped questions and answer key)
 * 2. exam_questions/{examId} (questions with correct answers/explanations stripped)
 * 3. answerKey/{examId} (answer keys and explanations for teachers/evaluation only)
 */
export const publishExamWithReviewGate = functions
  .region(DEPLOYMENT_REGION)
  .https.onCall(async (data: ExamPublishPayload, context) => {
    // 1. Authentication Check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required to publish an exam.',
      );
    }

    const teacherUid = context.auth.uid;
    const { examId, expectedDraftHash, targetStatus = 'upcoming' } = data;

    if (!examId || !expectedDraftHash) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'examId and expectedDraftHash are required.',
      );
    }

    // 2. Fetch master exam doc
    const masterExamRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
    const masterDoc = await masterExamRef.get();

    if (!masterDoc.exists) {
      throw new functions.https.HttpsError('not-found', `Exam with ID ${examId} not found.`);
    }

    const currentExam = masterDoc.data() as IExam;

    // 3. Authorization Check
    if (currentExam.teacherId !== teacherUid) {
      // Check admin custom claims if any
      const isAdmin = context.auth.token?.role === 'admin';
      if (!isAdmin) {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only the owning teacher or admin can publish this exam.',
        );
      }
    }

    // 4. Retrieve draft questions from staging/draft store or document
    const questionsSnapshot = await db
      .collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS)
      .doc(examId)
      .collection('draft_questions')
      .get();

    let questions: IExamQuestion[] = [];
    if (!questionsSnapshot.empty) {
      questions = questionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as object),
      } as IExamQuestion));
    } else if (Array.isArray(currentExam.questions) && currentExam.questions.length > 0) {
      questions = currentExam.questions;
    }

    if (questions.length === 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Cannot publish exam without questions.',
      );
    }

    // 5. Verify SHA-256 Draft Hash (Human-in-the-Loop review gate integrity)
    const computedHash = computeDraftHash(currentExam, questions);
    if (computedHash !== expectedDraftHash) {
      logger.warn(
        `Hash mismatch for exam ${examId}. Expected: ${expectedDraftHash}, Computed: ${computedHash}`,
      );
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Draft content hash mismatch. The exam was modified after review gate approval.',
      );
    }

    // 6. Partition data:
    // Partition A: Stripped student questions (no correctOptionId, answer, explanation)
    const sanitizedStudentQuestions = questions.map((q) => {
      const sanitized = { ...q };
      delete sanitized.correctOptionId;
      delete sanitized.answer;
      delete sanitized.explanation;
      return sanitized;
    });

    // Partition B: Teacher / grading answer key
    const answerKeyItems: Record<string, IAnswerKeyItem> = {};
    for (const q of questions) {
      const qId = q.id || crypto.randomUUID();
      answerKeyItems[qId] = {
        questionId: qId,
        correctOptionId: q.correctOptionId,
        answer: q.answer,
        explanation: q.explanation,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
      };
    }

    // 7. Atomic Batch Write Partition
    const batch = db.batch();

    // Partition 1: master_exams/{examId}
    const nowIso = new Date().toISOString();
    const updatedMasterData: Partial<IExam> = {
      status: targetStatus,
      updatedAt: nowIso,
      draftHash: computedHash,
      confirmationRef: `gate_${teacherUid}_${Date.now()}`,
    };
    batch.update(masterExamRef, {
      ...updatedMasterData,
      // Strip questions array from master_exams to prevent leakage
      questions: [],
    });

    // Partition 2: exam_questions/{examId}
    const examQuestionsRef = db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId);
    batch.set(examQuestionsRef, {
      examId,
      questions: sanitizedStudentQuestions,
      updatedAt: nowIso,
    });

    // Partition 3: answerKey/{examId}
    const answerKeyRef = db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId);
    batch.set(answerKeyRef, {
      examId,
      keys: answerKeyItems,
      updatedAt: nowIso,
      teacherId: teacherUid,
    });

    // Record review gate resolution
    const reviewGateRef = db.collection(FIRESTORE_COLLECTIONS.REVIEW_GATES).doc(`gate_${examId}`);
    batch.set(
      reviewGateRef,
      {
        gateId: `gate_${examId}`,
        examId,
        teacherId: teacherUid,
        status: 'approved',
        draftHash: computedHash,
        confirmedAt: nowIso,
      },
      { merge: true },
    );

    await batch.commit();

    logger.info(`Exam ${examId} successfully published under 3-way partition by teacher ${teacherUid}`);

    return {
      success: true,
      examId,
      status: targetStatus,
      draftHash: computedHash,
      publishedAt: nowIso,
    };
  });
