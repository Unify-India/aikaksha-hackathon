import { Service, computed, inject, signal } from '@angular/core';
import {
  EvaluationRunEvent,
  EvaluationTool,
  IGradingJob,
  IMarkingScheme,
  ISheetEvaluation,
} from '../models/evaluation.models';
import { EVALUATION_BACKEND, EVALUATION_ENGINE, IUploadSheet } from './evaluation-backend';
import { PdfDocumentService } from './pdf-document.service';
import { summariseSheet } from './sheet-summary';

export type EvaluationPhase = 'setup' | 'grading' | 'review';
export type BusyState = 'idle' | 'loading_schemes' | 'drafting' | 'approving' | 'uploading' | 'saving';

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
export const MAX_SHEET_BYTES = 50 * 1024 * 1024;

const TOOL_LABELS: Record<EvaluationTool, string> = {
  draft_marking_scheme: 'Drafting marking scheme',
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
  if (file.size > MAX_SHEET_BYTES) return `${file.name}: larger than 50 MB.`;
  return null;
}

@Service()
export class EvaluationStore {
  private readonly backend = inject(EVALUATION_BACKEND);
  /** Which engine grades: 'server', or 'gemini' (browser, local only). */
  readonly engine = inject(EVALUATION_ENGINE);
  private readonly pdf = inject(PdfDocumentService);
  private activityId = 0;

  readonly phase = signal<EvaluationPhase>('setup');
  readonly busy = signal<BusyState>('idle');
  readonly error = signal<string | null>(null);

  readonly schemes = signal<IMarkingScheme[]>([]);
  readonly selectedSchemeId = signal<string | null>(null);
  /** A Gemini-drafted scheme waiting for the teacher to check and approve. */
  readonly pendingDraft = signal<IMarkingScheme | null>(null);

  readonly job = signal<IGradingJob | null>(null);
  /** Original (renamed) files kept in the browser for display: submissionId → File. */
  readonly localFiles = signal<Record<string, File>>({});
  readonly activeSheetId = signal<string | null>(null);
  readonly activity = signal<IActivityEntry[]>([]);

  readonly selectedScheme = computed(
    () => this.schemes().find((s) => s.id === this.selectedSchemeId()) ?? null,
  );
  readonly approvedSchemes = computed(() => this.schemes().filter((s) => s.status === 'approved'));
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

  async loadSchemes(): Promise<void> {
    await this.run('loading_schemes', async () => {
      const schemes = await this.backend.listSchemes();
      this.schemes.set(schemes);
      if (!this.selectedSchemeId()) {
        this.selectedSchemeId.set(schemes.find((s) => s.status === 'approved')?.id ?? null);
      }
    });
  }

  selectScheme(id: string): void {
    this.selectedSchemeId.set(id);
  }

  async draftFromQuestionPaper(file: File): Promise<void> {
    const problem = validateSheetFile(file);
    if (problem) {
      this.error.set(problem);
      return;
    }
    await this.run('drafting', async () => {
      const draft = await this.backend.draftScheme(file, (e) => this.handleEvent(e));
      this.schemes.update((list) => [...list.filter((s) => s.id !== draft.id), draft]);
      this.pendingDraft.set(draft);
    });
  }

  async approveDraft(scheme: IMarkingScheme): Promise<void> {
    await this.run('approving', async () => {
      const approved = await this.backend.approveScheme(scheme);
      this.schemes.update((list) => list.map((s) => (s.id === approved.id ? approved : s)));
      this.pendingDraft.set(null);
      this.selectedSchemeId.set(approved.id);
    });
  }

  discardDraft(): void {
    this.pendingDraft.set(null);
  }

  async startGrading(files: File[]): Promise<void> {
    const schemeId = this.selectedSchemeId();
    if (!schemeId || files.length === 0) return;
    const problems = files.map(validateSheetFile).filter((p): p is string => p !== null);
    if (problems.length) {
      this.error.set(problems.join(' '));
      return;
    }

    await this.run('uploading', async () => {
      const uploads: IUploadSheet[] = await Promise.all(
        files.map(async (file, i) => {
          const renamed = anonymisedFile(file, i);
          let pages: Promise<Blob[]> | null = null;
          return {
            file: renamed,
            studentLabel: studentLabel(i),
            pageCount: await this.pdf.countPages(renamed),
            loadPages: () => (pages ??= this.pdf.toJpegPages(renamed)),
          };
        }),
      );
      this.activity.set([]);
      const { job, done } = await this.backend.startGrading(schemeId, uploads, (e) => this.handleEvent(e));
      this.job.set(job);
      this.localFiles.set(Object.fromEntries(job.sheets.map((s, i) => [s.submissionId, uploads[i].file])));
      this.activeSheetId.set(job.sheets[0]?.submissionId ?? null);
      this.phase.set('grading');
      done
        .then(() => this.phase.set('review'))
        .catch((e: unknown) => this.error.set(e instanceof Error ? e.message : String(e)));
    });
  }

  openSheet(submissionId: string): void {
    this.activeSheetId.set(submissionId);
  }

  previousSheet(): void {
    const i = this.activeIndex();
    if (i > 0) this.activeSheetId.set(this.sheets()[i - 1].submissionId);
  }

  nextSheet(): void {
    const i = this.activeIndex();
    if (i >= 0 && i < this.sheets().length - 1) this.activeSheetId.set(this.sheets()[i + 1].submissionId);
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
    this.replaceSheet(summariseSheet({ ...sheet, questions }));
  }

  clearOverrides(): void {
    const sheet = this.activeSheet();
    if (!sheet) return;
    this.replaceSheet(summariseSheet({ ...sheet, questions: sheet.questions.map((q) => ({ ...q, teacherOverride: undefined })) }));
  }

  /** Saves the open sheet as approved, then jumps to the next sheet that isn't approved yet. */
  async approveActiveAndNext(): Promise<void> {
    const sheet = this.activeSheet();
    if (!sheet) return;
    const overrides = Object.fromEntries(
      sheet.questions
        .filter((q) => q.teacherOverride !== undefined)
        .map((q) => [q.questionId, q.teacherOverride as number]),
    );
    await this.run('saving', async () => {
      const saved = await this.backend.saveReview(sheet.submissionId, overrides, true);
      this.replaceSheet(saved);
      const next = this.sheets().find((s, i) => i > this.activeIndex() && s.status !== 'approved')
        ?? this.sheets().find((s) => s.status !== 'approved');
      if (next) this.activeSheetId.set(next.submissionId);
    });
  }

  startOver(): void {
    this.job.set(null);
    this.localFiles.set({});
    this.activeSheetId.set(null);
    this.activity.set([]);
    this.error.set(null);
    this.phase.set('setup');
  }

  dismissError(): void {
    this.error.set(null);
  }

  private replaceSheet(sheet: ISheetEvaluation): void {
    this.job.update((job) =>
      job ? { ...job, sheets: job.sheets.map((s) => (s.submissionId === sheet.submissionId ? sheet : s)) } : job,
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
        this.replaceSheet(event.sheet);
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
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set('idle');
    }
  }
}
