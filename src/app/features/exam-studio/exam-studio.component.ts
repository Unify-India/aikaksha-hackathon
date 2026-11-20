import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ExamListComponent } from './components/exam-list.component';
import { QuestionCardComponent } from './components/question-card.component';
import { ExamStudioStore } from './data/exam-studio.store';

/**
 * Exam Studio: every exam created through POST /api/exams/create-complete (e.g. from the Voice
 * Copilot), read through GET /api/exams and GET /api/exams/:examId, questions rendered via KaTeX.
 * Routes: /exam-studio (opens the newest exam) and /exam-studio/:examId.
 */
@Component({
  selector: 'app-exam-studio',
  imports: [RouterLink, ExamListComponent, QuestionCardComponent],
  template: `
    <div class="flex flex-col gap-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Exam Studio
          </h1>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Exams created by you and the Voice Copilot.
          </p>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <button
            type="button"
            (click)="store.loadExams()"
            [disabled]="store.listState() === 'loading'"
            class="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {{ store.listState() === 'loading' ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>
      </header>

      @switch (view()) {
        @case ('loading') {
          <div
            class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
            role="status"
            aria-label="Loading exams"
          >
            <div class="flex flex-col gap-2">
              @for (i of [1, 2, 3, 4]; track i) {
                <div
                  class="h-20 animate-pulse rounded-xl bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70"
                ></div>
              }
            </div>
            <div class="flex flex-col gap-4">
              <div
                class="h-40 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70"
              ></div>
              <div
                class="h-56 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-800/70"
              ></div>
            </div>
            <span class="sr-only">Loading exams…</span>
          </div>
        }
        @case ('error') {
          <section
            role="alert"
            class="mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center dark:border-rose-900/60 dark:bg-rose-950/30"
          >
            <span
              class="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-2xl dark:bg-rose-900/50"
              aria-hidden="true"
              ><svg
                class="h-6 w-6 text-rose-700 dark:text-rose-300"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
                /></svg
            ></span>
            <h2 class="mt-4 text-lg font-semibold text-rose-950 dark:text-rose-100">
              Couldn't load your exams
            </h2>
            <p class="mt-2 text-sm text-rose-900 dark:text-rose-200">{{ store.listError() }}</p>
            <button
              type="button"
              (click)="store.loadExams()"
              class="mt-6 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              Try again
            </button>
          </section>
        }
        @case ('empty') {
          <section
            class="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/60"
            aria-labelledby="empty-heading"
          >
            <span
              class="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-7 w-7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M9 4h6l1 2h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3z"
                />
                <path d="M9 12h6M9 16h4" />
              </svg>
            </span>
            <h2
              id="empty-heading"
              class="mt-5 text-xl font-semibold text-slate-900 dark:text-white"
            >
              No exams yet
            </h2>
            <p class="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
              Describe the exam to the Voice Copilot, by voice or text. Once you confirm, its
              questions, answers and solutions appear here.
            </p>
            <a
              routerLink="/voice-copilot"
              class="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Create an exam with Voice Copilot
            </a>
          </section>
        }
        @default {
          @if (store.listState() === 'error') {
            <p
              role="alert"
              class="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
            >
              {{ store.listError() }}
            </p>
          }
          <div class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <nav
              aria-labelledby="exams-heading"
              class="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
            >
              <h2
                id="exams-heading"
                class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
              >
                Your exams ({{ store.exams().length }})
              </h2>
              <app-exam-list [exams]="store.exams()" [selectedId]="store.selectedId()" />
            </nav>

            <main class="min-w-0" aria-live="polite">
              @switch (store.detailState()) {
                @case ('loading') {
                  <p class="text-sm text-slate-600 dark:text-slate-400" role="status">
                    Loading exam…
                  </p>
                }
                @case ('error') {
                  <div
                    role="alert"
                    class="rounded-xl bg-rose-50 p-4 text-sm text-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
                  >
                    <p>{{ store.detailError() }}</p>
                    @if (store.selectedId(); as id) {
                      <button
                        type="button"
                        class="mt-2 font-semibold underline underline-offset-2"
                        (click)="store.select(id)"
                      >
                        Try again
                      </button>
                    }
                  </div>
                }
              }
              @if (store.detail(); as d) {
                <section
                  class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  aria-labelledby="exam-title"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <h2 id="exam-title" class="text-xl font-bold text-slate-900 dark:text-white">
                      {{ d.exam.title }}
                    </h2>
                    <span
                      class="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                      >{{ d.exam.status }}</span
                    >
                  </div>
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">{{ meta() }}</p>
                  <dl class="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    @for (stat of stats(); track stat.label) {
                      <div>
                        <dt class="text-slate-600 dark:text-slate-400">{{ stat.label }}</dt>
                        <dd class="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                          {{ stat.value }}
                        </dd>
                      </div>
                    }
                  </dl>
                  <p class="mt-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                    ID {{ d.exam.id }}
                  </p>
                </section>

                <div class="mt-6 flex flex-col gap-4">
                  @for (q of d.questions; track q.id; let i = $index) {
                    <app-question-card [question]="q" [index]="i" />
                  } @empty {
                    <p class="text-sm text-slate-600 dark:text-slate-400">
                      This exam has no questions stored.
                    </p>
                  }
                </div>
              } @else if (
                store.detailState() === 'idle' &&
                store.listState() === 'ready' &&
                store.exams().length
              ) {
                <p class="text-sm text-slate-600 dark:text-slate-400">Select an exam.</p>
              }
            </main>
          </div>
        }
      }
    </div>
  `,
})
export class ExamStudioComponent {
  protected readonly store = inject(ExamStudioStore);
  private readonly router = inject(Router);
  private refreshedFor: string | null = null;

