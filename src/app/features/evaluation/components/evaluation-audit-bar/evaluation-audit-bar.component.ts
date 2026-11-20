import { Component, computed, input, output } from '@angular/core';
import { ISheetEvaluation } from '../../models/evaluation.models';

/** Header for the open sheet: who, score, confidence, integrity, and the human approval gate. */
@Component({
  selector: 'app-evaluation-audit-bar',
  template: `
    @if (sheet(); as sheet) {
      <section
        aria-label="Sheet summary and approval"
        class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              {{ sheet.studentLabel }}
              <span class="text-sm font-normal text-slate-600 dark:text-slate-300">
                · sheet {{ index() + 1 }} of {{ total() }} · {{ sheet.pageCount }} {{ sheet.pageCount === 1 ? 'page' : 'pages' }}
              </span>
              @if (sheet.status === 'approved') {
                <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">✓ Approved</span>
              } @else if (sheet.needsReview) {
                <span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">⚠ Needs review</span>
              }
            </p>
            @if (sheet.status === 'failed') {
              <div class="mt-1 flex flex-wrap items-center gap-3">
                <p role="alert" class="text-sm text-rose-800 dark:text-rose-300">✗ Grading failed: {{ sheet.error }}</p>
                <button type="button"
                  class="rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
                  [disabled]="retrying()" (click)="retry.emit()">
                  {{ retrying() ? 'Retrying…' : 'Retry grading' }}
                </button>
              </div>
            }
            @if (sheet.checksum) {
              <p class="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300">
                SHA-256 {{ sheet.checksum.slice(0, 24) }}… · original file unchanged
              </p>
            }
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="rounded-xl border border-slate-200 px-3.5 py-2 text-center dark:border-slate-700">
              <span class="block text-[11px] text-slate-600 dark:text-slate-300">Score</span>
              <span class="font-mono text-sm font-bold text-slate-900 dark:text-white">{{ sheet.totalAwarded }} / {{ sheet.totalMax }}</span>
            </div>
            <div class="rounded-xl border border-slate-200 px-3.5 py-2 text-center dark:border-slate-700">
              <span class="block text-[11px] text-slate-600 dark:text-slate-300">Handwriting read</span>
              <span class="font-mono text-sm font-bold text-slate-900 dark:text-white">{{ (sheet.ocrConfidence * 100).toFixed(0) }}%</span>
            </div>
            <div class="rounded-xl border border-slate-200 px-3.5 py-2 text-center dark:border-slate-700">
              <span class="block text-[11px] text-slate-600 dark:text-slate-300">Overrides</span>
              <span class="font-mono text-sm font-bold text-slate-900 dark:text-white">{{ overrides() }}</span>
            </div>

            <div class="flex items-center gap-2">
              <button type="button"
                class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                [disabled]="index() === 0" (click)="previous.emit()">
                Previous
              </button>
              <button type="button"
                class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
                [disabled]="index() >= total() - 1" (click)="next.emit()">
                Next
              </button>
              <button type="button"
                class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                [disabled]="!canApprove()" (click)="approve.emit()">
                {{ busy() ? 'Saving…' : sheet.status === 'approved' ? 'Approved' : 'Approve & next' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    }
  `,
})
export class EvaluationAuditBarComponent {
  readonly sheet = input<ISheetEvaluation | null>(null);
  readonly index = input(0);
  readonly total = input(0);
  readonly busy = input(false);
  readonly retrying = input(false);

  readonly previous = output<void>();
  readonly next = output<void>();
  readonly approve = output<void>();
  readonly retry = output<void>();

  protected readonly overrides = computed(
    () => this.sheet()?.questions.filter((q) => q.teacherOverride !== undefined).length ?? 0,
  );
  protected readonly canApprove = computed(() => {
    const sheet = this.sheet();
    return !!sheet && !this.busy() && ['graded', 'needs_review'].includes(sheet.status);
  });
}
