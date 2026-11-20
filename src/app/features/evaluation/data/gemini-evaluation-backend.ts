import { Service, inject } from '@angular/core';
import { GeminiPart, GeminiService } from '../../../core/services/ai/gemini.service';
import { IGradingJob, IMarkingScheme, ISheetEvaluation } from '../models/evaluation.models';
import { sha256Hex } from './checksum';
import type { EvaluationBackend, IGradingOptions, IStartedJob, IUploadSheet, RunEventHandler } from './evaluation-backend';
import { teacherExamplesPrompt } from './teacher-feedback';
import {
  DRAFT_SCHEME_RESPONSE,
  DRAFT_SCHEME_SYSTEM,
  GRADE_SHEET_RESPONSE,
  GRADE_SHEET_SYSTEM,
  IRawDraftScheme,
  IRawGrading,
  gradeSheetPrompt,
} from './gemini-prompts';
import { normaliseDraftScheme, normaliseGrading } from './grading-normaliser';
import { pagesSummary } from './pages-summary';
import { isAnswerFlagged, summariseSheet } from './sheet-summary';

/** "Thinking" tokens per sheet: enough to check working step by step, low enough to stay quick. */
const GRADING_THINKING_BUDGET = 2048;

/**
 * Real grading with Gemini, called directly from the browser (local development only).
 * Schemes and results live in memory for this browser session; the server backend will persist them.
 */
@Service()
export class GeminiEvaluationBackend implements EvaluationBackend {
  private readonly gemini = inject(GeminiService);
  private sheets = new Map<string, ISheetEvaluation>();

  /** Schemes are stored in Firebase by the store; this backend keeps none of its own. */
  async listSchemes(): Promise<IMarkingScheme[]> {
    return [];
  }

  async draftScheme(questionPaper: File, onEvent: RunEventHandler, signal?: AbortSignal): Promise<IMarkingScheme> {
    const started = Date.now();
    onEvent({ type: 'tool_started', tool: 'draft_marking_scheme', at: started });
    try {
      const [checksum, filePart] = await Promise.all([
        sha256Hex(questionPaper),
        this.gemini.fileToPart(questionPaper, questionPaper.type, 'question-paper', signal),
      ]);
      const raw = await this.gemini.generateJson<IRawDraftScheme>({
        systemInstruction: DRAFT_SCHEME_SYSTEM,
        parts: [filePart, { text: 'Write the marking scheme for this question paper.' }],
        responseSchema: DRAFT_SCHEME_RESPONSE,
        thinkingBudget: 8192,
        signal,
      });
      signal?.throwIfAborted();
      const draft = normaliseDraftScheme(raw, `scheme-draft-${Date.now()}`, checksum);
      if (draft.questions.length === 0) throw new Error('Gemini found no questions in this file.');

      onEvent({ type: 'scheme_drafted', scheme: structuredClone(draft) });
      onEvent({
        type: 'tool_finished',
        tool: 'draft_marking_scheme',
        durationMs: Date.now() - started,
        summary: `Drafted ${draft.questions.length} questions, ${draft.totalMarks} marks`,
      });
      return structuredClone(draft);
    } catch (e) {
      const error = signal?.aborted ? 'Cancelled by the teacher' : errorText(e);
      onEvent({ type: 'tool_failed', tool: 'draft_marking_scheme', error });
      throw e;
    }
  }

  async approveScheme(scheme: IMarkingScheme): Promise<IMarkingScheme> {
    return { ...structuredClone(scheme), status: 'approved' };
  }

  async startGrading(
    scheme: IMarkingScheme,
    uploads: IUploadSheet[],
    onEvent: RunEventHandler,
    options?: IGradingOptions,
  ): Promise<IStartedJob> {
    const examples = teacherExamplesPrompt(options?.teacherExamples ?? []);
    const schemeId = scheme.id;
    const jobId = `job-${Date.now().toString(36)}`;
    const sheets: ISheetEvaluation[] = uploads.map((upload, i) => ({
      submissionId: upload.submissionId ?? `${jobId}-${i + 1}`,
      jobId,
      schemeId,
      studentLabel: upload.studentLabel,
      fileName: upload.file.name,
      mimeType: upload.file.type,
      pageCount: upload.pageCount,
      checksum: '',
      status: 'queued',
      questions: [],
      totalAwarded: 0,
      totalMax: scheme.totalMarks,
      ocrConfidence: 0,
      needsReview: false,
    }));
    sheets.forEach((s) => this.sheets.set(s.submissionId, s));
    const job: IGradingJob = { id: jobId, schemeId, createdAt: new Date().toISOString(), sheets };

    const done = (async () => {
      await delay(50); // let the caller store the job before the first event arrives
      // Queue: one paper at a time; each result is published as soon as it is ready.
      for (const [i, sheet] of sheets.entries()) {
        await this.gradeOne(sheet, uploads[i], scheme, onEvent, examples);
      }
      onEvent({ type: 'run_completed', jobId });
    })();

    return { job: structuredClone(job), done };
  }

