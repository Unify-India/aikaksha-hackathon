import { TestBed } from '@angular/core/testing';
import { ExamParamsCardComponent } from './exam-params-card.component';
import { evaluateDraft } from '../data/exam-params.rules';
import { TEACHER_BATCHES } from '../data/teacher-context';

describe('ExamParamsCardComponent', () => {
  it('renders the read-back with a spoken date and default tags (no locale data needed)', async () => {
    const ev = evaluateDraft(
      { subject: 'Physics', topic: 'Electrostatics', batchId: 'batch-lakshya-2026', targetQuestions: 15, date: '2026-11-22', startTime: '10:00' },
      { today: '2026-11-21', batches: TEACHER_BATCHES },
    );
    const fixture = TestBed.createComponent(ExamParamsCardComponent);
    fixture.componentRef.setInput('evaluation', ev);
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Sunday, 22 November 2026');
    expect(text).toContain('Lakshya 2026 (Class 12)');
    expect(text).toContain('10:00 – 10:45');
    expect(text).toContain('default');
    expect(text).toContain('Looks good, confirm');

    const el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('result', ev.result);
    fixture.componentRef.setInput('creation', { phase: 'generating', progress: { done: 5, total: 15 } });
    await fixture.whenStable();
    expect(el.textContent).toContain('Generating questions… 5 of 15');
    expect(el.textContent).not.toContain('Looks good, confirm');
    expect(el.textContent).toContain('Sunday, 22 November 2026'); // the summary stays

    fixture.componentRef.setInput('creation', { phase: 'failed', error: 'HTTP 404' });
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('HTTP 404');
    expect(el.textContent).toContain('Retry');

    fixture.componentRef.setInput('creation', {
      phase: 'created',
      exam: { success: true, examId: 'exam_9', totalQuestions: 15, totalMarks: 60, status: 'draft', createdAt: '', studentUrl: 'http://x/student/exams/exam_9' },
    });
    await fixture.whenStable();
    expect(el.textContent).toContain('Exam created as draft');
    expect(el.textContent).toContain('exam_9');
  });
});
