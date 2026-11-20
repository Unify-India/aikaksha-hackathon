import { Component, input, output } from '@angular/core';
import { IMarkingScheme } from '../../models/evaluation.models';

/** Shows a Gemini-drafted marking scheme so the teacher can check it before it is used for grading. */
@Component({
  selector: 'app-scheme-review',
  template: `
    <section
      aria-labelledby="draft-heading"
      class="lift rounded-lg border p-5"
      [class]="readOnly() ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900' : 'border-indigo-300 bg-white dark:border-indigo-700 dark:bg-slate-900'"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="draft-heading" class="text-base font-bold text-slate-900 dark:text-white">
            {{ readOnly() ? 'Marking scheme (approved)' : 'Check the drafted marking scheme' }}
          </h2>
          <p class="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
            {{ scheme().title }} · {{ scheme().questions.length }} questions · {{ scheme().totalMarks }} marks.
            {{ readOnly() ? 'Answers drafted by Gemini and approved by the teacher; grading uses these.' : 'Gemini wrote these answers — check them before grading.' }}
          </p>
          @if (!readOnly()) {
            <p id="draft-back-hint" class="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              Going back keeps this draft under “Awaiting your approval”, so you can review it later.
            </p>
          }
          @if (questionPaperUrl(); as url) {
            <p class="mt-2">
              <a class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-sky-950" [href]="url" target="_blank" rel="noopener"
                  [attr.aria-label]="'View question paper ' + scheme().title + ' (opens in a new tab)'">View question paper ↗</a>
            </p>
          }
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            [disabled]="busy()"
            [attr.aria-describedby]="readOnly() ? null : 'draft-back-hint'"
            (click)="discard.emit()"
          >
            ← Back to schemes
          </button>
          @if (!readOnly()) {
          <button
            type="button"
            class="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
            [disabled]="busy()"
            (click)="approve.emit(scheme())"
          >
            {{ busy() ? 'Approving…' : 'Approve scheme' }}
          </button>
          }
        </div>
      </div>

      <ol class="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
        @for (q of scheme().questions; track q.id) {
          <li class="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <div class="flex items-start justify-between gap-3">
              <p class="text-slate-900 dark:text-white">
                <span class="font-bold">{{ q.section ? 'Section ' + q.section + ' · ' : '' }}Q{{ q.number }}.</span>
                {{ q.questionText }}
              </p>
              <span class="shrink-0 font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                {{ q.maxMarks }} {{ q.maxMarks === 1 ? 'mark' : 'marks' }}
              </span>
            </div>
            @if (q.type === 'mcq') {
              <p class="mt-1 text-xs text-slate-700 dark:text-slate-300">
                Correct option: <strong>({{ q.correctOption }})</strong>
              </p>
            } @else {
              <p class="mt-1 text-xs text-slate-700 dark:text-slate-300">{{ q.modelAnswer }}</p>
              <ul class="mt-1.5 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
                @for (step of q.steps; track step.id) {
                  <li>• {{ step.description }} — {{ step.marks }}</li>
                }
              </ul>
            }
          </li>
        }
      </ol>
    </section>
  `,
})
export class SchemeReviewComponent {
  readonly scheme = input.required<IMarkingScheme>();
  readonly busy = input(false);
  /** Show an approved scheme without the Approve button. */
  readonly readOnly = input(false);
  /** Link to the uploaded question paper PDF, to compare with the drafted answers. */
  readonly questionPaperUrl = input<string | null>(null);

  readonly approve = output<IMarkingScheme>();
  readonly discard = output<void>();
}
