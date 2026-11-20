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
    <div class="space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-slate-900 dark:text-white">Review Gate</h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Answers the AI was less than 90% sure about. Check each one against the student's page, then approve or correct the mark.
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          @if (store.papersWithItems().length > 1) {
            <label class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Question paper
              <select class="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                [value]="store.paperFilter()" (change)="store.paperFilter.set($any($event.target).value)">
                <option value="all">All question papers</option>
                @for (paper of store.papersWithItems(); track paper.id) {
                  <option [value]="paper.id">{{ paper.title }}</option>
                }
              </select>
            </label>
          }
          <button type="button"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            [disabled]="store.loading()" (click)="store.load()">
            {{ store.loading() ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </header>

      @if (store.error(); as error) {
        <p role="alert" class="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">⚠ {{ error }}</p>
      }

      <p class="text-sm font-semibold text-slate-900 dark:text-white" aria-live="polite">
        @if (store.loading()) {
          Loading answers that need a check…
        } @else {
          {{ store.visibleItems().length }} {{ store.visibleItems().length === 1 ? 'item needs' : 'items need' }} your check
        }
      </p>

      @if (!store.loading() && store.visibleItems().length === 0 && !store.error()) {
        <div class="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
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
