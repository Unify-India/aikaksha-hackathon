import { IQuestionResult, ISheetEvaluation } from '../models/evaluation.models';
import { isAnswerFlagged, summariseSheet } from './sheet-summary';

const question = (id: string, awarded: number, confidence: number, teacherOverride?: number): IQuestionResult => ({
  questionId: id,
  verdict: 'partial',
  awarded,
  max: 4,
  studentAnswer: '',
  feedback: '',
  confidence,
  steps: [],
  evidence: [],
  teacherOverride,
});

const sheet = (questions: IQuestionResult[], ocrConfidence = 0.9): ISheetEvaluation => ({
  submissionId: 's1',
  jobId: 'j1',
  schemeId: 'x',
  studentLabel: 'Student A',
  fileName: 'sheet-01.pdf',
  mimeType: 'application/pdf',
  pageCount: 3,
  checksum: '',
  status: 'graded',
  questions,
  totalAwarded: 999, // a wrong total from the model must be ignored
  totalMax: 8,
  ocrConfidence,
  needsReview: false,
});

describe('summariseSheet', () => {
  it('recomputes the total, preferring teacher overrides', () => {
    const result = summariseSheet(sheet([question('a', 3, 0.9), question('b', 1, 0.9, 4)]));
    expect(result.totalAwarded).toBe(7);
  });

  it('flags low-confidence answers for review until the teacher overrides them', () => {
    expect(summariseSheet(sheet([question('a', 3, 0.5)])).needsReview).toBe(true);
    expect(summariseSheet(sheet([question('a', 3, 0.5, 2)])).needsReview).toBe(false);
  });

  it('flags sheets whose handwriting was hard to read', () => {
    expect(summariseSheet(sheet([question('a', 3, 0.95)], 0.4)).needsReview).toBe(true);
  });

  it('uses a 90% cut-off, and a teacher check clears the flag without changing marks', () => {
    expect(isAnswerFlagged(question('a', 3, 0.89))).toBe(true);
    expect(isAnswerFlagged(question('a', 3, 0.9))).toBe(false);
    const checked = { ...question('a', 3, 0.5), teacherVerified: true };
    expect(isAnswerFlagged(checked)).toBe(false);
    expect(summariseSheet(sheet([checked])).totalAwarded).toBe(3);
  });

  it('moves a sheet from needs_review to graded (never approved) once every flag is cleared', () => {
    const flagged = summariseSheet({ ...sheet([question('a', 3, 0.5)]), status: 'needs_review' });
    expect(flagged.status).toBe('needs_review');
    const cleared = summariseSheet({ ...flagged, questions: [{ ...flagged.questions[0], teacherVerified: true }] });
    expect(cleared).toMatchObject({ status: 'graded', needsReview: false });
    expect(summariseSheet({ ...cleared, status: 'approved' }).status).toBe('approved');
  });

  it('flags hard-to-read handwriting until the teacher checks the sheet', () => {
    expect(summariseSheet(sheet([question('a', 3, 0.95)], 0.85)).needsReview).toBe(true);
    expect(summariseSheet({ ...sheet([question('a', 3, 0.95)], 0.85), ocrVerified: true }).needsReview).toBe(false);
  });
});
