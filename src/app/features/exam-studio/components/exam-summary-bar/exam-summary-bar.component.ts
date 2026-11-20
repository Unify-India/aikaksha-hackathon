import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExam, ExamStatus } from '../../../../shared/models/exam.model';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-exam-summary-bar',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, AppButtonComponent],
  template: `
    <section class="lift overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Exam summary">
      <div class="h-1.5 bg-linear-to-r from-indigo-500 via-violet-500 to-sky-400" aria-hidden="true"></div>
      <div class="p-5">
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl md:text-3xl">
              {{ exam()?.title || 'Untitled practice exam' }}
            </h1>
            <app-status-badge
              [label]="exam()?.status || 'draft'"
              [variant]="isLiveOrOpen() ? 'success' : 'warning'"
            />
          </div>

          <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Batch Lakshya 2026, {{ exam()?.subject || 'Physics' }}, {{ exam()?.examPattern || 'NEET' }} pattern. Created {{ exam()?.date || 'today' }}.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <app-button
            variant="secondary"
            size="sm"
            label="Export PDF"
            (clicked)="exportPdf.emit()"
          />
          <app-button
            variant="primary"
            size="sm"
            label="Review and publish"
            (clicked)="openPublishModal.emit()"
          />
        </div>
      </div>

      <dl class="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div>
          <dt class="text-xs text-slate-600 dark:text-slate-400">Questions</dt>
          <dd class="mt-0.5 text-sm font-medium">
            <span [class]="countMismatch() ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'">{{ actualCount() }}</span>
            of {{ exam()?.targetQuestions ?? 15 }}
          </dd>
        </div>
        <div>
          <dt class="text-xs text-slate-600 dark:text-slate-400">Total marks</dt>
          <dd class="mt-0.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">{{ totalMarks() }}</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-600 dark:text-slate-400">Duration</dt>
          <dd class="mt-0.5 text-sm font-medium">{{ exam()?.duration ?? 45 }} minutes</dd>
        </div>
        <div>
          <dt class="text-xs text-slate-600 dark:text-slate-400">Submission window</dt>
          <dd class="mt-0.5 font-mono text-sm font-medium">{{ exam()?.startTime || '10:00' }} to {{ exam()?.endTime || '10:45' }}</dd>
        </div>
      </dl>
      </div>
    </section>
  `,
})
export class ExamSummaryBarComponent {
  public exam = input<IExam | null>(null);
  public actualCount = input<number>(0);

  public exportPdf = output<void>();
  public openPublishModal = output<void>();

  public totalMarks = computed(() => {
    const marksPerQ = this.exam()?.defaultMarks ?? 4;
    return this.actualCount() * marksPerQ;
  });

  public countMismatch = computed(() => {
    const target = this.exam()?.targetQuestions ?? 0;
    return this.actualCount() !== target;
  });

  public isLiveOrOpen = computed(() => {
    const status = this.exam()?.status;
    return status === ExamStatus.Live || status === ExamStatus.Open || status === ExamStatus.Validated;
  });
}
