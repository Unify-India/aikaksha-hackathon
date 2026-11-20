import { Service, computed, inject, signal } from '@angular/core';
import {
  EvaluationRunEvent,
  EvaluationTool,
  IGradingJob,
  IMarkingScheme,
  ISheetEvaluation,
} from '../models/evaluation.models';
import { EVALUATION_BACKEND, EVALUATION_ENGINE, IUploadSheet } from './evaluation-backend';
import { EVALUATION_REPOSITORY } from './evaluation-repository';
import { PdfDocumentService } from './pdf-document.service';
import { summariseSheet } from './sheet-summary';
import { collectDecisions, learningStats, pickExamples } from './teacher-feedback';

export type EvaluationPhase = 'setup' | 'grading' | 'review';
export type BusyState = 'idle' | 'loading_schemes' | 'drafting' | 'approving' | 'uploading' | 'saving' | 'retrying';

export interface IActivityEntry {
  id: number;
  tool: EvaluationTool;
  submissionId?: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  /** Epoch ms when the step started (drives the live seconds counter). */
  startedAt: number;
  detail?: string;
  durationMs?: number;
}

/** Teachers upload PDFs only; each PDF is one student's paper. */
export const ACCEPTED_SHEET_TYPES = ['application/pdf'];
export const MAX_SHEET_BYTES = 30 * 1024 * 1024;

const TOOL_LABELS: Record<EvaluationTool, string> = {
  draft_marking_scheme: 'Drafting marking scheme',
  apply_teacher_feedback: 'Learning from teacher decisions',
  prepare_pages: 'Preparing page images for',
  grade_answer_sheet: 'Grading',
  flag_for_review: 'Checking confidence for',
};

/** "Student A" … "Student Z", then "Student 27" onwards. */
export function studentLabel(index: number): string {
  return index < 26 ? `Student ${String.fromCharCode(65 + index)}` : `Student ${index + 1}`;
}

/** Renames a sheet so the student's real name (often in the file name) never leaves the browser. */
export function anonymisedFile(file: File, index: number): File {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  return new File([file], `sheet-${String(index + 1).padStart(2, '0')}${ext}`, { type: file.type });
}

/** Returns a user-facing problem with the file, or null if it can be uploaded. */
export function validateSheetFile(file: File): string | null {
  if (!ACCEPTED_SHEET_TYPES.includes(file.type)) return `${file.name}: only PDF files are supported.`;
  if (file.size > MAX_SHEET_BYTES) return `${file.name}: larger than 30 MB.`;
  return null;
}

@Service()
export class EvaluationStore {
  private readonly backend = inject(EVALUATION_BACKEND);
  private readonly repo = inject(EVALUATION_REPOSITORY);
  /** Which engine grades: 'server', or 'gemini' (browser, local only). */
  readonly engine = inject(EVALUATION_ENGINE);
  /** In browser mode the store saves papers and sheets to Firebase itself; the server saves its own. */
  private readonly persist = this.engine === 'gemini';
  private readonly pdf = inject(PdfDocumentService);
  private activityId = 0;
  /** Cancels the marking-scheme draft in progress, if any. */
  private draftAbort: AbortController | null = null;

  readonly phase = signal<EvaluationPhase>('setup');
  readonly busy = signal<BusyState>('idle');
  readonly error = signal<string | null>(null);
  /** Non-blocking notices, e.g. "PDF not saved: Storage not enabled". */
  readonly warning = signal<string | null>(null);

  /** Question papers (marking schemes) — draft, pending or approved. */
  readonly schemes = signal<IMarkingScheme[]>([]);
  readonly selectedSchemeId = signal<string | null>(null);
  /** A drafted scheme open for the teacher to check and approve. */
  readonly pendingDraft = signal<IMarkingScheme | null>(null);
  /** An approved scheme opened read-only ("View answers"). */
  readonly viewingScheme = signal<IMarkingScheme | null>(null);
  /** paperId → link that opens its question paper PDF in a new tab. */
  readonly paperUrls = signal<Record<string, string>>({});
  /** Student papers already saved under the selected question paper. */
  readonly savedSheets = signal<ISheetEvaluation[]>([]);

