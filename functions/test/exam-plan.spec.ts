import { describe, expect, it } from 'vitest';
import { findBatchByName, planExam } from '../src/modules/workflows/examPlan.js';
import type { IVoiceIntent } from '../src/types/voice-intent.js';

const NOW = '2026-11-20T09:00:00+05:30'; // Friday
const ist = (iso: string) => new Date(`${iso}+05:30`).getTime();
const BATCHES = [
  { id: 'batch-lakshya-2026', name: 'Lakshya 2026', classLevel: 'Class 12', targetExam: 'NEET' },
  { id: 'batch-arjuna-2027', name: 'Arjuna 2027', classLevel: 'Class 11', targetExam: 'JEE' },
];

const neetIntent = (slots: Partial<IVoiceIntent['extractedSlots']> = {}): IVoiceIntent => ({
  rawTranscript: 'NEET demo sentence',
  detectedAction: 'CREATE_EXAM',
  confidence: 0.95,
  extractedSlots: {
    title: 'NEET Practice: Electrostatics',
    batchName: 'Lakshya 2026',
    subject: 'Physics',
    topic: 'Electrostatics',
    questionCount: 15,
    durationMinutes: 45,
    marksPerQuestion: 4,
    negativeRule: '1/4',
    difficulty: 'medium',
    dateText: 'tomorrow',
    startTime: '10:00',
    endTime: '10:45',
    examPattern: 'NEET',
    ...slots,
  },
  missingRequiredSlots: [],
  isComplete: true,
});

describe('planExam: the NEET demo sentence', () => {
  it('becomes a complete plan with the right batch, topic, marking and IST times', () => {
    const r = planExam(neetIntent(), {}, BATCHES, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).toMatchObject({
      title: 'NEET Practice: Electrostatics',
      subject: 'Physics',
      topic: 'Electrostatics',
      batchId: 'batch-lakshya-2026',
      classLevel: 'Class 12',
      examPattern: 'NEET',
      count: 15,
      durationMinutes: 45,
      marks: 4,
      negativeRule: '1/4',
      negativeMarks: 1,
      difficulty: 'medium',
    });
    expect(r.plan.schedule?.startTimestampMs).toBe(ist('2026-11-21T10:00:00'));
    expect(r.plan.schedule?.endTimestampMs).toBe(ist('2026-11-21T10:45:00'));
  });

  it('lets explicit UI values (edited slot chips) win over the intent', () => {
    const r = planExam(neetIntent(), { topic: 'Current Electricity', count: 10, difficulty: 'hard' }, BATCHES, NOW);
    expect(r.ok && r.plan).toMatchObject({ topic: 'Current Electricity', count: 10, difficulty: 'hard' });
  });

  it('passes the spoken subtopic through to generation', () => {
    const r = planExam(neetIntent({ subtopic: "Gauss's law" }), {}, BATCHES, NOW);
    expect(r.ok && r.plan.subtopics).toEqual(["Gauss's law"]);
  });
});

describe('planExam: asks instead of guessing', () => {
  it('lists missing settings', () => {
    const r = planExam(neetIntent({ startTime: undefined, questionCount: undefined }), {}, BATCHES, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missingRequiredSlots).toEqual(expect.arrayContaining(['startTime', 'questionCount']));
  });

  it('reports an unknown batch name', () => {
    const r = planExam(neetIntent({ batchName: 'Phoenix 2030' }), {}, BATCHES, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missingRequiredSlots).toContain('batchName');
    expect(r.message).toContain('Phoenix 2030');
  });

  it('turns schedule problems into a clear message', () => {
    const r = planExam(neetIntent({ endTime: '10:30' }), {}, BATCHES, NOW); // 45 min exam in 30 min window
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/^DURATION_MISMATCH/);
  });

  it('redirects a DPP sentence and rejects nonsense', () => {
    const dpp = planExam({ ...neetIntent(), detectedAction: 'AUTO_DPP' }, {}, BATCHES, NOW);
    expect(!dpp.ok && dpp.message).toMatch(/Auto DPP/);
    const unknown = planExam({ ...neetIntent(), detectedAction: 'UNKNOWN', extractedSlots: {} }, {}, BATCHES, NOW);
    expect(unknown.ok).toBe(false);
  });
});

describe('planExam: legacy calls without a transcript', () => {
  it('keeps working with field defaults and no schedule', () => {
    const r = planExam(undefined, { subject: 'Physics', count: 5, duration: 45, batchId: 'batch-lakshya-2026' }, BATCHES, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).toMatchObject({ topic: 'Electrostatics', count: 5, durationMinutes: 45, negativeMarks: 1 });
    expect(r.plan.schedule).toBeUndefined();
  });
});

describe('findBatchByName', () => {
  it('matches spoken names loosely', () => {
    expect(findBatchByName(BATCHES, 'Lakshya 2026')?.id).toBe('batch-lakshya-2026');
    expect(findBatchByName(BATCHES, 'batch lakshya 2026')?.id).toBe('batch-lakshya-2026');
    expect(findBatchByName(BATCHES, 'arjuna-2027')?.id).toBe('batch-arjuna-2027');
    expect(findBatchByName(BATCHES, 'unknown')).toBeUndefined();
  });
});
