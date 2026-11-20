import { TestBed } from '@angular/core/testing';
import { ExamApiError, ExamApiService } from '../../../core/services/exam-api.service';
import { IStudioExam, IStudioExamDetail } from '../../../shared/models/exam-read.model';
import { ExamStudioStore } from './exam-studio.store';

const exam = (id: string): IStudioExam => ({
  id, title: id, subject: '', status: 'draft', batchId: '', classLevel: '', examPattern: '', totalQuestions: 0, totalMarks: 0,
  duration: 0, defaultMarks: 0, defaultNegativeMarks: 0, date: '', startTime: '', endTime: '', createdAt: '',
});
const detail = (id: string): IStudioExamDetail => ({ exam: exam(id), questions: [] });

describe('ExamStudioStore', () => {
  let pending: Record<string, { resolve: (d: IStudioExamDetail) => void; reject: (e: unknown) => void }>;
  let api: { listExams: () => Promise<IStudioExam[]>; getExam: (id: string) => Promise<IStudioExamDetail> };
  let store: ExamStudioStore;

  beforeEach(() => {
    pending = {};
    api = {
      listExams: async () => [exam('a'), exam('b')],
      getExam: (id) => new Promise((resolve, reject) => (pending[id] = { resolve, reject })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ExamApiService, useValue: api }] });
    store = TestBed.inject(ExamStudioStore);
  });

  it('loads the list', async () => {
    await store.loadExams();
    expect(store.listState()).toBe('ready');
    expect(store.exams().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('keeps the newest selection when an older request finishes later', async () => {
    const first = store.select('a');
    const second = store.select('b');
    pending['b'].resolve(detail('b'));
    await second;
    pending['a'].resolve(detail('a'));
    await first;
    expect(store.detail()?.exam.id).toBe('b');
    expect(store.detailState()).toBe('ready');
  });

  it('shows the server message for a missing exam, and allows retrying after an error', async () => {
    const p = store.select('gone');
    pending['gone'].reject(new ExamApiError('Exam gone not found', 'EXAM_NOT_FOUND', 404));
    await p;
    expect(store.detailError()).toContain('Exam gone not found');

    const retry = store.select('gone');
    expect(store.detailState()).toBe('loading');
    pending['gone'].resolve(detail('gone'));
    await retry;
    expect(store.detailState()).toBe('ready');
  });

  it('reports list failures', async () => {
    api.listExams = async () => Promise.reject(new ExamApiError('Could not reach the exam server', 'NETWORK', 0));
    await store.loadExams();
    expect(store.listState()).toBe('error');
    expect(store.listError()).toContain('Could not reach the exam server');
  });
});
