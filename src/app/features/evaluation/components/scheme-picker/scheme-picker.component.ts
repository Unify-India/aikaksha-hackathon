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
            <label
              class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-indigo-600"
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
          }
        </fieldset>
      } @else if (!loading()) {
        <p class="mt-4 text-sm text-slate-600 dark:text-slate-300">No approved schemes yet.</p>
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
  readonly selectedId = input<string | null>(null);
  readonly loading = input(false);
  readonly disabled = input(false);

  readonly selected = output<string>();
  readonly questionPaper = output<File>();
}