  readonly job = signal<IGradingJob | null>(null);
  /** PDFs available in the browser for display: submissionId → File. */
  readonly localFiles = signal<Record<string, File>>({});
  readonly activeSheetId = signal<string | null>(null);
  readonly activity = signal<IActivityEntry[]>([]);

  readonly selectedScheme = computed(
    () => this.schemes().find((s) => s.id === this.selectedSchemeId()) ?? null,
  );
  readonly approvedSchemes = computed(() => this.schemes().filter((s) => s.status === 'approved'));
  readonly pendingSchemes = computed(() => this.schemes().filter((s) => s.status === 'pending'));
  readonly sheets = computed(() => this.job()?.sheets ?? []);
  readonly activeIndex = computed(() => this.sheets().findIndex((s) => s.submissionId === this.activeSheetId()));
  readonly activeSheet = computed(() => this.sheets()[this.activeIndex()] ?? null);
  readonly activeFile = computed(() => {
    const id = this.activeSheetId();
    return id ? (this.localFiles()[id] ?? null) : null;
  });
  readonly jobScheme = computed(() => this.schemes().find((s) => s.id === this.job()?.schemeId) ?? null);
  readonly finishedCount = computed(
    () => this.sheets().filter((s) => !['queued', 'grading'].includes(s.status)).length,
  );
  readonly approvedCount = computed(() => this.sheets().filter((s) => s.status === 'approved').length);
  readonly reviewCount = computed(() => this.sheets().filter((s) => s.needsReview && s.status !== 'approved').length);
  /** How often teachers kept the AI's marks on the selected question paper, and how many corrections exist. */
  readonly learning = computed(() =>
    learningStats(collectDecisions(this.job() ? this.sheets() : this.savedSheets(), this.selectedScheme())),
  );

  async loadSchemes(): Promise<void> {
    await this.run('loading_schemes', async () => {
      const schemes = this.persist ? await this.repo.listPapers() : await this.backend.listSchemes();
      this.schemes.set(schemes);
      void this.resolvePaperUrls(schemes);
      if (!this.selectedSchemeId()) {
        const first = schemes.find((s) => s.status === 'approved');
        if (first) await this.selectScheme(first.id);
      }
    });
  }

  /** Selects an approved question paper and loads the student papers saved under it. */
  async selectScheme(id: string): Promise<void> {
    this.selectedSchemeId.set(id);
    this.savedSheets.set([]);
    if (!this.persist) return;
    try {
      this.savedSheets.set(await this.repo.listSheets(id));
    } catch (e) {
      this.warning.set(`Could not load saved marksheets: ${errorText(e)}`);
    }
  }

  viewScheme(id: string): void {
    this.viewingScheme.set(this.schemes().find((s) => s.id === id) ?? null);
  }

  closeSchemeView(): void {
    this.viewingScheme.set(null);
  }

  /** Opens a pending (drafted, not yet approved) scheme for review. */
  reviewPending(id: string): void {
    this.pendingDraft.set(this.schemes().find((s) => s.id === id) ?? null);
  }

  async draftFromQuestionPaper(file: File): Promise<void> {
    const problem = validateSheetFile(file);
    if (problem) {
      this.error.set(problem);
      return;
    }
    const cancel = new AbortController();
    this.draftAbort = cancel;
    await this.run('drafting', async () => {
      // 1. Save the question paper as 'draft' (and its PDF) before Gemini starts.
      let paperId: string | null = null;
      let paperFileSaved = false;
      if (this.persist) {
        const created = await this.repo.createPaper(file);
        paperId = created.id;
        paperFileSaved = created.fileSaved;
        if (!created.fileSaved) this.warning.set(STORAGE_WARNING);
      }
      if (cancel.signal.aborted) return;
      // 2. Gemini drafts the scheme → 'pending' until the teacher approves it.
      let drafted: IMarkingScheme;
      try {
        drafted = await this.backend.draftScheme(file, (e) => this.handleEvent(e), cancel.signal);
      } catch (e) {
        if (cancel.signal.aborted) return; // cancelled by the teacher: not an error
        throw e;
      }
      if (cancel.signal.aborted) return;
      const draft: IMarkingScheme = {
        ...drafted,
        id: paperId ?? drafted.id,
        status: 'pending',
        ...(paperId && paperFileSaved ? { filePath: `question_papers/${paperId}/question-paper.pdf` } : {}),
      };
      if (this.persist) await this.repo.savePaper(draft);
      this.schemes.update((list) => [draft, ...list.filter((s) => s.id !== draft.id)]);
      this.pendingDraft.set(draft);
      void this.resolvePaperUrls([draft]);
    });
    if (this.draftAbort === cancel) this.draftAbort = null;
  }

