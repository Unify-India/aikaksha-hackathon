import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { ITeacherReviewGateAssignment, ReviewStatus } from '../../shared/models/review-gate.model';

@Component({
  selector: 'app-review-gate',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, StatCardComponent],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Teacher Human-in-the-Loop Review Gate</h1>
            <app-status-badge label="Pending Teacher Sign-off" variant="warning" />
          </div>
          <p class="mt-1 text-sm text-slate-500">
            Mandatory architectural gate: AI autonomous drafts cannot be assigned or scheduled to students without verified teacher confirmation.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            (click)="rejectAssignment()"
            class="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            Reject & Regenerate
          </button>
          <button
            (click)="approveAndPublish()"
            [disabled]="isPublished()"
            class="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
          >
            {{ isPublished() ? 'Exam Published' : 'Approve & Commit Exam' }}
          </button>
        </div>
      </div>

      <!-- Gate Audit Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Gate Verification" [value]="assignment().status | uppercase" subtitle="Teacher Sign-Off Required" icon="🔐" />
        <app-stat-card title="Teacher ID" [value]="assignment().teacherId" subtitle="Resolved Auth Identity" icon="👨‍🏫" />
        <app-stat-card title="Batch Target" [value]="assignment().batchName" subtitle="45 Students Enrolled" icon="🎓" />
        <app-stat-card title="Content Hash" [value]="assignment().contentHash.slice(0, 10) + '...'" subtitle="SHA-256 Immutability Check" icon="🛡️" />
      </div>

      <!-- Review Checklist & Approval Surface -->
      <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h2 class="text-base font-bold text-slate-900 dark:text-white">Pre-Publish Safety & Policy Check</h2>
        <div class="mt-4 space-y-3">
          <label class="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked class="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
            <div>
              <span class="font-medium text-slate-800 dark:text-slate-200">Syllabus & Difficulty Alignment</span>
              <p class="text-xs text-slate-500">Questions strictly match NCERT Class 12 Electrostatics medium difficulty.</p>
            </div>
          </label>
          <label class="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked class="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
            <div>
              <span class="font-medium text-slate-800 dark:text-slate-200">Answer Key Partition Verified</span>
              <p class="text-xs text-slate-500">Correct answers are isolated in teacher answerKey collection with server security rules.</p>
            </div>
          </label>
          <label class="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked class="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
            <div>
              <span class="font-medium text-slate-800 dark:text-slate-200">No AI Hallucinations / Negative Marking Compliant</span>
              <p class="text-xs text-slate-500">Standard 1/4 negative marking rule verified (+4 / -1).</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  `,
})
export class ReviewGateComponent {
  public isPublished = signal<boolean>(false);

  public assignment = signal<ITeacherReviewGateAssignment>({
    id: 'gate-assign-881',
    examId: 'exam-elec-401',
    teacherId: 'teacher-sharma-101',
    teacherName: 'Prof. R. Sharma',
    batchId: 'batch-lakshya-2026',
    batchName: 'Batch Lakshya 2026',
    status: 'pending',
    totalQuestions: 15,
    approvedQuestionsCount: 15,
    rejectedQuestionsCount: 0,
    contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    draftVersion: 1,
    createdAt: new Date().toISOString(),
  });

  public approveAndPublish(): void {
    this.assignment.update((curr) => ({ ...curr, status: 'approved' }));
    this.isPublished.set(true);
  }

  public rejectAssignment(): void {
    this.assignment.update((curr) => ({ ...curr, status: 'rejected' }));
  }
}
