import { Component, computed, input, output } from '@angular/core';
import {
  IMarkingScheme,
  ISheetEvaluation,
  QuestionVerdict,
  SheetStatus,
  effectiveMarks,
  effectiveVerdict,
  questionLabel,
} from '../../models/evaluation.models';
import { isAnswerFlagged } from '../../data/sheet-summary';

const STATUS: Record<SheetStatus, { text: string; css: string }> = {
  queued: { text: 'Queued', css: 'text-slate-700 dark:text-slate-300' },
  grading: { text: 'Grading…', css: 'text-indigo-800 dark:text-indigo-300' },
  graded: { text: 'Ready to review', css: 'text-slate-900 dark:text-white' },
  needs_review: { text: '⚠ Needs review', css: 'text-amber-800 dark:text-amber-300' },
  approved: { text: '✓ Approved', css: 'text-emerald-800 dark:text-emerald-300' },
  failed: { text: '✗ Failed', css: 'text-rose-800 dark:text-rose-300' },
};

const VERDICT: Record<QuestionVerdict, { icon: string; text: string; css: string }> = {
  correct: { icon: '✓', text: 'correct', css: 'text-emerald-800 dark:text-emerald-300' },
  partial: { icon: '◐', text: 'partly correct', css: 'text-amber-800 dark:text-amber-300' },
  wrong: { icon: '✗', text: 'wrong', css: 'text-rose-800 dark:text-rose-300' },
  not_attempted: { icon: '–', text: 'not attempted', css: 'text-slate-600 dark:text-slate-400' },
};

/** Every student's result together: score, per-question marks and flags. Rows fill in as papers finish. */
@Component({
  selector: 'app-class-results-table',
  template: `
    <section
      aria-labelledby="results-heading"
      class="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="results-heading" class="text-base font-bold text-slate-900 dark:text-white">{{ heading() }}</h2>
        <p class="text-xs text-slate-600 dark:text-slate-300">
          {{ finished() }} of {{ sheets().length }} papers graded · open a student to review and approve
        </p>
      </div>

      <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            Marks per student and per question. ✓ correct, ◐ partly correct, ✗ wrong, – not attempted.
          </caption>
          <thead class="bg-slate-50 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <tr>
              <th scope="col" class="sticky left-0 bg-slate-50 px-3 py-2 dark:bg-slate-800">Student</th>
              <th scope="col" class="px-3 py-2">Status</th>
              <th scope="col" class="px-3 py-2 text-right">Score</th>
              <th scope="col" class="px-3 py-2 text-right">Review</th>
              @for (q of scheme()?.questions ?? []; track q.id) {
                <th scope="col" class="whitespace-nowrap px-2 py-2 text-center font-mono" [title]="q.questionText">
                  {{ label(q.id) }}
                  <span class="block font-normal text-slate-600 dark:text-slate-400">/{{ q.maxMarks }}</span>
                </th>
              }
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (sheet of sheets(); track sheet.submissionId) {
              @let results = resultsBy(sheet);
              <tr
                [class]="(sheet.submissionId === activeId() ? 'bg-indigo-50/60 dark:bg-indigo-950/30 ' : '') + (sheet.status === 'queued' ? '' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60')"
                (click)="sheet.status !== 'queued' && open.emit(sheet.submissionId)"
              >
                <th scope="row" class="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-semibold text-slate-900 dark:bg-slate-900 dark:text-white">
                  <!-- The row is clickable with a mouse; this button is the keyboard / screen-reader way in. -->
                  <button
                    type="button"
                    class="rounded px-1 text-left font-semibold text-indigo-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:text-slate-500 disabled:no-underline dark:text-indigo-300"
                    [disabled]="sheet.status === 'queued'"
                    [attr.aria-label]="'Review ' + sheet.studentLabel"
                    (click)="$event.stopPropagation(); open.emit(sheet.submissionId)"
                  >
                    {{ sheet.studentLabel }}
                  </button>
                </th>
                <td class="whitespace-nowrap px-3 py-2 text-xs font-semibold" [class]="statusOf(sheet.status).css">
                  {{ statusOf(sheet.status).text }}
                  @if (sheet.status === 'failed' && sheet.error) {
                    <span class="block max-w-56 truncate font-normal" [title]="sheet.error">{{ sheet.error }}</span>
                  }
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                  @if (sheet.questions.length) {
                    {{ sheet.totalAwarded }}/{{ sheet.totalMax }}
                    <span class="block text-xs font-normal text-slate-600 dark:text-slate-300">{{ percent(sheet) }}%</span>
                  } @else {
                    —
                  }
                </td>
                <td class="px-3 py-2 text-right text-xs text-slate-800 dark:text-slate-200">
                  {{ sheet.questions.length ? flagged(sheet) : '—' }}
                </td>
                @for (q of scheme()?.questions ?? []; track q.id) {
                  @let r = results.get(q.id);
                  <td class="whitespace-nowrap px-2 py-2 text-center font-mono text-xs">
                    @if (r) {
                      <span [class]="verdict(r).css" [title]="label(q.id) + ': ' + verdict(r).text">
                        <span aria-hidden="true">{{ verdict(r).icon }}</span>
                        {{ marks(r) }}
                        <span class="sr-only">{{ verdict(r).text }}</span>
                      </span>
                      @if (r.teacherOverride !== undefined) {
                        <span class="block text-[10px] text-indigo-800 dark:text-indigo-300">edited</span>
                      } @else if (flaggedAnswer(r)) {
                        <span class="block text-[10px] text-amber-800 dark:text-amber-300">⚠ check</span>
                      }
                    } @else {
                      <span class="text-slate-400" aria-hidden="true">·</span>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class ClassResultsTableComponent {
  readonly heading = input('Class results');
  readonly sheets = input.required<ISheetEvaluation[]>();
  readonly scheme = input<IMarkingScheme | null>(null);
  readonly activeId = input<string | null>(null);

  readonly open = output<string>();

  protected readonly flaggedAnswer = isAnswerFlagged;
  protected readonly finished = computed(
    () => this.sheets().filter((s) => !['queued', 'grading'].includes(s.status)).length,
  );
  private readonly questionsById = computed(() => new Map(this.scheme()?.questions.map((q) => [q.id, q]) ?? []));

  protected label(id: string): string {
    return questionLabel(this.questionsById().get(id), id);
  }

  protected resultsBy(sheet: ISheetEvaluation) {
    return new Map(sheet.questions.map((q) => [q.questionId, q]));
  }

  protected statusOf(status: SheetStatus) {
    return STATUS[status];
  }

  protected verdict(r: Parameters<typeof effectiveVerdict>[0]) {
    return VERDICT[effectiveVerdict(r)];
  }

  protected marks(r: Parameters<typeof effectiveMarks>[0]): number {
    return effectiveMarks(r);
  }

  protected percent(sheet: ISheetEvaluation): number {
    return sheet.totalMax ? Math.round((sheet.totalAwarded / sheet.totalMax) * 100) : 0;
  }

  protected flagged(sheet: ISheetEvaluation): string {
    const n = sheet.questions.filter(isAnswerFlagged).length;
    return n ? `⚠ ${n}` : '—';
  }
}
