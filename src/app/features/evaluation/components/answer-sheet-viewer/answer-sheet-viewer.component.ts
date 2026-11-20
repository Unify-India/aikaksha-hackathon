import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfDocumentService } from '../../data/pdf-document.service';
import { RedPenCopyService } from '../../data/red-pen-copy.service';
import {
  IMarkingScheme,
  ISheetEvaluation,
  QuestionVerdict,
  effectiveMarks,
  effectiveVerdict,
  questionLabel,
} from '../../models/evaluation.models';

interface IOverlayMark {
  questionId: string;
  label: string;
  verdict: QuestionVerdict;
  marks: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

const VERDICT_ICON: Record<QuestionVerdict, string> = {
  correct: '✓',
  partial: '◐',
  wrong: '✗',
  not_attempted: '–',
};

const VERDICT_TEXT: Record<QuestionVerdict, string> = {
  correct: 'correct',
  partial: 'partly correct',
  wrong: 'wrong',
  not_attempted: 'not attempted',
};

/**
 * Shows the original answer sheet (never modified) with a separate red-pen layer drawn from
 * Gemini's box_2d coordinates ([ymin, xmin, ymax, xmax] on a 0–1000 scale).
 */
@Component({
  selector: 'app-answer-sheet-viewer',
  template: `
    <section
      aria-labelledby="viewer-heading"
      class="flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <h2 id="viewer-heading" class="text-sm font-bold text-slate-900 dark:text-white">
          {{ sheet()?.studentLabel ?? 'Answer sheet' }}
          <span class="font-normal text-slate-600 dark:text-slate-300">· original, never modified</span>
        </h2>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <div class="flex items-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" class="px-2.5 py-1.5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600"
              aria-label="Previous page" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">◀</button>
            <span class="px-1 font-mono font-semibold text-slate-800 dark:text-slate-200" aria-live="polite">
              Page {{ page() }} of {{ pageCount() }}
            </span>
            <button type="button" class="px-2.5 py-1.5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600"
              aria-label="Next page" [disabled]="page() >= pageCount()" (click)="goToPage(page() + 1)">▶</button>
          </div>

          <div class="flex items-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" class="px-2.5 py-1.5 font-bold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600"
              aria-label="Zoom out" [disabled]="zoom() <= 60" (click)="zoom.set(zoom() - 20)">−</button>
            <span class="min-w-12 text-center font-mono text-slate-800 dark:text-slate-200">{{ zoom() }}%</span>
            <button type="button" class="px-2.5 py-1.5 font-bold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600"
              aria-label="Zoom in" [disabled]="zoom() >= 200" (click)="zoom.set(zoom() + 20)">+</button>
          </div>

          <div class="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Which version to show">
            <button type="button" class="rounded-md px-2.5 py-1 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-600"
              [class]="viewMode() === 'original' ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'"
              [attr.aria-pressed]="viewMode() === 'original'" (click)="viewMode.set('original')">Original</button>
            <button type="button" class="rounded-md px-2.5 py-1 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-600"
              [class]="viewMode() === 'redpen' ? 'bg-white text-rose-800 shadow dark:bg-slate-900 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'"
              [attr.aria-pressed]="viewMode() === 'redpen'" (click)="viewMode.set('redpen')">Red-pen copy (AI)</button>
          </div>

          <button type="button"
            class="rounded-lg border px-3 py-1.5 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-600"
            [class]="showOverlay() ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'"
            [attr.aria-pressed]="showOverlay()"
            [disabled]="showingCopy()"
            (click)="showOverlay.set(!showOverlay())">
            Mark boxes
          </button>
        </div>
      </div>

      @if (viewMode() === 'redpen') {
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100" aria-live="polite">
          @if (!redPen.available) {
            <span>Red-pen copies are drawn by Nano Banana (Gemini image model) and need a Gemini key in browser mode.</span>
          } @else if (redPenCopy()?.status === 'drawing') {
            <span><span aria-hidden="true" class="inline-block motion-safe:animate-spin">◌</span> Nano Banana is drawing page {{ page() }}… usually 10–40 s.</span>
          } @else if (redPenCopy()?.status === 'failed') {
            <span role="alert">✗ {{ redPenCopy()!.error }}</span>
            <button type="button" class="rounded-md bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-indigo-600" (click)="drawCopy()">Try again</button>
          } @else if (redPenCopy()?.status === 'ready') {
            <span>
              <strong>AI-generated copy</strong> drawn by Nano Banana — the original file and the marks table are the official record.
              @if (redPenOutdated()) { <strong>Marks changed since this copy was drawn.</strong> }
            </span>
            <span class="flex gap-2">
              @if (redPenOutdated()) {
                <button type="button" class="rounded-md bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-indigo-600" (click)="drawCopy()">Redraw</button>
              }
              <a class="rounded-md border border-rose-300 px-3 py-1 font-semibold hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-rose-700 dark:hover:bg-rose-900"
                [href]="redPenCopy()!.url" [download]="(sheet()?.studentLabel ?? 'sheet') + ' - page ' + page() + ' - red pen.png'">Download PNG</a>
            </span>
          } @else if (!canDraw()) {
            <span>{{ sheet()?.questions?.length ? 'No graded answers on this page to mark.' : 'Grade the sheet first, then draw a red-pen copy.' }}</span>
          } @else {
            <span>Nano Banana draws ticks, crosses and marks onto a copy of this page, using the final marks.</span>
            <button type="button" class="rounded-md bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-indigo-600" (click)="drawCopy()">Draw this page with Nano Banana</button>
          }
        </div>
      }

      <div class="relative min-h-[480px] overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
        @if (loadError()) {
          <p role="alert" class="p-6 text-center text-sm text-rose-800 dark:text-rose-300">{{ loadError() }}</p>
        } @else if (!pageImage()) {
          <p class="p-6 text-center text-sm text-slate-600 dark:text-slate-300">
            {{ file() ? 'Rendering page…' : 'Select a sheet to view it.' }}
          </p>
        } @else {
          <div class="relative mx-auto" [style.width.%]="zoom()">
            @if (showingCopy()) {
              <img
                class="block w-full select-none rounded-md shadow-md"
                [src]="redPenCopy()!.url"
                [alt]="'AI-generated red-pen copy of ' + (sheet()?.studentLabel ?? 'the answer sheet') + ', page ' + page() + ': ' + overlaySummary()"
              />
            } @else {
              <img
                class="block w-full select-none rounded-md shadow-md"
                [class.opacity-60]="redPenCopy()?.status === 'drawing' && viewMode() === 'redpen'"
                [src]="pageImage()!"
                [alt]="(sheet()?.studentLabel ?? 'Answer sheet') + ', page ' + page() + ' of ' + pageCount()"
              />
            }
            @if (showOverlay() && !showingCopy() && marks().length) {
              <div class="absolute inset-0" role="group" [attr.aria-label]="overlaySummary()">
                @for (mark of marks(); track mark.questionId) {
                  <button
                    type="button"
                    class="absolute rounded-md border-2 text-left focus-visible:outline-3 focus-visible:outline-indigo-600"
                    [class]="boxClass(mark)"
                    [style.top.%]="mark.top"
                    [style.left.%]="mark.left"
                    [style.width.%]="mark.width"
                    [style.height.%]="mark.height"
                    [attr.aria-label]="mark.label + ': ' + verdictText(mark.verdict) + ', ' + mark.marks + ' marks'"
                    [attr.aria-pressed]="mark.questionId === selectedQuestionId()"
                    (click)="questionSelected.emit(mark.questionId)"
                  >
                    <span
                      aria-hidden="true"
                      class="absolute -top-3 left-1 whitespace-nowrap rounded px-1.5 py-0.5 font-sans text-[11px] font-bold text-white shadow"
                      [class]="labelClass(mark.verdict)"
                    >
                      {{ icon(mark.verdict) }} {{ mark.label }} · {{ mark.marks }}
                    </span>
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      <p class="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
        @if (sheet()?.checksum) {
          SHA-256 <code class="break-all">{{ sheet()!.checksum.slice(0, 16) }}…</code> · marks are a separate layer
        } @else {
          Marks appear once grading finishes.
        }
      </p>
    </section>
  `,
})
export class AnswerSheetViewerComponent {
  private readonly pdf = inject(PdfDocumentService);

