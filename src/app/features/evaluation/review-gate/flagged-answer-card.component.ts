import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { FormField, form, max, min } from '@angular/forms/signals';
import { effectiveMarks, effectiveVerdict } from '../models/evaluation.models';
import { IReviewItem, ReviewQueueStore } from './review-queue.store';

const VERDICT: Record<string, { icon: string; text: string }> = {
  correct: { icon: '✓', text: 'Correct' },
  partial: { icon: '◐', text: 'Partly correct' },
  wrong: { icon: '✗', text: 'Wrong' },
  not_attempted: { icon: '–', text: 'Not attempted' },
};

/** One Review Gate card: the PDF page(s) with the answer boxed, what the AI decided, and approve / correct. */
@Component({
  selector: 'app-flagged-answer-card',
  imports: [FormField],
  template: `
    <article
      class="rounded-2xl border border-amber-300 bg-white dark:border-amber-800 dark:bg-slate-900"
      [attr.aria-labelledby]="'card-' + item().key"
    >
      <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 [id]="'card-' + item().key" class="text-sm font-bold text-slate-900 dark:text-white">
          {{ item().studentLabel }} · {{ item().label }}
          <span class="font-normal text-slate-600 dark:text-slate-300">· {{ item().paperTitle }}</span>
        </h3>
        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          ⚠ AI {{ (item().confidence * 100).toFixed(0) }}% sure
        </span>
      </header>

      <div class="grid grid-cols-1 gap-4 p-4 lg:grid-cols-5">
        <!-- The page(s) where the answer is -->
        <div class="space-y-2 lg:col-span-3">
          @if (browsing()) {
            <div class="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span>Gemini could not locate this answer. Browse the sheet:</span>
              <button type="button" class="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600"
                aria-label="Previous page" [disabled]="browsePage() <= 1" (click)="browsePage.set(browsePage() - 1)">◀</button>
              <span aria-live="polite">Page {{ browsePage() }} of {{ pageCount() }}</span>
              <button type="button" class="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600"
                aria-label="Next page" [disabled]="browsePage() >= pageCount()" (click)="browsePage.set(browsePage() + 1)">▶</button>
            </div>
          }
          @for (page of shownPages(); track page) {
            <figure class="rounded-lg bg-slate-100 p-2 dark:bg-slate-950">
              @if (images()[page]; as url) {
                <div class="relative">
                  <img class="block w-full rounded" [src]="url"
                    [alt]="item().studentLabel + ', page ' + page + (item().kind === 'answer' ? ', ' + item().label + ' boxed' : '')" />
                  @for (box of boxesOn(page); track $index) {
                    <span aria-hidden="true" class="absolute rounded border-2 border-amber-600 bg-amber-400/15"
                      [style.top.%]="box[0] / 10" [style.left.%]="box[1] / 10"
                      [style.height.%]="(box[2] - box[0]) / 10" [style.width.%]="(box[3] - box[1]) / 10"></span>
                  }
                </div>
              } @else if (imageErrors()[page]) {
                <p role="alert" class="p-4 text-center text-sm text-rose-800 dark:text-rose-300">Could not load page {{ page }}: {{ imageErrors()[page] }}</p>
              } @else {
                <p class="p-6 text-center text-sm text-slate-600 dark:text-slate-300">Loading page {{ page }}…</p>
              }
              <figcaption class="mt-1 text-center text-xs text-slate-600 dark:text-slate-300">Page {{ page }}</figcaption>
            </figure>
          }
        </div>

        <!-- What the AI decided, and the teacher's decision -->
        <div class="space-y-3 text-sm lg:col-span-2">
          @if (item().kind === 'handwriting') {
            <p class="text-slate-800 dark:text-slate-200">
              Gemini's overall handwriting confidence for this sheet was
              <strong>{{ (item().confidence * 100).toFixed(0) }}%</strong>. Check that the answers were read correctly
              (answers it was unsure about are listed as separate cards), then confirm.
            </p>
            <button type="button" class="w-full rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
              [disabled]="saving()" (click)="store.approveHandwriting(item())">
              {{ saving() ? 'Saving…' : 'Handwriting checked' }}
            </button>
          } @else if (result(); as r) {
            @if (question(); as q) {
              <p class="text-slate-800 dark:text-slate-200"><span class="font-semibold">Question:</span> {{ q.questionText }}</p>
            }
            <p class="text-slate-800 dark:text-slate-200"><span class="font-semibold">Student wrote (read by Gemini):</span> {{ r.studentAnswer || '— nothing found —' }}</p>
            <p class="text-slate-800 dark:text-slate-200"><span class="font-semibold">AI feedback:</span> {{ r.feedback }}</p>
            @if (r.steps.length) {
              <ul class="space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
                @for (step of r.steps; track step.stepId) {
                  <li><span class="font-mono font-semibold">{{ step.awarded }}/{{ step.max }}</span> — {{ step.reasoning }}</li>
                }
              </ul>
            }
            @if (question(); as q) {
              @if (q.type === 'mcq') {
                <p class="text-xs text-slate-700 dark:text-slate-300"><span class="font-semibold">Correct option:</span> ({{ q.correctOption }})</p>
              } @else if (q.modelAnswer) {
                <p class="text-xs text-slate-700 dark:text-slate-300"><span class="font-semibold">Model answer:</span> {{ q.modelAnswer }}</p>
              }
            }
            <p class="rounded-lg bg-slate-50 p-2 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white">
              AI mark: {{ verdict().icon }} {{ aiMarks() }} / {{ r.max }} <span class="font-normal">({{ verdict().text }})</span>
            </p>

            <button type="button" class="w-full rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
              [disabled]="saving()" (click)="store.approveAiMark(item())">
              {{ saving() ? 'Saving…' : 'Approve AI mark (' + aiMarks() + '/' + r.max + ')' }}
            </button>

            <div class="flex items-end gap-2">
              <label class="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
                Or set a different mark (0–{{ r.max }})
                <input type="number" step="0.5"
                  class="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  [formField]="markForm.marks"
                  [attr.aria-invalid]="markForm.marks().invalid()"
                  [attr.aria-describedby]="'mark-err-' + item().key" />
              </label>
              <button type="button" class="rounded-lg border border-indigo-700 px-3 py-1.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-950"
                [disabled]="saving() || markForm.marks().invalid()" (click)="saveMark()">
                Save mark
              </button>
            </div>
            <p [id]="'mark-err-' + item().key" class="text-xs text-rose-800 dark:text-rose-300">
              @if (markForm.marks().invalid()) { Enter a mark between 0 and {{ r.max }}. }
            </p>
          }
        </div>
      </div>
    </article>
  `,
})
export class FlaggedAnswerCardComponent {
  protected readonly store = inject(ReviewQueueStore);
  readonly item = input.required<IReviewItem>();

