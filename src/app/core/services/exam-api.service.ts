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
 * Client for the single-payload exam creation endpoint.
 * Contract: docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md (§2 endpoint and headers, §3 payload, §4 responses).
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
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.demoToken}`,
      'X-Request-ID': requestId,
      'X-Tenant-ID': this.config.tenantId,
    });
    try {
      const raw = await firstValueFrom(
        this.http.post<ICreateCompleteExamRawResponse>(`${this.config.baseUrl}/api/exams/create-complete`, payload, { headers }),
      );
      return {
        ...raw,
        status: raw.status === 'upcoming' ? 'upcoming' : 'draft',
        studentUrl: `${window.location.origin}/student/exams/${raw.examId}`,
      };
    } catch (err) {
      throw toExamApiError(err);
    }
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
    const hint = err.status === 404 ? ' The create-complete endpoint is not deployed yet.' : '';
    return new ExamApiError(`HTTP ${err.status}: ${err.statusText || 'Server error'}.${hint}`, `HTTP_${err.status}`, err.status);
  }
  return new ExamApiError(err instanceof Error ? err.message : String(err), 'UNKNOWN', 0);
}
