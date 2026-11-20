import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

export interface IRubricItem {
  id: string;
  stepNumber: number;
  criterion: string;
  modelAnswerSnippet: string;
  maxMarks: number;
  awardedMarks: number;
  reasoning: string;
  confidence: number;
  hasUncertaintyFlag?: boolean;
  uncertaintyReason?: string;
  isOverridden?: boolean;
}

@Component({
  selector: 'app-rubric-score-panel',
  standalone: true,
  imports: [CommonModule, AppButtonComponent],
  template: `
    <div class="flex flex-col h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <!-- Panel Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 class="text-base font-bold text-slate-900 dark:text-white">
            Step-Wise Rubric & Criteria Breakdown
          </h2>
          <p class="text-xs text-slate-500">Gemini 2.5 Flash Vision evaluation with teacher override controls</p>
        </div>

        <div class="flex items-center gap-2">
          <span class="rounded-lg bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            Total: {{ totalAwarded() }} / {{ totalMax() }}
          </span>
        </div>
      </div>

      <!-- Rubric List -->
      <div class="mt-4 flex-1 space-y-3.5 overflow-y-auto max-h-[460px] pr-1.5 scrollbar-thin">
        @for (item of rubrics(); track item.id) {
          <div
            [class]="item.hasUncertaintyFlag ? 'border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20' : 'border-slate-200/80 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-800/40'"
            class="rounded-xl border p-3.5 text-xs transition-all duration-150 hover:shadow-xs"
          >
            <!-- Step Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="flex h-5 w-5 items-center justify-center rounded bg-slate-200 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {{ item.stepNumber }}
                </span>
                <span class="font-semibold text-slate-900 dark:text-slate-100">{{ item.criterion }}</span>
              </div>

              <!-- Marks Control -->
              <div class="flex items-center gap-1.5">
                @if (editingItemId() === item.id) {
                  <div class="flex items-center gap-1">
                    <input
                      #marksInput
                      type="number"
                      step="0.5"
                      min="0"
                      [max]="item.maxMarks"
                      [value]="item.awardedMarks"
                      class="w-14 rounded border border-indigo-400 bg-white px-1.5 py-0.5 text-center font-bold text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-white"
                    />
                    <app-button
                      variant="primary"
                      size="sm"
                      label="✓"
                      (clicked)="applyOverride(item.id, marksInput.valueAsNumber)"
                    />
                  </div>
                } @else {
                  <span
                    [class]="item.awardedMarks === item.maxMarks ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
                    class="font-mono text-sm font-bold"
                  >
                    {{ item.awardedMarks }} / {{ item.maxMarks }}
                  </span>
                  @if (item.isOverridden) {
                    <span class="rounded bg-indigo-100 px-1 py-0.2 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      Teacher Override
                    </span>
                  }
                }
              </div>
            </div>

            <!-- Model Answer Reference Snippet -->
            <div class="mt-2.5 rounded-lg border border-slate-200/60 bg-white p-2 dark:border-slate-700/60 dark:bg-slate-900">
              <span class="font-bold text-[10px] text-slate-400 uppercase tracking-wide">Model Answer Key:</span>
              <p class="font-mono text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
                {{ item.modelAnswerSnippet }}
              </p>
            </div>

            <!-- AI Reasoning -->
            <p class="mt-2 leading-relaxed text-slate-600 dark:text-slate-400">
              {{ item.reasoning }}
            </p>

            <!-- Uncertainty Alert Callout -->
            @if (item.hasUncertaintyFlag) {
              <div class="mt-2 flex items-center gap-1.5 rounded-md bg-amber-100/70 px-2 py-1 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <span>⚠️ AI Uncertainty:</span>
                <span>{{ item.uncertaintyReason || 'Handwriting ligature ambiguity on denominator symbol.' }}</span>
              </div>
            }

            <!-- Footer: Confidence & Teacher Action -->
            <div class="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-400">
              <span class="flex items-center gap-1">
                <span>Confidence:</span>
                <strong class="text-slate-700 dark:text-slate-300">{{ (item.confidence * 100).toFixed(0) }}%</strong>
              </span>

              @if (editingItemId() !== item.id) {
                <button
                  type="button"
                  (click)="startEditing(item.id)"
                  class="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-400 cursor-pointer"
                >
                  Adjust Marks
                </button>
              }
            </div>
          </div>
        }
      </div>

      <!-- Footer Action -->
      <div class="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
        <span class="text-slate-400">Step Scoring Method: Strict NEET Sub-parts</span>
        <app-button
          variant="secondary"
          size="sm"
          label="Reset All to AI"
          (clicked)="resetRequested.emit()"
        />
      </div>
    </div>
  `,
})
export class RubricScorePanelComponent {
  public rubrics = input<IRubricItem[]>([
    {
      id: 'step-1',
      stepNumber: 1,
      criterion: 'Gauss Law Formulation & Surface Charge Density',
      modelAnswerSnippet: 'sigma = Q / A ; E_0 = sigma / epsilon_0 = Q / (A * epsilon_0)',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Surface charge correctly stated with appropriate units and polarity.',
      confidence: 0.98,
    },
    {
      id: 'step-2',
      stepNumber: 2,
      criterion: 'Potential Integral with Dielectric Slab (t thickness)',
      modelAnswerSnippet: 'V = E_0 * (d - t) + (E_0 / K) * t',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Proper piecewise line integral of electric field across thickness boundaries.',
      confidence: 0.94,
    },
    {
      id: 'step-3',
      stepNumber: 3,
      criterion: 'Final Capacitance Expression & Special Case (t = d)',
      modelAnswerSnippet: 'C = epsilon_0 * A / (d - t*(1 - 1/K)) ; When t=d => C = K * epsilon_0 * A / d',
      maxMarks: 1,
      awardedMarks: 1,
      reasoning: 'Both general algebraic result and special case cleanly evaluated.',
      confidence: 0.99,
    },
  ]);

  public scoreOverridden = output<{ id: string; marks: number }>();
  public resetRequested = output<void>();

  public editingItemId = signal<string | null>(null);

  public totalAwarded(): number {
    return this.rubrics().reduce((acc, curr) => acc + curr.awardedMarks, 0);
  }

  public totalMax(): number {
    return this.rubrics().reduce((acc, curr) => acc + curr.maxMarks, 0);
  }

  public startEditing(id: string): void {
    this.editingItemId.set(id);
  }

  public applyOverride(id: string, newMarks: number): void {
    if (!isNaN(newMarks)) {
      this.scoreOverridden.emit({ id, marks: newMarks });
    }
    this.editingItemId.set(null);
  }
}
