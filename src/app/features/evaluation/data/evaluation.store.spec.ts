import { TestBed } from '@angular/core/testing';
import { EVALUATION_BACKEND, EVALUATION_ENGINE } from './evaluation-backend';
import { EVALUATION_REPOSITORY } from './evaluation-repository';
import { InMemoryEvaluationRepository } from './in-memory-evaluation-repository.testing';
import { SAMPLE_MATHS_SCHEME } from './evaluation-fixtures.testing';
import { FakeEvaluationBackend } from './fake-evaluation-backend.testing';
import { PdfDocumentService } from './pdf-document.service';
import { fakePdfService } from './fake-pdf.testing';
import {
  EvaluationStore,
  MAX_SHEET_BYTES,
  anonymisedFile,
  studentLabel,
  validateSheetFile,
} from './evaluation.store';

const pdf = (name: string) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3])], name, { type: 'application/pdf' });



describe('evaluation privacy and validation helpers', () => {
  it('labels students A–Z, then by number', () => {
    expect(studentLabel(0)).toBe('Student A');
    expect(studentLabel(25)).toBe('Student Z');
    expect(studentLabel(26)).toBe('Student 27');
  });

  it('renames files so real names never leave the browser', () => {
    const renamed = anonymisedFile(new File(['x'], 'Neha Kumari 12.PDF', { type: 'application/pdf' }), 2);
    expect(renamed.name).toBe('sheet-03.pdf');
    expect(renamed.type).toBe('application/pdf');
  });

  it('accepts PDFs and photos, rejects other types and huge files', () => {
    expect(validateSheetFile(pdf('a.pdf'))).toBeNull();
    expect(validateSheetFile(new File(['x'], 'a.png', { type: 'image/png' }))).toContain('only PDF');
    const huge = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: MAX_SHEET_BYTES + 1 });
    expect(validateSheetFile(huge)).toContain('30 MB');
  });
});

