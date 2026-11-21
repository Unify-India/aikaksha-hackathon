import { Component, computed, input, output } from '@angular/core';
import { QUESTION_GEN_KEYS } from '../data/gemini-keys';
import { RouterLink } from '@angular/router';
import { IExamIntakeResult } from '../../../shared/models/exam-creation.model';
import { ICreationState } from '../data/exam-intake.store';
import { IDraftEvaluation, spokenDate } from '../data/exam-params.rules';
import { TEACHER_BATCHES } from '../data/teacher-context';

interface IRow {
  label: string;
  value: string;
  defaulted: boolean;
}

/** Read-back of the collected parameters: a confirm step while live, the final JSON once done. */
@Component({
  selector: 'app-exam-params-card',
  imports: [RouterLink],
  template: `
    <section
      class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      [attr.aria-label]="result() ? 'Exam details' : 'Confirm exam parameters'"
    >
      <header class="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-base font-bold text-slate-900 dark:text-white">
          @if (result()) {
            Exam details
          } @else {
            Please confirm these details
          }
        </h3>
        <span class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          {{ evaluation().generation.intent === 'AUTO_DPP' ? 'Daily Practice Problems' : 'Exam' }}
        </span>
      </header>

      <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        @for (row of rows(); track row.label) {
          <div class="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 dark:border-slate-800">
            <dt class="shrink-0 text-slate-600 dark:text-slate-400">{{ row.label }}</dt>
            <dd class="text-right font-medium text-slate-900 dark:text-slate-100">
              {{ row.value }}
              @if (row.defaulted) {
                <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-700 dark:bg-slate-800 dark:text-slate-300">default</span>
              }
            </dd>
          </div>
        }
      </dl>

      @if (result()) {
        <div class="mt-4" role="status" aria-live="polite">
          @switch (creation().phase) {
            @case ('generating') {
              <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
                Generating questions… {{ creation().progress?.done ?? 0 }} of {{ creation().progress?.total ?? '?' }}
              </p>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                <div class="h-full rounded-full bg-indigo-600 transition-[width] duration-500" [style.width.%]="progressPercent()"></div>
              </div>
            }
            @case ('saving') {
              <p class="text-sm font-medium text-slate-800 dark:text-slate-200">Creating the exam on the server…</p>
            }
            @case ('created') {
              @if (creation().exam; as exam) {
                <div class="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                  <p class="flex items-center gap-2 font-semibold">
            <svg aria-hidden="true" class="h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Exam created as {{ exam.status }}
          </p>
                  <p class="mt-1">{{ exam.totalQuestions }} questions · {{ exam.totalMarks }} marks · ID <span class="font-mono">{{ exam.examId }}</span></p>
                  <p class="mt-1 break-all">Student link: <a class="font-medium underline underline-offset-2" [href]="exam.studentUrl" target="_blank" rel="noopener">{{ exam.studentUrl }}</a></p>
                </div>
                <a
                  [routerLink]="['/exam-studio', exam.examId]"
                  class="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                >
                  Open in Exam Studio <span aria-hidden="true">→</span>
                </a>
              }
            }
            @case ('failed') {
              <div class="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100" role="alert">
                <p class="font-semibold">The exam was not created</p>
                <p class="mt-1">{{ creation().error }}</p>
                @if (!readonly()) {
                  <button
                    type="button"
                    (click)="retry.emit()"
                    class="mt-3 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                  >
                    Retry
                  </button>
                }
                @if (!readonly() && creation().quotaExceeded) {
                  <div class="mt-4 border-t border-rose-200 pt-3 dark:border-rose-800">
                    <p id="switch-key-label" class="font-semibold">Gemini quota reached. Generate the questions with another key (you can also change it any time under the chat box):</p>
                    <div class="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="switch-key-label">
                      @for (key of keys; track key.id) {
                        <button
                          type="button"
                          (click)="retryWithKey.emit(key.id)"
                          class="rounded-lg border border-rose-700 bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:border-rose-500 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-950"
                        >
                          Use {{ key.label }}'s key
                          @if (creation().keyLabel === key.label) {
                            <span class="font-normal">(just tried)</span>
                          }
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>
      } @else if (!readonly()) {
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            (click)="confirm.emit()"
            class="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Looks good, confirm
          </button>
          <span class="text-sm text-slate-600 dark:text-slate-400">or just say “yes”, or tell me what to change.</span>
        </div>
      }
    </section>
  `,
})
export class ExamParamsCardComponent {
  readonly evaluation = input.required<IDraftEvaluation>();
  readonly result = input<IExamIntakeResult | null>(null);
  readonly readonly = input(false);
  readonly creation = input<ICreationState>({ phase: 'idle' });
  readonly confirm = output<void>();
  readonly retry = output<void>();
  /** Retry question generation with the key of this id (from QUESTION_GEN_KEYS). */
  readonly retryWithKey = output<string>();
  protected readonly keys = QUESTION_GEN_KEYS;

  protected readonly progressPercent = computed(() => {
    const p = this.creation().progress;
    return p && p.total ? Math.round((p.done / p.total) * 100) : 0;
  });

  protected readonly rows = computed<IRow[]>(() => {
    const ev = this.evaluation();
    const p = this.result()?.examParams ?? ev.examParams;
    const g = this.result()?.generation ?? ev.generation;
    const d = (field: string) => ev.defaulted.includes(field);
    const batch = TEACHER_BATCHES.find((b) => b.id === p.batchId);
    const topic = [g.topic, ...(g.subtopics ?? [])].filter(Boolean).join(' · ');
    const rows: IRow[] = [
      { label: 'Batch', value: batch ? `${batch.name} (${batch.classLevel})` : '—', defaulted: false },
      { label: 'Subject', value: p.subject ?? '—', defaulted: d('subject') },
      { label: 'Topic', value: topic || '—', defaulted: false },
      { label: 'Questions', value: p.targetQuestions?.toString() ?? '—', defaulted: d('targetQuestions') },
      { label: 'Date', value: spokenDate(p.date) ?? p.date ?? '—', defaulted: d('date') },
      { label: 'Time', value: p.startTime ? `${p.startTime} – ${p.endTime ?? '?'}` : '—', defaulted: d('endTime') },
      { label: 'Duration', value: p.duration ? `${p.duration} min` : '—', defaulted: d('duration') },
      {
        label: 'Marking',
        value: p.defaultMarks !== undefined ? `+${p.defaultMarks} / −${p.defaultNegativeMarks ?? 0}` : '—',
        defaulted: d('defaultMarks'),
      },
      { label: 'Difficulty', value: g.difficulty ?? '—', defaulted: d('difficulty') },
      { label: 'Question type', value: g.questionType ?? '—', defaulted: d('questionType') },
      { label: 'Title', value: p.title ?? '—', defaulted: d('title') },
    ];
    return rows;
  });
}
