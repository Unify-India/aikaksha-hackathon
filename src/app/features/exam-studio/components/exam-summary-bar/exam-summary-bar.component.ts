import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExam } from '../../../../shared/models/exam.model';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-exam-summary-bar',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, AppButtonComponent],
  template: `
    <div class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <!-- Title & Batch Context -->
        <div>
          <div class="flex flex-wrap items-center gap-2.5">
            <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {{ exam()?.title || 'Untitled Practice Exam' }}
            </h1>
            <app-status-badge
              [label]="exam()?.status || 'draft'"
              [variant]="exam()?.status === 'published' ? 'success' : 'warning'"
            />
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span class="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              👥 Batch Lakshya 2026 (Physics)
            </span>
            <span>&bull;</span>
            <span>Subject: <strong class="text-slate-700 dark:text-slate-300">{{ exam()?.subject || 'Physics' }}</strong></span>
            <span>&bull;</span>
            <span>Pattern: <strong class="text-slate-700 dark:text-slate-300">{{ exam()?.examPattern || 'NEET' }}</strong></span>
            <span>&bull;</span>
            <span>Created: {{ exam()?.date || 'Today' }}</span>
          </div>
        </div>

        <!-- Metric Badges Group -->
        <div class="flex flex-wrap items-center gap-3">
          <!-- Target vs Actual Count -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">Questions</span>
            <span class="text-sm font-bold text-slate-800 dark:text-slate-200">
              <span [class]="countMismatch() ? 'text-amber-600' : 'text-emerald-600'">{{ actualCount() }}</span>
              <span class="text-slate-400"> / {{ exam()?.targetQuestions ?? 15 }}</span>
            </span>
          </div>

          <!-- Total Marks -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">Total Marks</span>
            <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {{ totalMarks() }} pts
            </span>
          </div>

          <!-- Duration Timer -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">Duration</span>
            <span class="text-sm font-bold text-slate-800 dark:text-slate-200">
              ⏱️ {{ exam()?.duration ?? 45 }}m
            </span>
          </div>

          <!-- Time-Lock Window -->
          <div class="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span class="text-[11px] font-medium text-slate-400 block">Time-Lock Window</span>
            <span class="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
              {{ exam()?.startTime || '10:00' }} – {{ exam()?.endTime || '10:45' }}
            </span>
          </div>

          <!-- Actions: Export & Human Gate Modal Trigger -->
          <div class="flex items-center gap-2 pl-2">
            <app-button
              variant="secondary"
              size="sm"
              icon="📄"
              label="PDF"
              (clicked)="exportPdf.emit()"
            />
            <app-button
              variant="primary"
              size="sm"
              icon="🚀"
              label="Review & Publish"
              (clicked)="openPublishModal.emit()"
            />
          </div>
        </div>
      </div>
    </div>
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
}
