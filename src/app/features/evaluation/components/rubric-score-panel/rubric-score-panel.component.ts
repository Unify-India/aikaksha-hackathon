import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FieldTree, FormField, applyEach, form, max, min, readonly } from '@angular/forms/signals';
import { isAnswerFlagged } from '../../data/sheet-summary';
import {
  IMarkingScheme,
  IMarkingSchemeQuestion,
  IQuestionResult,
  ISheetEvaluation,
  QuestionVerdict,
  effectiveMarks,
  effectiveVerdict,
  questionLabel,
} from '../../models/evaluation.models';

interface IMarkRow {
  questionId: string;
  max: number;
  marks: number;
}

const VERDICT_LABEL: Record<QuestionVerdict, { icon: string; text: string; css: string }> = {
  correct: { icon: '✓', text: 'Correct', css: 'text-emerald-800 dark:text-emerald-300' },
  partial: { icon: '◐', text: 'Partly correct', css: 'text-amber-800 dark:text-amber-300' },
  wrong: { icon: '✗', text: 'Wrong', css: 'text-rose-800 dark:text-rose-300' },
  not_attempted: { icon: '–', text: 'Not attempted', css: 'text-slate-700 dark:text-slate-300' },
};

/** Per-question marks with the AI's reasoning and Signal-Forms teacher overrides. */
@Component({
  selector: 'app-rubric-score-panel',
  imports: [FormField],
  template: `
    <section
      aria-labelledby="marks-heading"
      class="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <h2 id="marks-heading" class="text-base font-bold text-slate-900 dark:text-white">
          Marks by question
          <span class="ml-1 rounded-lg bg-indigo-50 px-2 py-0.5 font-mono text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
            {{ total() }} / {{ sheet()?.totalMax ?? 0 }}
          </span>
        </h2>
        <div class="flex items-center gap-3 text-xs">
          <label class="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
            <input type="checkbox" class="accent-indigo-700" [checked]="onlyFlagged()" (change)="onlyFlagged.set(!onlyFlagged())" />
            Only needs review ({{ flaggedCount() }})
          </label>
          <button type="button"
            class="rounded px-2 py-1 font-semibold text-indigo-800 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:text-indigo-300"
            [disabled]="overrideCount() === 0 || readOnly()"
            (click)="resetRequested.emit()">
            Undo all overrides
          </button>
        </div>
      </div>

      @if (!sheet()?.questions?.length) {
        <p class="mt-4 text-sm text-slate-600 dark:text-slate-300">
          @switch (sheet()?.status) {
            @case ('grading') { Gemini is grading this sheet — usually 30–90 seconds. Progress is shown under “Agent activity”. }
            @case ('queued') { Waiting for the sheets before it to finish grading. }
            @case ('failed') { Grading failed for this sheet. Use “Retry grading” above to grade it again. }
            @default { Marks appear here once this sheet is graded. }
          }
        </p>
      }

      <ul class="mt-3 flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-[640px]">
        @for (row of marksForm.questions; track $index) {
          @let result = resultFor(row().value().questionId);
          @let question = questionFor(row().value().questionId);
          @if (result && (!onlyFlagged() || isFlagged(result))) {
            @let open = result.questionId === selectedQuestionId();
            @let verdict = verdictLabel(effectiveVerdict(result));
            @let label = questionLabel(question, result.questionId);
            <li
              class="rounded-lg border text-sm"
              [class]="open ? 'border-indigo-500 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/30' : isFlagged(result) ? 'border-amber-400 dark:border-amber-700' : 'border-slate-200 dark:border-slate-700'"
            >
              <div class="flex items-center gap-2 p-2.5">
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-indigo-600"
                  [attr.aria-expanded]="open"
                  [attr.aria-controls]="'q-detail-' + result.questionId"
                  (click)="questionSelected.emit(result.questionId)"
                >
                  <span class="font-mono text-xs font-bold text-slate-900 dark:text-white">{{ label }}</span>
                  <span class="text-xs font-semibold" [class]="verdict.css">
                    <span aria-hidden="true">{{ verdict.icon }}</span> {{ verdict.text }}
                  </span>
                  @if (isFlagged(result)) {
                    <span class="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      ⚠ {{ (result.confidence * 100).toFixed(0) }}% sure
                    </span>
                  }
                  @if (result.teacherOverride !== undefined) {
                    <span class="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
                      Teacher override (AI: {{ result.awarded }})
                    </span>
                  }
                </button>

                <label class="flex items-center gap-1 text-xs text-slate-800 dark:text-slate-200">
                  <span class="sr-only">Marks for {{ label }}, out of {{ result.max }}</span>
                  <input
                    type="number"
                    step="0.5"
                    class="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right font-mono font-bold text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 aria-invalid:border-rose-600 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    [formField]="row.marks"
                    [attr.aria-invalid]="row.marks().invalid()"
                    [attr.aria-describedby]="'q-err-' + result.questionId"
                    (change)="commit(row)"
                  />
                  <span aria-hidden="true">/ {{ result.max }}</span>
                </label>
                @if (result.teacherOverride !== undefined && !readOnly()) {
                  <button type="button"
                    class="rounded px-1.5 py-1 text-xs font-semibold text-indigo-800 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-indigo-300"
                    [attr.aria-label]="'Undo override for ' + label"
                    (click)="overrideChanged.emit({ questionId: result.questionId, marks: null })">
                    Undo
                  </button>
                }
              </div>
              <p [id]="'q-err-' + result.questionId" class="px-2.5 text-xs text-rose-800 dark:text-rose-300">
                @if (row.marks().invalid()) {
                  Enter a mark between 0 and {{ result.max }}.
                }
              </p>

              @if (open) {
                <div [id]="'q-detail-' + result.questionId" class="space-y-2 border-t border-slate-200 p-3 text-xs text-slate-800 dark:border-slate-700 dark:text-slate-200">
                  @if (question) {
                    <p><span class="font-semibold">Question:</span> {{ question.questionText }}</p>
                  }
                  <p>
                    <span class="font-semibold">Student wrote (read by Gemini):</span>
                    {{ result.studentAnswer || '— nothing found —' }}
                  </p>
                  <p><span class="font-semibold">Feedback:</span> {{ result.feedback }}</p>
                  @if (result.steps.length) {
                    <ul class="space-y-1">
                      @for (step of result.steps; track step.stepId) {
                        <li class="flex gap-2">
                          <span class="font-mono font-semibold">{{ step.awarded }}/{{ step.max }}</span>
                          <span>{{ stepDescription(question, step.stepId) }} — {{ step.reasoning }}</span>
                        </li>
                      }
                    </ul>
                  }
                  @if (question?.type === 'mcq') {
                    <p><span class="font-semibold">Correct option:</span> ({{ question?.correctOption }})</p>
                  } @else if (question?.modelAnswer) {
                    <p><span class="font-semibold">Model answer:</span> {{ question?.modelAnswer }}</p>
                  }
                  <p class="text-slate-600 dark:text-slate-300">AI confidence {{ (result.confidence * 100).toFixed(0) }}%</p>
                </div>
              }
            </li>
          }
        }
      </ul>
    </section>
  `,
})
export class RubricScorePanelComponent {
  readonly sheet = input<ISheetEvaluation | null>(null);
  readonly scheme = input<IMarkingScheme | null>(null);
  readonly selectedQuestionId = input<string | null>(null);
  readonly readOnly = input(false);

