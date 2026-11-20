import { TestBed } from '@angular/core/testing';
import { IQuestionResult, ISheetEvaluation } from '../models/evaluation.models';
import { EVALUATION_REPOSITORY } from '../data/evaluation-repository';
import { SAMPLE_MATHS_SCHEME } from '../data/evaluation-fixtures.testing';
import { fakePdfService } from '../data/fake-pdf.testing';
import { InMemoryEvaluationRepository } from '../data/in-memory-evaluation-repository.testing';
import { PdfDocumentService } from '../data/pdf-document.service';
import { AnswerReviewGateComponent } from './answer-review-gate.component';
import { ReviewQueueStore } from './review-queue.store';

const answer = (questionId: string, awarded: number, max: number, confidence: number, pages: number[]): IQuestionResult => ({
  questionId,
  verdict: awarded === max ? 'correct' : awarded === 0 ? 'wrong' : 'partial',
  awarded,
  max,
  studentAnswer: 'student working',
  feedback: 'AI feedback',
  confidence,
  steps: [],
  evidence: pages.map((page) => ({ page, box_2d: [100, 50, 300, 950] as [number, number, number, number] })),
});

/** A graded sheet: one confident answer, two low-confidence answers (one not located), hard-to-read handwriting. */
function seededRepo(): InMemoryEvaluationRepository {
  const repo = new InMemoryEvaluationRepository();
  const sheet: ISheetEvaluation = {
    submissionId: 'job-x-1',
    jobId: 'job-x',
    schemeId: SAMPLE_MATHS_SCHEME.id,
    studentLabel: 'Student A',
    fileName: 'sheet-01.pdf',
    mimeType: 'application/pdf',
    pageCount: 3,
    checksum: 'abc',
    status: 'needs_review',
    questions: [answer('A1', 1, 1, 0.97, [1]), answer('B2', 1, 2, 0.6, [2]), answer('C8', 2, 4, 0.8, [])],
    totalAwarded: 4,
    totalMax: 23,
    ocrConfidence: 0.85,
    needsReview: true,
    filePath: 'question_papers/x/answer_sheets/job-x-1.pdf',
  };
  void repo.saveSheet(SAMPLE_MATHS_SCHEME.id, sheet);
  return repo;
}

describe('Review Gate', () => {
  let repo: InMemoryEvaluationRepository;

  beforeEach(() => {
    repo = seededRepo();
    TestBed.configureTestingModule({
      providers: [
        { provide: EVALUATION_REPOSITORY, useValue: repo },
        { provide: PdfDocumentService, useValue: fakePdfService },
      ],
    });
  });

  it('lists every answer below 90% plus hard-to-read handwriting, with the pages to show', async () => {
    const store = TestBed.inject(ReviewQueueStore);
    await store.load();
    expect(store.items().map((i) => [i.kind, i.label, i.pages])).toEqual([
      ['handwriting', 'Handwriting', [1]],
      ['answer', 'B·Q2', [2]],
      ['answer', 'C·Q8', []],
    ]);
  });

  it('saves approvals and corrections, and leaves the sheet graded (not approved)', async () => {
    const store = TestBed.inject(ReviewQueueStore);
    await store.load();
    const [handwriting, b2, c8] = store.items();

    await store.approveAiMark(b2);
    let saved = repo.sheets.get(SAMPLE_MATHS_SCHEME.id)!.get('job-x-1')!;
    expect(saved.questions.find((q) => q.questionId === 'B2')).toMatchObject({ teacherVerified: true, awarded: 1 });
    expect(saved.questions.find((q) => q.questionId === 'B2')!.teacherOverride).toBeUndefined();
    expect(saved.status).toBe('needs_review');

    await store.setMark(c8, 3);
    saved = repo.sheets.get(SAMPLE_MATHS_SCHEME.id)!.get('job-x-1')!;
    expect(saved.questions.find((q) => q.questionId === 'C8')).toMatchObject({ teacherOverride: 3, teacherVerified: true });
    expect(saved.totalAwarded).toBe(1 + 1 + 3);

    await store.approveHandwriting(handwriting);
    saved = repo.sheets.get(SAMPLE_MATHS_SCHEME.id)!.get('job-x-1')!;
    expect(saved).toMatchObject({ ocrVerified: true, needsReview: false, status: 'graded' });
    expect(store.items()).toHaveLength(0);
    expect(repo.statusHistory.get('job-x-1')!.at(-1)).toBe('graded');
  });

  it('shows a card per item with the page image, and removes a card once approved', async () => {
    URL.createObjectURL ??= () => 'blob:test';
    const fixture = TestBed.createComponent(AnswerReviewGateComponent);
    const store = TestBed.inject(ReviewQueueStore);
    await vi.waitFor(() => expect(store.items()).toHaveLength(3));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('article')).toHaveLength(3);
    expect(el.textContent).toContain('3 items need your check');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelector('img[alt*="B·Q2 boxed"]')?.getAttribute('src')).toBe('blob:page-2');
    });
    expect(el.textContent).toContain('Gemini could not locate this answer');

    const approve = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Approve AI mark (1/2)'))!;
    approve.click();
    await vi.waitFor(() => expect(store.items()).toHaveLength(2));
    fixture.detectChanges();
    expect(el.querySelectorAll('article')).toHaveLength(2);
  });
});
