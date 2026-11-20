import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGeminiClientForTests, type GeminiClientLike } from '../providers/gemini.provider.js';
import { buildAutoDppIntent } from './auto-dpp.prompt.js';
import { extractIntent, toVoiceIntent } from './intent-extraction.prompt.js';
import { checkLatex, checkMcq, dedupeByStem, stemSimilarity } from './question-checks.js';
import { generateQuestions, splitIntoBatches } from './question-generation.prompt.js';
import { assertBlind, auditQuestions } from './solver-audit.prompt.js';
import type { IExamQuestion } from './types.js';

/** Fake client whose reply depends on the request (calls run in parallel). */
function routedClient(route: (prompt: string, label: string) => unknown): GeminiClientLike & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    models: {
      generateContent: vi.fn(async (params) => {
        const contents = params.contents as string | { parts: { text?: string }[] }[];
        const prompt = typeof contents === 'string' ? contents : contents.flatMap((c) => c.parts.map((p) => p.text ?? '')).join('');
        prompts.push(prompt);
        return { text: JSON.stringify(route(prompt, String(params.config?.systemInstruction ?? ''))) };
      }),
    },
  };
}

afterEach(() => setGeminiClientForTests(undefined));

// ---------------------------------------------------------------------------

describe('question checks', () => {
  const good = {
    stem: 'Force between charges $q_1$ and $q_2$ at distance $r$ is:',
    options: [
      { id: 'opt1', text: '$\\frac{kq_1q_2}{r^2}$' },
      { id: 'opt2', text: '$kq_1q_2 r$' },
      { id: 'opt3', text: '$\\frac{kq_1q_2}{r}$' },
      { id: 'opt4', text: 'Zero' },
    ],
    correctOptionId: 'opt1',
    explanation: "Coulomb's law: $F = \\frac{kq_1q_2}{r^2}$.",
  };

  it('accepts a well-formed MCQ', () => {
    expect(checkMcq(good, { requireKey: true })).toEqual({ fatal: [], warnings: [] });
  });

  it('rejects a key that is not among the options and duplicate options', () => {
    const bad = { ...good, correctOptionId: 'opt5', options: [...good.options.slice(0, 3), { id: 'opt4', text: '$kq_1q_2 r$' }] };
    const { fatal } = checkMcq(bad, { requireKey: true });
    expect(fatal).toContain('CORRECT_OPTION_NOT_IN_OPTIONS');
    expect(fatal).toContain('DUPLICATE_OPTION_TEXT');
  });

  it('treats options that differ only in LaTeX structure as different', () => {
    const opts = [
      { id: 'opt1', text: '$\\frac{a}{b}$' },
      { id: 'opt2', text: '$ab$' },
    ];
    expect(checkMcq({ ...good, options: opts }, { requireKey: true }).fatal).toEqual([]);
    expect(checkMcq({ ...good, options: [opts[0]!, { id: 'opt2', text: '$\\frac{a}{b}$ ' }] }, { requireKey: true }).fatal).toContain(
      'DUPLICATE_OPTION_TEXT',
    );
  });

  it('treats options that differ only in letter case as different (R vs r)', () => {
    const opts = [
      { id: 'opt1', text: '$V_0/R$' },
      { id: 'opt2', text: '$V_0/r$' },
      { id: 'opt3', text: '$0$' },
    ];
    expect(checkMcq({ ...good, options: opts }, { requireKey: true }).fatal).toEqual([]);
  });

  it('flags broken LaTeX as a warning, not a drop', () => {
    const r = checkMcq({ ...good, stem: 'Find $\\frac{1}{2 here' }, { requireKey: true });
    expect(r.fatal).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/LATEX_ERROR in stem/);
  });

  it('checkLatex finds common breakages', () => {
    expect(checkLatex('$x$ and $$y$$ and \\$5')).toEqual([]);
    expect(checkLatex('$x')).toContain('unbalanced $');
    expect(checkLatex('$\\left( x$')).toContain('\\left/\\right mismatch');
  });

  it('dedupes near-identical stems', () => {
    expect(stemSimilarity('What is the SI unit of charge?', 'what is the si unit of charge')).toBe(1);
    const { kept, dropped } = dedupeByStem(['What is the SI unit of charge?', 'What is the SI unit of charge', 'Define electric flux.'], (s) => s);
    expect(kept).toHaveLength(2);
    expect(dropped).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('intent extraction', () => {
  const NEET =
    'Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.';

  it('normalises the NEET demo answer and marks it complete', async () => {
    setGeminiClientForTests(
      routedClient(() => ({
        detectedAction: 'CREATE_EXAM',
        confidence: 0.95,
        batchName: 'Lakshya 2026',
        subject: 'physics',
        topic: 'Electrostatics',
        questionCount: 15,
        durationMinutes: 45,
        marksPerQuestion: 4,
        negativeRule: '1/4',
        questionType: 'MCQ',
        difficulty: 'medium',
        dateText: 'tomorrow',
        startTime: '10:00',
        endTime: '10:45',
        examPattern: 'NEET',
      })),
    );
    const intent = await extractIntent(NEET, '2026-11-20T09:00:00+05:30', 'Asia/Kolkata');
    expect(intent.isComplete).toBe(true);
    expect(intent.missingRequiredSlots).toEqual([]);
    expect(intent.extractedSlots).toMatchObject({ subject: 'Physics', title: 'NEET Practice: Electrostatics', dateText: 'tomorrow' });
    expect(intent.extractedSlots.scheduledDate).toBeUndefined(); // the server resolves dates, not the model
  });

  it('tells the model today’s date and time zone', async () => {
    const fake = routedClient(() => ({ detectedAction: 'UNKNOWN', confidence: 0.2 }));
    setGeminiClientForTests(fake);
    await extractIntent('hello', '2026-11-20T09:00:00+05:30', 'Asia/Kolkata');
    expect(fake.prompts[0]).toContain('Friday, 20 November 2026');
    expect(fake.prompts[0]).toContain('Asia/Kolkata');
  });

  it('computes missing settings in code', () => {
    const intent = toVoiceIntent('x', { detectedAction: 'CREATE_EXAM', confidence: 0.9, topic: 'Optics', questionCount: 0 });
    expect(intent.isComplete).toBe(false);
    expect(intent.missingRequiredSlots).toEqual(
      expect.arrayContaining(['batchName', 'subject', 'questionCount', 'marksPerQuestion', 'dateText', 'startTime', 'durationMinutes']),
    );
  });
});

// ---------------------------------------------------------------------------

function fakeQuestion(stem: string, key = 'opt1') {
  return {
    stem,
    options: [
      { id: 'opt1', text: `A ${stem}` },
      { id: 'opt2', text: `B ${stem}` },
      { id: 'opt3', text: `C ${stem}` },
      { id: 'opt4', text: `D ${stem}` },
    ],
    correctOptionId: key,
    explanation: 'Because.',
    subtopic: 'S',
    difficulty: 'medium',
  };
}

describe('question generation', () => {
  it('splits into balanced batches of at most 5', () => {
    expect(splitIntoBatches(15, 5)).toEqual([5, 5, 5]);
    expect(splitIntoBatches(12, 5)).toEqual([4, 4, 4]);
    expect(splitIntoBatches(7, 5)).toEqual([4, 3]);
    expect(splitIntoBatches(3, 5)).toEqual([3]);
  });

  it('runs one call per batch, each on its own subtopic, and maps to IExamQuestion', async () => {
    const fake = routedClient((prompt) => {
      const sub = /Subtopic for this set: (.+)/.exec(prompt)?.[1] ?? '?';
      const n = Number(/Write exactly (\d+)/.exec(prompt)?.[1]);
      return { questions: Array.from({ length: n }, (_, i) => fakeQuestion(`${sub} question number ${i} unique`)) };
    });
    setGeminiClientForTests(fake);

    const qs = await generateQuestions({
      subject: 'Physics',
      topic: 'Electrostatics',
      subtopics: ['Coulomb law', 'Electric field', 'Gauss law'],
      count: 15,
      difficulty: 'medium',
      marks: 4,
      negativeMarks: 1,
      examPattern: 'NEET',
    });

    expect(fake.prompts).toHaveLength(3);
    expect(fake.prompts.map((p) => /Subtopic for this set: (.+)/.exec(p)?.[1])).toEqual(['Coulomb law', 'Electric field', 'Gauss law']);
    expect(qs).toHaveLength(15);
    expect(qs[0]).toMatchObject({ id: 'q-01', type: 'MCQ', marks: 4, negativeMarks: 1, correctOptionId: 'opt1', isAiGenerated: true });
    expect(qs[0]?.en?.options).toHaveLength(4);
  });

  it('surfaces a shortfall: drops invalid and duplicate questions instead of padding', async () => {
    setGeminiClientForTests(
      routedClient(() => ({
        questions: [
          fakeQuestion('Valid question about charge one'),
          { ...fakeQuestion('Broken key question'), options: fakeQuestion('x').options.slice(0, 4), correctOptionId: 'opt1', stem: '' },
          fakeQuestion('Valid question about charge one'), // duplicate
        ],
      })),
    );
    const qs = await generateQuestions({
      subject: 'Physics', topic: 'Electrostatics', subtopics: ['A'], count: 3, difficulty: 'easy', marks: 4, negativeMarks: 0,
    });
    expect(qs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

const stripped = (id: string): IExamQuestion => ({
  id,
  type: 'MCQ',
  marks: 4,
  negativeMarks: 1,
  subject: 'Physics',
  topic: 'Electrostatics',
  difficulty: 'medium',
  en: { text: `Question ${id}`, options: [{ id: 'opt1', text: '1' }, { id: 'opt2', text: '2' }, { id: 'opt3', text: '3' }, { id: 'opt4', text: '4' }] },
});

describe('solver audit', () => {
  it('refuses questions that still carry the key', () => {
    expect(() => assertBlind([{ ...stripped('q-01'), correctOptionId: 'opt1' }])).toThrow(/answer fields/);
    expect(() => assertBlind([{ ...stripped('q-01'), explanation: 'x' }])).toThrow(/answer fields/);
    expect(() => assertBlind([stripped('q-01')])).not.toThrow();
  });

  it('never sends key fields and returns one item per question in order', async () => {
    const fake = routedClient((prompt) => {
      const { questions } = JSON.parse(prompt) as { questions: { questionId: string }[] };
      return {
        results: questions
          .filter((q) => q.questionId !== 'q-02') // solver "forgets" one
          .map((q) => ({ questionId: q.questionId, solverOptionId: q.questionId === 'q-03' ? 'opt9' : 'opt2', issues: [] })),
      };
    });
    setGeminiClientForTests(fake);

    const items = await auditQuestions(['q-01', 'q-02', 'q-03'].map(stripped));

    expect(fake.prompts.join('')).not.toMatch(/correctOptionId|explanation/);
    expect(items.map((i) => i.questionId)).toEqual(['q-01', 'q-02', 'q-03']);
    expect(items[0]).toEqual({ questionId: 'q-01', solverOptionId: 'opt2', issues: [] });
    expect(items[1]?.issues[0]).toMatch(/^AUDIT_FAILED/);
    expect(items[2]?.solverOptionId).toBe('none'); // unknown option id is not trusted
  });
});

// ---------------------------------------------------------------------------

describe('auto DPP', () => {
  it('builds a fixed 10-question intent with pattern-based negative marking', async () => {
    setGeminiClientForTests(
      routedClient(() => ({
        subject: 'Physics',
        topic: 'Motion in a Plane',
        subtopic: 'Projectile motion at an angle',
        examPattern: 'JEE',
        confidence: 0.9,
      })),
    );
    const intent = await buildAutoDppIntent('Taught projectile motion at an angle — Class 12 JEE', 'batch-lakshya-2026');
    expect(intent).toMatchObject({
      detectedAction: 'AUTO_DPP',
      isComplete: true,
      extractedSlots: {
        batchId: 'batch-lakshya-2026',
        questionCount: 10,
        marksPerQuestion: 4,
        negativeRule: '1/4',
        difficulty: 'medium',
        title: 'DPP: Projectile motion at an angle',
      },
    });
  });
});
