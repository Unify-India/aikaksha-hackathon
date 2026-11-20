import { IQuestionResult, ISheetEvaluation } from '../models/evaluation.models';
import { summariseSheet } from './sheet-summary';

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
});
