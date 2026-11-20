import { TestBed } from '@angular/core/testing';
import { EVALUATION_BACKEND, EVALUATION_ENGINE } from './data/evaluation-backend';
import { EVALUATION_REPOSITORY } from './data/evaluation-repository';
import { InMemoryEvaluationRepository } from './data/in-memory-evaluation-repository.testing';
import { FakeEvaluationBackend } from './data/fake-evaluation-backend.testing';
import { EvaluationStore } from './data/evaluation.store';
import { PdfDocumentService } from './data/pdf-document.service';
import { fakePdfService } from './data/fake-pdf.testing';
import { EvaluationCockpitComponent } from './evaluation-cockpit.component';

const pdf = (name: string) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 9])], name, { type: 'application/pdf' });

describe('EvaluationCockpitComponent', () => {
  beforeEach(() => {
    // Never call real Gemini or a server from tests: use the test-only fake backend.
    TestBed.configureTestingModule({
      providers: [
        { provide: EVALUATION_ENGINE, useValue: 'gemini' },
        { provide: EVALUATION_REPOSITORY, useValue: new InMemoryEvaluationRepository() },
        { provide: EVALUATION_BACKEND, useClass: FakeEvaluationBackend },
        { provide: PdfDocumentService, useValue: fakePdfService },
      ],
    });
    // jsdom has no object URLs; the viewer only needs a string.
    URL.createObjectURL ??= () => 'blob:test';
    URL.revokeObjectURL ??= () => undefined;
  });

  it('shows the setup step with approved schemes', async () => {
    const fixture = TestBed.createComponent(EvaluationCockpitComponent);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('input[type="radio"]').length).toBe(2);
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('From question paper');
    expect(text).toContain('From Voice Copilot exam');
    // Real file inputs exist (keyboard / screen-reader accessible upload).
    expect(fixture.nativeElement.querySelectorAll('input[type="file"]').length).toBe(2);
  });

  it('lets the teacher override a mark and updates the total', async () => {
    const fixture = TestBed.createComponent(EvaluationCockpitComponent);
    const store = TestBed.inject(EvaluationStore);
    await vi.waitFor(() => expect(store.selectedScheme()).not.toBeNull());

    await store.startGrading([pdf('Toorna Prakash 12.pdf')]);
    await vi.waitFor(() => expect(store.phase()).toBe('review'), { timeout: 8_000, interval: 100 });
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Toorna');

    // Results land in the class table first; open the student to review.
    expect(el.querySelector('table caption')?.textContent).toContain('Marks per student');
    el.querySelector<HTMLButtonElement>('button[aria-label="Review Student A"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const inputs = el.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(inputs.length).toBe(store.activeSheet()!.questions.length);

    const first = store.activeSheet()!.questions[0];
    const target = first.awarded === 0 ? first.max : 0;
    const before = store.activeSheet()!.totalAwarded;

    inputs[0].value = String(target);
    inputs[0].dispatchEvent(new Event('input'));
    inputs[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(store.activeSheet()!.questions[0].teacherOverride).toBe(target);
    expect(store.activeSheet()!.totalAwarded).toBe(before - first.awarded + target);
    expect(el.textContent).toContain('Teacher override');

    // Out-of-range marks are rejected and explained, not saved.
    inputs[0].value = String(first.max + 5);
    inputs[0].dispatchEvent(new Event('input'));
    inputs[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(store.activeSheet()!.questions[0].teacherOverride).toBe(target);
    expect(el.textContent).toContain(`Enter a mark between 0 and ${first.max}`);
  }, 15_000);
  it('shows a Cancel drafting button while Gemini drafts, and cancels', async () => {
    const fixture = TestBed.createComponent(EvaluationCockpitComponent);
    const store = TestBed.inject(EvaluationStore);
    await vi.waitFor(() => expect(store.busy()).toBe('idle'));

    const drafting = store.draftFromQuestionPaper(new File(['%PDF-1.3'], 'paper.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(store.busy()).toBe('drafting'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cancel = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Cancel drafting'));
    expect(cancel).toBeTruthy();

    cancel!.click();
    await drafting;
    fixture.detectChanges();
    expect(store.busy()).toBe('idle');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Cancel drafting'))).toBe(false);
    expect(el.querySelector('[role="alert"]')).toBeNull();
  }, 10_000);
  it('links to the saved question paper PDF (opens in a new tab), and hides the link when no PDF is saved', async () => {
    const fixture = TestBed.createComponent(EvaluationCockpitComponent);
    const store = TestBed.inject(EvaluationStore);
    await vi.waitFor(() => expect(store.busy()).toBe('idle'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // The sample papers have no saved PDF → no link.
    expect(el.querySelectorAll('a[aria-label^="View question paper"]')).toHaveLength(0);

    await store.draftFromQuestionPaper(new File(['%PDF-1.3'], 'maths paper.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => {
      fixture.detectChanges();
      const link = el.querySelector<HTMLAnchorElement>('a[aria-label^="View question paper"]');
      expect(link?.getAttribute('href')).toMatch(/^https:\/\/storage\.test\/question_papers\/.+\/question-paper\.pdf$/);
      expect(link?.target).toBe('_blank');
      expect(link?.rel).toContain('noopener');
    });
  }, 10_000);
  it('shows an approved scheme read-only with "View answers", and goes back', async () => {
    const fixture = TestBed.createComponent(EvaluationCockpitComponent);
    const store = TestBed.inject(EvaluationStore);
    await vi.waitFor(() => expect(store.busy()).toBe('idle'));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = () => [...el.querySelectorAll('button')];

    buttons().find((b) => b.getAttribute('aria-label')?.startsWith('View answers'))!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Marking scheme (approved)');
    expect(el.textContent).toContain('Correct option:');
    expect(buttons().some((b) => b.textContent?.includes('Approve scheme'))).toBe(false);

    buttons().find((b) => b.textContent?.includes('Back to schemes'))!.click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Marking scheme (approved)');
    expect(el.textContent).toContain('1. Marking scheme');
  });
});
