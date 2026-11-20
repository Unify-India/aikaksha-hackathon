import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { LIVE_DETAIL_RESPONSE, LIVE_LIST_RESPONSE } from './data/live-api.fixture.testing';
import { ExamStudioComponent } from './exam-studio.component';

/** Exam Studio end to end through the real ExamApiService, fed the server's real responses. */
describe('Exam Studio contract with the live api function', () => {
  it('renders the exam exactly as the server returns it', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const id = LIVE_DETAIL_RESPONSE.exam.id;

    const fixture = TestBed.createComponent(ExamStudioComponent);
    fixture.componentRef.setInput('examId', id);
    await fixture.whenStable();

    http.expectOne(`${environment.examApi.baseUrl}/api/exams`).flush(LIVE_LIST_RESPONSE);
    http.expectOne(`${environment.examApi.baseUrl}/api/exams/${id}`).flush(LIVE_DETAIL_RESPONSE);
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#exam-title')?.textContent).toContain(LIVE_DETAIL_RESPONSE.exam.title);
    expect(el.textContent).toContain(`Your exams (${LIVE_LIST_RESPONSE.exams.length})`);
    expect(el.textContent).toContain('+4 / −1');
    expect(el.textContent).toContain('10:00 – 10:45');
    const cards = el.querySelectorAll('app-question-card');
    expect(cards.length).toBe(LIVE_DETAIL_RESPONSE.questions.length);
    // Every question renders its maths with KaTeX (no raw $ left) and shows the server's answer: marked option (MCQ) or value (Numeric).
    cards.forEach((card, i) => {
      expect(card.querySelector('.katex')).not.toBeNull();
      expect(card.textContent).not.toMatch(/\$[^$]+\$/);
      const q = LIVE_DETAIL_RESPONSE.questions[i];
      if (q.options.length) {
        const optionIndex = q.options.findIndex((o) => o.id === q.correctOptionId);
        expect(card.querySelectorAll('li')[optionIndex].textContent).toContain('Correct');
      } else {
        expect(card.textContent?.replace(/\u00a0/g, ' ')).toContain(`Answer: ${q.answer}`);
      }
      expect(card.textContent).toContain('Solution');
    });
    http.verify();
  });
});
