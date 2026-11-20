import { TestBed } from '@angular/core/testing';
import { EVALUATION_BACKEND } from './data/evaluation-backend';
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
});
