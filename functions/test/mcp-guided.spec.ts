import { describe, expect, it, vi } from 'vitest';

// Pure logic only; stub Firestore so importing the MCP module never touches the network.
vi.mock('../src/config/firebase.js', () => ({ db: {}, auth: {} }));

const { intentFromFields, friendlyFlag } = await import('../src/modules/mcp/mcpServer.js');

describe('teacher-friendly flags', () => {
  it('turns audit codes into plain sentences with option letters', () => {
    expect(friendlyFlag('q-03: KEY_MISMATCH (key opt3, solver opt1)')).toBe(
      'Question 3: the answer key may be wrong (key C, checker got A)',
    );
    expect(friendlyFlag('q-02: KEY_MISMATCH (key opt2, solver none)')).toMatch(/^Question 2: the checker found no correct option/);
    expect(friendlyFlag('q-05: AMBIGUOUS: two readings')).toBe('Question 5: the wording can be read in more than one way (two readings)');
  });
});
const { buildExamOptions, ASK_ORDER } = await import('../src/modules/mcp/examOptions.js');
const { planExam } = await import('../src/modules/workflows/examPlan.js');

const NOW = '2026-11-20T09:00:00+05:30';
const ist = (iso: string) => new Date(`${iso}+05:30`).getTime();
const BATCHES = [
  { id: 'batch-lakshya-2026', name: 'Lakshya 2026', classLevel: 'Class 12', targetExam: 'NEET', subject: 'Physics' },
  { id: 'batch-arjuna-2027', name: 'Arjuna 2027', classLevel: 'Class 11', targetExam: 'JEE', subject: 'Chemistry' },
];

describe('get_exam_options', () => {
  it('offers real batches and topics, in the guided order batch -> subject -> topic -> ...', () => {
    const o = buildExamOptions(BATCHES, ['Physics', 'Chemistry']);
    expect(ASK_ORDER[0]).toMatch(/^batch.*Create a new batch/);
    expect(ASK_ORDER[1]).toMatch(/^subject.*skip if the batch has one/);
    expect(o.createNewBatchOption.label).toBe('Create a new batch');
    expect(o.batches[1]).toMatchObject({ name: 'Arjuna 2027', subject: 'Chemistry' });
    expect(o.batches.map((b) => b.batchId)).toEqual(['batch-lakshya-2026', 'batch-arjuna-2027']);
    expect(o.topicsBySubject['Chemistry']).toContain('Chemical Kinetics');
    expect(o.guidance).toMatch(/ONE question at a time/);
  });
});

describe('create_ai_exam with fields chosen step by step', () => {
  it('plans a Chemistry exam for another batch without any Gemini call', () => {
    const intent = intentFromFields({
      batchId: 'batch-arjuna-2027', subject: 'Chemistry', topic: 'Chemical Kinetics', count: 10, difficulty: 'hard',
      date: '25 November 2026', startTime: '2:00 PM', durationMinutes: 60, marks: 4, negativeRule: '1/4', examPattern: 'JEE',
    });
    const r = planExam(intent, { batchId: 'batch-arjuna-2027' }, BATCHES, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan).toMatchObject({
      batchId: 'batch-arjuna-2027', classLevel: 'Class 11', subject: 'Chemistry', topic: 'Chemical Kinetics',
      count: 10, difficulty: 'hard', marks: 4, negativeMarks: 1, examPattern: 'JEE', durationMinutes: 60,
    });
    expect(r.plan.schedule?.startTimestampMs).toBe(ist('2026-11-25T14:00:00'));
    expect(r.plan.schedule?.endTimestampMs).toBe(ist('2026-11-25T15:00:00'));
  });

  it('asks instead of guessing when the date or time was not chosen', () => {
    const intent = intentFromFields({ batchId: 'batch-arjuna-2027', subject: 'Chemistry', topic: 'Solutions', count: 5 });
    const r = planExam(intent, { batchId: 'batch-arjuna-2027' }, BATCHES, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missingRequiredSlots).toEqual(expect.arrayContaining(['dateText', 'startTime', 'durationMinutes']));
  });
});

describe('subject comes from the batch (not asked)', () => {
  it("uses the batch's subject when none is given", async () => {
    const { planExam: plan } = await import('../src/modules/workflows/examPlan.js');
    const intent = intentFromFields({
      batchId: 'batch-arjuna-2027', topic: 'Solutions', count: 5, date: '25 November 2026', startTime: '10:00 AM', durationMinutes: 30,
    });
    const r = plan(intent, { batchId: 'batch-arjuna-2027' }, BATCHES, NOW);
    expect(r.ok && r.plan.subject).toBe('Chemistry');
  });

  it('still lets the teacher choose a different subject explicitly', async () => {
    const { planExam: plan } = await import('../src/modules/workflows/examPlan.js');
    const intent = intentFromFields({
      batchId: 'batch-arjuna-2027', subject: 'Physics', topic: 'Waves', count: 5, date: '25 November 2026', startTime: '10:00 AM', durationMinutes: 30,
    });
    const r = plan(intent, { batchId: 'batch-arjuna-2027' }, BATCHES, NOW);
    expect(r.ok && r.plan.subject).toBe('Physics');
  });
});

describe('create a new batch', () => {
  it('validates and normalises the batch', async () => {
    const { validateNewBatch, batchIdFor } = await import('../src/modules/exams/batches.js');
    expect(batchIdFor('Arjuna 2027')).toBe('batch-arjuna-2027');
    expect(batchIdFor('Batch Lakshya 2026')).toBe('batch-lakshya-2026');
    expect(validateNewBatch({ name: 'Arjuna 2027', subject: 'chemistry', classLevel: '11', targetExam: 'JEE', studentCount: 40 })).toEqual({
      ok: true,
      value: { name: 'Arjuna 2027', subject: 'Chemistry', classLevel: 'Class 11', targetExam: 'JEE', studentCount: 40 },
    });
    const bad = validateNewBatch({ name: 'x', subject: '', classLevel: '' });
    expect(bad.ok).toBe(false);
  });
});

describe('choosing which exam (list_my_exams)', () => {
  const rows = [
    { examId: 'e1', title: 'Old Physics draft', subject: 'Physics', batchId: 'batch-lakshya-2026', status: 'draft', createdAt: '2026-11-18T10:00:00Z' },
    { examId: 'e2', title: 'Published Physics', subject: 'Physics', batchId: 'batch-lakshya-2026', status: 'upcoming', createdAt: '2026-11-19T10:00:00Z' },
    { examId: 'e3', title: 'New Chemistry draft', subject: 'Chemistry', batchId: 'batch-arjuna-2027', status: 'draft', createdAt: '2026-11-20T10:00:00Z' },
  ];

  it('lists newest first and filters by status, batch and subject', async () => {
    const { selectExams } = await import('../src/modules/exams/teacherExams.js');
    expect(selectExams(rows).map((r) => r.examId)).toEqual(['e3', 'e2', 'e1']);
    expect(selectExams(rows, { status: 'draft' }).map((r) => r.examId)).toEqual(['e3', 'e1']);
    expect(selectExams(rows, { status: 'published' }).map((r) => r.examId)).toEqual(['e2']);
    expect(selectExams(rows, { batchId: 'batch-lakshya-2026' }).map((r) => r.examId)).toEqual(['e2', 'e1']);
    expect(selectExams(rows, { subject: 'chemistry' }).map((r) => r.examId)).toEqual(['e3']);
    expect(selectExams(rows, { limit: 1 }).map((r) => r.examId)).toEqual(['e3']);
  });
});
