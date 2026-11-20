import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ExamApiService } from '../../core/services/exam-api.service';
import { IStudioExamDetail } from '../../shared/models/exam-read.model';
import { ExamStudioComponent } from './exam-studio.component';

const detail: IStudioExamDetail = {
  exam: {
    id: 'exam_1', title: 'NEET Electrostatics', subject: 'Physics', status: 'draft', batchId: 'batch-lakshya-2026', classLevel: 'Class 12',
    examPattern: 'NEET', totalQuestions: 1, totalMarks: 4, duration: 45, defaultMarks: 4, defaultNegativeMarks: 1, date: '2026-11-22',
    startTime: '10:00', endTime: '10:45', createdAt: '2026-11-21',
  },
  questions: [
    { id: 'q1', type: 'MCQ', marks: 4, negativeMarks: 1, topic: 'E', subtopic: 'Gauss', difficulty: 'medium', text: 'Flux $\\Phi$?', options: [{ id: 'opt1', text: 'a' }, { id: 'opt2', text: '$q/\\varepsilon_0$' }], correctOptionId: 'opt2', explanation: 'Because' },
  ],
};

const settle = async (fixture: { whenStable: () => Promise<unknown> }) => {
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
};

describe('ExamStudioComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'exam-studio/:examId', children: [] }]),
        { provide: ExamApiService, useValue: { listExams: async () => [detail.exam], getExam: async () => detail } },
      ],
    });
  });

  it('shows no sign-in, and renders the exam from the route with KaTeX and the marked correct option', async () => {
    const fixture = TestBed.createComponent(ExamStudioComponent);
    fixture.componentRef.setInput('examId', 'exam_1');
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Sign in');
    expect(el.querySelector('#exam-title')?.textContent).toContain('NEET Electrostatics');
    expect(el.querySelectorAll('.katex').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Correct');
    expect(el.textContent).toContain('Solution');
    expect(el.textContent).toContain('+4 / −1');
  });

  it('opens the newest exam when the URL has no id', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ExamStudioComponent);
    await settle(fixture);
    expect(navigate).toHaveBeenCalledWith(['/exam-studio', 'exam_1'], { replaceUrl: true });
  });

  it('shows a full-width empty state with a Voice Copilot call to action when there are no exams', async () => {
    TestBed.overrideProvider(ExamApiService, { useValue: { listExams: async () => [], getExam: async () => detail } });
    const fixture = TestBed.createComponent(ExamStudioComponent);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#empty-heading')?.textContent).toContain('No exams yet');
    expect(el.querySelector('a[href="/voice-copilot"]')?.textContent).toContain('Create an exam with Voice Copilot');
    expect(el.querySelector('nav[aria-labelledby="exams-heading"]')).toBeNull();
  });

  it('shows a retryable error when the list cannot load', async () => {
    let calls = 0;
    TestBed.overrideProvider(ExamApiService, {
      useValue: { listExams: async () => (++calls === 1 ? Promise.reject(new Error('Could not reach the exam server')) : [detail.exam]), getExam: async () => detail },
    });
    const fixture = TestBed.createComponent(ExamStudioComponent);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Could not reach the exam server');
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Try again')) as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.textContent).toContain('Your exams (1)');
  });

  it('fetches the exam list again on every visit', async () => {
    const listExams = vi.fn(async () => [detail.exam]);
    TestBed.overrideProvider(ExamApiService, { useValue: { listExams, getExam: async () => detail } });
    const first = TestBed.createComponent(ExamStudioComponent);
    await settle(first);
    first.destroy();
    const second = TestBed.createComponent(ExamStudioComponent);
    await settle(second);
    expect(listExams).toHaveBeenCalledTimes(2);
  });
});
