import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ITeacherReviewGateAssignment, ReviewStatus } from '../../shared/models/review-gate.model';

@Component({
  selector: 'app-review-gate',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-8">
      <section
        class="relative overflow-hidden rounded-2xl hero-surface p-6 text-white shadow-xl shadow-indigo-900/25 md:p-8"
        aria-labelledby="gate-title"
      >
        <div
          class="pointer-events-none absolute inset-0 opacity-[0.18]"
          style="background-image: radial-gradient(circle at 1px 1px, #fff 1px, transparent 0); background-size: 22px 22px;"
          aria-hidden="true"
        ></div>

        <div class="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div class="max-w-xl">
            <div class="flex flex-wrap items-center gap-3">
              <h1 id="gate-title" class="text-3xl md:text-4xl">Review gate</h1>
              <span class="rounded-md bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-inset ring-white/30">Waiting for your sign-off</span>
            </div>
            <p class="mt-3 text-sm leading-relaxed text-indigo-100">
              AI-drafted exams cannot be assigned to students until you confirm them here.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              (click)="rejectAssignment()"
              class="min-h-11 cursor-pointer rounded-md border border-white/50 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              Reject and regenerate
            </button>
            <button
              type="button"
              (click)="approveAndPublish()"
              [disabled]="isPublished()"
              class="min-h-11 cursor-pointer rounded-md bg-emerald-700 px-5 py-2 text-sm font-medium text-white shadow-md shadow-emerald-950/30 transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ isPublished() ? 'Exam published' : 'Approve and publish' }}
            </button>
          </div>
        </div>
      </section>

      <dl class="stagger grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
        <div class="border-t-2 border-t-indigo-500 dark:border-t-indigo-400 bg-white px-4 py-3 dark:bg-slate-900">
          <dt class="text-xs text-slate-600 dark:text-slate-400">Gate status</dt>
          <dd class="mt-1 font-serif text-2xl font-semibold leading-tight capitalize">{{ assignment().status }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Needs teacher sign-off</dd>
        </div>
        <div class="border-t-2 border-t-violet-500 dark:border-t-violet-400 bg-white px-4 py-3 dark:bg-slate-900">
          <dt class="text-xs text-slate-600 dark:text-slate-400">Teacher</dt>
          <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">{{ assignment().teacherName }}</dd>
          <dd class="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">{{ assignment().teacherId }}</dd>
        </div>
        <div class="border-t-2 border-t-sky-500 dark:border-t-sky-400 bg-white px-4 py-3 dark:bg-slate-900">
          <dt class="text-xs text-slate-600 dark:text-slate-400">Batch</dt>
          <dd class="mt-1 font-serif text-2xl font-semibold leading-tight">{{ assignment().batchName }}</dd>
          <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">45 students enrolled</dd>
        </div>
        <div class="border-t-2 border-t-orange-400 dark:border-t-orange-400 bg-white px-4 py-3 dark:bg-slate-900">
          <dt class="text-xs text-slate-600 dark:text-slate-400">Content hash</dt>
          <dd class="mt-1 font-mono text-lg leading-tight">{{ assignment().contentHash.slice(0, 10) }}…</dd>
          <dd class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">SHA-256 of the draft</dd>
        </div>
      </dl>

      <section class="lift rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900" aria-labelledby="checks-title">
        <h2 id="checks-title" class="text-xl">Before you publish</h2>
        <div class="mt-4 space-y-4">
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked class="mt-1 h-4 w-4 cursor-pointer accent-indigo-700" />
            <span>
              <span class="block font-medium">Syllabus and difficulty match</span>
              <span class="block text-xs text-slate-600 dark:text-slate-400">The questions follow NCERT Class 12 Electrostatics at medium difficulty.</span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked class="mt-1 h-4 w-4 cursor-pointer accent-indigo-700" />
            <span>
              <span class="block font-medium">Answer key kept separate</span>
              <span class="block text-xs text-slate-600 dark:text-slate-400">Correct answers sit in the teacher-only answer key, behind server security rules.</span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked class="mt-1 h-4 w-4 cursor-pointer accent-indigo-700" />
            <span>
              <span class="block font-medium">Answers and marking checked</span>
              <span class="block text-xs text-slate-600 dark:text-slate-400">You verified each answer yourself. Negative marking is 1/4 (+4 / -1).</span>
            </span>
          </label>
        </div>
      </section>
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
