import { Component, input, output } from '@angular/core';
import { ISheetEvaluation, SheetStatus } from '../../models/evaluation.models';

const STATUS_TEXT: Record<SheetStatus, string> = {
  queued: 'Queued',
  grading: 'Grading…',
  graded: 'Ready to review',
  needs_review: 'Needs review',
  approved: 'Approved',
  failed: 'Failed',
};

const STATUS_ICON: Record<SheetStatus, string> = {
  queued: '…',
  grading: '◌',
  graded: '●',
  needs_review: '⚠',
  approved: '✓',
  failed: '✗',
};

/** The class's sheets with status and score; selecting a row opens that sheet. */
@Component({
  selector: 'app-class-roster',
  template: `
    <nav
      aria-labelledby="roster-heading"
      class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 id="roster-heading" class="px-1 text-sm font-bold text-slate-900 dark:text-white">
        Class sheets
        <span class="font-normal text-slate-600 dark:text-slate-300">· {{ approved() }}/{{ sheets().length }} approved</span>
      </h2>
      <ul class="mt-2 space-y-1">
        @for (sheet of sheets(); track sheet.submissionId) {
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-indigo-600"
              [class]="
                sheet.submissionId === activeId()
                  ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100'
                  : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
              "
              [attr.aria-current]="sheet.submissionId === activeId() ? 'true' : null"
              (click)="selected.emit(sheet.submissionId)"
            >
              <span aria-hidden="true" class="w-4 text-center" [class]="iconClass(sheet.status)">
                {{ icon(sheet.status) }}
              </span>
              <span class="flex-1 font-semibold">{{ sheet.studentLabel }}</span>
              <span class="text-xs">
                @if (sheet.questions.length) {
                  <span class="font-mono font-semibold">{{ sheet.totalAwarded }}/{{ sheet.totalMax }}</span> ·
                }
                {{ statusText(sheet.status) }}
              </span>
            </button>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class ClassRosterComponent {
  readonly sheets = input.required<ISheetEvaluation[]>();
  readonly activeId = input<string | null>(null);
  readonly approved = input(0);

  readonly selected = output<string>();

  protected statusText(status: SheetStatus): string {
    return STATUS_TEXT[status];
  }

  protected icon(status: SheetStatus): string {
    return STATUS_ICON[status];
  }

  protected iconClass(status: SheetStatus): string {
    switch (status) {
      case 'approved':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'needs_review':
        return 'text-amber-700 dark:text-amber-400';
      case 'failed':
        return 'text-rose-700 dark:text-rose-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  }
}
