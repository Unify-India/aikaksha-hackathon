import { describe, expect, it } from 'vitest';
import { sortNewestFirst, toExamDetail, toExamSummary, toQuestionView } from '../src/modules/exams/examViews.js';

describe('exam views (teacher read model)', () => {
  it('maps master_exams fields, including server names like class and negativeMarks', () => {
    const view = toExamSummary('exam_1', {
      title: 'NEET Physics', subject: 'Physics', status: 'draft', batchId: 'b', class: 'Class 12', examPattern: 'NEET',
      totalQuestions: 15, totalMarks: 60, duration: 45, defaultMarks: 4, negativeMarks: 1, date: '2026-11-22', startTime: '10:00', endTime: '10:45', createdAt: '2026-11-21T10:00:00Z',
    });
    expect(view).toMatchObject({ id: 'exam_1', classLevel: 'Class 12', defaultNegativeMarks: 1, totalMarks: 60 });
    expect(toExamSummary('x', {}).title).toBe('Untitled exam');
  });

  it('sorts newest first and puts exams without createdAt last', () => {
    const ids = sortNewestFirst([toExamSummary('old', { createdAt: '2026-01-01' }), toExamSummary('none', {}), toExamSummary('new', { createdAt: '2026-11-21' })]).map((e) => e.id);
    expect(ids).toEqual(['new', 'old', 'none']);
  });

  it('merges stripped questions with the answer key and reads { en } explanations', () => {
    const detail = toExamDetail(
      'exam_1',
      { title: 'T' },
      { questions: [{ id: 'q1', type: 'MCQ', marks: 4, negativeMarks: 1, en: { text: 'Flux?', options: [{ id: 'opt1', text: 'a' }, { id: 'opt2', text: 'b' }] } }, { id: 'q2', type: 'Numeric', text: 'g?' }] },
      { keys: { q1: { correctOptionId: 'opt2', answer: 'opt2', explanation: { en: 'Gauss', hi: '' } }, q2: { answer: '9.8', explanation: 'free fall' } } },
    );
    expect(detail.questions[0]).toMatchObject({ correctOptionId: 'opt2', explanation: 'Gauss', text: 'Flux?' });
    expect(detail.questions[0].answer).toBeUndefined();
    expect(detail.questions[1]).toMatchObject({ answer: '9.8', explanation: 'free fall', text: 'g?' });
  });

  it('survives missing documents and fields', () => {
    expect(toExamDetail('e', {}, {}, {}).questions).toEqual([]);
    expect(toQuestionView({ options: [{ text: 'x' }] }, 2, {})).toMatchObject({ id: 'q_3', type: 'MCQ', options: [{ id: 'opt1', text: 'x' }] });
  });

  it('shows the answer of a Numeric question even though the server stores it as correctOptionId', () => {
    // What createAndSegregateExam writes for a question without options and answer "9".
    const q = toQuestionView({ id: 'n1', type: 'Numeric', en: { text: 'F in mN?' } }, 0, { n1: { correctOptionId: '9', answer: '9', explanation: { en: 'F = 9 mN' } } });
    expect(q.correctOptionId).toBeUndefined();
    expect(q.answer).toBe('9');
    expect(q.explanation).toBe('F = 9 mN');
  });

  it('ignores a correctOptionId that matches no option', () => {
    const q = toQuestionView({ id: 'm', en: { text: 't', options: [{ id: 'opt1', text: 'a' }] } }, 0, { m: { correctOptionId: 'opt9' } });
    expect(q.correctOptionId).toBeUndefined();
    expect(q.answer).toBe('opt9');
  });
});
