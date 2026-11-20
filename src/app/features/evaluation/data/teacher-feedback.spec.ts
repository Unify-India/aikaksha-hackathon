import { IQuestionResult, ISheetEvaluation } from '../models/evaluation.models';
import { SAMPLE_MATHS_SCHEME } from './evaluation-fixtures.testing';
import { collectDecisions, learningStats, pickExamples, teacherExamplesPrompt } from './teacher-feedback';

const q = (questionId: string, awarded: number, extra: Partial<IQuestionResult> = {}): IQuestionResult => ({
  questionId,
  verdict: 'partial',
  awarded,
  max: 2,
  studentAnswer: `working for ${questionId}`,
  feedback: '',
  confidence: 0.95,
  steps: [],
  evidence: [],
  ...extra,
});

const sheet = (status: ISheetEvaluation['status'], questions: IQuestionResult[]): ISheetEvaluation => ({
  submissionId: `s-${Math.random()}`,
  jobId: 'j',
  schemeId: SAMPLE_MATHS_SCHEME.id,
  studentLabel: 'Student A',
  fileName: 'sheet-01.pdf',
  mimeType: 'application/pdf',
  pageCount: 1,
  checksum: '',
  status,
  questions,
  totalAwarded: 0,
  totalMax: 23,
  ocrConfidence: 0.95,
  needsReview: false,
});

describe('learning from teacher decisions', () => {
  const sheets = [
    // Approved sheet: B2 corrected 1 → 2, B3 implicitly confirmed by approving the sheet.
    sheet('approved', [q('B2', 1, { teacherOverride: 2 }), q('B3', 2)]),
    // Graded (not approved) sheet: B5 explicitly confirmed in the Review Gate; B6 untouched.
    sheet('graded', [q('B5', 1, { teacherVerified: true }), q('B6', 0)]),
  ];

  it('collects corrections and confirmations, ignoring untouched answers', () => {
    const decisions = collectDecisions(sheets, SAMPLE_MATHS_SCHEME);
    expect(decisions.map((d) => [d.label, d.kind, d.aiMarks, d.teacherMarks, d.explicit])).toEqual([
      ['B·Q2', 'corrected', 1, 2, true],
      ['B·Q3', 'confirmed', 2, 2, false],
      ['B·Q5', 'confirmed', 1, 1, true],
    ]);
  });

  it('measures AI vs teacher agreement', () => {
    expect(learningStats(collectDecisions(sheets, SAMPLE_MATHS_SCHEME))).toEqual({
      checked: 3,
      agreed: 2,
      agreementPercent: 67,
      corrections: 1,
    });
    expect(learningStats([]).agreementPercent).toBeNull();
  });

  it('puts corrections first, skips implicit confirmations, and caps examples per question', () => {
    const many = Array.from({ length: 6 }, () => sheet('graded', [q('B2', 0, { teacherOverride: 1 })]));
    const picked = pickExamples(collectDecisions([...sheets, ...many], SAMPLE_MATHS_SCHEME));
    expect(picked[0].kind).toBe('corrected');
    expect(picked.filter((d) => d.questionId === 'B2')).toHaveLength(3);
    expect(picked.some((d) => d.questionId === 'B3')).toBe(false); // implicit only
    expect(picked.some((d) => d.questionId === 'B5')).toBe(true);
  });

  it('tells Gemini what the teacher corrected', () => {
    const text = teacherExamplesPrompt(pickExamples(collectDecisions(sheets, SAMPLE_MATHS_SCHEME)));
    expect(text).toContain('B·Q2 (max 2): student wrote "working for B2". AI gave 1; the TEACHER CORRECTED it to 2.');
    expect(text).toContain('the teacher CONFIRMED 1');
    expect(teacherExamplesPrompt([])).toBe('');
  });
});