describe('EvaluationStore (fake backend + in-memory Firebase)', () => {
  let store: EvaluationStore;
  let repo: InMemoryEvaluationRepository;

  beforeEach(() => {
    // Never call real Gemini or a server from tests: use the test-only fake backend.
    repo = new InMemoryEvaluationRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: EVALUATION_ENGINE, useValue: 'gemini' },
        { provide: EVALUATION_REPOSITORY, useValue: repo },
        { provide: EVALUATION_BACKEND, useClass: FakeEvaluationBackend },
        { provide: PdfDocumentService, useValue: fakePdfService },
      ],
    });
    store = TestBed.inject(EvaluationStore);
  });

  it('grades a class, applies an override, and approves sheet by sheet', async () => {
    await store.loadSchemes();
    expect(store.selectedScheme()?.status).toBe('approved');

    await store.startGrading([pdf('Aryan Vats 12.pdf'), pdf('Md Sadab 12.pdf')]);
    expect(store.error()).toBeNull();
    expect(store.phase()).toBe('grading');
    expect(store.sheets().map((s) => s.studentLabel)).toEqual(['Student A', 'Student B']);
    expect(store.sheets().some((s) => /Aryan|Sadab/.test(s.fileName))).toBe(false);

    await vi.waitFor(() => expect(store.phase()).toBe('review'), { timeout: 12_000, interval: 100 });
    expect(store.finishedCount()).toBe(2);
    expect(store.activity().filter((a) => a.tool === 'grade_answer_sheet' && a.status === 'done')).toHaveLength(2);
    expect(store.activity()[0]).toMatchObject({ tool: 'prepare_pages', label: 'Preparing page images for Student A', status: 'done' });
    expect(store.activity()[0].detail).toContain('3 pages');
    expect(store.activity().find((a) => a.tool === 'grade_answer_sheet')!.label).toBe('Grading Student A');

    const sheet = store.activeSheet()!;
    expect(sheet.checksum).toMatch(/^[0-9a-f]{64}$/);
    const question = sheet.questions.find((q) => q.max >= 2)!;
    const others = sheet.totalAwarded - (question.teacherOverride ?? question.awarded);
    const newMarks = question.awarded === 0 ? 1 : 0;

    store.setOverride(question.questionId, newMarks);
    expect(store.activeSheet()!.totalAwarded).toBe(others + newMarks);
    expect(store.activeSheet()!.questions.find((q) => q.questionId === question.questionId)!.teacherOverride).toBe(newMarks);

    store.setOverride(question.questionId, null);
    expect(store.activeSheet()!.totalAwarded).toBe(sheet.totalAwarded);

    store.setOverride(question.questionId, newMarks);
    await store.approveActiveAndNext();
    expect(store.sheets()[0].status).toBe('approved');
    expect(store.sheets()[0].totalAwarded).toBe(others + newMarks);
    expect(store.activeSheet()!.studentLabel).toBe('Student B');

    // Saved under the question paper, with the status trail draft → in_progress → graded → approved.
    const saved = repo.sheets.get(SAMPLE_MATHS_SCHEME.id)!;
    expect(saved.size).toBe(2);
    expect(repo.statusHistory.get(sheet.submissionId)).toEqual(['draft', 'in_progress', 'graded', 'approved']);
    expect(saved.get(sheet.submissionId)!.questions.find((q) => q.questionId === question.questionId)!.teacherOverride).toBe(newMarks);
    expect(saved.get(sheet.submissionId)!.filePath).toContain(`question_papers/${SAMPLE_MATHS_SCHEME.id}/answer_sheets/`);
    expect([...saved.values()].some((s) => /Aryan|Sadab/.test(JSON.stringify(s)))).toBe(false);

    // A later batch is listed under the same paper and continues the numbering.
    store.startOver();
    await vi.waitFor(() => expect(store.savedSheets()).toHaveLength(2));
    expect(store.learning().corrections).toBe(1);
    await store.startGrading([pdf('Neha Kumari 12.pdf')]);
    expect(store.sheets().map((s) => s.studentLabel)).toEqual(['Student A', 'Student B', 'Student C']);
    // The teacher's earlier correction is passed to the grader as a marking example, and logged.
    const backend = TestBed.inject(EVALUATION_BACKEND) as FakeEvaluationBackend;
    expect(backend.lastOptions?.teacherExamples?.some((e) => e.kind === 'corrected' && e.questionId === question.questionId)).toBe(true);
    expect(store.activity()[0]).toMatchObject({ tool: 'apply_teacher_feedback', status: 'done' });
    await vi.waitFor(() => expect(store.phase()).toBe('review'), { timeout: 12_000, interval: 100 });
    expect(repo.sheets.get(SAMPLE_MATHS_SCHEME.id)!.size).toBe(3);
  }, 30_000);

  it('drafts a scheme from a question paper and approves it', async () => {
    await store.loadSchemes();
    await store.draftFromQuestionPaper(new File(['%PDF-1.3'], 'class 12 test question.pdf', { type: 'application/pdf' }));
    const draft = store.pendingDraft();
    expect(draft?.status).toBe('pending');
    expect(repo.papers.get(draft!.id)).toMatchObject({ status: 'pending', filePath: expect.stringContaining('question-paper.pdf') });
    expect(store.pendingSchemes().map((s) => s.id)).toContain(draft!.id);
    expect(store.activity().at(-1)).toMatchObject({ tool: 'draft_marking_scheme', status: 'done' });

    await store.approveDraft(draft!);
    expect(store.pendingDraft()).toBeNull();
    expect(store.selectedScheme()?.id).toBe(draft!.id);
    expect(store.selectedScheme()?.status).toBe('approved');
    expect(repo.papers.get(draft!.id)!.status).toBe('approved');
  }, 10_000);
  it('cancels drafting a scheme without showing an error', async () => {
    await store.loadSchemes();
    const drafting = store.draftFromQuestionPaper(new File(['%PDF-1.3'], 'question paper.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() =>
      expect(store.activity().some((a) => a.tool === 'draft_marking_scheme' && a.status === 'running')).toBe(true),
    );
    expect(store.busy()).toBe('drafting');

    store.cancelDrafting();
    await drafting;

    expect(store.busy()).toBe('idle');
    expect(store.error()).toBeNull();
    expect(store.pendingDraft()).toBeNull();
    expect(store.activity().at(-1)).toMatchObject({
      tool: 'draft_marking_scheme',
      status: 'failed',
      detail: 'Cancelled by the teacher',
    });
    // The question paper stays saved as a hidden 'draft'; nothing is waiting for approval.
    expect([...repo.papers.values()].filter((p) => p.status === 'draft')).toHaveLength(1);
    expect(store.pendingSchemes()).toHaveLength(0);
  }, 10_000);
});
