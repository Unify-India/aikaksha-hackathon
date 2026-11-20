import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../../shared/components/app-button/app-button.component';
import { QuestionEditorCardComponent } from './components/question-editor-card/question-editor-card.component';
import { ExamSummaryBarComponent } from './components/exam-summary-bar/exam-summary-bar.component';
import { PublishConfirmModalComponent } from './components/publish-confirm-modal/publish-confirm-modal.component';
import { IExam, IExamQuestion, QuestionType, ExamStatus, NegativeMarkingRule } from '../../shared/models/exam.model';

@Component({
  selector: 'app-exam-studio',
  standalone: true,
  imports: [
    CommonModule,
    AppButtonComponent,
    QuestionEditorCardComponent,
    ExamSummaryBarComponent,
    PublishConfirmModalComponent,
  ],
  template: `
    <div class="space-y-8">
      <app-exam-summary-bar
        [exam]="activeExam()"
        [actualCount]="questions().length"
        (exportPdf)="handleExportPdf()"
        (openPublishModal)="isModalOpen.set(true)"
      />

      <p class="text-sm text-slate-600 dark:text-slate-400">
        <span class="font-medium text-slate-900 dark:text-slate-100">Duplicate check:</span> none found.
        <span class="ml-4 font-medium text-slate-900 dark:text-slate-100">Answer key:</span> kept on the server and never sent to students.
      </p>

      <section class="space-y-4" aria-labelledby="bank-title">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="bank-title" class="text-2xl">Question bank</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {{ questions().length }} questions drafted by Gemini. Check every answer and formula before you publish.
            </p>
          </div>

          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-600 dark:text-slate-400">Language: English</span>
            <app-button
              variant="secondary"
              size="sm"
              label="Add question"
              (clicked)="addQuestion()"
            />
          </div>
        </div>

        <div class="stagger grid grid-cols-1 gap-4">
          @for (q of questions(); track q.id) {
            <app-question-editor-card
              [question]="q"
              [index]="$index"
              (deleteQuestion)="onDeleteQuestion($event)"
              (regenerateQuestion)="onRegenerateQuestion($event)"
              (updateQuestion)="onUpdateQuestion($event)"
              (setCorrectKey)="onSetCorrectKey($event)"
            />
          }
        </div>
      </section>

      <app-publish-confirm-modal
        [isOpen]="isModalOpen()"
        [exam]="activeExam()"
        [questionCount]="questions().length"
        [contentHash]="draftContentHash()"
        (closeModal)="isModalOpen.set(false)"
        (confirmPublish)="handlePublishConfirm()"
      />
    </div>
  `,
})
export class ExamStudioComponent {
  public isModalOpen = signal<boolean>(false);
  public draftContentHash = signal<string>('a4f89d31f0e49c7162985cb96e95b0b2e32a68817a5be536c4f0392ad7c81d02');

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
      isAiGenerated: true,
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
      explanation:
        'New charges are (3 - 5) = -2 µC and (8 - 5) = +3 µC. Since product changes sign and magnitude ratio is (2 * 3) / (3 * 8) = 1/4, new force = 40/4 = 10 N attractive.',
    },
    {
      id: 'q-02',
      type: QuestionType.MCQ,
      marks: 4,
      negativeMarks: 1,
      subject: 'Physics',
      topic: 'Electrostatics',
      difficulty: 'medium',
      isAiGenerated: true,
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

  public handleExportPdf(): void {
    alert('Generating PDF paper bundle with OMR bubble sheet layout.');
  }

  public handlePublishConfirm(): void {
    this.isModalOpen.set(false);
    this.activeExam.update((e) => ({ ...e, status: ExamStatus.Live }));
    alert('Exam published successfully to Batch Lakshya 2026! Time-lock active.');
  }

  public onDeleteQuestion(id: string): void {
    this.questions.update((list) => list.filter((q) => q.id !== id));
  }

  public onRegenerateQuestion(id: string): void {
    alert(`Regenerating question ${id} with alternative phrasing and updated distractor analysis.`);
  }

  public onUpdateQuestion(event: { id: string; text: string }): void {
    this.questions.update((list) =>
      list.map((q) => (q.id === event.id ? { ...q, en: { ...q.en!, text: event.text } } : q))
    );
  }

  public onSetCorrectKey(event: { questionId: string; optionId: string }): void {
    this.questions.update((list) =>
      list.map((q) => (q.id === event.questionId ? { ...q, correctOptionId: event.optionId } : q))
    );
  }

  public addQuestion(): void {
    const newId = `q-${this.questions().length + 1}`;
    this.questions.update((list) => [
      ...list,
      {
        id: newId,
        type: QuestionType.MCQ,
        marks: 4,
        negativeMarks: 1,
        subject: 'Physics',
        topic: 'Electrostatics',
        difficulty: 'medium',
        isAiGenerated: true,
        en: {
          text: 'What is the electric flux through a Gaussian surface enclosing a dipole of charge +q and -q?',
          options: [
            { id: 'opt1', text: 'Zero' },
            { id: 'opt2', text: 'q / ε0' },
            { id: 'opt3', text: '2q / ε0' },
            { id: 'opt4', text: 'Infinity' },
          ],
        },
        correctOptionId: 'opt1',
        explanation: 'Net charge inside Gaussian surface is +q + (-q) = 0. By Gauss law, flux phi = Q_net / ε0 = 0.',
      },
    ]);
  }
}
