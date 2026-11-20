import { Component, computed, input } from '@angular/core';
import { KatexPipe } from '../../../shared/pipes/katex.pipe';
import { IStudioQuestion } from '../../../shared/models/exam-read.model';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** One question, rendered read-only with KaTeX; correct option marked with an icon and text, not colour alone. */
@Component({
  selector: 'app-question-card',
  imports: [KatexPipe],
  template: `
    <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" [attr.aria-labelledby]="'q-' + question().id">
      <header class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <h3 [id]="'q-' + question().id" class="mr-1 text-sm font-bold text-slate-900 dark:text-white">Question {{ index() + 1 }}</h3>
        <span class="rounded bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">{{ question().type }}</span>
        <span class="rounded bg-slate-100 px-1.5 py-0.5 capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">{{ question().difficulty }}</span>
        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          +{{ question().marks }}@if (question().negativeMarks) { / −{{ question().negativeMarks }} }
        </span>
        @if (question().subtopic) {
          <span class="text-slate-600 dark:text-slate-400">{{ question().subtopic }}</span>
        }
      </header>

      <div class="text-base leading-relaxed text-slate-900 dark:text-slate-100" [innerHTML]="question().text | katex"></div>

      @if (question().options.length) {
        <ol class="mt-4 grid gap-2 sm:grid-cols-2" [attr.aria-label]="'Options for question ' + (index() + 1)">
          @for (option of question().options; track option.id; let i = $index) {
            <li
              [class]="option.id === question().correctOptionId
                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                : 'border-slate-200 dark:border-slate-700'"
              class="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200"
            >
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300" aria-hidden="true">{{ letter(i) }}</span>
              <span class="sr-only">Option {{ letter(i) }}:</span>
              <span class="min-w-0 flex-1" [innerHTML]="option.text | katex"></span>
              @if (option.id === question().correctOptionId) {
                <span class="shrink-0 text-xs font-semibold text-emerald-800 dark:text-emerald-300"><span aria-hidden="true">✓ </span>Correct</span>
              }
            </li>
          }
        </ol>
      }

      @if (question().answer) {
        <p class="mt-4 text-sm text-slate-800 dark:text-slate-200"><span class="font-semibold">Answer:&nbsp;</span><span [innerHTML]="question().answer! | katex"></span></p>
      }

      @if (question().explanation) {
        <details class="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
          <summary class="cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold text-amber-950 focus-visible:outline-2 focus-visible:outline-amber-600 dark:text-amber-200">Solution</summary>
          <div class="px-4 pb-4 text-sm leading-relaxed text-amber-950 dark:text-amber-100" [innerHTML]="question().explanation! | katex"></div>
        </details>
      }
      @if (missingKey()) {
        <p class="mt-3 text-xs text-slate-600 dark:text-slate-400">No answer key found for this question.</p>
      }
    </article>
  `,
})
export class QuestionCardComponent {
  readonly question = input.required<IStudioQuestion>();
  readonly index = input(0);

  protected readonly missingKey = computed(() => !this.question().correctOptionId && !this.question().answer && !this.question().explanation);

  protected letter(i: number): string {
    return LETTERS[i] ?? String(i + 1);
  }
}