  readonly file = input<File | null>(null);
  readonly sheet = input<ISheetEvaluation | null>(null);
  readonly scheme = input<IMarkingScheme | null>(null);
  readonly selectedQuestionId = input<string | null>(null);

  readonly questionSelected = output<string>();

  protected readonly page = signal(1);
  protected readonly zoom = signal(100);
  protected readonly showOverlay = signal(true);
  protected readonly pageCount = signal(1);
  /** Object URL of the page currently shown. */
  protected readonly pageImage = signal<string | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly redPen = inject(RedPenCopyService);
  protected readonly viewMode = signal<'original' | 'redpen'>('original');
  protected readonly redPenCopy = computed(() => {
    const sheet = this.sheet();
    return sheet ? (this.redPen.copies()[this.redPen.key(sheet.submissionId, this.page())] ?? null) : null;
  });
  protected readonly redPenOutdated = computed(() => {
    const sheet = this.sheet();
    const copy = this.redPenCopy();
    return !!sheet && !!copy && copy.signature !== this.redPen.signature(sheet, this.page());
  });
  /** True when the AI red-pen copy (not the original) is on screen. */
  protected readonly showingCopy = computed(
    () => this.viewMode() === 'redpen' && this.redPenCopy()?.status === 'ready' && !!this.redPenCopy()?.url,
  );
  protected readonly canDraw = computed(() => {
    const sheet = this.sheet();
    return (
      this.redPen.available &&
      !!sheet &&
      !!this.pageImage() &&
      ['graded', 'needs_review', 'approved'].includes(sheet.status) &&
      this.redPen.hasMarks(sheet, this.page())
    );
  });

  private doc: PDFDocumentProxy | null = null;
  private imageUrl: string | null = null;
  private readonly pageCache = new Map<number, string>();
  private loadVersion = 0;

