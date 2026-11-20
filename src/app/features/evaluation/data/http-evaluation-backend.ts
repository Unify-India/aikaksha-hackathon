import { Service } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  EvaluationRunEvent,
  IGradingJob,
  IMarkingScheme,
  ISheetEvaluation,
} from '../models/evaluation.models';
import { sha256Hex } from './checksum';
import type {
  EvaluationBackend,
  IStartedJob,
  IUploadSheet,
  RunEventHandler,
} from './evaluation-backend';
import { pagesSummary } from './pages-summary';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Talks to the real grading server (server/src/evaluation).
 *
 * TODO(Paritosh): add `mcp.demoToken` to the environments and point `mcp.serverUrl` at `/api`.
 * Until then the origin of `mcp.serverUrl` is used and the token falls back to ''.
 */
@Service()
export class HttpEvaluationBackend implements EvaluationBackend {
  private readonly base = `${new URL(environment.mcp.serverUrl).origin}/api/evaluation`;
  private readonly token = (environment.mcp as { demoToken?: string }).demoToken ?? '';

  listSchemes(): Promise<IMarkingScheme[]> {
    return this.request<IMarkingScheme[]>('GET', '/schemes');
  }

  async draftScheme(questionPaper: File, onEvent: RunEventHandler): Promise<IMarkingScheme> {
    const body = new FormData();
    body.append('questionPaper', questionPaper);
    const { runId } = await this.request<{ runId: string }>('POST', '/schemes/draft', body);

    let drafted: IMarkingScheme | undefined;
    await this.followRun(runId, (event) => {
      if (event.type === 'scheme_drafted') drafted = event.scheme;
      onEvent(event);
    });
    if (!drafted) throw new Error('The server finished without returning a marking scheme.');
    return drafted;
  }

  approveScheme(scheme: IMarkingScheme): Promise<IMarkingScheme> {
    return this.request<IMarkingScheme>('PUT', `/schemes/${encodeURIComponent(scheme.id)}/approve`, scheme);
  }

  /**
   * Client-side queue: one paper at a time. Each paper is converted to JPEG pages in the browser and
   * sent as ONE request (`POST /sheets/grade`), which returns that paper's graded result.
   * One small request per paper keeps us under Firebase HTTP function limits (~10 MB, 300 s).
   */
  async startGrading(
    schemeId: string,
    uploads: IUploadSheet[],
    onEvent: RunEventHandler,
  ): Promise<IStartedJob> {
    const jobId = `job-${Date.now()}`;
    const sheets: ISheetEvaluation[] = uploads.map((u, i) => ({
      submissionId: `${jobId}-${i + 1}`,
      jobId,
      schemeId,
      studentLabel: u.studentLabel,
      fileName: u.file.name,
      mimeType: u.file.type,
      pageCount: u.pageCount,
      checksum: '',
      status: 'queued',
      questions: [],
      totalAwarded: 0,
      totalMax: 0,
      ocrConfidence: 0,
      needsReview: false,
    }));
    const job: IGradingJob = { id: jobId, schemeId, createdAt: new Date().toISOString(), sheets };

    const done = (async () => {
      await new Promise((r) => setTimeout(r, 50)); // let the caller store the job first
      for (const [i, sheet] of sheets.entries()) {
        await this.gradeOne(sheet, uploads[i], onEvent);
      }
      onEvent({ type: 'run_completed', jobId });
    })();
    return { job, done };
  }

  private async gradeOne(sheet: ISheetEvaluation, upload: IUploadSheet, onEvent: RunEventHandler): Promise<void> {
    const { submissionId } = sheet;
    onEvent({ type: 'sheet_updated', sheet: { ...sheet, status: 'grading' } });

    let pages: Blob[];
    let checksum: string;
    const prepStarted = Date.now();
    onEvent({ type: 'tool_started', tool: 'prepare_pages', submissionId, at: prepStarted });
    try {
      [pages, checksum] = await Promise.all([upload.loadPages(), sha256Hex(upload.file)]);
      onEvent({ type: 'tool_finished', tool: 'prepare_pages', submissionId, durationMs: Date.now() - prepStarted, summary: pagesSummary(pages) });
    } catch (e) {
      const error = `Could not read this PDF: ${errorText(e)}`;
      onEvent({ type: 'tool_failed', tool: 'prepare_pages', submissionId, error });
      onEvent({ type: 'sheet_updated', sheet: { ...sheet, status: 'failed', error } });
      return;
    }

    const started = Date.now();
    onEvent({ type: 'tool_started', tool: 'grade_answer_sheet', submissionId, at: started });
    try {
      const body = new FormData();
      body.append('schemeId', sheet.schemeId);
      body.append('jobId', sheet.jobId);
      body.append('submissionId', submissionId);
      body.append('studentLabel', sheet.studentLabel);
      body.append('checksum', checksum);
      body.append('pageCount', String(pages.length));
      pages.forEach((page, i) => body.append('pages', page, `page-${String(i + 1).padStart(2, '0')}.jpg`));
      const graded = await this.request<ISheetEvaluation>('POST', '/sheets/grade', body);
      onEvent({
        type: 'tool_finished',
        tool: 'grade_answer_sheet',
        submissionId,
        durationMs: Date.now() - started,
        summary: `${graded.studentLabel}: ${graded.totalAwarded} / ${graded.totalMax}${graded.needsReview ? ' · needs review' : ''}`,
      });
      onEvent({ type: 'sheet_updated', sheet: { ...graded, fileName: sheet.fileName, pageCount: pages.length } });
    } catch (e) {
      onEvent({ type: 'tool_failed', tool: 'grade_answer_sheet', submissionId, error: errorText(e) });
      onEvent({ type: 'sheet_updated', sheet: { ...sheet, status: 'failed', error: errorText(e) } });
    }
  }

  saveReview(
    submissionId: string,
    overrides: Record<string, number>,
    approve: boolean,
  ): Promise<ISheetEvaluation> {
    return this.request<ISheetEvaluation>('PATCH', `/sheets/${encodeURIComponent(submissionId)}`, {
      overrides,
      approve,
    });
  }

  /** Streams Server-Sent Events for a run until `run_completed` (or a connection error). */
  private followRun(runId: string, onEvent: RunEventHandler): Promise<void> {
    const url = `${this.base}/runs/${encodeURIComponent(runId)}/events?token=${encodeURIComponent(this.token)}`;
    return new Promise((resolve, reject) => {
      const source = new EventSource(url);
      source.onmessage = (message: MessageEvent<string>) => {
        const event = JSON.parse(message.data) as EvaluationRunEvent;
        onEvent(event);
        if (event.type === 'run_completed') {
          source.close();
          resolve();
        }
      };
      source.onerror = () => {
        source.close();
        reject(new Error('Lost connection to the grading server.'));
      };
    });
  }

  private async request<T>(method: string, path: string, body?: FormData | object): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}` };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${this.base}${path}`, { method, headers, body: payload });
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(error?.error?.message ?? `Server error ${response.status}`);
    }
    return (await response.json()) as T;
  }
}