  /**
   * Stops a running draft. Gemini's request is aborted straight away; the question paper stays
   * saved as 'draft' (records can't be deleted) and drafts are hidden from the scheme list.
   */
  cancelDrafting(): void {
    this.draftAbort?.abort(new DOMException('Cancelled by the teacher', 'AbortError'));
    this.draftAbort = null;
  }

  async approveDraft(scheme: IMarkingScheme): Promise<void> {
    await this.run('approving', async () => {
      const approved = await this.backend.approveScheme(scheme);
      if (this.persist) await this.repo.savePaper(approved);
      this.schemes.update((list) => list.map((s) => (s.id === approved.id ? approved : s)));
      this.pendingDraft.set(null);
      await this.selectScheme(approved.id);
    });
  }

  /** Closes the review panel; the scheme stays 'pending' and can be reopened later. */
  discardDraft(): void {
    this.pendingDraft.set(null);
  }

  async startGrading(files: File[]): Promise<void> {
    const scheme = this.selectedScheme();
    if (!scheme || files.length === 0) return;
    const problems = files.map(validateSheetFile).filter((p): p is string => p !== null);
    if (problems.length) {
      this.error.set(problems.join(' '));
      return;
    }

    await this.run('uploading', async () => {
      // Continue the numbering after papers already saved under this question paper.
      const offset = this.savedSheets().length;
      const uploads: IUploadSheet[] = await Promise.all(
        files.map(async (file, i) => {
          const renamed = anonymisedFile(file, offset + i);
          let pages: Promise<Blob[]> | null = null;
          return {
            file: renamed,
            studentLabel: studentLabel(offset + i),
            pageCount: await this.pdf.countPages(renamed),
            loadPages: () => (pages ??= this.pdf.toJpegPages(renamed)),
          };
        }),
      );
      this.activity.set([]);
      // Learn from this teacher: earlier corrections/confirmations on this paper guide the new grading.
      const examples = pickExamples(collectDecisions(this.savedSheets(), scheme));
      if (examples.length) {
        const corrections = examples.filter((e) => e.kind === 'corrected').length;
        this.activity.set([
          {
            id: ++this.activityId,
            tool: 'apply_teacher_feedback',
            label: TOOL_LABELS.apply_teacher_feedback,
            status: 'done',
            startedAt: Date.now(),
            detail: `${examples.length} earlier decisions (${corrections} corrections) given to Gemini as marking examples`,
          },
        ]);
      }
      const { job, done } = await this.backend.startGrading(scheme, uploads, (e) => this.handleEvent(e), {
        teacherExamples: examples,
      });

      // Save each new paper ('draft') and its PDF, in the order they were uploaded.
      if (this.persist) {
        job.sheets.forEach((sheet, i) => {
          this.repo
            .createSheet(scheme.id, sheet, uploads[i].file)
            .then(({ fileSaved }) => {
              if (!fileSaved) this.warning.set(STORAGE_WARNING);
            })
            .catch((e: unknown) => this.warning.set(`Could not save ${sheet.studentLabel}: ${errorText(e)}`));
        });
      }

      this.job.set({ ...job, sheets: [...this.savedSheets(), ...job.sheets] });
      this.localFiles.set(Object.fromEntries(job.sheets.map((s, i) => [s.submissionId, uploads[i].file])));
      this.activeSheetId.set(job.sheets[0]?.submissionId ?? null);
      this.phase.set('grading');
      done
        .then(() => this.phase.set('review'))
        .catch((e: unknown) => this.error.set(errorText(e)));
    });
  }