  async saveReview(submissionId: string, overrides: Record<string, number>, approve: boolean): Promise<ISheetEvaluation> {
    const sheet = this.sheets.get(submissionId);
    if (!sheet) throw new Error(`Unknown submission ${submissionId}`);
    const questions = sheet.questions.map((q) => ({ ...q, teacherOverride: overrides[q.questionId] }));
    const updated: ISheetEvaluation = {
      ...summariseSheet({ ...sheet, questions }),
      status: approve ? 'approved' : sheet.status,
      approvedAt: approve ? new Date().toISOString() : sheet.approvedAt,
    };
    this.sheets.set(submissionId, updated);
    return structuredClone(updated);
  }

  private async gradeOne(
    sheet: ISheetEvaluation,
    upload: IUploadSheet,
    scheme: IMarkingScheme,
    onEvent: RunEventHandler,
    teacherExamples = '',
  ): Promise<void> {
    const { submissionId } = sheet;
    let current: ISheetEvaluation = { ...sheet, status: 'grading' };
    this.publish(current, onEvent);

    // 1. PDF → JPEG page images (the PDF itself is never sent).
    let pages: Blob[];
    let checksum: string;
    const prepStarted = Date.now();
    onEvent({ type: 'tool_started', tool: 'prepare_pages', submissionId, at: prepStarted });
    try {
      [pages, checksum] = await Promise.all([upload.loadPages(), sha256Hex(upload.file)]);
      onEvent({
        type: 'tool_finished',
        tool: 'prepare_pages',
        submissionId,
        durationMs: Date.now() - prepStarted,
        summary: pagesSummary(pages),
      });
    } catch (e) {
      current = { ...current, status: 'failed', error: `Could not read this PDF: ${errorText(e)}` };
      onEvent({ type: 'tool_failed', tool: 'prepare_pages', submissionId, error: errorText(e) });
      this.publish(current, onEvent);
      return;
    }

    // 2. Grade all pages in one Gemini call.
    const started = Date.now();
    onEvent({ type: 'tool_started', tool: 'grade_answer_sheet', submissionId, at: started });
    try {
      const pageParts: GeminiPart[] = [];
      for (const [i, page] of pages.entries()) {
        pageParts.push({ text: `Page ${i + 1}:` }, await this.gemini.fileToPart(page, 'image/jpeg', `page-${i + 1}`));
      }
      const raw = await this.gemini.generateJson<IRawGrading>({
        systemInstruction: GRADE_SHEET_SYSTEM,
        parts: [{ text: gradeSheetPrompt(scheme, pages.length, teacherExamples) }, ...pageParts],
        responseSchema: GRADE_SHEET_RESPONSE,
        thinkingBudget: GRADING_THINKING_BUDGET,
      });
      const { questions, ocrConfidence } = normaliseGrading(raw, scheme, pages.length);
      current = summariseSheet({ ...current, checksum, questions, ocrConfidence, status: 'graded' });
      onEvent({
        type: 'tool_finished',
        tool: 'grade_answer_sheet',
        submissionId,
        durationMs: Date.now() - started,
        summary: `${current.studentLabel}: ${current.totalAwarded} / ${current.totalMax}`,
      });
    } catch (e) {
      current = { ...current, status: 'failed', error: errorText(e) };
      onEvent({ type: 'tool_failed', tool: 'grade_answer_sheet', submissionId, error: errorText(e) });
      this.publish(current, onEvent);
      return;
    }

    const flagStarted = Date.now();
    onEvent({ type: 'tool_started', tool: 'flag_for_review', submissionId, at: flagStarted });
    const flagged = current.questions.filter(isAnswerFlagged).length;
    current = { ...current, status: current.needsReview ? 'needs_review' : 'graded' };
    onEvent({
      type: 'tool_finished',
      tool: 'flag_for_review',
      submissionId,
      durationMs: Date.now() - flagStarted,
      summary: flagged ? `${flagged} question(s) need a teacher's eye` : 'No low-confidence answers',
    });
    this.publish(current, onEvent);
  }

  private publish(sheet: ISheetEvaluation, onEvent: RunEventHandler): void {
    this.sheets.set(sheet.submissionId, sheet);
    onEvent({ type: 'sheet_updated', sheet: structuredClone(sheet) });
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
