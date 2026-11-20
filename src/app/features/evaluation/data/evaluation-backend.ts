import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  EvaluationRunEvent,
  IGradingJob,
  IMarkingScheme,
  ISheetEvaluation,
} from '../models/evaluation.models';
import { GeminiService } from '../../../core/services/ai/gemini.service';
import { GeminiEvaluationBackend } from './gemini-evaluation-backend';
import { HttpEvaluationBackend } from './http-evaluation-backend';
import { MockEvaluationBackend } from './mock-evaluation-backend';

/**
 * One student's paper in the grading queue. The PDF is renamed (e.g. "sheet-01.pdf") so no student
 * name leaves the browser, and it is sent to the API as JPEG page images — never as the PDF itself.
 */
export interface IUploadSheet {
  /** The original (renamed) PDF — kept in the browser for display; never modified. */
  file: File;
  studentLabel: string;
  pageCount: number;
  /** Converts the PDF into JPEG pages on first call (cached), so conversion happens when the paper's turn comes. */
  loadPages: () => Promise<Blob[]>;
}

export type RunEventHandler = (event: EvaluationRunEvent) => void;

export interface IStartedJob {
  job: IGradingJob;
  /** Resolves when every sheet has finished grading (or failed). */
  done: Promise<void>;
}

/** What the evaluation screens need from a backend. Implemented by the mock and the live (HTTP) backend. */
export interface EvaluationBackend {
  listSchemes(): Promise<IMarkingScheme[]>;
  /** Gemini reads the question paper and drafts a step-wise marking scheme (status 'draft'). */
  draftScheme(questionPaper: File, onEvent: RunEventHandler): Promise<IMarkingScheme>;
  approveScheme(scheme: IMarkingScheme): Promise<IMarkingScheme>;
  startGrading(schemeId: string, sheets: IUploadSheet[], onEvent: RunEventHandler): Promise<IStartedJob>;
  /** Saves teacher overrides; when `approve` is true the sheet becomes 'approved'. */
  saveReview(
    submissionId: string,
    overrides: Record<string, number>,
    approve: boolean,
  ): Promise<ISheetEvaluation>;
}

/**
 * Which grading engine runs:
 * - 'server'  — `environment.mcp.mode === 'live'`: the grading server (key stays server-side).
 * - 'gemini'  — a Gemini key is set in environment.ts: Gemini called from the browser (LOCAL ONLY).
 * - 'mock'    — otherwise: fake but realistic grades, no network.
 */
export type EvaluationEngine = 'server' | 'gemini' | 'mock';

/**
 * Set to true to grade with Gemini straight from the browser when a key is configured.
 * Off for now: testing uses mock grades until the Google API key setup is sorted out.
 */
const USE_GEMINI_IN_BROWSER = false;

export const EVALUATION_ENGINE = new InjectionToken<EvaluationEngine>('EVALUATION_ENGINE', {
  providedIn: 'root',
  factory: () => {
    if (environment.mcp.mode === 'live') return 'server';
    return USE_GEMINI_IN_BROWSER && inject(GeminiService).isConfigured() ? 'gemini' : 'mock';
  },
});

export const EVALUATION_BACKEND = new InjectionToken<EvaluationBackend>('EVALUATION_BACKEND', {
  providedIn: 'root',
  factory: () => {
    switch (inject(EVALUATION_ENGINE)) {
      case 'server':
        return inject(HttpEvaluationBackend);
      case 'gemini':
        return inject(GeminiEvaluationBackend);
      default:
        return inject(MockEvaluationBackend);
    }
  },
});
