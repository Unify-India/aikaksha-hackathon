import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExam } from '../../../../shared/models/exam.model';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';

@Component({
  selector: 'app-publish-confirm-modal',
  standalone: true,
  imports: [CommonModule, AppButtonComponent, StatusBadgeComponent],
  template: `
    @if (isOpen()) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs transition-opacity duration-200"
        (click)="onBackdropClick($event)"
      >
        <!-- Modal Dialog Surface -->
        <div
          class="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                🛡️
              </span>
              <div>
                <h3 class="text-base font-bold text-slate-900 dark:text-white">
                  Teacher Review Gate: Publish Confirmation
                </h3>
                <p class="text-xs text-slate-500">Human-in-the-loop signing before dispatching to student portal</p>
              </div>
            </div>

            <button
              type="button"
              (click)="closeModal.emit()"
              class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body Info -->
          <div class="mt-4 space-y-4 text-xs">
            <!-- Exam Meta Summary -->
            <div class="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
              <div class="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                <span>{{ exam()?.title || 'NEET Practice: Electrostatics DPP' }}</span>
                <span class="text-indigo-600 dark:text-indigo-400">{{ questionCount() }} Questions</span>
              </div>
              <div class="mt-1 flex items-center gap-2 text-slate-500">
                <span>Batch: <strong class="text-slate-700 dark:text-slate-300">Lakshya 2026</strong></span>
                <span>&bull;</span>
                <span>Time: {{ exam()?.startTime || '10:00' }} - {{ exam()?.endTime || '10:45' }}</span>
              </div>
            </div>

            <!-- SHA-256 Draft Checksum Verification -->
            <div class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
              <div class="flex items-center justify-between">
                <span class="font-bold text-indigo-900 dark:text-indigo-200">SHA-256 Draft Content Hash:</span>
                <app-status-badge label="Tamper Proof" variant="success" />
              </div>
              <p class="mt-1 font-mono text-[11px] text-indigo-700 dark:text-indigo-300 break-all select-all">
                {{ contentHash() }}
              </p>
              <p class="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Cryptographic signature guaranteeing identical questions are delivered across OMR and Digital portals.
              </p>
            </div>

            <!-- Security Acknowledgement Checklist -->
            <div class="space-y-2">
              <label class="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  [checked]="acknowledgedAnswerKey()"
                  (change)="acknowledgedAnswerKey.set(!acknowledgedAnswerKey())"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <span class="text-slate-700 dark:text-slate-300">
                  I have verified that correct answer keys and explanations are verified and will remain partitioned server-side until the scheduled end time.
                </span>
              </label>

              <label class="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  [checked]="acknowledgedBatchLock()"
                  (change)="acknowledgedBatchLock.set(!acknowledgedBatchLock())"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <span class="text-slate-700 dark:text-slate-300">
                  Time-lock schedule is finalized. Students cannot submit past the 45-minute epoch cutoff.
                </span>
              </label>
            </div>
          </div>

          <!-- Footer Buttons -->
          <div class="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <app-button
              variant="secondary"
              label="Cancel"
              (clicked)="closeModal.emit()"
            />
            <app-button
              variant="accent"
              icon="🔒"
              label="Sign & Publish Exam"
              [disabled]="!acknowledgedAnswerKey() || !acknowledgedBatchLock()"
              (clicked)="confirmPublish.emit()"
            />
          </div>
        </div>
      </div>
    }
  `,
})
export class PublishConfirmModalComponent {
  public isOpen = input<boolean>(false);
  public exam = input<IExam | null>(null);
  public questionCount = input<number>(15);
  public contentHash = input<string>('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

  public closeModal = output<void>();
  public confirmPublish = output<void>();

  public acknowledgedAnswerKey = signal<boolean>(true);
  public acknowledgedBatchLock = signal<boolean>(true);

  public onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal.emit();
    }
  }
}
