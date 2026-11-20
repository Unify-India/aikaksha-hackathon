import { Router } from 'express';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { authMiddleware } from '../../auth/middleware.js';
import {
  createExam,
  generateAndAttachQuestions,
  auditQuestionBatch,
  resolveTeacherContext,
  createAutoDpp,
} from '../exams/examTools.js';

export const workflowRouter = Router();

// Event bus registry for SSE runs
export type RunEvent =
  | { type: 'tool_started'; tool: string; at: number }
  | { type: 'tool_finished'; tool: string; durationMs: number; summary: string }
  | { type: 'tool_failed'; tool: string; error: string }
  | { type: 'run_completed'; examId: string; contentHash: string; confirmationToken: string };

interface RunSession {
  runId: string;
  teacherId: string;
  emitter: EventEmitter;
  history: RunEvent[];
  isCompleted: boolean;
  completedResult?: { examId: string; contentHash: string; confirmationToken: string };
}

const activeRuns = new Map<string, RunSession>();

function getOrCreateSession(runId: string, teacherId: string): RunSession {
  let session = activeRuns.get(runId);
  if (!session) {
    session = {
      runId,
      teacherId,
      emitter: new EventEmitter(),
      history: [],
      isCompleted: false,
    };
    activeRuns.set(runId, session);
  }
  return session;
}

function broadcastEvent(session: RunSession, event: RunEvent) {
  session.history.push(event);
  session.emitter.emit('event', event);
}

/**
 * POST /api/workflows/create-exam
 * Accepts { transcript, requestId, subject, batchId, duration, count }
 * Starts autonomous creation pipeline in background and returns { runId } immediately.
 */
workflowRouter.post('/create-exam', authMiddleware, async (req: Request, res: Response) => {
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const { transcript, requestId, subject = 'Physics', batchId = 'batch-lakshya-2026', count = 5, duration = 45 } = req.body;

  const runId = `run_${crypto.randomUUID().slice(0, 8)}`;
  const session = getOrCreateSession(runId, teacherId);

  res.status(202).json({
    runId,
    status: 'QUEUED',
    message: 'Autonomous exam creation workflow started',
  });

  // Background execution pipeline
  (async () => {
    try {
      // 1. Tool: resolve_teacher_context
      const t1Start = Date.now();
      broadcastEvent(session, { type: 'tool_started', tool: 'resolve_teacher_context', at: t1Start });
      const context = await resolveTeacherContext(teacherId);
      broadcastEvent(session, {
        type: 'tool_finished',
        tool: 'resolve_teacher_context',
        durationMs: Date.now() - t1Start,
        summary: `Resolved context for ${context.batches.length} batches and ${context.subjects.length} subjects`,
      });

      // 2. Tool: create_exam
      const t2Start = Date.now();
      broadcastEvent(session, { type: 'tool_started', tool: 'create_exam', at: t2Start });
      const examTitle = transcript ? `Exam: ${transcript.slice(0, 40)}` : 'NEET Physics Rapid Assessment';
      const examResult = await createExam(teacherId, {
        title: examTitle,
        subject,
        batchId,
        duration,
        targetQuestions: count,
        defaultMarks: 4,
        defaultNegativeMarks: 1,
      });
      broadcastEvent(session, {
        type: 'tool_finished',
        tool: 'create_exam',
        durationMs: Date.now() - t2Start,
        summary: `Created master draft exam ${examResult.examId}`,
      });

      // 3. Tool: generate_and_attach_questions
      const t3Start = Date.now();
      broadcastEvent(session, { type: 'tool_started', tool: 'generate_and_attach_questions', at: t3Start });
      const questionsResult = await generateAndAttachQuestions(teacherId, {
        examId: examResult.examId,
        subject,
        count,
        requestId,
      });
      broadcastEvent(session, {
        type: 'tool_finished',
        tool: 'generate_and_attach_questions',
        durationMs: Date.now() - t3Start,
        summary: `Generated and partitioned ${questionsResult.generatedCount} questions`,
      });

      // 4. Tool: audit_question_batch
      const t4Start = Date.now();
      broadcastEvent(session, { type: 'tool_started', tool: 'audit_question_batch', at: t4Start });
      const auditResult = await auditQuestionBatch(teacherId, { examId: examResult.examId });
      broadcastEvent(session, {
        type: 'tool_finished',
        tool: 'audit_question_batch',
        durationMs: Date.now() - t4Start,
        summary: `Audited ${auditResult.questionCount} questions (Score: ${auditResult.score}/100, Passed: ${auditResult.passed})`,
      });

      // 5. Run completed event
      session.isCompleted = true;
      session.completedResult = {
        examId: examResult.examId,
        contentHash: auditResult.contentHash,
        confirmationToken: auditResult.confirmationToken,
      };
      broadcastEvent(session, {
        type: 'run_completed',
        examId: examResult.examId,
        contentHash: auditResult.contentHash,
        confirmationToken: auditResult.confirmationToken,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Workflow run ${runId} failed:`, errorMsg);
      broadcastEvent(session, {
        type: 'tool_failed',
        tool: 'pipeline',
        error: errorMsg,
      });
    }
  })();
});

/**
 * GET /api/workflows/runs/:runId/events?token=...
 * Real-time Server-Sent Events (SSE) streaming endpoint.
 */
workflowRouter.get('/runs/:runId/events', authMiddleware, (req: Request, res: Response) => {
  const { runId } = req.params;
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const session = getOrCreateSession(runId, teacherId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send historical events first
  for (const event of session.history) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // If already finished, close stream after history replay
  if (session.isCompleted) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  // Listen for new events
  const onEvent = (event: RunEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'run_completed' || event.type === 'tool_failed') {
      res.write('data: [DONE]\n\n');
      res.end();
      session.emitter.off('event', onEvent);
    }
  };

  session.emitter.on('event', onEvent);

  req.on('close', () => {
    session.emitter.off('event', onEvent);
  });
});

/**
 * POST /api/workflows/auto-dpp
 * Autonomous DPP generation workflow
 */
workflowRouter.post('/auto-dpp', authMiddleware, async (req: Request, res: Response) => {
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const { topic, batchId = 'batch-lakshya-2026', subject = 'Physics', count = 10, requestId } = req.body;

  if (!topic) {
    res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'Topic is required for Auto DPP' });
    return;
  }

  try {
    const result = await createAutoDpp(teacherId, {
      topic,
      batchId,
      subject,
      count,
      requestId,
    });

    res.json({
      success: true,
      dpp: result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: errorMsg });
  }
});
