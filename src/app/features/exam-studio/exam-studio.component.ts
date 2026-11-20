import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { IExam, IExamQuestion, QuestionType, ExamStatus, NegativeMarkingRule } from '../../shared/models/exam.model';

@Component({
  selector: 'app-exam-studio',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, StatCardComponent],
  template: `
    <div class="space-y-6">
      <!-- Studio Header -->
      <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{{ activeExam()?.title }}</h1>
            <app-status-badge [label]="activeExam()?.status || 'draft'" variant="warning" />
          </div>
          <p class="mt-1 text-sm text-slate-500">
            Batch: <span class="font-semibold text-slate-700 dark:text-slate-300">Lakshya 2026 (Physics)</span> &bull;
            Duration: <span class="font-semibold text-slate-700 dark:text-slate-300">{{ activeExam()?.duration }} mins</span> &bull;
            Marking: <span class="font-semibold text-slate-700 dark:text-slate-300">+{{ activeExam()?.defaultMarks }} / -1.0 (1/4 Neg)</span>
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
            Export PDF
          </button>
          <button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 cursor-pointer">
            Send to Review Gate
          </button>
        </div>
      </div>

      <!-- Overview Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Total Questions" [value]="questions().length" subtitle="15 Target" icon="📝" />
        <app-stat-card title="Total Marks" [value]="questions().length * 4" subtitle="4 Marks / Question" icon="🏆" />
        <app-stat-card title="Deduplication Status" value="Passed (0 dupes)" subtitle="Cosine Sim < 0.85" icon="🛡️" />
        <app-stat-card title="Answer Key Partition" value="Secured Server-Side" subtitle="Excluded from Student Payloads" icon="🔒" />
      </div>

      <!-- Question Bank Draft Viewer -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">Generated Question Bank (15 Questions)</h2>
          <span class="text-xs text-slate-500">Language: English (Primary)</span>
        </div>

        <div class="grid grid-cols-1 gap-4">
          @for (q of questions(); track q.id) {
            <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-200 dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xs font-semibold text-slate-400">#{{ $index + 1 }}</span>
                  <span class="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{{ q.type }}</span>
                  <span class="text-xs font-medium text-slate-500">{{ q.topic }} &bull; {{ q.difficulty }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-emerald-600">+{{ q.marks }} marks</span>
                  <span class="text-xs font-semibold text-rose-500">-{{ q.negativeMarks }}</span>
                </div>
              </div>

              <!-- Question Text -->
              <p class="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                {{ q.en?.text }}
              </p>

              <!-- MCQ Options Grid -->
              @if (q.en?.options) {
                <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  @for (opt of q.en?.options; track opt.id) {
                    <div
                      [class]="opt.id === q.correctOptionId ? 'border-emerald-300 bg-emerald-50/50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-slate-200 bg-slate-50/50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'"
                      class="flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium"
                    >
                      <span class="font-mono font-bold">{{ opt.id | uppercase }}.</span>
                      <span>{{ opt.text }}</span>
                      @if (opt.id === q.correctOptionId) {
                        <span class="ml-auto text-[10px] font-bold text-emerald-600 dark:text-emerald-400">CORRECT KEY</span>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Teacher Explanation Box -->
              @if (q.explanation) {
                <div class="mt-3 rounded-lg bg-amber-50/60 p-3 text-xs text-amber-900 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/60">
                  <span class="font-bold">Authoritative Teacher Explanation:</span>
                  <p class="mt-0.5">{{ q.explanation }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ExamStudioComponent {
  public activeExam = signal<IExam>({
    id: 'exam-elec-401',
    title: 'NEET Practice: Electrostatics DPP',
    batchId: 'batch-lakshya-2026',
    duration: 45,
    targetQuestions: 15,
    defaultMarks: 4,
    negativeRule: NegativeMarkingRule.OneQuarter,
    defaultNegativeMarks: 1,
    date: '2026-11-21',
    startTime: '10:00',
    endTime: '10:45',
    startTimestampMs: 1795240800000,
    endTimestampMs: 1795243500000,
    languages: ['en'],
    primaryLanguage: 'en',
    subject: 'Physics',
    examPattern: 'NEET',
    status: ExamStatus.Draft,
    createdByTeacherRef: 'teacher-sharma-101',
    tenantId: 'institute-alpha-delhi',
  });

  public questions = signal<IExamQuestion[]>([
    {
      id: 'q-01',
      type: QuestionType.MCQ,
      marks: 4,
      negativeMarks: 1,
      subject: 'Physics',
      topic: 'Electrostatics',
      difficulty: 'medium',
      en: {
        text: 'Two point charges +3 µC and +8 µC repel each other with a force of 40 N. If a charge of -5 µC is added to each of them, then the force between them will become:',
        options: [
          { id: 'opt1', text: '+10 N (attractive)' },
          { id: 'opt2', text: '-10 N (repulsive)' },
          { id: 'opt3', text: '+20 N (attractive)' },
          { id: 'opt4', text: '-20 N (repulsive)' },
        ],
      },
      correctOptionId: 'opt1',
      explanation: 'New charges are (3 - 5) = -2 µC and (8 - 5) = +3 µC. Since product changes sign and magnitude ratio is (2 * 3) / (3 * 8) = 1/4, new force = 40/4 = 10 N attractive.',
    },
    {
      id: 'q-02',
      type: QuestionType.MCQ,
      marks: 4,
      negativeMarks: 1,
      subject: 'Physics',
      topic: 'Electrostatics',
      difficulty: 'medium',
      en: {
        text: 'An electric dipole of moment p is placed in an electric field of intensity E. The dipole acquires a position such that the axis of dipole makes an angle with the direction of the field. The torque acting on the dipole is:',
        options: [
          { id: 'opt1', text: 'p × E' },
          { id: 'opt2', text: 'p . E' },
          { id: 'opt3', text: 'p + E' },
          { id: 'opt4', text: 'Zero' },
        ],
      },
      correctOptionId: 'opt1',
      explanation: 'Torque tau = p x E = pE sin(theta), directed perpendicular to both p and E.',
    },
  ]);
}
