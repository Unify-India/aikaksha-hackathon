import { Router } from 'express';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as logger from 'firebase-functions/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { authMiddleware } from '../../auth/middleware.js';
import { db } from '../../config/firebase.js';
import { extractIntent } from '../../prompts/intent-extraction.prompt.js';
import type { IVoiceIntent } from '../../types/voice-intent.js';
import { DEFAULT_TIMEZONE } from '../../utils/schedule.js';
import {
  createExam,
  generateAndAttachQuestions,
  auditQuestionBatch,
  resolveTeacherContext,
  createAutoDpp,
} from '../exams/examTools.js';
import { planExam, type ExamPlan, type WorkflowOverrides } from './examPlan.js';

export const workflowRouter = Router();

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type RunEvent =
  | { type: 'tool_started'; tool: string; at: number }
  | { type: 'tool_finished'; tool: string; durationMs: number; summary: string }
  | { type: 'tool_failed'; tool: string; error: string }
  /** What was understood from the teacher's sentence (for slot chips). */
  | { type: 'intent_extracted'; intent: IVoiceIntent; plan?: ExamPlan }
  /** The sentence was understood but settings are missing: ask the teacher, then start a new run with them. */
  | { type: 'needs_input'; missingRequiredSlots: string[]; message: string; intent?: IVoiceIntent }
  | { type: 'run_completed'; examId: string; contentHash: string; confirmationToken: string; auditScore?: number; auditFlags?: string[] };

const TERMINAL: RunEvent['type'][] = ['run_completed', 'tool_failed', 'needs_input'];

/**
 * Runs are stored in Firestore, not only in memory, because on Cloud Functions the POST that creates
 * a run and the GET that streams it can land on different instances.
 */
const RUNS = 'workflow_runs';

