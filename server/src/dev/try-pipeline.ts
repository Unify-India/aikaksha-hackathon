/**
 * Manual end-to-end check of Sakshi's prompts against the real Gemini API.
 *
 *   cd server
 *   echo GEMINI_API_KEY=... > .env        # never commit .env
 *   npm run try                           # NEET demo sentence, 15 questions
 *   npm run try -- --count 5              # fewer questions (cheaper)
 *   npm run try -- --corrupt-key          # flips q-01's key; the audit must catch it
 *   npm run try -- --dpp "Taught projectile motion at an angle — Class 12 JEE"
 *   npm run try -- --golden               # also writes src/app/core/mocks/golden-run.json
 *
 * Not used by the server at runtime.
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildAutoDppIntent } from '../prompts/auto-dpp.prompt.js';
import { extractIntent } from '../prompts/intent-extraction.prompt.js';
import { generateQuestions } from '../prompts/question-generation.prompt.js';
import { auditQuestions } from '../prompts/solver-audit.prompt.js';
import type { IExamQuestion, IVoiceIntent, NegativeRule } from '../prompts/types.js';
import { DEFAULT_TIMEZONE, resolveSchedule, type ResolvedSchedule } from '../utils/time.js';

const NEET_SENTENCE =
  'Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.';

const { values } = parseArgs({
  options: {
    transcript: { type: 'string', default: NEET_SENTENCE },
    dpp: { type: 'string' },
    count: { type: 'string' },
    'corrupt-key': { type: 'boolean', default: false },
    golden: { type: 'boolean', default: false },
  },
});

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  const out = await fn();
  console.log(`✔ ${label} — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return out;
}

function negativeMarks(marks: number, rule: NegativeRule | undefined): number {
  switch (rule) {
    case '1/2':
      return marks / 2;
    case '1/3':
      return Number((marks / 3).toFixed(2));
    case '1/4':
      return marks / 4;
    default:
      return 0;
  }
}

/** Local stand-in for Sandeep's stripForStudent (utils/strip.ts). */
function strip(q: IExamQuestion): IExamQuestion {
  const { correctOptionId: _k, answer: _a, explanation: _e, ...rest } = q;
  return { ...rest, ...(rest.en && { en: { text: rest.en.text, options: rest.en.options ?? [] } }) };
}

async function main(): Promise<void> {
  const nowIso = new Date().toISOString();
  const t0 = Date.now();

  // 1. Intent
  const intent: IVoiceIntent = values.dpp
    ? await timed('buildAutoDppIntent', () => buildAutoDppIntent(values.dpp!, 'batch-lakshya-2026'))
    : await timed('extractIntent', () => extractIntent(values.transcript!, nowIso, DEFAULT_TIMEZONE));
  console.log(JSON.stringify(intent, null, 2));
  if (!intent.isComplete) {
    console.log(`\nIncomplete intent — the agent would ask for: ${intent.missingRequiredSlots.join(', ')}`);
    return;
  }

  // 2. Schedule (exams only)
  let schedule: ResolvedSchedule | undefined;
  if (intent.detectedAction === 'CREATE_EXAM') {
    schedule = resolveSchedule(intent, nowIso, DEFAULT_TIMEZONE);
    console.log('✔ resolveSchedule', schedule);
  }

  // 3. Questions
  const s = intent.extractedSlots;
  const marks = s.marksPerQuestion ?? 4;
  const count = values.count ? Number(values.count) : (s.questionCount ?? 10);
  const questions = await timed(`generateQuestions(${count})`, () =>
    generateQuestions({
      subject: s.subject ?? 'Physics',
      topic: s.topic ?? 'General',
      subtopics: s.subtopic ? [s.subtopic] : [],
      count,
      difficulty: s.difficulty ?? 'medium',
      marks,
      negativeMarks: negativeMarks(marks, s.negativeRule),
      ...(s.examPattern && { examPattern: s.examPattern }),
    }),
  );
  const warned = questions.filter((q) => (q.validationWarnings ?? []).length > 0);
  console.log(`  ${questions.length}/${count} questions, ${warned.length} with warnings`);
  if (questions.length < count) console.log(`  ⚠ SHORTFALL: ${count - questions.length} missing`);
  for (const q of warned) console.log(`  ${q.id}: ${q.validationWarnings?.join('; ')}`);

  // 4. Optional: corrupt one key to prove the audit catches it
  const key = new Map(questions.map((q) => [q.id, q.correctOptionId]));
  if (values['corrupt-key'] && questions[0]) {
    const real = key.get(questions[0].id);
    const wrong = questions[0].en?.options?.find((o) => o.id !== real)?.id;
    key.set(questions[0].id, wrong);
    console.log(`  (corrupted ${questions[0].id}: key ${real} -> ${wrong})`);
  }

  // 5. Blind audit
  const audit = await timed('auditQuestions', () => auditQuestions(questions.map(strip)));
  const disagreements = audit.filter((a) => a.solverOptionId !== key.get(a.questionId));
  const flagged = audit.filter((a) => a.issues.length > 0);
  console.log(`  solver agrees on ${audit.length - disagreements.length}/${audit.length}`);
  for (const d of disagreements) console.log(`  ✗ ${d.questionId}: key ${key.get(d.questionId)}, solver ${d.solverOptionId}`);
  for (const f of flagged) console.log(`  ⚑ ${f.questionId}: ${f.issues.join('; ')}`);

  // Print every question the teacher would need to review, so it can be checked by hand.
  const review = new Set([...disagreements, ...flagged].map((a) => a.questionId));
  for (const q of questions.filter((x) => review.has(x.id))) {
    console.log(`\n── REVIEW ${q.id} (${q.subtopic ?? ''}) ──`);
    console.log(`  Q: ${q.en?.text}`);
    for (const o of q.en?.options ?? []) console.log(`  ${o.id}: ${o.text}`);
    console.log(`  Key: ${key.get(q.id)} | Solver: ${audit.find((a) => a.questionId === q.id)?.solverOptionId}`);
    console.log(`  Explanation: ${q.explanation}`);
  }

  console.log(`\nTotal ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // 6. Golden fixture for Paritosh's mock mode
  if (values.golden) {
    // Never save a broken run as the reference: every question must exist and be audited.
    const auditFailed = audit.filter((a) => a.issues.some((i) => i.startsWith('AUDIT_FAILED')));
    if (questions.length < count || auditFailed.length > 0 || values['corrupt-key']) {
      console.log(
        `\n✗ Golden run NOT written: ${questions.length}/${count} questions, ${auditFailed.length} audit failures` +
          (values['corrupt-key'] ? ', --corrupt-key was used' : '') +
          '. Run again.',
      );
      return;
    }
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, '../../../src/app/core/mocks/golden-run.json');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(
      out,
      JSON.stringify({ generatedAt: nowIso, intent, schedule, questions, audit }, null, 2) + '\n',
      'utf8',
    );
    console.log(`Golden run written to ${out}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