  protected readonly marks = computed<IOverlayMark[]>(() => {
    const sheet = this.sheet();
    if (!sheet) return [];
    const questions = new Map(this.scheme()?.questions.map((q) => [q.id, q]) ?? []);
    return sheet.questions.flatMap((result) =>
      result.evidence
        .filter((region) => region.page === this.page())
        .map((region) => {
          const [ymin, xmin, ymax, xmax] = region.box_2d;
          return {
            questionId: result.questionId,
            label: questionLabel(questions.get(result.questionId), result.questionId),
            verdict: effectiveVerdict(result),
            marks: `${effectiveMarks(result)}/${result.max}`,
            top: ymin / 10,
            left: xmin / 10,
            width: Math.max(xmax - xmin, 10) / 10,
            height: Math.max(ymax - ymin, 10) / 10,
          };
        }),
    );
  });

  protected readonly overlaySummary = computed(
    () =>
      `Red-pen marks on page ${this.page()}: ` +
      this.marks()
        .map((m) => `${m.label} ${VERDICT_TEXT[m.verdict]} ${m.marks}`)
        .join('; '),
  );

  constructor() {
    // Load the document whenever the file changes.
    effect(() => {
      const file = this.file();
      untracked(() => void this.openFile(file));
    });

    // When a question is selected elsewhere, jump to the page holding its answer.
    effect(() => {
      const id = this.selectedQuestionId();
      const result = this.sheet()?.questions.find((q) => q.questionId === id);
      const target = result?.evidence[0]?.page;
      if (target && target !== untracked(this.page)) untracked(() => this.goToPage(target));
    });

    inject(DestroyRef).onDestroy(() => this.releaseAll());
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.pageCount()) return;
    this.page.set(page);
    void this.showPage(page, this.loadVersion);
  }

  /** Sends the current page (as an image) and its final marks to Nano Banana. */
  protected async drawCopy(): Promise<void> {
    const sheet = this.sheet();
    const url = this.pageImage();
    const file = this.file();
    if (!sheet || !url || !file) return;
    const page = this.page();
    const pageBlob = file.type === 'application/pdf' ? await (await fetch(url)).blob() : file;
    await this.redPen.draw(sheet, this.scheme(), page, pageBlob);
  }

  protected icon(verdict: QuestionVerdict): string {
    return VERDICT_ICON[verdict];
  }

  protected verdictText(verdict: QuestionVerdict): string {
    return VERDICT_TEXT[verdict];
  }

  protected boxClass(mark: IOverlayMark): string {
    const selected = mark.questionId === this.selectedQuestionId() ? ' ring-4 ring-indigo-500/60' : '';
    switch (mark.verdict) {
      case 'correct':
        return 'border-emerald-700 bg-emerald-500/10' + selected;
      case 'partial':
        return 'border-amber-700 bg-amber-400/10' + selected;
      default:
        return 'border-rose-700 bg-rose-500/10' + selected;
    }
  }

  protected labelClass(verdict: QuestionVerdict): string {
    switch (verdict) {
      case 'correct':
        return 'bg-emerald-700';
      case 'partial':
        return 'bg-amber-700';
      default:
        return 'bg-rose-700';
    }
  }

  private async openFile(file: File | null): Promise<void> {
    const version = ++this.loadVersion;
    this.releaseAll();
    this.page.set(1);
    this.pageCount.set(1);
    this.pageImage.set(null);
    this.loadError.set(null);
    if (!file) return;

    try {
      if (file.type === 'application/pdf') {
        const doc = await this.pdf.open(file);
        if (version !== this.loadVersion) {
          await doc.loadingTask.destroy();
          return;
        }
        this.doc = doc;
        this.pageCount.set(doc.numPages);
        await this.showPage(1, version);
      } else {
        this.imageUrl = URL.createObjectURL(file);
        this.pageImage.set(this.imageUrl);
      }
    } catch {
      if (version === this.loadVersion) this.loadError.set('This file could not be opened.');
    }
  }

  private async showPage(page: number, version: number): Promise<void> {
    if (!this.doc) return;
    const url = await this.renderCached(page);
    if (version !== this.loadVersion || page !== this.page()) return;
    this.pageImage.set(url);
    // Warm up the next page so paging feels instant.
    if (page < this.pageCount()) void this.renderCached(page + 1).catch(() => undefined);
  }

  private async renderCached(page: number): Promise<string> {
    const cached = this.pageCache.get(page);
    if (cached) return cached;
    const doc = this.doc;
    if (!doc) throw new Error('No document');
    const rendered = await this.pdf.renderPage(doc, page, 1100);
    if (this.doc !== doc) {
      URL.revokeObjectURL(rendered.url);
      throw new Error('Document changed');
    }
    this.pageCache.set(page, rendered.url);
    return rendered.url;
  }

  private releaseAll(): void {
    this.pageCache.forEach((url) => URL.revokeObjectURL(url));
    this.pageCache.clear();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null;
    if (this.doc) void this.doc.loadingTask.destroy();
    this.doc = null;
  }
}