interface RunDoc {
  runId: string;
  teacherId: string;
  input: CreateExamRunInput;
  status: 'queued' | 'running' | 'completed' | 'failed';
  events: RunEvent[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

interface CreateExamRunInput extends WorkflowOverrides {
  transcript?: string;
  requestId?: string;
  /** Pre-extracted intent (e.g. after the UI showed slot chips); skips the Gemini intent call. */
  intent?: IVoiceIntent;
}

/** In-memory fan-out for streams on the instance that is executing the run. */
const localRuns = new Map<string, EventEmitter>();

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * extract_intent → resolve_teacher_context → create_exam → generate_and_attach_questions → audit_question_batch.
 * `emit` receives every event; the last one is terminal (run_completed / needs_input / tool_failed).
 */
export async function runCreateExamPipeline(
  teacherId: string,
  input: CreateExamRunInput,
  emit: (event: RunEvent) => Promise<void>,
): Promise<void> {
  const nowIso = new Date().toISOString();
  let tool = 'pipeline';
  try {
    // 1. Context (needed to resolve "Lakshya 2026" -> batch id)
    tool = 'resolve_teacher_context';
    let t = Date.now();
    await emit({ type: 'tool_started', tool, at: t });
    const context = await resolveTeacherContext(teacherId);
    await emit({
      type: 'tool_finished',
      tool,
      durationMs: Date.now() - t,
      summary: `Resolved context for ${context.batches.length} batches and ${context.subjects.length} subjects`,
    });

    // 2. Understand the teacher's sentence (skipped for legacy field-only calls)
    let intent = input.intent;
    if (!intent && input.transcript?.trim()) {
      tool = 'extract_intent';
      t = Date.now();
      await emit({ type: 'tool_started', tool, at: t });
      intent = await extractIntent(input.transcript, nowIso, DEFAULT_TIMEZONE);
      await emit({
        type: 'tool_finished',
        tool,
        durationMs: Date.now() - t,
        summary: `Understood: ${intent.detectedAction} (confidence ${Math.round(intent.confidence * 100)}%)`,
      });
    }

    const planned = planExam(intent, overridesFrom(input), context.batches, nowIso, DEFAULT_TIMEZONE);
    if (intent) await emit({ type: 'intent_extracted', intent, ...(planned.ok && { plan: planned.plan }) });
    if (!planned.ok) {
      await emit({
        type: 'needs_input',
        missingRequiredSlots: planned.missingRequiredSlots,
        message: planned.message,
        ...(intent && { intent }),
      });
      return;
    }
    const plan = planned.plan;

    // 3. create_exam
    tool = 'create_exam';
    t = Date.now();
    await emit({ type: 'tool_started', tool, at: t });
    const examResult = await createExam(teacherId, {
      title: plan.title,
      subject: plan.subject,
      batchId: plan.batchId,
      duration: plan.durationMinutes,
      targetQuestions: plan.count,
      defaultMarks: plan.marks,
      defaultNegativeMarks: plan.negativeMarks,
      ...(plan.examPattern && { examPattern: plan.examPattern }),
      ...(plan.classLevel && { classLevel: plan.classLevel }),
      ...(plan.schedule && {
        startTimestampMs: plan.schedule.startTimestampMs,
        endTimestampMs: plan.schedule.endTimestampMs,
      }),
    });
    await emit({ type: 'tool_finished', tool, durationMs: Date.now() - t, summary: `Created draft exam ${examResult.examId}` });

    // 4. generate_and_attach_questions (Gemini)
    tool = 'generate_and_attach_questions';
    t = Date.now();
    await emit({ type: 'tool_started', tool, at: t });
    const questionsResult = await generateAndAttachQuestions(teacherId, {
      examId: examResult.examId,
      subject: plan.subject,
      topic: plan.topic,
      subtopics: plan.subtopics,
      count: plan.count,
      difficulty: plan.difficulty,
      ...(input.requestId && { requestId: input.requestId }),
    });
    const shortfall =
      questionsResult.requestedCount && questionsResult.generatedCount < questionsResult.requestedCount
        ? ` (${questionsResult.requestedCount - questionsResult.generatedCount} short)`
        : '';
    await emit({
      type: 'tool_finished',
      tool,
      durationMs: Date.now() - t,
      summary: `Generated ${questionsResult.generatedCount} questions on ${plan.topic}${shortfall}`,
    });

    // 5. audit_question_batch (blind Gemini solver)
    tool = 'audit_question_batch';
    t = Date.now();
    await emit({ type: 'tool_started', tool, at: t });
    const audit = await auditQuestionBatch(teacherId, { examId: examResult.examId });
    await emit({
      type: 'tool_finished',
      tool,
      durationMs: Date.now() - t,
      summary: `Audited ${audit.questionCount} questions (Score: ${audit.score}/100, ${audit.flags.length} flags)`,
    });

    await emit({
      type: 'run_completed',
      examId: examResult.examId,
      contentHash: audit.contentHash,
      confirmationToken: audit.confirmationToken,
      auditScore: audit.score,
      auditFlags: audit.flags,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`Workflow failed at ${tool}:`, error);
    await emit({ type: 'tool_failed', tool, error });
  }
}

function overridesFrom(body: CreateExamRunInput): WorkflowOverrides {
  const keys: (keyof WorkflowOverrides)[] = [
    'title', 'subject', 'topic', 'subtopic', 'batchId', 'count', 'duration', 'difficulty',
    'marks', 'negativeRule', 'examPattern', 'dateText', 'startTime', 'endTime',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined && body[k] !== null && body[k] !== '') out[k] = body[k];
  return out as WorkflowOverrides;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/workflows/create-exam
 * Body: { transcript, requestId?, intent?, ...overrides (subject, topic, batchId, count, duration, difficulty,
 *         marks, negativeRule, examPattern, dateText, startTime, endTime) }
 * Returns 202 { runId }. The pipeline runs when the client opens GET /runs/:runId/events.
 * With ?wait=true it runs inside this request and returns the full event list (curl / tests / agents).
 */
workflowRouter.post('/create-exam', authMiddleware, async (req: Request, res: Response) => {
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const input = cleanInput(req.body as CreateExamRunInput);

  if (req.query.wait === 'true') {
    const events: RunEvent[] = [];
    await runCreateExamPipeline(teacherId, input, async (e) => {
      events.push(e);
    });
    const last = events[events.length - 1];
    res.status(last?.type === 'run_completed' ? 200 : last?.type === 'needs_input' ? 422 : 500).json({ events, result: last });
    return;
  }

  const runId = `run_${crypto.randomUUID().slice(0, 8)}`;
  const doc: RunDoc = { runId, teacherId, input, status: 'queued', events: [], createdAt: new Date().toISOString() };
  await db.collection(RUNS).doc(runId).set(doc);

  res.status(202).json({
    runId,
    status: 'QUEUED',
    message: 'Open GET /api/workflows/runs/:runId/events to start and follow the run',
  });
});

/**
 * GET /api/workflows/runs/:runId/events?token=...
 * Server-Sent Events. The first stream for a queued run executes it (so the work happens inside an open
 * request, which Cloud Functions keeps running). Later or parallel streams replay stored events.
 */
workflowRouter.get('/runs/:runId/events', authMiddleware, async (req: Request, res: Response) => {
  const { runId } = req.params;
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const ref = db.collection(RUNS).doc(runId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let closed = false;
  const send = (event: RunEvent) => {
    if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const finish = () => {
    if (closed) return;
    res.write('data: [DONE]\n\n');
    res.end();
    closed = true;
  };
  const keepAlive = setInterval(() => !closed && res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    closed = true;
    clearInterval(keepAlive);
  });

  try {
    // Same instance is already running it: subscribe.
    const local = localRuns.get(runId);
    if (local) {
      const snap = await ref.get();
      for (const e of (snap.data() as RunDoc | undefined)?.events ?? []) send(e);
      await new Promise<void>((resolve) => {
        const onEvent = (e: RunEvent) => {
          send(e);
          if (TERMINAL.includes(e.type)) {
            local.off('event', onEvent);
            resolve();
          }
        };
        local.on('event', onEvent);
        req.on('close', () => {
          local.off('event', onEvent);
          resolve();
        });
      });
      return;
    }

    // Claim a queued run (exactly one stream executes it).
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 'missing' as const;
      const run = snap.data() as RunDoc;
      if (run.teacherId !== teacherId) return 'forbidden' as const;
      if (run.status !== 'queued') return 'not-queued' as const;
      tx.update(ref, { status: 'running', startedAt: new Date().toISOString() });
      return run;
    });

    if (claimed === 'missing' || claimed === 'forbidden') {
      send({ type: 'tool_failed', tool: 'pipeline', error: claimed === 'missing' ? `Run ${runId} not found` : 'Not your run' });
      return;
    }

    if (claimed !== 'not-queued') {
      // Execute here, streaming and persisting every event in order.
      const emitter = new EventEmitter();
      localRuns.set(runId, emitter);
      let chain = Promise.resolve();
      try {
        await runCreateExamPipeline(teacherId, claimed.input, (event) => {
          send(event);
          emitter.emit('event', event);
          chain = chain.then(() => ref.update({ events: FieldValue.arrayUnion(event) }).then(() => undefined));
          return chain;
        });
        const last = await ref.get();
        const events = (last.data() as RunDoc | undefined)?.events ?? [];
        const ok = events[events.length - 1]?.type === 'run_completed';
        await ref.update({ status: ok ? 'completed' : 'failed', finishedAt: new Date().toISOString() });
      } finally {
        localRuns.delete(runId);
      }
      return;
    }

    // Running on another instance, or already finished: replay, then poll until terminal.
    let seen = 0;
    const deadline = Date.now() + 280_000;
    while (!closed && Date.now() < deadline) {
      const snap = await ref.get();
      const run = snap.data() as RunDoc;
      for (const e of run.events.slice(seen)) send(e);
      seen = run.events.length;
      if (run.status === 'completed' || run.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(`SSE for run ${runId} failed:`, error);
    send({ type: 'tool_failed', tool: 'pipeline', error });
  } finally {
    clearInterval(keepAlive);
    finish();
  }
});

/**
 * POST /api/workflows/auto-dpp
 * Body: { sentence } (preferred, e.g. "Taught projectile motion at an angle — Class 12 JEE") or { topic },
 * plus optional batchId, subject, count, difficulty, requestId.
 */
workflowRouter.post('/auto-dpp', authMiddleware, async (req: Request, res: Response) => {
  const teacherId = req.auth?.teacherId || 'teacher-sharma-101';
  const { sentence, topic, batchId = 'batch-lakshya-2026', subject, count, difficulty, requestId } = req.body;

  if (!sentence && !topic) {
    res.status(400).json({ error: 'INVALID_ARGUMENT', message: 'A sentence (what was taught) or a topic is required for Auto DPP' });
    return;
  }

  try {
    const result = await createAutoDpp(teacherId, { sentence, topic, batchId, subject, count, difficulty, requestId });
    res.json({ success: true, dpp: result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: errorMsg });
  }
});

/** Drops undefined/null so the input can be stored in Firestore. */
function cleanInput(body: CreateExamRunInput | undefined): CreateExamRunInput {
  return JSON.parse(JSON.stringify(body ?? {})) as CreateExamRunInput;
}
