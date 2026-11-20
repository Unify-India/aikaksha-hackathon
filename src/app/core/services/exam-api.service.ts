import { Service, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  IApiErrorResponse,
  ICreateCompleteExamRawResponse,
  ICreateCompleteExamRequest,
  ICreateCompleteExamResponse,
} from '../../shared/models/exam-creation.model';
import { IStudioExam, IStudioExamDetail } from '../../shared/models/exam-read.model';

/** Public student portal; student exam links always point here, whatever host the teacher app runs on. */
export const STUDENT_PORTAL_URL = 'https://aikaksha.co.in';

/** A failed create-complete call, with the server's machine-readable code when there is one. */
export class ExamApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details: IApiErrorResponse['details'] = [],
  ) {
    super(message);
    this.name = 'ExamApiError';
  }
}

/**
 * Client for the exam endpoints of the `api` Cloud Function.
 * - POST /api/exams/create-complete: docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md (§2 endpoint and headers, §3 payload, §4 responses)
 * - GET /api/exams, GET /api/exams/:examId: teacher read models (functions/src/modules/exams/examViews.ts)
 * The teacher is derived on the server from the bearer token; never sent in the body.
 */
@Service()
export class ExamApiService {
  private readonly http = inject(HttpClient);
  private readonly config = environment.examApi;

  /**
   * POST /api/exams/create-complete.
   * Pass the same `requestId` when retrying the same exam: the server uses X-Request-ID for
   * idempotency, so a retry after a dropped connection cannot create the exam twice.
   */
  async createCompleteExam(payload: ICreateCompleteExamRequest, requestId: string): Promise<ICreateCompleteExamResponse> {
    const headers = this.headers().set('Content-Type', 'application/json').set('X-Request-ID', requestId);
    try {
      const raw = await firstValueFrom(
        this.http.post<ICreateCompleteExamRawResponse>(`${this.config.baseUrl}/api/exams/create-complete`, payload, { headers }),
      );
      return {
        ...raw,
        status: raw.status === 'upcoming' ? 'upcoming' : 'draft',
        studentUrl: `${STUDENT_PORTAL_URL}/student/exams/${raw.examId}`,
      };
    } catch (err) {
      throw toExamApiError(err);
    }
  }

  /** The signed-in teacher's exams, newest first. */
  async listExams(): Promise<IStudioExam[]> {
    try {
      const res = await firstValueFrom(this.http.get<{ exams: IStudioExam[] }>(`${this.config.baseUrl}/api/exams`, { headers: this.headers() }));
      return res.exams ?? [];
    } catch (err) {
      throw toExamApiError(err);
    }
  }

  /** One exam with every question and its answer key (teacher only; 404 / 403 otherwise). */
  async getExam(examId: string): Promise<IStudioExamDetail> {
    try {
      return await firstValueFrom(
        this.http.get<IStudioExamDetail>(`${this.config.baseUrl}/api/exams/${encodeURIComponent(examId)}`, { headers: this.headers() }),
      );
    } catch (err) {
      throw toExamApiError(err);
    }
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.config.demoToken}`, 'X-Tenant-ID': this.config.tenantId });
  }
}

export function toExamApiError(err: unknown): ExamApiError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return new ExamApiError(`Could not reach the exam server (${environment.examApi.baseUrl}). Is the api function deployed?`, 'NETWORK', 0);
    }
    const body = err.error as Partial<IApiErrorResponse> | null;
    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return new ExamApiError(body.message, body.error ?? `HTTP_${err.status}`, err.status, body.details ?? []);
    }
    const hint =
      err.status === 404
        ? ' The create-complete endpoint is not deployed yet.'
        : err.status === 401 || err.status === 403
          ? ' The Cloud Function rejected the call before the app saw it: it is not publicly invokable (grant allUsers the Cloud Functions Invoker role) or the token is wrong.'
          : '';
    return new ExamApiError(`HTTP ${err.status}: ${err.statusText || 'Server error'}.${hint}`, `HTTP_${err.status}`, err.status);
  }
  return new ExamApiError(err instanceof Error ? err.message : String(err), 'UNKNOWN', 0);
}
