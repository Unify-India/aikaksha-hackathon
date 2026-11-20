import { normaliseDraftScheme, normaliseGrading, normaliseOption, sectionLetter } from './grading-normaliser';
import { SAMPLE_MATHS_SCHEME } from './evaluation-fixtures.testing';
import { preprocessJsonString, parseJsonResponse } from '../../../core/services/ai/gemini.service';

describe('normaliseGrading', () => {
  const scheme = SAMPLE_MATHS_SCHEME;

  it('scores MCQs against the key itself, ignoring what the model claims', () => {
    const { questions } = normaliseGrading(
      {
        ocrConfidence: 0.9,
        questions: [
          { questionId: 'A1', attempted: true, chosenOption: '(B)', studentAnswer: '', steps: [], feedback: '', confidence: 0.95, evidence: [] },
          { questionId: 'A2', attempted: true, chosenOption: 'a', studentAnswer: '', steps: [], feedback: '', confidence: 0.95, evidence: [] },
        ],
      },
      scheme,
      7,
    );
    const a1 = questions.find((q) => q.questionId === 'A1')!;
    const a2 = questions.find((q) => q.questionId === 'A2')!;
    expect(a1).toMatchObject({ awarded: 1, verdict: 'correct', studentAnswer: 'Marked (b)' });
    expect(a2).toMatchObject({ awarded: 0, verdict: 'wrong' });
  });

  it('clamps step marks to the scheme, rounds to halves, and recomputes the total', () => {
    const { questions } = normaliseGrading(
      {
        questions: [
          {
            questionId: 'C8',
            attempted: true,
            studentAnswer: 'x = a tanθ …',
            steps: [
              { stepId: 'C8-1', awarded: 5, reasoning: 'too generous' },
              { stepId: 'C8-2', awarded: 0.74, reasoning: 'rounds to 0.5' },
              { stepId: 'C8-3', awarded: -2, reasoning: 'negative' },
            ],
            feedback: 'ok',
            confidence: 1.4,
            evidence: [],
          },
        ],
      },
      scheme,
      7,
    );
    const c8 = questions.find((q) => q.questionId === 'C8')!;
    expect(c8.steps.map((s) => s.awarded)).toEqual([1, 0.5, 0, 0]);
    expect(c8.awarded).toBe(1.5);
    expect(c8.verdict).toBe('partial');
    expect(c8.confidence).toBe(1);
  });

  it('keeps valid boxes and drops boxes on missing pages or with bad coordinates', () => {
    const { questions } = normaliseGrading(
      {
        questions: [
          {
            questionId: 'B2',
            attempted: true,
            studentAnswer: '',
            steps: [],
            feedback: '',
            confidence: 0.8,
            evidence: [
              { page: 3, box_2d: [100, 50, 400, 950] },
              { page: 9, box_2d: [100, 50, 400, 950] },
              { page: 2, box_2d: [500, 50, 400, 950] },
              { page: 2, box_2d: [100, 50, 400] },
            ],
          },
        ],
      },
      scheme,
      7,
    );
    expect(questions.find((q) => q.questionId === 'B2')!.evidence).toEqual([{ page: 3, box_2d: [100, 50, 400, 950] }]);
  });

  it('treats questions Gemini skipped as not attempted and low confidence', () => {
    const { questions } = normaliseGrading({ questions: [] }, scheme, 7);
    expect(questions).toHaveLength(scheme.questions.length);
    expect(questions.every((q) => q.verdict === 'not_attempted' && q.confidence < 0.7)).toBe(true);
  });
});

describe('normaliseDraftScheme', () => {
  it('builds ids, fixes step totals and option letters', () => {
    const scheme = normaliseDraftScheme(
      {
        title: 'Class 12 Mathematics Test',
        subject: 'Mathematics',
        classLevel: '12',
        questions: [
          { section: 'A', number: '1', type: 'mcq', questionText: 'Range of sin⁻¹x', maxMarks: 1, correctOption: '(B)', steps: [] },
          { section: 'B', number: '2', type: 'subjective', questionText: 'Evaluate', maxMarks: 2, modelAnswer: '1', steps: [{ description: 'part i', marks: 1 }] },
          { section: 'B', number: '3', type: 'subjective', questionText: 'Find', maxMarks: 2, steps: [{ description: 'all', marks: 5 }] },
          { section: 'B', number: '3', type: 'subjective', questionText: 'Duplicate number', maxMarks: 2, steps: [] },
        ],
      },
      'draft-1',
      'abc',
    );
    expect(scheme.questions.map((q) => q.id)).toEqual(['A1', 'B2', 'B3', 'B3_']);
    expect(scheme.questions[0].correctOption).toBe('b');
    expect(scheme.questions[1].steps).toEqual([{ id: 'B2-1', description: 'part i', marks: 2 }]);
    expect(scheme.questions[2].steps).toEqual([{ id: 'B3-1', description: 'Complete, correct answer', marks: 2 }]);
    expect(scheme.totalMarks).toBe(7);
    expect(scheme.status).toBe('pending');
  });

  it('reads section letters from headings like "SECTION – A"', () => {
    expect(['SECTION – A', 'Section-B', 'SEC. C', 'Part D', 'a', ''].map(sectionLetter)).toEqual(['A', 'B', 'C', 'D', 'A', '']);
  });

  it('reads option letters loosely', () => {
    expect(normaliseOption('Option (C)')).toBe('c');
    expect(normaliseOption(null)).toBeNull();
  });
});

describe('Gemini JSON parsing', () => {
  it('repairs LaTeX backslashes inside $…$', () => {
    const raw = '{"t": "$\\frac{1}{2}$"}';
    expect(parseJsonResponse<{ t: string }>(raw).t).toBe('$\\frac{1}{2}$');
    expect(preprocessJsonString(raw)).toBe('{"t": "$\\\\frac{1}{2}$"}');
  });

  it('strips markdown fences', () => {
    expect(parseJsonResponse<{ a: number }>('```json\n{"a": 1}\n```').a).toBe(1);
  });
});
