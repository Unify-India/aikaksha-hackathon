import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IExamQuestion } from '../../../../shared/models/exam.model';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-question-editor-card',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <div
      class="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all duration-200 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800"
    >
      <!-- Top Meta Bar -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            #{{ index() + 1 }}
          </span>
          <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 uppercase dark:bg-slate-800 dark:text-slate-300">
            {{ question().type }}
          </span>
          <span class="text-xs text-slate-500">
            {{ question().subject }} &bull; {{ question().topic }}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <!-- Difficulty Badge -->
          <span
            [class]="difficultyClass()"
            class="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize border"
          >
            {{ question().difficulty }}
          </span>

          <!-- Marks Pill -->
          <div class="flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-slate-800">
            <span class="text-emerald-600 dark:text-emerald-400">+{{ question().marks }}</span>
            <span class="mx-1 text-slate-400">/</span>
            <span class="text-rose-500">-{{ question().negativeMarks }}</span>
          </div>

          <!-- Formula / LaTeX Badge -->
          @if (hasFormula()) {
            <span class="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
              LaTeX Math
            </span>
          }
        </div>
      </div>

      <!-- Question Statement -->
      <div class="mt-4">
        @if (isEditing()) {
          <textarea
            #editTextArea
            rows="3"
            class="w-full rounded-xl border border-indigo-300 bg-indigo-50/20 p-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-800 dark:text-white"
            [value]="question().en?.text || ''"
          ></textarea>
          <div class="mt-2 flex justify-end gap-2">
            <app-button variant="ghost" size="sm" label="Cancel" (clicked)="cancelEdit()" />
            <app-button
              variant="primary"
              size="sm"
              label="Save Changes"
              (clicked)="saveEdit(editTextArea.value)"
            />
          </div>
        } @else {
          <p class="text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">
            {{ question().en?.text }}
          </p>
        }
      </div>

      <!-- MCQ Options Grid with Radio Selectors -->
      @if (question().en?.options && question().en?.options!.length > 0) {
        <div class="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          @for (option of question().en?.options; track option.id) {
            <div
              (click)="selectCorrectKey(option.id)"
              [class]="optionClasses(option.id)"
              class="relative flex items-center gap-3 rounded-xl border p-3 text-xs font-medium cursor-pointer transition-all duration-150 select-none hover:shadow-xs"
            >
              <!-- Radio Circle indicator -->
              <div
                [class]="option.id === question().correctOptionId ? 'border-emerald-500 bg-emerald-500 ring-2 ring-emerald-300/40' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'"
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all"
              >
                @if (option.id === question().correctOptionId) {
                  <span class="h-1.5 w-1.5 rounded-full bg-white"></span>
                }
              </div>

              <!-- Option Letter & Text -->
              <span class="font-mono font-bold text-slate-500 dark:text-slate-400 uppercase">
                {{ option.id }}.
              </span>
              <span class="flex-1 text-slate-800 dark:text-slate-200">
                {{ option.text }}
              </span>

              <!-- Server Correct Key Badge -->
              @if (option.id === question().correctOptionId) {
                <span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase dark:bg-emerald-950 dark:text-emerald-300">
                  Key
                </span>
              }
            </div>
          }
        </div>
      }

      <!-- Authoritative Teacher Explanation Callout -->
      @if (question().explanation) {
        <div class="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <div class="flex items-center gap-1.5 font-bold">
            <span>💡</span>
            <span>Teacher Authoritative Solution & Derivation:</span>
          </div>
          <p class="mt-1 leading-relaxed">{{ question().explanation }}</p>
        </div>
      }

      <!-- Action Card Footer -->
      <div class="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2">
          @if (question().isAiGenerated) {
            <span class="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              ⚡ Gemini Verified
            </span>
          }
          <span class="text-[11px] text-slate-400">ID: {{ question().id }}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <app-button
            variant="ghost"
            size="sm"
            icon="✏️"
            label="Edit"
            (clicked)="toggleEdit()"
          />
          <app-button
            variant="secondary"
            size="sm"
            icon="🔄"
            label="Regenerate"
            (clicked)="regenerateQuestion.emit(question().id)"
          />
          <app-button
            variant="danger"
            size="sm"
            icon="🗑️"
            label="Delete"
            (clicked)="deleteQuestion.emit(question().id)"
          />
        </div>
      </div>
    </div>
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
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'hard':
        return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'medium':
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    }
  }

  public optionClasses(optionId: string): string {
    if (optionId === this.question().correctOptionId) {
      return 'border-emerald-400 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/30';
    }
    return 'border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/40';
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