  /**
   * Grades a failed sheet again, using its PDF (kept in the browser, or downloaded from Storage).
   * Keeps the same id and student label, so the saved record is updated instead of duplicated.
   */
  async retrySheet(submissionId: string): Promise<void> {
    const sheet = this.sheets().find((s) => s.submissionId === submissionId);
    const scheme = this.schemes().find((s) => s.id === sheet?.schemeId) ?? null;
    if (!sheet || !scheme) return;

    await this.run('retrying', async () => {
      let file: File | null = this.localFiles()[submissionId] ?? null;
      if (!file && this.persist) {
        const downloaded = await this.repo.downloadSheetFile(sheet);
        if (downloaded) this.localFiles.update((files) => ({ ...files, [submissionId]: downloaded }));
        file = downloaded;
      }
      if (!file) throw new Error(`No saved PDF for ${sheet.studentLabel}. Upload this paper again from the setup screen.`);

      const pdfFile = file;
      let pages: Promise<Blob[]> | null = null;
      const upload: IUploadSheet = {
        file: pdfFile,
        studentLabel: sheet.studentLabel,
        pageCount: await this.pdf.countPages(pdfFile),
        loadPages: () => (pages ??= this.pdf.toJpegPages(pdfFile)),
        submissionId,
      };
      const examples = pickExamples(
        collectDecisions(this.sheets().filter((s) => s.submissionId !== submissionId), scheme),
      );
      const { done } = await this.backend.startGrading(scheme, [upload], (e) => this.handleEvent(e), {
        teacherExamples: examples,
      });
      // Back to the start of the pipeline; events will move it to grading → graded.
      this.updateSheet({ ...sheet, status: 'queued', error: undefined, questions: [], totalAwarded: 0, needsReview: false });
      done.catch((e: unknown) => this.error.set(errorText(e)));
    });
  }

  /** Shows the marksheets already saved under the selected question paper. */
  openSavedResults(submissionId?: string): void {
    const scheme = this.selectedScheme();
    if (!scheme) return;
    this.job.set({ id: `saved-${scheme.id}`, schemeId: scheme.id, createdAt: new Date().toISOString(), sheets: this.savedSheets() });
    this.activity.set([]);
    this.phase.set('review');
    if (submissionId) this.openSheet(submissionId);
  }

  openSheet(submissionId: string): void {
    this.activeSheetId.set(submissionId);
    void this.ensureFile(submissionId);
  }

  previousSheet(): void {
    const i = this.activeIndex();
    if (i > 0) this.openSheet(this.sheets()[i - 1].submissionId);
  }

  nextSheet(): void {
    const i = this.activeIndex();
    if (i >= 0 && i < this.sheets().length - 1) this.openSheet(this.sheets()[i + 1].submissionId);
  }

  /** Sets (or clears, with null) the teacher's marks for one question on the open sheet. */
  setOverride(questionId: string, marks: number | null): void {
    const sheet = this.activeSheet();
    if (!sheet) return;
    const questions = sheet.questions.map((q) =>
      q.questionId === questionId
        ? { ...q, teacherOverride: marks === null || marks === q.awarded ? undefined : marks }
        : q,
    );
    this.updateSheet(summariseSheet({ ...sheet, questions }));
  }

  clearOverrides(): void {
    const sheet = this.activeSheet();
    if (!sheet) return;
    this.updateSheet(summariseSheet({ ...sheet, questions: sheet.questions.map((q) => ({ ...q, teacherOverride: undefined })) }));
  }

  /** Saves the open sheet as approved, then jumps to the next sheet that isn't approved yet. */
  async approveActiveAndNext(): Promise<void> {
    const sheet = this.activeSheet();
    if (!sheet) return;
    await this.run('saving', async () => {
      let saved: ISheetEvaluation;
      if (this.persist) {
        saved = { ...summariseSheet(sheet), status: 'approved', approvedAt: new Date().toISOString() };
        await this.repo.saveSheet(sheet.schemeId, saved);
      } else {
        const overrides = Object.fromEntries(
          sheet.questions
            .filter((q) => q.teacherOverride !== undefined)
            .map((q) => [q.questionId, q.teacherOverride as number]),
        );
        saved = await this.backend.saveReview(sheet.submissionId, overrides, true);
      }
      this.replaceSheet(saved);
      const next = this.sheets().find((s, i) => i > this.activeIndex() && s.status !== 'approved')
        ?? this.sheets().find((s) => s.status !== 'approved');
      if (next) this.openSheet(next.submissionId);
    });
  }

