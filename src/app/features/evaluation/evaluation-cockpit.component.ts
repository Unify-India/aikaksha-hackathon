import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { StatCardComponent } from '../../shared/components/stat-card.component';
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

/** Workflow B: grade a whole class's handwritten answer sheets with Gemini, then review and approve. */
@Component({
  selector: 'app-evaluation-cockpit',
  imports: [
    StatCardComponent,
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
    <div class="space-y-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-slate-900 dark:text-white">Answer-sheet evaluation</h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Gemini reads the handwriting and marks each question; you review and approve.
          </p>
          <p class="mt-1 text-xs">
            <span class="rounded-full border px-2 py-0.5 font-semibold" [class]="engineBadge().css">
              {{ engineBadge().text }}
            </span>
          </p>
        </div>
        @if (store.phase() !== 'setup') {
          <button type="button"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            (click)="store.startOver()">
            Start a new batch
          </button>
        }
      </header>

      @if (store.error(); as error) {
        <div role="alert" class="flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <span>⚠ {{ error }}</span>
          <button type="button" class="font-semibold underline focus-visible:outline-2 focus-visible:outline-indigo-600" (click)="store.dismissError()">
            Dismiss
          </button>
        </div>
      }

      @if (store.phase() === 'setup') {
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div class="space-y-6 lg:col-span-7">
            @if (store.pendingDraft(); as draft) {
              <app-scheme-review
                [scheme]="draft"
                [busy]="store.busy() === 'approving'"
                (approve)="store.approveDraft($event)"
                (discard)="store.discardDraft()"
              />
            } @else {
              <app-scheme-picker
                [schemes]="store.approvedSchemes()"
                [selectedId]="store.selectedSchemeId()"
                [loading]="store.busy() === 'loading_schemes'"
                [disabled]="store.busy() !== 'idle'"
                (selected)="store.selectScheme($event)"
                (questionPaper)="store.draftFromQuestionPaper($event)"
              />
            }
            <app-sheet-upload
              [schemeReady]="!!store.selectedScheme() && store.selectedScheme()?.status === 'approved' && !store.pendingDraft()"
              [uploading]="store.busy() === 'uploading'"
              [disabled]="store.busy() !== 'idle'"
              (start)="store.startGrading($event)"
            />
          </div>
          <div class="lg:col-span-5">
            <app-grading-activity [entries]="store.activity()" />
          </div>
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <app-stat-card title="Graded" [value]="store.finishedCount() + ' / ' + store.sheets().length" [subtitle]="store.phase() === 'grading' ? 'Grading in progress…' : 'All sheets graded'" icon="📝" />
          <app-stat-card title="Approved" [value]="store.approvedCount()" subtitle="Teacher signed off" icon="✅" />
          <app-stat-card title="Needs review" [value]="store.reviewCount()" subtitle="Low-confidence answers" icon="⚠️" />
          <app-stat-card title="Class average" [value]="classAverage()" [subtitle]="store.jobScheme()?.title ?? ''" icon="📊" />
        </div>

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
          <button type="button"
            class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            (click)="view.set('table')">
            ← Back to class results
          </button>
        </div>

        <app-evaluation-audit-bar
          [sheet]="store.activeSheet()"
          [index]="store.activeIndex()"
          [total]="store.sheets().length"
          [busy]="store.busy() === 'saving'"
          (previous)="store.previousSheet()"
          (next)="store.nextSheet()"
          (approve)="store.approveActiveAndNext()"
        />

        <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div class="lg:col-span-2">
            <app-class-roster
              [sheets]="store.sheets()"
              [activeId]="store.activeSheetId()"
              [approved]="store.approvedCount()"
              (selected)="store.openSheet($event)"
            />
          </div>
          <div class="lg:col-span-6">
            <app-answer-sheet-viewer
              [file]="store.activeFile()"
              [sheet]="store.activeSheet()"
              [scheme]="store.jobScheme()"
              [selectedQuestionId]="selectedQuestionId()"
              (questionSelected)="selectQuestion($event)"
            />
          </div>
          <div class="lg:col-span-4">
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

  protected readonly engineBadge = computed(() => {
    switch (this.store.engine) {
      case 'server':
        return { text: 'Engine: grading server', css: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' };
      case 'gemini':
        return { text: 'Engine: Gemini from this browser (local testing only)', css: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200' };
      default:
        return { text: 'Engine: mock grades (testing)', css: 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200' };
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
