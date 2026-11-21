import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../../../environments/environment';
import {
  EvaluationRunEvent,
  IGradingJob,
  IMarkingScheme,
  ISheetEvaluation,
} from '../models/evaluation.models';
import { GeminiEvaluationBackend } from './gemini-evaluation-backend';
import { HttpEvaluationBackend } from './http-evaluation-backend';
import type { ITeacherDecision } from './teacher-feedback';

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
  /** Set when re-grading an existing sheet (Retry grading): keeps its id so the saved record is updated. */
  submissionId?: string;
}

export type RunEventHandler = (event: EvaluationRunEvent) => void;

export interface IGradingOptions {
  /** Past teacher decisions on this question paper, shown to Gemini as marking examples. */
  teacherExamples?: ITeacherDecision[];
}

export interface IStartedJob {
  job: IGradingJob;
  /** Resolves when every sheet has finished grading (or failed). */
  done: Promise<void>;
}

/** What the evaluation screens need from a backend. Implemented by the server (HTTP) and browser-Gemini backends. */
export interface EvaluationBackend {
  listSchemes(): Promise<IMarkingScheme[]>;
  /** Gemini reads the question paper and drafts a step-wise marking scheme (status 'draft'). */
  /** `signal` lets the teacher cancel drafting; the backend stops its Gemini/server calls when it fires. */
  draftScheme(questionPaper: File, onEvent: RunEventHandler, signal?: AbortSignal): Promise<IMarkingScheme>;
  approveScheme(scheme: IMarkingScheme): Promise<IMarkingScheme>;
  /** Grades papers one at a time against an approved scheme (question paper). */
  startGrading(
    scheme: IMarkingScheme,
    sheets: IUploadSheet[],
    onEvent: RunEventHandler,
    options?: IGradingOptions,
  ): Promise<IStartedJob>;
  /** Saves teacher overrides; when `approve` is true the sheet becomes 'approved'. */
  saveReview(
    submissionId: string,
    overrides: Record<string, number>,
    approve: boolean,
  ): Promise<ISheetEvaluation>;
}

/**
 * Which grading engine runs:
 * - 'server' — `environment.mcp.mode === 'live'`: the grading server (key stays server-side).
 * - 'gemini' — otherwise: Gemini called from this browser with the key in environment.ts (LOCAL ONLY).
 */
export type EvaluationEngine = 'server' | 'gemini';

export const EVALUATION_ENGINE = new InjectionToken<EvaluationEngine>('EVALUATION_ENGINE', {
  providedIn: 'root',
  factory: () => {
    // The grading-server route (HttpEvaluationBackend) does not exist yet, so mcp.mode no longer picks it.
    // Gemini calls go through the backend relay (key stays on the server) whenever examApi is configured.
    void environment;
    return 'gemini';
  },
});

export const EVALUATION_BACKEND = new InjectionToken<EvaluationBackend>('EVALUATION_BACKEND', {
  providedIn: 'root',
  factory: () => {
    return inject(EVALUATION_ENGINE) === 'server' ? inject(HttpEvaluationBackend) : inject(GeminiEvaluationBackend);
  },
});
