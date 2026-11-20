import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { AnswerSheetViewerComponent } from './components/answer-sheet-viewer/answer-sheet-viewer.component';
import { ClassResultsTableComponent } from './components/class-results-table/class-results-table.component';
import { ClassRosterComponent } from './components/class-roster/class-roster.component';
import { EvaluationAuditBarComponent } from './components/evaluation-audit-bar/evaluation-audit-bar.component';
import { GradingActivityComponent } from './components/grading-activity/grading-activity.component';
import { RubricScorePanelComponent } from './components/rubric-score-panel/rubric-score-panel.component';
import { SchemePickerComponent } from './components/scheme-picker/scheme-picker.component';
import { SchemeReviewComponent } from './components/scheme-review/scheme-review.component';
import { SheetUploadComponent } from './components/sheet-upload/sheet-upload.component';
import { EvaluationStore } from './data/evaluation.store';

type StepState = 'done' | 'current' | 'locked' | 'upcoming';

interface IStep {
  n: number;
  title: string;
  detail: string;
  state: StepState;
}

/** Workflow B: grade a whole class's handwritten answer sheets with Gemini, then review and approve. */
@Component({
  selector: 'app-evaluation-cockpit',
  imports: [
    AnswerSheetViewerComponent,
    ClassResultsTableComponent,
    ClassRosterComponent,
    EvaluationAuditBarComponent,
    GradingActivityComponent,
    RubricScorePanelComponent,
    SchemePickerComponent,
    SchemeReviewComponent,
    SheetUploadComponent,
  ],
  template: `
    <div class="space-y-8">
      <section
        class="hero-surface relative overflow-hidden rounded-2xl p-6 text-white shadow-xl shadow-indigo-900/25 md:p-8"
        aria-labelledby="eval-title"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.18]"
          style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 22px 22px;"
          aria-hidden="true"
        ></div>

        <div class="relative flex flex-wrap items-end justify-between gap-4">
          <div class="max-w-xl">
            <h1 id="eval-title" class="text-3xl md:text-4xl">Answer-sheet evaluation</h1>
            <p class="mt-3 max-w-lg text-sm leading-relaxed text-indigo-100">
              Gemini reads the handwriting and marks each question; you review and approve.
            </p>
            <p class="mt-3 text-xs">
              <span class="rounded-md border px-2.5 py-0.5 font-medium" [class]="engineBadge().css">
                {{ engineBadge().text }}
              </span>
            </p>
          </div>
          @if (store.phase() !== 'setup') {
            <button
              type="button"
              class="min-h-11 cursor-pointer rounded-md border border-white/50 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
              (click)="store.startOver()"
            >
              Start a new batch
            </button>
          }
        </div>
      </section>

      @if (store.error(); as error) {
        <div
          role="alert"
          class="flex items-start justify-between gap-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
        >
          <span>⚠ {{ error }}</span>
          <button
            type="button"
            class="font-semibold underline focus-visible:outline-2 focus-visible:outline-indigo-600"
            (click)="store.dismissError()"
          >
            Dismiss
          </button>
        </div>
      }

      @if (store.warning(); as warning) {
        <div
          role="status"
          class="flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <span>⚠ {{ warning }}</span>
          <button
            type="button"
            class="font-semibold underline focus-visible:outline-2 focus-visible:outline-indigo-600"
            (click)="store.dismissWarning()"
          >
            Dismiss
          </button>
        </div>
      }

      @if (store.phase() === 'setup') {
        <ol aria-label="Grading steps" class="stagger grid grid-cols-1 gap-3 md:grid-cols-3">
          @for (step of steps(); track step.n) {
            <li
              class="flex items-start gap-3 rounded-lg border p-4 transition-colors"
              [class]="stepClass(step.state)"
              [attr.aria-current]="step.state === 'current' ? 'step' : null"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                [class]="badgeClass(step.state)"
                aria-hidden="true"
              >
                @if (step.state === 'done') {
                  <svg
                    class="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                } @else {
                  {{ step.n }}
                }
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-slate-900 dark:text-white">
                  {{ step.title }}
                  <span class="sr-only">: {{ stateText(step.state) }}</span>
                </span>
                <span
                  class="mt-0.5 line-clamp-2 block text-xs text-slate-600 dark:text-slate-400"
                  >{{ step.detail }}</span
                >
              </span>
            </li>
          }
        </ol>

        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <div class="min-w-0 space-y-6 lg:col-span-3">
            @if (store.busy() === 'drafting') {
              <div
                role="status"
                class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-300 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100"
              >
                <span>
                  <span aria-hidden="true" class="inline-block motion-safe:animate-spin">◌</span>
                  Gemini is drafting the marking scheme from your question paper — usually 1–3
                  minutes.
                </span>
                <button
                  type="button"
                  class="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950"
                  (click)="store.cancelDrafting()"
                >
                  Cancel drafting
                </button>
              </div>
            }
            @if (store.pendingDraft(); as draft) {
              <app-scheme-review
                [scheme]="draft"
                [busy]="store.busy() === 'approving'"
                [questionPaperUrl]="store.paperUrls()[draft.id] ?? null"
                (approve)="store.approveDraft($event)"
                (discard)="store.discardDraft()"
              />
            } @else if (store.viewingScheme(); as viewing) {
              <app-scheme-review
                [scheme]="viewing"
                [readOnly]="true"
                [questionPaperUrl]="store.paperUrls()[viewing.id] ?? null"
                (discard)="store.closeSchemeView()"
              />
            } @else {
              <app-scheme-picker
                [schemes]="store.approvedSchemes()"
                [pending]="store.pendingSchemes()"
                [paperUrls]="store.paperUrls()"
                [selectedId]="store.selectedSchemeId()"
                [loading]="store.busy() === 'loading_schemes'"
                [disabled]="store.busy() !== 'idle'"
                (selected)="store.selectScheme($event)"
                (reviewPending)="store.reviewPending($event)"
                (viewAnswers)="store.viewScheme($event)"
                (questionPaper)="store.draftFromQuestionPaper($event)"
              />
            }
          </div>

          <div class="min-w-0 space-y-6 lg:sticky lg:top-6 lg:col-span-2">
            <app-sheet-upload
              [schemeReady]="schemeReady()"
              [uploading]="store.busy() === 'uploading'"
              [disabled]="store.busy() !== 'idle'"
              (start)="store.startGrading($event)"
            />

            @if (store.selectedScheme() && !store.pendingDraft() && !store.viewingScheme()) {
              <p
                class="rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100"
                aria-live="polite"
              >
                @if (store.learning().agreementPercent !== null) {
                  <strong>AI vs teacher agreement: {{ store.learning().agreementPercent }}%</strong>
                  ({{ store.learning().agreed }} of {{ store.learning().checked }} checked answers
                  kept the AI's mark). {{ store.learning().corrections }}
                  {{ store.learning().corrections === 1 ? 'correction' : 'corrections' }} will guide
                  the next grading.
                } @else {
                  The AI learns from you: every mark you approve or correct guides how it grades the
                  next sheets of this paper.
                }
              </p>
            }
          </div>
        </div>

        @if (store.savedSheets().length && !store.pendingDraft() && !store.viewingScheme()) {
          <app-class-results-table
            heading="Saved marksheets for this question paper"
            [sheets]="store.savedSheets()"
            [scheme]="store.selectedScheme()"
            (open)="openSaved($event)"
          />
        }

        @if (store.activity().length) {
          <app-grading-activity [entries]="store.activity()" />
        }
      } @else {
        <dl
          class="stagger grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-800"
        >
          <div
            class="border-t-2 border-t-indigo-500 bg-white px-4 py-3 dark:border-t-indigo-400 dark:bg-slate-900"
          >
            <dt class="text-xs text-slate-600 dark:text-slate-400">Graded</dt>
            <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">
              {{ store.finishedCount() + ' / ' + store.sheets().length }}
            </dd>
            <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {{ store.phase() === 'grading' ? 'Grading in progress…' : 'All sheets graded' }}
            </dd>
          </div>
          <div class="border-t-2 border-t-emerald-500 bg-white px-4 py-3 dark:bg-slate-900">
            <dt class="text-xs text-slate-600 dark:text-slate-400">Approved</dt>
            <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">
              {{ store.approvedCount() }}
            </dd>
            <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Teacher signed off</dd>
          </div>
          <div class="border-t-2 border-t-amber-500 bg-white px-4 py-3 dark:bg-slate-900">
            <dt class="text-xs text-slate-600 dark:text-slate-400">Needs review</dt>
            <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">
              {{ store.reviewCount() }}
            </dd>
            <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Low-confidence answers
            </dd>
          </div>
          <div
            class="border-t-2 border-t-violet-500 bg-white px-4 py-3 dark:border-t-violet-400 dark:bg-slate-900"
          >
            <dt class="text-xs text-slate-600 dark:text-slate-400">Class average</dt>
            <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">
              {{ classAverage() }}
            </dd>
            <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {{ store.jobScheme()?.title ?? '' }}
            </dd>
          </div>
        </dl>

        @if (view() === 'table') {
          <app-class-results-table
            [sheets]="store.sheets()"
            [scheme]="store.jobScheme()"
            [activeId]="store.activeSheetId()"
            (open)="openStudent($event)"
          />
          <app-grading-activity [entries]="store.activity()" />
        } @else {
          <div>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              (click)="view.set('table')"
            >
              ← Back to class results
            </button>
          </div>

          <app-evaluation-audit-bar
            [sheet]="store.activeSheet()"
            [index]="store.activeIndex()"
            [total]="store.sheets().length"
            [busy]="store.busy() === 'saving'"
            [retrying]="store.busy() === 'retrying'"
            (retry)="store.retrySheet(store.activeSheetId()!)"
            (previous)="store.previousSheet()"
            (next)="store.nextSheet()"
            (approve)="store.approveActiveAndNext()"
          />

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div class="min-w-0 lg:col-span-2">
              <app-class-roster
                [sheets]="store.sheets()"
                [activeId]="store.activeSheetId()"
                [approved]="store.approvedCount()"
                (selected)="store.openSheet($event)"
              />
            </div>
            <div class="min-w-0 lg:col-span-6">
              <app-answer-sheet-viewer
                [file]="store.activeFile()"
                [sheet]="store.activeSheet()"
                [scheme]="store.jobScheme()"
                [selectedQuestionId]="selectedQuestionId()"
                (questionSelected)="selectQuestion($event)"
              />
            </div>
            <div class="min-w-0 lg:col-span-4">
              <app-rubric-score-panel
                [sheet]="store.activeSheet()"
                [scheme]="store.jobScheme()"
                [selectedQuestionId]="selectedQuestionId()"
                [readOnly]="marksReadOnly()"
                (questionSelected)="selectQuestion($event)"
                (overrideChanged)="store.setOverride($event.questionId, $event.marks)"
                (resetRequested)="store.clearOverrides()"
              />
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class EvaluationCockpitComponent {
  protected readonly store = inject(EvaluationStore);

  /** The question highlighted in both the viewer and the marks panel; cleared when another sheet opens. */
  protected readonly selectedQuestionId = linkedSignal<string | null, string | null>({
    source: this.store.activeSheetId,
    computation: () => null,
  });

  /** 'table' = everyone's results together; 'sheet' = one student's sheet, marks and approval. */
  protected readonly view = signal<'table' | 'sheet'>('table');

  protected openStudent(submissionId: string): void {
    this.store.openSheet(submissionId);
    this.view.set('sheet');
  }

  /** Opens a marksheet saved earlier under the selected question paper. */
  protected openSaved(submissionId: string): void {
    this.store.openSavedResults(submissionId);
    this.view.set('sheet');
  }

  /** True once an approved marking scheme is chosen and no draft is waiting for approval. Unlocks step 2. */
  protected readonly schemeReady = computed(
    () =>
      !!this.store.selectedScheme() &&
      this.store.selectedScheme()?.status === 'approved' &&
      !this.store.pendingDraft(),
  );

  /** The three-step tracker shown above the setup forms. */
  protected readonly steps = computed<IStep[]>(() => {
    const scheme = this.store.selectedScheme();
    const ready = this.schemeReady();
    return [
      {
        n: 1,
        title: 'Marking scheme',
        state: ready ? 'done' : 'current',
        detail:
          ready && scheme
            ? `${scheme.title} · ${scheme.questions.length} questions · ${scheme.totalMarks} marks`
            : 'Pick an approved scheme, or draft one from a question paper',
      },
      {
        n: 2,
        title: 'Answer sheets',
        state: ready ? 'current' : 'locked',
        detail: ready
          ? "Add the class's PDFs, then press Grade"
          : 'Unlocks once a scheme is approved',
      },
      {
        n: 3,
        title: 'Grade and review',
        state: 'upcoming',
        detail: 'Marks appear as each sheet finishes. You review and approve them.',
      },
    ];
  });

  protected stepClass(state: StepState): string {
    switch (state) {
      case 'done':
        return 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20';
      case 'current':
        return 'border-indigo-400 bg-white ring-1 ring-indigo-400/40 dark:border-indigo-500 dark:bg-slate-900';
      default:
        return 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50';
    }
  }

  protected badgeClass(state: StepState): string {
    switch (state) {
      case 'done':
        return 'bg-emerald-700 text-white';
      case 'current':
        return 'bg-indigo-600 text-white dark:bg-indigo-400 dark:text-slate-950';
      default:
        return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  }

  protected stateText(state: StepState): string {
    return state === 'done'
      ? 'completed'
      : state === 'current'
        ? 'current step'
        : state === 'locked'
          ? 'locked'
          : 'next';
  }

  protected readonly engineBadge = computed(() => {
    switch (this.store.engine) {
      case 'server':
        return {
          text: 'Engine: Grading server',
          css: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
        };
      default:
        return {
          text: 'Engine: Grading server',
          css: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
        };
    }
  });

  protected readonly marksReadOnly = computed(() => {
    const status = this.store.activeSheet()?.status;
    return status !== 'graded' && status !== 'needs_review';
  });

  protected readonly classAverage = computed(() => {
    const graded = this.store.sheets().filter((s) => s.questions.length > 0);
    if (!graded.length) return '—';
    const avg = graded.reduce((sum, s) => sum + s.totalAwarded, 0) / graded.length;
    return `${avg.toFixed(1)} / ${graded[0].totalMax}`;
  });

  constructor() {
    void this.store.loadSchemes();
  }

  protected selectQuestion(id: string): void {
    this.selectedQuestionId.update((current) => (current === id ? null : id));
  }
}
