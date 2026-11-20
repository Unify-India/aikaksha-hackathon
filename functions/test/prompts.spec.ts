import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setGeminiClientForTests, type GeminiClientLike } from '../src/providers/gemini.provider.js';
import type { IBaseQuestion } from '../src/types/index.js';
import { checkLatex, checkMcq, dedupeByStem, stemSimilarity } from '../src/prompts/question-checks.js';
import { generateQuestions, splitIntoBatches } from '../src/prompts/question-generation.prompt.js';
import { assertBlind, auditQuestions, summariseAudit } from '../src/prompts/solver-audit.prompt.js';

/** Fake client whose reply depends on the request (calls run in parallel). */
function routedClient(route: (prompt: string) => unknown): GeminiClientLike & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    models: {
      generateContent: vi.fn(async (params) => {
        const contents = params.contents as string | { parts: { text?: string }[] }[];
        const prompt = typeof contents === 'string' ? contents : contents.flatMap((c) => c.parts.map((p) => p.text ?? '')).join('');
        prompts.push(prompt);
        return { text: JSON.stringify(route(prompt)) };
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

  it('treats options that differ only in LaTeX structure or letter case as different', () => {
    expect(checkMcq({ ...good, options: [{ id: 'opt1', text: '$\\frac{a}{b}$' }, { id: 'opt2', text: '$ab$' }] }, { requireKey: true }).fatal).toEqual([]);
    expect(checkMcq({ ...good, options: [{ id: 'opt1', text: '$V_0/R$' }, { id: 'opt2', text: '$V_0/r$' }] }, { requireKey: true }).fatal).toEqual([]);
  });

  it('flags broken LaTeX as a warning, not a drop', () => {
    const r = checkMcq({ ...good, stem: 'Find $\\frac{1}{2 here' }, { requireKey: true });
    expect(r.fatal).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/LATEX_ERROR in stem/);
    expect(checkLatex('$x')).toContain('unbalanced $');
  });

  it('dedupes near-identical stems', () => {
    expect(stemSimilarity('What is the SI unit of charge?', 'what is the si unit of charge')).toBe(1);
    expect(dedupeByStem(['What is the SI unit of charge?', 'What is the SI unit of charge', 'Define flux.'], (s) => s).kept).toHaveLength(2);
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
  });

  it('runs one call per batch, each on its own subtopic, and maps to the functions IExamQuestion', async () => {
    const fake = routedClient((prompt) => {
      const sub = /Subtopic for this set: (.+)/.exec(prompt)?.[1] ?? '?';
      const n = Number(/Write exactly (\d+)/.exec(prompt)?.[1]);
      return { questions: Array.from({ length: n }, (_, i) => fakeQuestion(`${sub} question number ${i} unique`)) };
    });
    setGeminiClientForTests(fake);

    const qs = await generateQuestions({
      subject: 'Physics', topic: 'Electrostatics', subtopics: ['Coulomb law', 'Electric field', 'Gauss law'],
      count: 15, difficulty: 'medium', marks: 4, negativeMarks: 1, examPattern: 'NEET',
    });

    expect(fake.prompts).toHaveLength(3);
    expect(qs).toHaveLength(15);
    expect(new Set(qs.map((q) => q.id)).size).toBe(15); // unique ids across parallel batches
    expect(qs[0]).toMatchObject({
      id: 'q-01', type: 'MCQ', marks: 4, negativeMarks: 1, correctOptionId: 'opt1',
      explanation: { en: 'Because.' }, isAiGenerated: true,
    });
    expect(qs[0]?.en?.options).toHaveLength(4);
  });

  it('keeps the other batches when one batch fails (shortfall, not total loss)', async () => {
    let call = 0;
    setGeminiClientForTests({
      models: {
        generateContent: vi.fn(async (params) => {
          const prompt = String(params.contents);
          if (call++ === 0) throw new ApiError({ message: 'bad request', status: 400 }); // not retried
          const n = Number(/Write exactly (\d+)/.exec(prompt)?.[1]);
          const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
          return { text: JSON.stringify({ questions: Array.from({ length: n }, (_, i) => fakeQuestion(`Distinct ${words[i]} question about lenses`)) }) };
        }),
      },
    });
    const qs = await generateQuestions({
      subject: 'Physics', topic: 'Optics', subtopics: ['A', 'B'], count: 10, difficulty: 'easy', marks: 4, negativeMarks: 0,
    });
    expect(qs).toHaveLength(5); // batch 1 lost, batch 2 kept
    expect(qs.map((q) => q.id)).toEqual(['q-01', 'q-02', 'q-03', 'q-04', 'q-05']);
  });

  it('tells the model never to rely on a figure', async () => {
    const fake = routedClient(() => ({ questions: [fakeQuestion('only one')] }));
    setGeminiClientForTests(fake);
    await generateQuestions({ subject: 'Physics', topic: 'Optics', subtopics: ['A'], count: 1, difficulty: 'hard', marks: 4, negativeMarks: 1 });
    const config = (fake.models.generateContent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.config as { systemInstruction: string };
    expect(config.systemInstruction).toMatch(/Never refer to a figure/);
  });
});

// ---------------------------------------------------------------------------

const stripped = (id: string, difficulty = 'medium'): IBaseQuestion => ({
  id, type: 'MCQ', marks: 4, negativeMarks: 1, subject: 'Physics', topic: 'Electrostatics', difficulty,
  en: { text: `Question ${id}`, options: [{ id: 'opt1', text: '1' }, { id: 'opt2', text: '2' }, { id: 'opt3', text: '3' }, { id: 'opt4', text: '4' }] },
});

describe('solver audit', () => {
  it('refuses questions that still carry the key', () => {
    expect(() => assertBlind([{ ...stripped('q-01'), correctOptionId: 'opt1' }])).toThrow(/answer fields/);
    expect(() => assertBlind([{ ...stripped('q-01'), explanation: { en: 'x' } }])).toThrow(/answer fields/);
    expect(() => assertBlind([stripped('q-01')])).not.toThrow();
  });

  it('never sends key fields and returns one item per question in order', async () => {
    const fake = routedClient((prompt) => {
      const { questions } = JSON.parse(prompt) as { questions: { questionId: string }[] };
      return {
        results: questions
          .filter((q) => q.questionId !== 'q-02')
          .map((q) => ({ questionId: q.questionId, solverOptionId: q.questionId === 'q-03' ? 'opt9' : 'opt2', issues: [] })),
      };
    });
    setGeminiClientForTests(fake);

    const items = await auditQuestions(['q-01', 'q-02', 'q-03'].map((id) => stripped(id)));

    expect(fake.prompts.join('')).not.toMatch(/correctOptionId|explanation/);
    expect(items.map((i) => i.questionId)).toEqual(['q-01', 'q-02', 'q-03']);
    expect(items[0]).toEqual({ questionId: 'q-01', solverOptionId: 'opt2', issues: [] });
    expect(items[1]?.issues[0]).toMatch(/^AUDIT_FAILED/);
    expect(items[2]?.solverOptionId).toBe('none');
  });

  it('uses smaller batches when any question is hard', async () => {
    const fake = routedClient((prompt) => {
      const { questions } = JSON.parse(prompt) as { questions: { questionId: string }[] };
      return { results: questions.map((q) => ({ questionId: q.questionId, solverOptionId: 'opt1', issues: [] })) };
    });
    setGeminiClientForTests(fake);
    await auditQuestions(['q-01', 'q-02', 'q-03', 'q-04', 'q-05', 'q-06'].map((id) => stripped(id, 'hard')));
    expect(fake.prompts).toHaveLength(2); // 3 + 3
  });
});

describe('summariseAudit (score and flags for audit_question_batch)', () => {
  it('scores agreement and lists readable flags', () => {
    const keys = new Map<string, string | undefined>([['q-01', 'opt1'], ['q-02', 'opt2'], ['q-03', 'opt3'], ['q-04', 'opt4']]);
    const { score, flags, details } = summariseAudit(
      [
        { questionId: 'q-01', solverOptionId: 'opt1', issues: [] }, // clean
        { questionId: 'q-02', solverOptionId: 'opt1', issues: [] }, // wrong key
        { questionId: 'q-03', solverOptionId: 'opt3', issues: ['AMBIGUOUS: two readings'] }, // agrees but flagged
        { questionId: 'q-04', solverOptionId: 'opt4', issues: [] }, // clean
      ],
      keys,
    );
    expect(score).toBe(50);
    expect(flags).toEqual(['q-02: KEY_MISMATCH (key opt2, solver opt1)', 'q-03: AMBIGUOUS: two readings']);
    expect(details[1]).toMatchObject({ questionId: 'q-02', keyOptionId: 'opt2', solverOptionId: 'opt1', agrees: false });
  });

  it('gives 100 and no flags when everything agrees', () => {
    const { score, flags } = summariseAudit(
      [{ questionId: 'q-01', solverOptionId: 'opt2', issues: [] }],
      new Map([['q-01', 'opt2']]),
    );
    expect(score).toBe(100);
    expect(flags).toEqual([]);
  });
});
