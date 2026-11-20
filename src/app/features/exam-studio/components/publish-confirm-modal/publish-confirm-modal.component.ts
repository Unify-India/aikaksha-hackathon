import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExam } from '../../../../shared/models/exam.model';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-publish-confirm-modal',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        (click)="onBackdropClick($event)"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-title"
          class="relative w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h3 id="publish-title" class="font-serif text-xl font-medium">Publish this exam?</h3>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">Once you confirm, it goes to the student portal.</p>
            </div>

            <button
              type="button"
              (click)="closeModal.emit()"
              aria-label="Close"
              class="cursor-pointer rounded-md p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-4 space-y-5 text-sm">
            <div>
              <p class="font-medium">{{ exam()?.title || 'NEET Practice: Electrostatics DPP' }}</p>
              <p class="mt-0.5 text-slate-600 dark:text-slate-400">
                {{ questionCount() }} questions, Batch Lakshya 2026, {{ exam()?.startTime || '10:00' }} to {{ exam()?.endTime || '10:45' }}
              </p>
            </div>

            <div class="border-l-2 border-slate-300 pl-4 dark:border-slate-600">
              <p class="text-xs font-medium text-slate-600 dark:text-slate-400">Content hash (SHA-256)</p>
              <p class="mt-1 select-all break-all font-mono text-xs">{{ contentHash() }}</p>
              <p class="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                Students get exactly the questions you approve here. Editing anything afterwards changes this hash.
              </p>
            </div>

            <div class="space-y-3">
              <label class="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  [checked]="acknowledgedAnswerKey()"
                  (change)="acknowledgedAnswerKey.set(!acknowledgedAnswerKey())"
                  class="mt-0.5 h-4 w-4 cursor-pointer accent-indigo-700"
                />
                <span>
                  I checked the answer key and explanations. They stay on the server until the exam ends.
                </span>
              </label>

              <label class="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  [checked]="acknowledgedBatchLock()"
                  (change)="acknowledgedBatchLock.set(!acknowledgedBatchLock())"
                  class="mt-0.5 h-4 w-4 cursor-pointer accent-indigo-700"
                />
                <span>
                  The schedule is final. Students cannot submit after the 45-minute cutoff.
                </span>
              </label>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <app-button
              variant="secondary"
              label="Cancel"
              (clicked)="closeModal.emit()"
            />
            <app-button
              variant="accent"
              label="Publish exam"
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
