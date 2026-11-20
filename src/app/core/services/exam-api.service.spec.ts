import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ICreateCompleteExamRequest } from '../../shared/models/exam-creation.model';
import { ExamApiError, ExamApiService } from './exam-api.service';

const payload = { examParams: { title: 'T' }, questions: [] } as unknown as ICreateCompleteExamRequest;
const url = `${environment.examApi.baseUrl}/api/exams/create-complete`;

describe('ExamApiService', () => {
  let service: ExamApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ExamApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the payload with the guide headers and decorates the response with the student link', async () => {
    const pending = service.createCompleteExam(payload, 'req-1');
    const req = http.expectOne(url);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(payload);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${environment.examApi.demoToken}`);
    expect(req.request.headers.get('X-Request-ID')).toBe('req-1');
    expect(req.request.headers.get('X-Tenant-ID')).toBe(environment.examApi.tenantId);
    req.flush({ success: true, examId: 'exam_1', totalQuestions: 3, totalMarks: 12, status: 'draft', createdAt: 'now' }, { status: 201, statusText: 'Created' });
    const res = await pending;
    expect(res.studentUrl).toBe(`${window.location.origin}/student/exams/exam_1`);
    expect(res.status).toBe('draft');
  });

  it('surfaces the server validation message and code', async () => {
    const pending = service.createCompleteExam(payload, 'r');
    http.expectOne(url).flush({ error: 'VALIDATION_FAILED', message: 'Question #2 validation failed', details: [{ field: 'q', issue: 'x' }] }, { status: 400, statusText: 'Bad Request' });
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExamApiError);
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED', status: 400, message: 'Question #2 validation failed' });
  });

  it('says plainly when the endpoint is not deployed or the server is unreachable', async () => {
    const p404 = service.createCompleteExam(payload, 'r');
    http.expectOne(url).flush('<html>Not Found</html>', { status: 404, statusText: 'Not Found' });
    expect(((await p404.catch((e: unknown) => e)) as Error).message).toContain('not deployed yet');

    const p403 = service.createCompleteExam(payload, 'r');
    http.expectOne(url).flush('<html>Forbidden</html>', { status: 403, statusText: 'Forbidden' });
    expect(((await p403.catch((e: unknown) => e)) as Error).message).toContain('not publicly invokable');

    const p0 = service.createCompleteExam(payload, 'r');
    http.expectOne(url).error(new ProgressEvent('error'), { status: 0 });
    expect(((await p0.catch((e: unknown) => e)) as Error).message).toContain('Could not reach the exam server');
  });
});