  protected readonly result = computed(() => this.store.resultFor(this.item()));
  protected readonly question = computed(() => this.store.questionFor(this.item()));
  protected readonly aiMarks = computed(() => {
    const r = this.result();
    return r ? effectiveMarks(r) : 0;
  });
  protected readonly verdict = computed(() => {
    const r = this.result();
    return VERDICT[r ? effectiveVerdict(r) : 'not_attempted'];
  });
  protected readonly saving = computed(() => this.store.savingKey() === this.item().key);
  protected readonly pageCount = computed(() => this.store.sheetFor(this.item())?.pageCount || 1);

  /** Answer not located on the sheet: let the teacher flip through the pages. */
  protected readonly browsing = computed(() => this.item().kind === 'answer' && this.item().pages.length === 0);
  protected readonly browsePage = signal(1);
  protected readonly shownPages = computed(() => (this.browsing() ? [this.browsePage()] : this.item().pages));

  protected readonly images = signal<Record<number, string>>({});
  protected readonly imageErrors = signal<Record<number, string>>({});

  private readonly markModel = linkedSignal(() => ({ marks: this.aiMarks(), max: this.result()?.max ?? 0 }));
  protected readonly markForm = form(this.markModel, (path) => {
    min(path.marks, 0);
    max(path.marks, ({ valueOf }) => valueOf(path.max));
  });

  constructor() {
    // Load each page image as it comes into view (downloaded once per sheet, cached by the store).
    effect(() => {
      const item = this.item();
      for (const page of this.shownPages()) {
        if (this.images()[page]) continue;
        this.store
          .pageImage(item, page)
          .then((url) => this.images.update((all) => ({ ...all, [page]: url })))
          .catch((e: unknown) =>
            this.imageErrors.update((all) => ({ ...all, [page]: e instanceof Error ? e.message : String(e) })),
          );
      }
    });
  }

  protected boxesOn(page: number): number[][] {
    return (this.result()?.evidence ?? []).filter((e) => e.page === page).map((e) => e.box_2d);
  }

  protected saveMark(): void {
    const { marks } = this.markModel();
    if (this.markForm.marks().invalid() || typeof marks !== 'number' || Number.isNaN(marks)) return;
    void this.store.setMark(this.item(), marks);
  }
}
