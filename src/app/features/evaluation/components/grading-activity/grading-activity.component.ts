import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { IActivityEntry } from '../../data/evaluation.store';

/** Live log of the grading tool chain (draft_marking_scheme → grade_answer_sheet → flag_for_review). */
@Component({
  selector: 'app-grading-activity',
  template: `
    <section
      aria-labelledby="activity-heading"
      class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="activity-heading" class="text-base font-bold text-slate-900 dark:text-white">Agent activity</h2>
      @if (entries().length === 0) {
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Tool calls will appear here as they run.</p>
      }
      <ol aria-live="polite" class="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
        @for (entry of entries(); track entry.id) {
          <li class="flex items-start gap-2.5 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
            <span aria-hidden="true" class="mt-0.5 w-4 shrink-0 text-center">
              @switch (entry.status) {
                @case ('running') { <span class="inline-block motion-safe:animate-spin">◌</span> }
                @case ('done') { ✓ }
                @case ('failed') { ✗ }
              }
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-baseline justify-between gap-x-2">
                <span class="font-semibold text-slate-900 dark:text-white">
                  {{ entry.label }}
                  <span class="sr-only">— {{ statusText(entry) }}</span>
                </span>
                <code class="text-[11px] text-slate-600 dark:text-slate-300">{{ entry.tool }}()</code>
              </span>
              @if (entry.status === 'running') {
                <!-- Not announced every second: the live region only reports the start and the result. -->
                <span class="block text-xs text-slate-600 dark:text-slate-300" aria-hidden="true">
                  Working… {{ elapsed(entry) }} s{{ entry.tool === 'grade_answer_sheet' ? ' (usually 30–90 s)' : entry.tool === 'draft_marking_scheme' ? ' (can take 1–3 min)' : '' }}
                </span>
              } @else if (entry.detail) {
                <span
                  class="block text-xs"
                  [class]="entry.status === 'failed' ? 'text-rose-800 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'"
                >
                  {{ entry.detail }}
                  @if (entry.durationMs !== undefined) {
                    · {{ (entry.durationMs / 1000).toFixed(1) }} s
                  }
                </span>
              }
            </span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class GradingActivityComponent {
  readonly entries = input.required<IActivityEntry[]>();

  /** Ticks once a second while something is running, so elapsed times update. */
  private readonly now = signal(Date.now());
  private readonly anyRunning = computed(() => this.entries().some((e) => e.status === 'running'));

  constructor() {
    let timer: ReturnType<typeof setInterval> | undefined;
    effect(() => {
      clearInterval(timer);
      timer = this.anyRunning() ? setInterval(() => this.now.set(Date.now()), 1000) : undefined;
    });
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected elapsed(entry: IActivityEntry): number {
    return Math.max(0, Math.round((this.now() - entry.startedAt) / 1000));
  }

  protected statusText(entry: IActivityEntry): string {
    return entry.status === 'running' ? 'in progress' : entry.status === 'done' ? 'done' : 'failed';
  }
}
