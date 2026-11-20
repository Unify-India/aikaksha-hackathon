import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExamQuestion } from '../../../../shared/models/exam.model';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-question-editor-card',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <article class="lift rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span class="flex h-8 min-w-8 items-center justify-center rounded-md bg-indigo-100 px-1.5 font-serif text-base font-semibold leading-none text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Q{{ index() + 1 }}</span>
          <span>{{ question().type }}</span>
          <span>{{ question().subject }}, {{ question().topic }}</span>
          @if (hasFormula()) {
            <span>Contains formulas</span>
          }
        </p>

        <p class="flex items-center gap-3 text-xs">
          <span [class]="difficultyClass()" class="rounded-full px-2.5 py-0.5 font-medium capitalize">{{ question().difficulty }}</span>
          <span class="font-medium">
            <span class="text-emerald-800 dark:text-emerald-300">+{{ question().marks }}</span>
            <span class="text-slate-400" aria-hidden="true"> / </span>
            <span class="sr-only"> and </span>
            <span class="text-rose-800 dark:text-rose-300">-{{ question().negativeMarks }}</span>
          </span>
        </p>
      </div>

      <div class="mt-4">
        @if (isEditing()) {
          <label class="sr-only" [for]="'edit-' + question().id">Question text</label>
          <textarea
            #editTextArea
            [id]="'edit-' + question().id"
            rows="3"
            class="w-full rounded-md border border-indigo-400 bg-white p-3 text-sm text-slate-900 dark:border-indigo-700 dark:bg-slate-800 dark:text-white"
            [value]="question().en?.text || ''"
          ></textarea>
          <div class="mt-2 flex justify-end gap-2">
            <app-button variant="ghost" size="sm" label="Cancel" (clicked)="cancelEdit()" />
            <app-button
              variant="primary"
              size="sm"
              label="Save changes"
              (clicked)="saveEdit(editTextArea.value)"
            />
          </div>
        } @else {
          <p class="max-w-[40rem] text-base leading-relaxed text-slate-900 dark:text-slate-100">
            {{ question().en?.text }}
          </p>
        }
      </div>

      @if (question().en?.options && question().en?.options!.length > 0) {
        <div class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Mark the correct option">
          @for (option of question().en?.options; track option.id; let i = $index) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="option.id === question().correctOptionId"
              (click)="selectCorrectKey(option.id)"
              [class]="optionClasses(option.id)"
              class="flex w-full cursor-pointer items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors duration-150"
            >
              <span
                [class]="option.id === question().correctOptionId ? 'border-emerald-700 bg-emerald-700' : 'border-slate-400 bg-transparent dark:border-slate-500'"
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                aria-hidden="true"
              >
                @if (option.id === question().correctOptionId) {
                  <span class="h-1.5 w-1.5 rounded-full bg-white"></span>
                }
              </span>

              <span class="w-4 font-mono text-xs text-slate-600 dark:text-slate-400" aria-label="Option {{ 'ABCDE'.charAt(i) }}">{{ 'ABCDE'.charAt(i) }}</span>
              <span class="flex-1">{{ option.text }}</span>

              @if (option.id === question().correctOptionId) {
                <span class="text-xs font-medium text-emerald-800 dark:text-emerald-300">Answer key</span>
              }
            </button>
          }
        </div>
      }

      @if (question().explanation) {
        <div class="mt-4 border-l-2 border-indigo-400 pl-4 dark:border-indigo-500">
          <p class="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Worked solution</p>
          <p class="mt-1 text-sm leading-relaxed">{{ question().explanation }}</p>
        </div>
      }

      <div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <p class="text-xs text-slate-600 dark:text-slate-400">
          @if (question().isAiGenerated) {
            <span>AI-generated</span>
            <span aria-hidden="true"> · </span>
          }
          <span>ID {{ question().id }}</span>
        </p>

        <div class="flex items-center gap-1.5">
          <app-button
            variant="ghost"
            size="sm"
            label="Edit"
            (clicked)="toggleEdit()"
          />
          <app-button
            variant="secondary"
            size="sm"
            label="Regenerate"
            (clicked)="regenerateQuestion.emit(question().id)"
          />
          <app-button
            variant="danger-quiet"
            size="sm"
            label="Delete"
            (clicked)="deleteQuestion.emit(question().id)"
          />
        </div>
      </div>
    </article>
  `,
})
export class QuestionEditorCardComponent {
  public question = input.required<IExamQuestion>();
  public index = input<number>(0);

  public deleteQuestion = output<string>();
  public regenerateQuestion = output<string>();
  public updateQuestion = output<{ id: string; text: string }>();
  public setCorrectKey = output<{ questionId: string; optionId: string }>();

  public isEditing = signal<boolean>(false);

  public hasFormula(): boolean {
    const text = this.question().en?.text || '';
    return text.includes('µC') || text.includes('×') || text.includes('^') || text.includes('ε') || text.includes('tau');
  }

  public difficultyClass(): string {
    switch (this.question().difficulty) {
      case 'easy':
        return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
      case 'hard':
        return 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
      case 'medium':
      default:
        return 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300';
    }
  }

  public optionClasses(optionId: string): string {
    if (optionId === this.question().correctOptionId) {
      return 'border-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30';
    }
    return 'border-slate-200 bg-transparent hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50';
  }

  public toggleEdit(): void {
    this.isEditing.update((val) => !val);
  }

  public cancelEdit(): void {
    this.isEditing.set(false);
  }

  public saveEdit(newText: string): void {
    if (newText.trim()) {
      this.updateQuestion.emit({ id: this.question().id, text: newText.trim() });
    }
    this.isEditing.set(false);
  }

  public selectCorrectKey(optionId: string): void {
    this.setCorrectKey.emit({ questionId: this.question().id, optionId });
  }
}
