import { Component, input, output } from '@angular/core';
import { IMarkingScheme } from '../../models/evaluation.models';
import { FileDropZoneComponent } from '../file-drop-zone/file-drop-zone.component';

/** Step 1 of grading: choose an approved marking scheme, or upload a question paper for Gemini to draft one. */
@Component({
  selector: 'app-scheme-picker',
  imports: [FileDropZoneComponent],
  template: `
    <section
      aria-labelledby="scheme-heading"
      class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="scheme-heading" class="text-base font-bold text-slate-900 dark:text-white">
        1. Marking scheme
      </h2>
      <p class="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        Reuse an exam's answer key, or let Gemini draft one from the question paper.
      </p>

      @if (schemes().length) {
        <fieldset class="mt-4 space-y-2">
          <legend class="sr-only">Approved marking schemes</legend>
          @for (scheme of schemes(); track scheme.id) {
            <div class="flex flex-wrap items-center gap-2">
            <label
              class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl border p-3 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-indigo-600"
              [class]="
                scheme.id === selectedId()
                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40'
                  : 'border-slate-200 dark:border-slate-700'
              "
            >
              <input
                type="radio"
                name="scheme"
                class="mt-1 accent-indigo-700"
                [value]="scheme.id"
                [checked]="scheme.id === selectedId()"
                [disabled]="disabled()"
                (change)="selected.emit(scheme.id)"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-slate-900 dark:text-white">{{ scheme.title }}</span>
                <span class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>{{ scheme.questions.length }} questions · {{ scheme.totalMarks }} marks</span>
                  <span
                    class="rounded-full border px-2 py-0.5 font-medium"
                    [class]="
                      scheme.source === 'workflow_a_exam'
                        ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-200'
                        : 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200'
                    "
                  >
                    {{ scheme.source === 'workflow_a_exam' ? 'From Voice Copilot exam' : 'From question paper' }}
                  </span>
                </span>
              </span>
            </label>
            <button type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              [attr.aria-label]="'View answers (marking scheme) for ' + scheme.title"
              (click)="viewAnswers.emit(scheme.id)">
              View answers
            </button>
            @if (paperUrls()[scheme.id]; as url) {
              <a class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-sky-950" [href]="url" target="_blank" rel="noopener"
                  [attr.aria-label]="'View question paper ' + scheme.title + ' (opens in a new tab)'">View question paper ↗</a>
            }
            </div>
          }
        </fieldset>
      } @else if (!loading()) {
        <p class="mt-4 text-sm text-slate-600 dark:text-slate-300">No approved schemes yet.</p>
      }

      @if (pending().length) {
        <div class="mt-4">
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">Awaiting your approval</h3>
          <ul class="mt-2 space-y-2">
            @for (scheme of pending(); track scheme.id) {
              <li class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
                <span class="min-w-0">
                  <span class="block font-semibold text-slate-900 dark:text-white">{{ scheme.title }}</span>
                  <span class="text-xs text-slate-700 dark:text-slate-300">
                    Drafted by Gemini · {{ scheme.questions.length }} questions · {{ scheme.totalMarks }} marks
                  </span>
                </span>
                <span class="flex flex-wrap gap-2">
                @if (paperUrls()[scheme.id]; as url) {
                  <a class="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-sky-950" [href]="url" target="_blank" rel="noopener"
                  [attr.aria-label]="'View question paper ' + scheme.title + ' (opens in a new tab)'">View question paper ↗</a>
                }
                <button type="button"
                  class="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60"
                  [disabled]="disabled()"
                  [attr.aria-label]="'Review drafted scheme ' + scheme.title"
                  (click)="reviewPending.emit(scheme.id)">
                  Review
                </button>
                </span>
              </li>
            }
          </ul>
        </div>
      }

      <div class="mt-4">
        <app-file-drop-zone
          label="Draft a new scheme from a question paper"
          hint="Question paper as PDF · Gemini drafts answers and step marks"
          accept="application/pdf"
          [disabled]="disabled()"
          (filesSelected)="questionPaper.emit($event[0])"
        />
      </div>
    </section>
  `,
})
export class SchemePickerComponent {
  readonly schemes = input.required<IMarkingScheme[]>();
  /** Drafted schemes saved but not yet approved. */
  readonly pending = input<IMarkingScheme[]>([]);
  /** paperId → link to its question paper PDF. */
  readonly paperUrls = input<Record<string, string>>({});
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly disabled = input(false);

  readonly selected = output<string>();
  readonly questionPaper = output<File>();
  readonly reviewPending = output<string>();
  readonly viewAnswers = output<string>();
}