  startOver(): void {
    this.job.set(null);
    this.localFiles.set({});
    this.activeSheetId.set(null);
    this.activity.set([]);
    this.error.set(null);
    this.phase.set('setup');
    const id = this.selectedSchemeId();
    if (id) void this.selectScheme(id); // refresh the saved marksheets list
  }

  dismissError(): void {
    this.error.set(null);
  }

  dismissWarning(): void {
    this.warning.set(null);
  }

  /** Looks up "view" links for question papers whose PDF is saved (failures just hide the link). */
  private async resolvePaperUrls(papers: IMarkingScheme[]): Promise<void> {
    if (!this.persist) return;
    for (const paper of papers) {
      if (!paper.filePath || this.paperUrls()[paper.id]) continue;
      try {
        const url = await this.repo.fileUrl(paper.filePath);
        this.paperUrls.update((all) => ({ ...all, [paper.id]: url }));
      } catch {
        // No link: the PDF may not exist (e.g. Storage was off when it was uploaded).
      }
    }
  }

  /** Downloads a saved sheet's PDF from Storage the first time it is opened. */
  private async ensureFile(submissionId: string): Promise<void> {
    if (this.localFiles()[submissionId] || !this.persist) return;
    const sheet = this.sheets().find((s) => s.submissionId === submissionId);
    if (!sheet?.filePath) return;
    try {
      const file = await this.repo.downloadSheetFile(sheet);
      if (file) this.localFiles.update((files) => ({ ...files, [submissionId]: file }));
    } catch (e) {
      this.warning.set(`Could not load the saved PDF for ${sheet.studentLabel}: ${errorText(e)}`);
    }
  }

  /** Updates a sheet on screen and (in browser mode) saves it. */
  private updateSheet(sheet: ISheetEvaluation): void {
    this.replaceSheet(sheet);
    if (this.persist) {
      this.repo.saveSheet(sheet.schemeId, sheet).catch((e: unknown) => this.warning.set(`Could not save changes: ${errorText(e)}`));
    }
  }

  private replaceSheet(sheet: ISheetEvaluation): void {
    this.job.update((job) =>
      job ? { ...job, sheets: job.sheets.map((s) => (s.submissionId === sheet.submissionId ? { ...s, ...sheet } : s)) } : job,
    );
  }

  private handleEvent(event: EvaluationRunEvent): void {
    switch (event.type) {
      case 'tool_started':
        this.activity.update((list) => [
          ...list,
          {
            id: ++this.activityId,
            tool: event.tool,
            submissionId: event.submissionId,
            label: this.describe(event.tool, event.submissionId),
            status: 'running',
            startedAt: Date.now(),
          },
        ]);
        break;
      case 'tool_finished':
      case 'tool_failed': {
        const failed = event.type === 'tool_failed';
        this.activity.update((list) => {
          let index = -1;
          list.forEach((a, i) => {
            if (a.tool === event.tool && a.submissionId === event.submissionId && a.status === 'running') index = i;
          });
          if (index < 0) return list;
          const updated: IActivityEntry = {
            ...list[index],
            status: failed ? 'failed' : 'done',
            detail: failed ? event.error : event.summary,
            durationMs: failed ? undefined : event.durationMs,
          };
          return list.map((a, i) => (i === index ? updated : a));
        });
        break;
      }
      case 'sheet_updated':
        this.updateSheet(event.sheet);
        break;
      case 'scheme_drafted':
      case 'run_completed':
        break;
    }
  }

  private describe(tool: EvaluationTool, submissionId?: string): string {
    const label = this.sheets().find((s) => s.submissionId === submissionId)?.studentLabel;
    return label ? `${TOOL_LABELS[tool]} ${label}` : TOOL_LABELS[tool];
  }

  private async run(state: BusyState, work: () => Promise<void>): Promise<void> {
    this.busy.set(state);
    this.error.set(null);
    try {
      await work();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set('idle');
    }
  }
}

const STORAGE_WARNING =
  'Saved the marks, but not the PDF file: Firebase Storage is not enabled for this project yet.';

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
