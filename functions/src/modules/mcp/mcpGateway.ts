import * as express from 'express';
import cors from 'cors';
import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';
import type { IExam, IMCPToolCall, IQuestionContent } from '../../types/index.js';
import {
  auditQuestionBatch,
  createAndSegregateExam,
  createAutoDpp,
  finalizeAndPublishExam,
  generateAndAttachQuestions,
  type AuditQuestionBatchInput,
  type CreateAutoDppInput,
  type FinalizeAndPublishExamInput,
  type GenerateQuestionsInput,
} from '../exams/examTools.js';

import { understandTeacherRequest } from '../workflows/understand.js';

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
 * - extract_intent                 (teacher sentence -> intent + exam plan or what is missing)
 * - create_exam
 * - generate_and_attach_questions  (real Gemini generation)
 * - audit_question_batch           (blind Gemini solver; issues confirmationToken + contentHash)
 * - finalize_and_publish_exam      (requires that token + hash)
 * - create_auto_dpp
 * - create_complete_exam           (single payload { examParams, questions })
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
        // Real Gemini generation (same code path as /api/tools and the workflow).
        const input = toolCall.input as GenerateQuestionsInput;

        if (!input?.examId || !input.subject || !input.count) {
          res.status(400).json({
            error: 'INVALID_ARGUMENT',
            message: 'examId, subject, and count are required',
          });
          return;
        }

        const result = await generateAndAttachQuestions(teacherId, input);
        res.json({
          ...result,
          questionPreview: result.questions.map((q) => ({
            id: q.id,
            text: (q.en as IQuestionContent | undefined)?.text,
            type: q.type,
            marks: q.marks,
          })),
        });
        return;
      }

      case 'audit_question_batch': {
        // Blind Gemini solver pass; returns score, flags, contentHash and a one-time confirmationToken.
        const input = toolCall.input as AuditQuestionBatchInput;
        if (!input?.examId) {
          res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'examId is required' });
          return;
        }
        res.json(await auditQuestionBatch(teacherId, input));
        return;
      }

      case 'finalize_and_publish_exam': {
        // Requires the confirmationToken + contentHash issued by audit_question_batch.
        const input = toolCall.input as FinalizeAndPublishExamInput;
        if (!input?.examId || !input.confirmationToken || !input.contentHash) {
          res.status(400).json({
            error: 'INVALID_ARGUMENT',
            message: 'examId, confirmationToken and contentHash are required (run audit_question_batch first)',
          });
          return;
        }
        res.json(await finalizeAndPublishExam(teacherId, input));
        return;
      }

      case 'extract_intent': {
        const transcript = (toolCall.input as { transcript?: unknown })?.transcript;
        if (typeof transcript !== 'string' || !transcript.trim()) {
          res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'transcript is required' });
          return;
        }
        res.json(await understandTeacherRequest(teacherId, transcript.trim()));
        return;
      }

      case 'create_auto_dpp': {
        const input = toolCall.input as CreateAutoDppInput;
        if (!input?.sentence && !input?.topic) {
          res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'sentence (what was taught) or topic is required' });
          return;
        }
        res.json(await createAutoDpp(teacherId, input));
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
    const { status, code } = toolErrorStatus(errorMsg);
    res.status(status).json({ error: code, message: errorMsg });
  }
});

/** Maps the exam tools' error messages to HTTP statuses so callers can tell what went wrong. */
function toolErrorStatus(message: string): { status: number; code: string } {
  if (message.startsWith('IDEMPOTENCY_CONFLICT')) return { status: 409, code: 'IDEMPOTENCY_CONFLICT' };
  if (message.startsWith('HASH_MISMATCH') || message.startsWith('CONTENT_TAMPERED')) return { status: 409, code: 'HASH_MISMATCH' };
  if (message.startsWith('INVALID_TOKEN')) return { status: 403, code: 'INVALID_TOKEN' };
  if (/ownership mismatch/i.test(message)) return { status: 403, code: 'FORBIDDEN' };
  if (/not found/i.test(message)) return { status: 404, code: 'NOT_FOUND' };
  if (message.startsWith('GENERATION_FAILED') || /Gemini|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return { status: 502, code: 'MODEL_ERROR' };
  }
  return { status: 500, code: 'INTERNAL_ERROR' };
}
