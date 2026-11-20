import { describe, expect, it, vi } from 'vitest';

// The validator is pure; stub Firestore so importing the module never touches the network.
vi.mock('../src/config/firebase.js', () => ({ db: {}, auth: {} }));

const { validateCompleteExam } = await import('../src/modules/exams/createCompleteExam.js');

// 2026-11-20 14:00 IST
const NOW = new Date('2026-11-20T14:00:00+05:30');
const ist = (iso: string) => new Date(`${iso}+05:30`).getTime();

const mcq = (overrides: Record<string, unknown> = {}) => ({
  type: 'MCQ',
  marks: 4,
  negativeMarks: 1,
  subject: 'Physics',
  topic: 'Electrostatics',
  difficulty: 'medium',
  en: {
    text: 'A point charge $q$ sits at the centre of a cube. Flux through one face?',
    options: [
      { id: 'opt1', text: '$\\frac{q}{\\varepsilon_0}$' },
      { id: 'opt2', text: '$\\frac{q}{6\\varepsilon_0}$' },
      { id: 'opt3', text: '$\\frac{q}{4\\pi\\varepsilon_0 a^2}$' },
      { id: 'opt4', text: '$0$' },
    ],
  },
  correctOptionId: 'opt2',
  explanation: 'Flux divides equally over 6 faces: $\\frac{q}{6\\varepsilon_0}$.',
  ...overrides,
});

const payload = (examParams: Record<string, unknown> = {}, questions: unknown[] = [mcq()]) => ({
  examParams: {
    title: 'NEET 2026 Physics Sprint: Electrostatics',
    batchId: 'batch-lakshya-2026',
    subject: 'Physics',
    duration: 45,
    targetQuestions: questions.length,
    defaultMarks: 4,
    defaultNegativeMarks: 1,
    date: '2026-11-25',
    startTime: '09:30',
    endTime: '10:30',
    ...examParams,
  },
  questions,
});

describe('validateCompleteExam: happy path (guide §3.3 shape)', () => {
  it('accepts the guide-style payload and resolves IST timestamps', () => {
    const r = validateCompleteExam(payload(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startTimestampMs).toBe(ist('2026-11-25T09:30:00'));
    expect(r.value.endTimestampMs).toBe(ist('2026-11-25T10:30:00'));
    expect(r.value.totalMarks).toBe(4);
    expect(r.value.params.status).toBe('draft');
    expect(r.value.questions[0]).toMatchObject({ id: 'q-01', correctOptionId: 'opt2', explanation: { en: expect.stringContaining('6 faces') } });
  });

  it('fills defaults: targetQuestions, endTime from duration, date = today (IST)', () => {
    const r = validateCompleteExam(payload({ targetQuestions: undefined, endTime: undefined, date: undefined, startTime: '15:00' }), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.params).toMatchObject({ targetQuestions: 1, date: '2026-11-20', endTime: '15:45' });
  });

  it('moves en.explanation out of the student-visible content', () => {
    const q = mcq({ explanation: undefined, en: { ...mcq().en, explanation: 'secret working' } });
    const r = validateCompleteExam(payload({}, [q]), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.questions[0]?.explanation).toEqual({ en: 'secret working' });
    expect(JSON.stringify(r.value.questions[0]?.en)).not.toContain('secret working');
  });

  it('accepts Numeric questions with an answer', () => {
    const numeric = { type: 'Numeric', topic: 'Capacitance', en: { text: 'Find C in pF.' }, answer: 96 };
    expect(validateCompleteExam(payload({}, [numeric]), NOW).ok).toBe(true);
  });
});

describe('validateCompleteExam: 400 cases from the guide', () => {
  const fails = (body: unknown) => {
    const r = validateCompleteExam(body, NOW);
    expect(r.ok).toBe(false);
    return r.ok ? [] : r.details;
  };

  it('negativeMarks greater than marks', () => {
    expect(fails(payload({}, [mcq({ negativeMarks: 5 })]))).toContainEqual(
      expect.objectContaining({ field: 'questions[0].negativeMarks' }),
    );
  });

  it('correctOptionId missing or not among the options', () => {
    expect(fails(payload({}, [mcq({ correctOptionId: undefined })]))).toContainEqual(
      expect.objectContaining({ field: 'questions[0].correctOptionId' }),
    );
    expect(fails(payload({}, [mcq({ correctOptionId: 'opt9' })]))).toContainEqual(
      { field: 'questions[0].correctOptionId', issue: 'correctOptionId does not match any option id' },
    );
  });

  it('targetQuestions not equal to questions.length', () => {
    expect(fails(payload({ targetQuestions: 3 }))).toContainEqual(expect.objectContaining({ field: 'examParams.targetQuestions' }));
  });

  it('endTime before startTime, and window shorter than duration', () => {
    expect(fails(payload({ startTime: '10:30', endTime: '10:00' }))).toContainEqual(expect.objectContaining({ field: 'examParams.endTime' }));
    expect(fails(payload({ startTime: '10:00', endTime: '10:30', duration: 45 }))).toContainEqual(
      expect.objectContaining({ field: 'examParams.endTime' }),
    );
  });

  it('fewer than 2 options for an MCQ', () => {
    expect(fails(payload({}, [mcq({ en: { text: 'Q?', options: [{ id: 'opt1', text: 'only' }] }, correctOptionId: 'opt1' })]))).toContainEqual(
      { field: 'questions[0].en.options', issue: 'MCQ needs 2 to 5 options' },
    );
  });

  it('Numeric without an answer, empty question list, bad date and short title', () => {
    expect(fails(payload({}, [{ type: 'Numeric', topic: 'X', en: { text: 'Find x.' } }]))).toContainEqual(
      expect.objectContaining({ field: 'questions[0].answer' }),
    );
    expect(fails(payload({ targetQuestions: 0 }, []))).toContainEqual(expect.objectContaining({ field: 'questions' }));
    expect(fails(payload({ date: '2026-02-30' }))).toContainEqual(expect.objectContaining({ field: 'examParams.date' }));
    expect(fails(payload({ title: 'Hi' }))).toContainEqual(expect.objectContaining({ field: 'examParams.title' }));
  });

  it('rejects a body without examParams with a readable field path', () => {
    expect(fails({ questions: [] })).toContainEqual(expect.objectContaining({ field: 'examParams' }));
  });
});
