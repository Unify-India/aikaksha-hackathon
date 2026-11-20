import { Component, inject } from '@angular/core';
import { FlaggedAnswerCardComponent } from './flagged-answer-card.component';
import { ReviewQueueStore } from './review-queue.store';

/**
 * Review Gate: every graded answer the AI was less than 90% sure about, with the exact PDF page,
 * for the teacher to accept or correct. Final sign-off of a whole sheet stays in the Evaluation Cockpit.
 */
@Component({
  selector: 'app-answer-review-gate',
  imports: [FlaggedAnswerCardComponent],
  template: `
    <div class="space-y-8">
      <section
        class="hero-surface relative overflow-hidden rounded-2xl p-6 text-white shadow-xl shadow-indigo-900/25 md:p-8"
        aria-labelledby="gate-title"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.18]"
          style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 22px 22px;"
          aria-hidden="true"
        ></div>

        <div class="relative flex flex-wrap items-end justify-between gap-4">
          <div class="max-w-xl">
            <h1 id="gate-title" class="text-3xl md:text-4xl">Review gate</h1>
            <p class="mt-3 max-w-lg text-sm leading-relaxed text-indigo-100">
              Answers the AI was less than 90% sure about. Check each one against the student's page, then approve or correct the mark.
            </p>
          </div>
          <button type="button"
            class="min-h-11 cursor-pointer rounded-md border border-white/50 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            [disabled]="store.loading()" (click)="store.load()">
            {{ store.loading() ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </section>

      <div class="flex flex-wrap items-end justify-between gap-3">
        <p class="text-sm font-semibold text-slate-900 dark:text-white" aria-live="polite">
          @if (store.loading()) {
            Loading answers that need a check…
          } @else {
            {{ store.visibleItems().length }} {{ store.visibleItems().length === 1 ? 'item needs' : 'items need' }} your check
          }
        </p>
        @if (store.papersWithItems().length > 1) {
          <label class="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Question paper
            <select class="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              [value]="store.paperFilter()" (change)="store.paperFilter.set($any($event.target).value)">
              <option value="all">All question papers</option>
              @for (paper of store.papersWithItems(); track paper.id) {
                <option [value]="paper.id">{{ paper.title }}</option>
              }
            </select>
          </label>
        }
      </div>

      @if (store.error(); as error) {
        <p role="alert" class="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">⚠ {{ error }}</p>
      }


      @if (!store.loading() && store.visibleItems().length === 0 && !store.error()) {
        <div class="rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-center text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          ✓ Nothing to review. Every graded answer is above 90% AI confidence or already checked by a teacher.
        </div>
      }

      <div class="space-y-4">
        @for (item of store.visibleItems(); track item.key) {
          <app-flagged-answer-card [item]="item" />
        }
      </div>
    </div>
  `,
})
export class AnswerReviewGateComponent {
  protected readonly store = inject(ReviewQueueStore);

  constructor() {
    void this.store.load();
  }
}
