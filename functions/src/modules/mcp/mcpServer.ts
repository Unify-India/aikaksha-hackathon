/**
 * Real MCP (Model Context Protocol) server for AI Kaksha exam creation.
 *
 * Transport: Streamable HTTP, stateless (a fresh server per request — fits Cloud Functions).
 * Endpoint:  POST {api base}/mcp   with   Authorization: Bearer <demo token>
 *
 * Connect from Gemini CLI (~/.gemini/settings.json):
 *   "mcpServers": { "aikaksha": { "httpUrl": "<api base>/mcp",
 *                                  "headers": { "Authorization": "Bearer <DEMO_AUTH_TOKEN>" } } }
 * or from MCP Inspector / Claude / any MCP client that supports Streamable HTTP.
 *
 * Every tool calls the same tested functions as the REST API; nothing is duplicated here.
 * Owner: Sakshi.
 */
import type { Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';
import * as logger from 'firebase-functions/logger';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { CreateCompleteExamSchema, CreateExamError, createCompleteExam } from '../exams/createCompleteExam.js';
import { createAutoDpp, finalizeAndPublishExam, resolveTeacherContext } from '../exams/examTools.js';
import { getTeacherDraft, type TeacherDraftView } from '../exams/teacherDraft.js';
import { createBatch } from '../exams/batches.js';
import { fetchTeacherExams, selectExams } from '../exams/teacherExams.js';
import { understandTeacherRequest } from '../workflows/understand.js';
import { runCreateExamPipeline, type RunEvent } from '../workflows/routes.js';
import { registerAikakshaPrompts } from './mcpPrompts.js';
import { buildExamOptions } from './examOptions.js';
import type { Difficulty, IVoiceIntent, NegativeRule } from '../../types/voice-intent.js';

export const MCP_SERVER_NAME = 'ai-kaksha-exams';
export const MCP_SERVER_VERSION = '1.0.0';

interface Caller {
  teacherId: string;
  tenantId?: string;
}

/** Builds an MCP server whose tools act on behalf of `caller`. */
export function buildMcpServer(caller: Caller): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        'AI Kaksha exam tools for Indian school/coaching teachers. Dates/times are Asia/Kolkata.\n' +
        'CREATING AN EXAM: if the teacher gave a complete request in one sentence, call understand_exam_request, ' +
        'then create_ai_exam with that transcript. Otherwise (e.g. "create an exam") run a guided conversation: call ' +
        'get_exam_options, then ask ONE question at a time in this order: batch -> subject -> topic -> number of ' +
        'questions and difficulty -> date and start time -> duration or end time -> marking. Offer the real options ' +
        'returned by get_exam_options as choices; never assume a batch or topic and never invent presets.\n' +
        '- Batch choices = the existing batches plus "Create a new batch" (never a generic "other"). For a new batch ' +
        'ask its name, class, target exam, subject and optionally number of students, then call create_batch.\n' +
        '- Subject: every batch has a subject. Use the chosen batch\'s subject and do NOT ask, unless the teacher ' +
        'says the exam is for a different subject.\n' +
        '- Any answer may contain SEVERAL settings or a whole request (e.g. "Chemistry exam for Arjuna 2027, ' +
        '10 questions, 23 Nov 10 to 10:30am"). Then call understand_exam_request on it, keep everything it found, and ' +
        'skip those questions; ask only for what is still missing. If nothing is missing, create the exam right away ' +
        '(it is only a draft) and show the summary afterwards.\n' +
        '- A range like "10-15 questions": use the higher number (max 15) and mention it in the summary.\n' +
        '- If the named batch does not exist, say so and offer "Create a new batch" with that name.\n' +
        '- If a date and weekday disagree (e.g. "Monday 22 Nov" when 22 Nov is a Sunday), ask which one they meant.\n' +
        'Then call create_ai_exam with the structured fields (no transcript needed).\n' +
        'AFTER CREATING: show the audit score and every flag; use review_exam to show questions with keys. ' +
        'CHOOSING AN EXAM: when the teacher asks to review, show or publish "an exam" without naming one (and it is ' +
        'not the exam just created in this conversation), call list_my_exams and ask which one, as numbered choices. ' +
        "Call publish_exam only after the teacher explicitly approves.\n" +
        'PRESENTING RESULTS: speak to a teacher, not a developer. Show title, batch, subject, topic, number of ' +
        'questions, marking, date/time (IST), duration, status and the answer-check result. Never show internal ' +
        'fields such as reference ids, tokens, hashes, timestamps or tool names unless the teacher asks; keep the ' +
        'reference examId to yourself and use it when the teacher says "show it" or "publish it".',
    },
  );

  server.registerTool(
    'list_my_batches',
    {
      title: 'List my batches',
      description: "Returns the teacher's batches (id, name, class, target exam) and subjects.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => ok(await resolveTeacherContext(caller.teacherId, caller.tenantId)),
  );

  server.registerTool(
    'create_batch',
    {
      title: 'Create a new batch',
      description:
        'Creates a new batch (class group) for the teacher when they choose "Create a new batch". Ask the teacher ' +
        'for each value; do not invent them.',
      inputSchema: {
        name: z.string().min(2).max(60).describe('Batch name, e.g. Arjuna 2027'),
        classLevel: z.string().describe('e.g. Class 11, Class 12, Dropper'),
        targetExam: z.string().optional().describe('NEET, JEE, CBSE, ICSE, State Board or Other'),
        subject: z.string().describe('Main subject taught to this batch, e.g. Chemistry'),
        studentCount: z.number().int().min(0).max(1000).optional().describe('Number of students (optional)'),
      },
    },
    async (input) => {
      try {
        const b = await createBatch(caller.teacherId, input, caller.tenantId);
        return ok({
          status: 'batch_created',
          batch: { name: b.name, class: b.classLevel, targetExam: b.targetExam, subject: b.subject, students: b.studentCount },
          next: 'Continue the exam setup with this batch (its subject is set, so do not ask for the subject).',
          reference: { batchId: b.id },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return fail(msg.replace(/^[A-Z_]+:\s*/, ''));
      }
    },
  );

  server.registerTool(
    'get_exam_options',
    {
      title: 'Options for creating an exam',
      description:
        'Returns the choices for each step of a guided exam setup, in order: my batches, subjects, NCERT topics per ' +
        'subject, question count, difficulty, exam patterns, durations and marking schemes. Call this before asking ' +
        'the teacher anything when the request is incomplete, and offer these as choices one question at a time.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const ctx = await resolveTeacherContext(caller.teacherId, caller.tenantId);
      return ok(buildExamOptions(ctx.batches, ctx.subjects));
    },
  );

  server.registerTool(
    'understand_exam_request',
    {
      title: 'Understand an exam request',
      description:
        'Reads a teacher sentence such as "Create a 45-minute NEET test for Lakshya 2026 on Electrostatics, 15 MCQs, ' +
        '4 marks each, 1/4 negative, tomorrow 10 to 10:45 AM". Returns the understood settings plus either a complete ' +
        'plan (batch, exact IST start/end) or the list of missing settings to ask the teacher. Creates nothing.',
      inputSchema: { transcript: z.string().min(1).describe("The teacher's request, spoken or typed.") },
      annotations: { readOnlyHint: true },
    },
    async ({ transcript }) => ok(await understandTeacherRequest(caller.teacherId, transcript)),
  );

  server.registerTool(
    'create_ai_exam',
    {
      title: 'Create an exam with AI questions',
      description:
        'Creates a draft exam and has Gemini write MCQs (parallel batches, validated, de-duplicated), then runs a ' +
        'blind solver audit. Give EITHER the teacher\'s complete sentence (transcript) OR the structured fields ' +
        'collected step by step (batchId, subject, topic, count, difficulty, date, startTime, durationMinutes or ' +
        'endTime, marking). Do not guess missing values: if batch, subject, topic, date or start time were not ' +
        'chosen by the teacher, use get_exam_options and ask first. Returns examId, audit score and flags, and the ' +
        'confirmationToken + contentHash for publish_exam, or needs_input listing what is missing. Takes 1–2 minutes.',
      inputSchema: {
        transcript: z.string().optional().describe("The teacher's complete request in one sentence (optional if fields are given)."),
        batchId: z.string().optional().describe('Batch id chosen from get_exam_options.'),
        subject: z.string().optional().describe('e.g. Physics, Chemistry, Biology, Mathematics.'),
        topic: z.string().optional().describe('Chapter/topic, e.g. Chemical Kinetics.'),
        subtopic: z.string().optional(),
        count: z.number().int().min(1).max(15).optional().describe('Number of MCQs (max 15).'),
        difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
        date: z.string().optional().describe('e.g. 25 November 2026, tomorrow, next Monday.'),
        startTime: z.string().optional().describe('e.g. 10:00 AM or 14:30.'),
        endTime: z.string().optional().describe('e.g. 10:45 AM (or give durationMinutes).'),
        durationMinutes: z.number().int().min(5).max(360).optional(),
        marks: z.number().min(1).max(20).optional().describe('Marks per question.'),
        negativeRule: z.enum(['none', '1/4', '1/3', '1/2']).optional(),
        examPattern: z.string().optional().describe('NEET, JEE, CBSE …'),
        title: z.string().optional(),
      },
    },
    async (args) => {
      const { transcript, batchId, subject, topic, subtopic, count, difficulty, date, startTime, endTime, durationMinutes, marks, negativeRule, examPattern, title } = args;
      if (!transcript?.trim() && !(topic && (subject || batchId))) {
        return fail('Not enough information. Call get_exam_options and ask the teacher step by step (batch, subject, topic, …).');
      }
      const overrides = {
        ...(batchId && { batchId }),
        ...(subject && { subject }),
        ...(topic && { topic }),
        ...(subtopic && { subtopic }),
        ...(count && { count }),
        ...(difficulty && { difficulty }),
        ...(date && { dateText: date }),
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        ...(durationMinutes && { duration: durationMinutes }),
        ...(marks && { marks }),
        ...(negativeRule && { negativeRule }),
        ...(examPattern && { examPattern }),
        ...(title && { title }),
      };
      // Structured fields from a guided conversation: build the intent directly (no extra Gemini call).
      const input = transcript?.trim()
        ? { transcript: transcript.trim(), ...overrides }
        : { intent: intentFromFields(args), ...overrides };
      const events: RunEvent[] = [];
      await runCreateExamPipeline(caller.teacherId, input, async (e) => {
        events.push(e);
      });
      const last = events[events.length - 1];
      if (last?.type === 'run_completed') {
        const draft = await getTeacherDraft(caller.teacherId, last.examId);
        return ok({
          status: 'created_as_draft',
          exam: await teacherSummary(caller, draft),
          audit: auditSummary(draft),
          next: 'Offer to show the questions (review_exam) and, only if the teacher approves, publish (publish_exam).',
          reference: { examId: last.examId },
        });
      }
      if (last?.type === 'needs_input') {
        return ok({
          status: 'needs_more_details',
          askTheTeacherFor: last.missingRequiredSlots.map(friendlySlot),
          note: last.message.replace(/^[A-Z_]+:\s*/, ''),
        });
      }
      return fail(last?.type === 'tool_failed' ? friendlyError(last.error) : 'The exam could not be created. Please try again.');
    },
  );

  server.registerTool(
    'list_my_exams',
    {
      title: 'List my exams',
      description:
        "Lists the teacher's exams, newest first, so they can choose one to review or publish. Call this whenever " +
        'the teacher asks to review/show/publish an exam without saying which one (unless it is the exam created ' +
        'earlier in this same conversation). Present the items as numbered choices using title, batch, date and ' +
        'status; never show the reference ids. Optional filters narrow the list.',
      inputSchema: {
        status: z.enum(['draft', 'published', 'all']).optional().describe('draft = not published yet; default all.'),
        batchId: z.string().optional().describe('Only exams for this batch.'),
        subject: z.string().optional(),
        limit: z.number().int().min(1).max(25).optional().describe('Default 10.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, batchId, subject, limit }) => {
      const rows = selectExams(await fetchTeacherExams(caller.teacherId), {
        ...(status && { status }),
        ...(batchId && { batchId }),
        ...(subject && { subject }),
        ...(limit && { limit }),
      });
      if (rows.length === 0) return ok({ exams: [], note: 'No exams found. Offer to create one.' });
      const names = await batchNames(caller);
      return ok({
        exams: rows.map((r, i) => ({
          choice: i + 1,
          title: r.title,
          ...(r.batchId && { batch: names.get(r.batchId) ?? r.batchId }),
          ...(r.subject && { subject: r.subject }),
          ...(r.startTimestampMs !== undefined && {
            when: `${IST_FMT.format(r.startTimestampMs)}, ${IST_TIME.format(r.startTimestampMs)}${
              r.endTimestampMs !== undefined ? ` – ${IST_TIME.format(r.endTimestampMs)}` : ''
            } IST`,
          }),
          status: r.status === 'draft' ? 'Draft' : r.status === 'upcoming' ? 'Published (upcoming)' : r.status,
          ...(r.totalQuestions !== undefined && { questions: r.totalQuestions }),
          ...(r.auditScore !== undefined && {
            answerCheck: r.auditFlagCount ? `${r.auditScore}/100, ${r.auditFlagCount} flag(s)` : `${r.auditScore}/100`,
          }),
          reference: { examId: r.examId },
        })),
        note: 'Ask the teacher which exam (by number or title). Keep the reference ids to yourself.',
      });
    },
  );

  server.registerTool(
    'review_exam',
    {
      title: 'Review an exam',
      description:
        'Teacher view of ONE exam: summary, every question with its options, the correct answer and a short ' +
        'explanation, plus the answer-check result (flagged questions first). If the teacher has not said which ' +
        'exam, call list_my_exams first and ask them to choose; do not guess.',
      inputSchema: { examId: z.string().min(1).describe('Reference of the exam the teacher chose (from list_my_exams or create_ai_exam).') },
      annotations: { readOnlyHint: true },
    },
    async ({ examId }) => {
      const draft = await getTeacherDraft(caller.teacherId, examId);
      const flagged = new Set(draft.audit.flags.map((f) => f.split(':')[0]));
      const questions = draft.questions.map((q, i) => {
        const options = q.en?.options ?? [];
        const correct = options.find((o) => o.id === q.correctOptionId);
        return {
          number: i + 1,
          ...(flagged.has(q.id ?? '') && { flagged: draft.audit.flags.filter((f) => f.startsWith(`${q.id}:`)).map(friendlyFlag) }),
          question: q.en?.text ?? '',
          options: options.map((o, j) => `${String.fromCharCode(65 + j)}. ${o.text}`),
          correctAnswer: correct ? `${String.fromCharCode(65 + options.indexOf(correct))}. ${correct.text}` : q.answer,
          explanation: q.explanation?.en ?? '',
          ...(Array.isArray(q.validationWarnings) && q.validationWarnings.length > 0 && { warnings: q.validationWarnings }),
        };
      });
      questions.sort((a, b) => Number(Boolean(b.flagged)) - Number(Boolean(a.flagged)));
      return ok({ exam: await teacherSummary(caller, draft), audit: auditSummary(draft), questions });
    },
  );

  server.registerTool(
    'publish_exam',
    {
      title: 'Publish an exam to students',
      description:
        'Publishes a reviewed draft so students can take it at its scheduled time (they never receive answers). ' +
        'The server verifies the questions have not changed since the audit. If the audit flagged any question, ' +
        'publishing is refused unless acknowledgeFlags is true, which must only be set after the teacher has seen ' +
        "the flags. Only call after the teacher explicitly approves. If the teacher has not said which exam, call " +
        'list_my_exams with status "draft" and ask them to choose; do not guess.',
      inputSchema: {
        examId: z.string().min(1).describe('Reference of the exam the teacher chose (from list_my_exams or create_ai_exam).'),
        acknowledgeFlags: z
          .boolean()
          .optional()
          .describe('Set true only if the teacher reviewed every audit flag and still wants to publish.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ examId, acknowledgeFlags }) => {
      const draft = await getTeacherDraft(caller.teacherId, examId);
      if (draft.exam.status !== 'draft') {
        return fail(`"${draft.exam.title}" is already published (status: ${draft.exam.status}).`);
      }
      if (draft.audit.flags.length > 0 && !acknowledgeFlags) {
        return fail('Not published: the answer checker flagged some questions. Show them to the teacher first.', {
          auditScore: draft.audit.score,
          flaggedQuestions: draft.audit.flags.map(friendlyFlag),
        });
      }
      const { confirmationToken, contentHash } = draft.audit;
      if (!confirmationToken || !contentHash) {
        return fail('This exam has not been checked yet, so it cannot be published. Create it again or ask for help.');
      }
      // Token and hash stay server-side; finalize still verifies the questions are unchanged since the audit.
      await finalizeAndPublishExam(caller.teacherId, { examId, confirmationToken, contentHash, status: 'upcoming' });
      return ok({
        status: 'published',
        exam: await teacherSummary(caller, { ...draft, exam: { ...draft.exam, status: 'upcoming' } }),
        studentLinkPath: `/student/exams/${examId}`,
        note: 'Students see only the questions, never the answers.',
      });
    },
  );

  server.registerTool(
    'create_daily_practice',
    {
      title: 'Daily practice set from what was taught',
      description:
        'From a sentence like "Taught projectile motion at an angle today, Class 12 JEE", maps the lesson to the ' +
        'syllabus and creates a 10-question practice set (generated + blind-audited). Published only if the audit ' +
        'passes; otherwise left as a draft with the flags.',
      inputSchema: {
        sentence: z.string().min(1).describe('What the teacher taught.'),
        batchId: z.string().optional(),
        count: z.number().int().min(1).max(15).optional(),
      },
    },
    async ({ sentence, batchId, count }) => {
      const dpp = await createAutoDpp(caller.teacherId, { sentence, ...(batchId && { batchId }), ...(count && { count }) });
      return ok({
        status: dpp.published ? 'published' : 'held_for_review',
        title: dpp.title,
        topic: dpp.subtopic ? `${dpp.topic} → ${dpp.subtopic}` : dpp.topic,
        questions: dpp.totalQuestions,
        totalMarks: dpp.totalMarks,
        answerCheck: { score: `${dpp.auditScore}/100`, flaggedQuestions: dpp.auditFlags.map(friendlyFlag) },
        note: dpp.published
          ? 'All answers were confirmed by the independent checker, so it was published.'
          : 'Some questions were flagged, so it was kept as a draft. Review it before publishing.',
        reference: { examId: dpp.examId },
      });
    },
  );

  server.registerTool(
    'create_exam_from_questions',
    {
      title: 'Create an exam from ready-made questions',
      description:
        'Single-shot creation when the questions are already written: { examParams, questions }. Validates marking, ' +
        'IST schedule and answer keys, then stores the student copy (no answers) and the answer key separately. ' +
        'Same contract as POST /api/exams/create-complete.',
      inputSchema: CreateCompleteExamSchema.shape,
    },
    async (input) => {
      try {
        return ok(await createCompleteExam(caller, input));
      } catch (err) {
        if (err instanceof CreateExamError) return fail(err.message, err.details ? { details: err.details } : undefined);
        throw err;
      }
    },
  );

  registerAikakshaPrompts(server);
  return server;
}

/** Express handler for POST /mcp (Streamable HTTP, stateless). */
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const caller: Caller = {
    teacherId: req.auth?.teacherId ?? 'teacher-sharma-101',
    ...(req.auth?.tenantId && { tenantId: req.auth.tenantId }),
  };
  const server = buildMcpServer(caller);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    // Our req.auth (AuthContext) is not the SDK's AuthInfo; tools receive the caller via closure instead.
    await transport.handleRequest(req as unknown as IncomingMessage, res, req.body);
  } catch (err) {
    logger.error('MCP request failed:', err instanceof Error ? err.message : String(err));
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

/** GET/DELETE /mcp: no server-initiated streams or sessions in stateless mode. */
export function mcpMethodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST.' }, id: null });
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Teacher-friendly output (no tokens, hashes or raw timestamps)
// ---------------------------------------------------------------------------

const IST_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});
const IST_TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

/** batchId -> batch name for this teacher (empty map if the lookup fails). */
async function batchNames(caller: Caller): Promise<Map<string, string>> {
  try {
    const ctx = await resolveTeacherContext(caller.teacherId, caller.tenantId);
    return new Map(ctx.batches.map((b) => [b.id, b.name]));
  } catch {
    return new Map();
  }
}

/** Plain summary of an exam for the teacher. */
export async function teacherSummary(caller: Caller, draft: TeacherDraftView) {
  const e = draft.exam;
  const batch = e.batchId ? ((await batchNames(caller)).get(e.batchId) ?? e.batchId) : undefined;
  const topics = [...new Set(draft.questions.map((q) => q.topic).filter(Boolean))];
  return {
    title: e.title,
    ...(batch && { batch }),
    subject: e.subject,
    ...(topics.length > 0 && { topic: topics.join(', ') }),
    questions: e.totalQuestions,
    totalMarks: e.totalMarks,
    marking: `+${e.defaultMarks} per correct answer, −${e.defaultNegativeMarks} per wrong answer`,
    ...(e.startTimestampMs !== undefined && e.endTimestampMs !== undefined && {
      when: `${IST_FMT.format(e.startTimestampMs)}, ${IST_TIME.format(e.startTimestampMs)} – ${IST_TIME.format(e.endTimestampMs)} IST`,
    }),
    durationMinutes: e.duration,
    status: e.status === 'draft' ? 'Draft (not visible to students yet)' : e.status === 'upcoming' ? 'Published (upcoming)' : e.status,
  };
}

/** The blind answer-check result in plain words. */
export function auditSummary(draft: TeacherDraftView) {
  const flags = draft.audit.flags;
  return {
    score: draft.audit.score !== undefined ? `${draft.audit.score}/100` : 'not checked yet',
    result: flags.length === 0 ? 'Every answer key was independently confirmed.' : `${flags.length} issue(s) need the teacher's attention.`,
    flaggedQuestions: flags.map(friendlyFlag),
  };
}

/** "q-03: KEY_MISMATCH (key opt3, solver opt1)" -> "Question 3: the answer key may be wrong (key C, checker got A)". */
export function friendlyFlag(flag: string): string {
  const m = /^q-0*(\d+):\s*(.*)$/.exec(flag);
  const where = m ? `Question ${m[1]}` : 'A question';
  const rest = m?.[2] ?? flag;
  const letter = (opt: string) => (/^opt(\d)$/.test(opt) ? String.fromCharCode(64 + Number(opt.slice(3))) : opt);
  const km = /KEY_MISMATCH \(key (\S+), solver (\S+)\)/.exec(rest);
  if (km) {
    return km[2] === 'none'
      ? `${where}: the checker found no correct option; the question or options may be wrong`
      : `${where}: the answer key may be wrong (key ${letter(km[1]!)}, checker got ${letter(km[2]!)})`;
  }
  const code = rest.split(':')[0]?.trim();
  const detail = rest.slice((code?.length ?? 0) + 1).trim();
  const label: Record<string, string> = {
    AMBIGUOUS: 'the wording can be read in more than one way',
    MULTIPLE_CORRECT: 'more than one option looks correct',
    NO_CORRECT_OPTION: 'none of the options looks correct',
    LATEX_ERROR: 'a formula may not display correctly',
    UNSOLVABLE: 'data is missing (or it refers to a figure that is not shown)',
    AUDIT_FAILED: 'it could not be checked automatically',
  };
  return `${where}: ${label[code ?? ''] ?? rest}${detail && label[code ?? ''] ? ` (${detail})` : ''}`;
}

function friendlySlot(slot: string): string {
  const map: Record<string, string> = {
    batchName: 'batch',
    subject: 'subject',
    topic: 'topic',
    questionCount: 'number of questions',
    dateText: 'date',
    startTime: 'start time',
    durationMinutes: 'duration (or end time)',
    marksPerQuestion: 'marks per question',
  };
  return map[slot] ?? slot;
}

function friendlyError(error: string): string {
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(error)) return 'The AI service has reached its usage limit for now. Please try again later.';
  if (/GENERATION_FAILED/.test(error)) return 'The AI could not write valid questions this time. Please try again.';
  if (/DURATION_MISMATCH|INVALID_SCHEDULE|START_IN_PAST|UNRECOGNISED_DATE|INVALID_TIME|WEEKDAY_MISMATCH/.test(error)) return error.replace(/^[A-Z_]+:\s*/, '');
  return 'Something went wrong while creating the exam. Please try again.';
}

export interface ExamFields {
  batchId?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  count?: number;
  difficulty?: Difficulty;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  marks?: number;
  negativeRule?: NegativeRule;
  examPattern?: string;
  title?: string;
}

/**
 * Builds the intent for fields collected step by step (no Gemini call). The workflow's planner still checks
 * that everything needed is present and resolves the IST schedule, returning needs_input otherwise.
 */
export function intentFromFields(f: ExamFields): IVoiceIntent {
  const slots: IVoiceIntent['extractedSlots'] = {
    ...(f.title && { title: f.title }),
    ...(f.batchId && { batchId: f.batchId }),
    ...(f.subject && { subject: f.subject }),
    ...(f.topic && { topic: f.topic }),
    ...(f.subtopic && { subtopic: f.subtopic }),
    ...(f.count && { questionCount: f.count }),
    ...(f.durationMinutes && { durationMinutes: f.durationMinutes }),
    ...(f.marks && { marksPerQuestion: f.marks }),
    ...(f.negativeRule && { negativeRule: f.negativeRule }),
    ...(f.difficulty && { difficulty: f.difficulty }),
    ...(f.date && { dateText: f.date }),
    ...(f.startTime && { startTime: f.startTime }),
    ...(f.endTime && { endTime: f.endTime }),
    ...(f.examPattern && { examPattern: f.examPattern }),
  };
  const summary = [
    f.examPattern, f.subject, f.topic && `on ${f.topic}`, f.count && `${f.count} MCQs`, f.difficulty,
    f.batchId && `for ${f.batchId}`, f.date && `on ${f.date}`, f.startTime && `at ${f.startTime}`,
  ].filter(Boolean).join(' ');
  return {
    rawTranscript: `Guided setup: ${summary}`,
    detectedAction: 'CREATE_EXAM',
    confidence: 1,
    extractedSlots: slots,
    missingRequiredSlots: [],
    isComplete: true,
  };
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string, extra?: Record<string, unknown>) {
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message, ...extra }, null, 2) }] };
}