  readonly overrideChanged = output<{ questionId: string; marks: number | null }>();
  readonly questionSelected = output<string>();
  readonly resetRequested = output<void>();

  protected readonly onlyFlagged = signal(false);

  /** Form model, re-derived whenever the sheet changes (e.g. after an override is saved). */
  private readonly marksModel = linkedSignal<{ questions: IMarkRow[] }>(() => ({
    questions: (this.sheet()?.questions ?? []).map((q) => ({
      questionId: q.questionId,
      max: q.max,
      marks: effectiveMarks(q),
    })),
  }));

  protected readonly marksForm = form(this.marksModel, (path) => {
    applyEach(path.questions, (row) => {
      min(row.marks, 0);
      max(row.marks, ({ valueOf }) => valueOf(row.max));
      readonly(row.marks, { when: () => this.readOnly() });
    });
  });

  private readonly results = computed(
    () => new Map((this.sheet()?.questions ?? []).map((q) => [q.questionId, q])),
  );
  private readonly questions = computed(
    () => new Map((this.scheme()?.questions ?? []).map((q) => [q.id, q])),
  );

  protected readonly total = computed(() => this.sheet()?.totalAwarded ?? 0);
  protected readonly overrideCount = computed(
    () => this.sheet()?.questions.filter((q) => q.teacherOverride !== undefined).length ?? 0,
  );
  protected readonly flaggedCount = computed(
    () => this.sheet()?.questions.filter((q) => this.isFlagged(q)).length ?? 0,
  );

  protected resultFor(id: string): IQuestionResult | undefined {
    return this.results().get(id);
  }

  protected questionFor(id: string): IMarkingSchemeQuestion | undefined {
    return this.questions().get(id);
  }

  protected isFlagged(result: IQuestionResult): boolean {
    return isAnswerFlagged(result);
  }

  protected verdictLabel(verdict: QuestionVerdict) {
    return VERDICT_LABEL[verdict];
  }

  protected readonly effectiveVerdict = effectiveVerdict;
  protected readonly questionLabel = questionLabel;

  protected stepDescription(question: IMarkingSchemeQuestion | undefined, stepId: string): string {
    return question?.steps.find((s) => s.id === stepId)?.description ?? stepId;
  }

  /** Sends a valid edited mark to the store; invalid values stay in the box with an error message. */
  protected commit(row: FieldTree<IMarkRow>): void {
    if (row.marks().invalid()) return;
    const { questionId, marks } = row().value();
    if (typeof marks !== 'number' || Number.isNaN(marks)) return;
    this.overrideChanged.emit({ questionId, marks });
  }
}
