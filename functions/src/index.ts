import express from 'express';
import cors from 'cors';
import * as functions from 'firebase-functions/v1';
import * as logger from 'firebase-functions/logger';
import { DEPLOYMENT_REGION } from './config/index.js';
import { seedFirestoreDatabase } from './config/seed.js';
import { onExamWrite } from './modules/exams/examTriggers.js';
import { publishExamWithReviewGate } from './modules/exams/examPublishCallable.js';
import { evaluateSubjectiveAnswer } from './modules/evaluation/subjectiveEvaluation.js';
import { mcpApp } from './modules/mcp/mcpGateway.js';
import { workflowRouter } from './modules/workflows/routes.js';
import { studentRouter } from './modules/student/routes.js';
import { authMiddleware } from './auth/middleware.js';
import {
  resolveTeacherContext,
  createExam,
  generateAndAttachQuestions,
  auditQuestionBatch,
  finalizeAndPublishExam,
  createAutoDpp,
  createAndSegregateExam,
} from './modules/exams/examTools.js';

// Auto-seed Firestore collections on cold start
seedFirestoreDatabase().catch((err) => {
  logger.warn('Seed initialization error:', err);
});

// Express App for Cloud Function / HTTP API
export const apiApp = express();

apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

// Health check endpoint
apiApp.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-kaksha-api',
    region: DEPLOYMENT_REGION,
    timestamp: new Date().toISOString(),
  });
});

// Mount Workflow and SSE streaming routes
apiApp.use('/api/workflows', workflowRouter);

// Mount Student safe routes (stripped questions, server-clock check)
apiApp.use('/api/student', studentRouter);

// Mount MCP and Tools Direct Endpoints
apiApp.post('/api/tools/resolve_teacher_context', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const tenantId = req.auth?.tenantId;
    const result = await resolveTeacherContext(teacherId, tenantId);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/tools/create_exam', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await createExam(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/tools/generate_and_attach_questions', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await generateAndAttachQuestions(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/tools/audit_question_batch', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await auditQuestionBatch(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/tools/finalize_and_publish_exam', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await finalizeAndPublishExam(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('IDEMPOTENCY_CONFLICT')) {
      res.status(409).json({ error: 'IDEMPOTENCY_CONFLICT', message: errorMsg });
      return;
    }
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/tools/create_auto_dpp', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await createAutoDpp(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

apiApp.post('/api/exams/create-complete', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await createAndSegregateExam(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to create complete exam:', errorMsg);
    res.status(400).json({ error: 'CREATION_FAILED', message: errorMsg });
  }
});

apiApp.post('/api/tools/create_complete_exam', authMiddleware, async (req, res) => {
  try {
    const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
    const result = await createAndSegregateExam(teacherId, req.body);
    res.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to execute create_complete_exam tool:', errorMsg);
    res.status(400).json({ error: 'TOOL_ERROR', message: errorMsg });
  }
});

// Primary Cloud Function: Express API exported as `api`
export const api = functions
  .region(DEPLOYMENT_REGION)
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onRequest(apiApp);

// Exam Triggers
export { onExamWrite };

// Review Gate and Publish Callables
export { publishExamWithReviewGate, createAndSegregateExam };

// Subjective Evaluation AI Callable
export { evaluateSubjectiveAnswer };

// MCP Agent Gateway HTTP API
export const mcpGateway = functions
  .region(DEPLOYMENT_REGION)
  .https.onRequest(mcpApp);

// Multimodal Evaluation & Prompt exports
export * from './modules/evaluation/multimodalEvaluator.js';
export * from './prompts/intentExtraction.prompt.js';
export * from './prompts/questionGeneration.prompt.js';
export * from './prompts/solverAudit.prompt.js';
export * from './prompts/subjectiveVision.prompt.js';
export * from './utils/time.js';