  /** From the route (exam-studio/:examId) via withComponentInputBinding. */
  readonly examId = input<string>();

  /** Full-width states (loading / error / empty) vs the two-column list layout. Keeps the list while refreshing. */
  protected readonly view = computed(() => {
    const state = this.store.listState();
    const count = this.store.exams().length;
    if (count) return 'list';
    if (state === 'error') return 'error';
    if (state === 'ready') return 'empty';
    return 'loading';
  });

  protected readonly meta = computed(() => {
    const e = this.store.detail()?.exam;
    return e ? [e.subject, e.classLevel, e.examPattern, e.batchId].filter(Boolean).join(' · ') : '';
  });

  protected readonly stats = computed(() => {
    const d = this.store.detail();
    if (!d) return [];
    const e = d.exam;
    return [
      { label: 'Questions', value: String(d.questions.length || e.totalQuestions) },
      { label: 'Total marks', value: String(e.totalMarks) },
      { label: 'Duration', value: e.duration ? `${e.duration} min` : '—' },
      {
        label: 'Marking',
        value: e.defaultMarks ? `+${e.defaultMarks} / −${e.defaultNegativeMarks}` : '—',
      },
      { label: 'Date', value: e.date || '—' },
      {
        label: 'Time',
        value: e.startTime ? `${e.startTime}${e.endTime ? ' – ' + e.endTime : ''}` : '—',
      },
    ];
  });

  constructor() {
    // Reload on every visit so exams created elsewhere show up; exams already shown stay visible meanwhile.
    void this.store.loadExams();

    // Open the exam from the URL, or the newest one when the URL has none.
    effect(() => {
      const id = this.examId();
      if (id) {
        untracked(() => void this.store.select(id));
        // A just-created exam (e.g. from the Voice Copilot) is not in a list loaded earlier: refresh once.
        if (
          this.store.listState() === 'ready' &&
          !this.store.exams().some((e) => e.id === id) &&
          this.refreshedFor !== id
        ) {
          this.refreshedFor = id;
          untracked(() => void this.store.loadExams());
        }
        return;
      }
      const newest = this.store.exams()[0];
      if (newest) void this.router.navigate(['/exam-studio', newest.id], { replaceUrl: true });
    });
  }
}
