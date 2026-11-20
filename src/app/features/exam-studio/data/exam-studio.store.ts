import { Service, inject, signal } from '@angular/core';
import { ExamApiService } from '../../../core/services/exam-api.service';
import { IStudioExam, IStudioExamDetail } from '../../../shared/models/exam-read.model';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

@Service()
export class ExamStudioStore {
  private readonly api = inject(ExamApiService);

  readonly exams = signal<IStudioExam[]>([]);
  readonly listState = signal<LoadState>('idle');
  readonly listError = signal<string | null>(null);

  readonly selectedId = signal<string | null>(null);
  readonly detail = signal<IStudioExamDetail | null>(null);
  readonly detailState = signal<LoadState>('idle');
  readonly detailError = signal<string | null>(null);

  private detailRequest = 0;

  async loadExams(): Promise<void> {
    this.listState.set('loading');
    this.listError.set(null);
    try {
      this.exams.set(await this.api.listExams());
      this.listState.set('ready');
    } catch (err) {
      this.listError.set(readError(err, 'Could not load exams'));
      this.listState.set('error');
    }
  }

  async select(examId: string): Promise<void> {
    if (this.selectedId() === examId && this.detailState() !== 'error') return;
    const request = ++this.detailRequest;
    this.selectedId.set(examId);
    this.detail.set(null);
    this.detailState.set('loading');
    this.detailError.set(null);
    try {
      const detail = await this.api.getExam(examId);
      if (request !== this.detailRequest) return; // a newer selection won
      this.detail.set(detail);
      this.detailState.set('ready');
    } catch (err) {
      if (request !== this.detailRequest) return;
      this.detailError.set(readError(err, 'Could not load this exam'));
      this.detailState.set('error');
    }
  }
}

function readError(err: unknown, prefix: string): string {
  return `${prefix}: ${err instanceof Error ? err.message : String(err)}`;
}
