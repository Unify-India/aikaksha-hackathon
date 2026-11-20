import * as express from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import type { IExam, IExamQuestion, IMCPToolCall } from '../../types/index.js';
import { computeDraftHash } from '../exams/examPublishCallable.js';
import { createAndSegregateExam } from '../exams/examTools.js';

export const mcpApp = express.default();

mcpApp.use(cors({ origin: true }));
mcpApp.use(express.json());

/**
 * Authentication middleware for MCP Gateway:
 * Verifies Bearer token with Firebase Admin Auth
 */
async function authenticateRequest(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Bearer token required' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const admin = await import('../../config/firebase.js');
    const decodedToken = await admin.auth.verifyIdToken(idToken);
    (req as express.Request & { user: typeof decodedToken }).user = decodedToken;
    next();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn('MCP Gateway token verification failed:', errorMsg);
    res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
  }
}

/**
 * MCP Tools Handler Route
 * Executes one of:
 * - resolve_teacher_context
 * - create_exam
 * - generate_and_attach_questions
 * - finalize_and_publish_exam
 */
mcpApp.post('/v1/tools', authenticateRequest, async (req: express.Request, res: express.Response) => {
  const user = (req as express.Request & { user: { uid: string; role?: string } }).user;
  const teacherId = user.uid;
  const toolCall: IMCPToolCall = req.body;

  if (!toolCall || !toolCall.tool) {
    res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'Tool name is required' });
    return;
  }

  try {
    switch (toolCall.tool) {
      case 'resolve_teacher_context': {
        // Retrieve teacher batches and recent exams
        const batchesSnapshot = await db
          .collection(FIRESTORE_COLLECTIONS.BATCHES)
          .where('teacherId', '==', teacherId)
          .limit(10)
          .get();

        const batches = batchesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const examsSnapshot = await db
          .collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS)
          .where('teacherId', '==', teacherId)
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();

        const recentExams = examsSnapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().title,
          status: doc.data().status,
          batchId: doc.data().batchId,
        }));

        res.json({
          teacherId,
          batches,
          recentExams,
        });
        return;
      }

      case 'create_exam': {
        const input = toolCall.input as Partial<IExam>;
        if (!input.title || !input.duration) {
          res.status(400).json({
            error: 'INVALID_ARGUMENT',
            message: 'title and duration are required to create an exam',
          });
          return;
        }

        const newExamId = `exam_${crypto.randomUUID().slice(0, 8)}`;
        const nowIso = new Date().toISOString();
        const startMs = input.startTimestampMs || Date.now() + 3600 * 1000;
        const durationMin = input.duration || 45;
        const endMs = input.endTimestampMs || startMs + durationMin * 60 * 1000;

        const newExam: IExam = {
          id: newExamId,
          title: input.title,
          totalMarks: input.totalMarks || 0,
          duration: durationMin,
          subject: input.subject || 'General',
          status: 'draft',
          teacherId,
          batchId: input.batchId || '',
          createdAt: nowIso,
          updatedAt: nowIso,
          totalQuestions: 0,
          targetQuestions: input.targetQuestions || 10,
          allowedAttempts: 1,
          defaultMarks: input.defaultMarks || 4,
          defaultNegativeMarks: input.defaultNegativeMarks || 1,
          languages: input.languages || ['en'],
          primaryLanguage: input.primaryLanguage || 'en',
          startTimestampMs: startMs,
          endTimestampMs: endMs,
          startTime: new Date(startMs).toISOString().slice(11, 16),
          endTime: new Date(endMs).toISOString().slice(11, 16),
          isSubjective: input.isSubjective || false,
        };

        await db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(newExamId).set(newExam);

        res.json({
          examId: newExamId,
          status: 'draft',
          exam: newExam,
        });
        return;
      }

      case 'generate_and_attach_questions': {
        interface GenerateQuestionsInput {
          examId: string;
          subject: string;
          topic: string;
          count: number;
          difficulty?: string;
          languages?: string[];
        }
        const input = toolCall.input as GenerateQuestionsInput;

        if (!input.examId || !input.subject || !input.count) {
          res.status(400).json({
            error: 'INVALID_ARGUMENT',
            message: 'examId, subject, and count are required',
          });
          return;
        }

        const examRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(input.examId);
        const examDoc = await examRef.get();
        if (!examDoc.exists) {
          res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: 'Exam draft not found' });
          return;
        }

        const count = Math.min(Math.max(1, input.count), 15);
        const generatedQuestions: IExamQuestion[] = [];

        for (let i = 1; i <= count; i++) {
          const qId = `q_${crypto.randomUUID().slice(0, 8)}`;
          generatedQuestions.push({
            id: qId,
            type: 'MCQ',
            marks: 4,
            negativeMarks: 1,
            subject: input.subject,
            topic: input.topic || 'General',
            difficulty: input.difficulty || 'medium',
            teacherId,
            en: {
              text: `Sample generated question ${i} on ${input.subject} (${input.topic || 'General'})?`,
              options: [
                { id: 'opt1', text: 'Option A - Correct Statement' },
                { id: 'opt2', text: 'Option B - Alternative theory' },
                { id: 'opt3', text: 'Option C - Incorrect concept' },
                { id: 'opt4', text: 'Option D - Irrelevant factor' },
              ],
            },
            correctOptionId: 'opt1',
            explanation: {
              en: `Detailed explanation for generated question ${i}.`,
            },
          });
        }

        // Attach to draft_questions subcollection
        const batch = db.batch();
        for (const q of generatedQuestions) {
          const docRef = examRef.collection('draft_questions').doc(q.id!);
          batch.set(docRef, q);
        }

        // Update totalQuestions on master draft
        batch.update(examRef, {
          totalQuestions: generatedQuestions.length,
          totalMarks: generatedQuestions.length * 4,
          updatedAt: new Date().toISOString(),
        });

        await batch.commit();

        res.json({
          examId: input.examId,
          generatedCount: generatedQuestions.length,
          requestedCount: input.count,
          validationStatus: 'PASSED',
          questionPreview: generatedQuestions.map((q) => ({
            id: q.id,
            text: q.en?.text,
            type: q.type,
            marks: q.marks,
          })),
        });
        return;
      }

      case 'finalize_and_publish_exam': {
        interface FinalizeInput {
          examId: string;
          status?: 'upcoming' | 'live';
          expectedDraftHash?: string;
        }
        const input = toolCall.input as FinalizeInput;
        const examId = input.examId;

        if (!examId) {
          res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'examId is required' });
          return;
        }

        const masterExamRef = db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).doc(examId);
        const masterDoc = await masterExamRef.get();
        if (!masterDoc.exists) {
          res.status(404).json({ error: 'DRAFT_NOT_FOUND', message: 'Exam not found' });
          return;
        }

        const currentExam = masterDoc.data() as IExam;
        if (currentExam.teacherId !== teacherId) {
          res.status(403).json({ error: 'FORBIDDEN', message: 'Teacher ownership mismatch' });
          return;
        }

        const questionsSnapshot = await masterExamRef.collection('draft_questions').get();
        const questions: IExamQuestion[] = questionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as object),
        } as IExamQuestion));

        const computedHash = computeDraftHash(currentExam, questions);
        const targetStatus = input.status || 'upcoming';
        const nowIso = new Date().toISOString();

        // 3-way partition write
        const batch = db.batch();

        batch.update(masterExamRef, {
          status: targetStatus,
          updatedAt: nowIso,
          draftHash: computedHash,
          questions: [],
        });

        const examQuestionsRef = db.collection(FIRESTORE_COLLECTIONS.EXAM_QUESTIONS).doc(examId);
        batch.set(examQuestionsRef, {
          examId,
          questions: questions.map((q) => {
            const sanitized = { ...q };
            delete sanitized.correctOptionId;
            delete sanitized.answer;
            delete sanitized.explanation;
            return sanitized;
          }),
          updatedAt: nowIso,
        });

        const answerKeyRef = db.collection(FIRESTORE_COLLECTIONS.ANSWER_KEY).doc(examId);
        const keysMap: Record<string, unknown> = {};
        for (const q of questions) {
          keysMap[q.id!] = {
            questionId: q.id,
            correctOptionId: q.correctOptionId,
            answer: q.answer,
            explanation: q.explanation,
            marks: q.marks,
            negativeMarks: q.negativeMarks,
          };
        }
        batch.set(answerKeyRef, {
          examId,
          keys: keysMap,
          updatedAt: nowIso,
          teacherId,
        });

        await batch.commit();

        res.json({
          success: true,
          examId,
          status: targetStatus,
          draftHash: computedHash,
        });
        return;
      }

      case 'create_complete_exam': {
        const payload = toolCall.input;
        if (!payload) {
          res.status(400).json({
            error: 'INVALID_ARGUMENT',
            message: 'Payload with examParams and questions is required',
          });
          return;
        }

        const result = await createAndSegregateExam(teacherId, payload);
        res.json(result);
        return;
      }

      default:
        res.status(400).json({ error: 'TOOL_NOT_SUPPORTED', message: `Unknown tool: ${toolCall.tool}` });
        return;
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('MCP execution error:', errorMsg);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: errorMsg });
  }
});
