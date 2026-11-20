import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';

export interface IEvalRubricItem {
  id: string;
  criterion: string;
  maxMarks: number;
  awardedMarks: number;
  reasoning: string;
  confidence: number;
}

@Component({
  selector: 'app-evaluation-cockpit',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, StatCardComponent],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Subjective & OMR Evaluation Cockpit</h1>
            <app-status-badge label="AI Annotated" variant="info" />
          </div>
          <p class="mt-1 text-sm text-slate-500">
            Multimodal evaluation: Gemini 2.5 Flash analyzes handwritten student submissions, generates non-destructive SVG annotation layers, and applies step-wise rubrics.
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer">
            Previous Sheet
          </button>
          <button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-500 cursor-pointer">
            Confirm Marks & Next
          </button>
        </div>
      </div>

      <!-- Cockpit Overview -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <app-stat-card title="Student Roll" value="2026-NEET-042" subtitle="Aarav Verma" icon="👤" />
        <app-stat-card title="Provisional Score" value="18 / 20" subtitle="AI Step-Marking" icon="📊" />
        <app-stat-card title="Handwriting OCR" value="96.4%" subtitle="High Confidence" icon="✍️" />
        <app-stat-card title="Integrity Check" value="Zero Overwrite" subtitle="Non-destructive Overlay" icon="🛡️" />
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <!-- Visual Answer Sheet + Annotation Layer -->
        <div class="space-y-4 lg:col-span-7">
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 class="text-sm font-bold text-slate-900 dark:text-white">Handwritten Answer Sheet (Page 1/2)</h2>
              <span class="text-xs text-slate-400">Non-destructive Overlay Layer</span>
            </div>

            <!-- Simulated Sheet Canvas -->
            <div class="relative mt-4 aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-300 bg-amber-50/20 p-6 font-mono text-xs dark:border-slate-700 dark:bg-slate-950">
              <div class="space-y-4 text-slate-800 dark:text-slate-200">
                <p class="font-bold underline">Q3. Derive expression for capacitance of a parallel plate capacitor.</p>
                <p>1. Surface charge density sigma = Q / A</p>
                <p>2. Electric field between plates E = sigma / epsilon_0 = Q / (A * epsilon_0)</p>
                <p>3. Potential difference V = E * d = (Q * d) / (A * epsilon_0)</p>
                <p>4. Since C = Q / V => C = Q / ((Q * d) / (A * epsilon_0)) = (epsilon_0 * A) / d</p>
                <p class="font-semibold text-emerald-700 dark:text-emerald-400">Hence proved: C = epsilon_0 * A / d</p>
              </div>

              <!-- AI Annotation Callout Overlay -->
              <div class="absolute right-4 top-16 w-60 rounded-lg border border-emerald-400 bg-emerald-50/90 p-3 text-[11px] text-emerald-900 shadow-md backdrop-blur-xs dark:bg-emerald-950/80 dark:text-emerald-200">
                <span class="font-bold">✓ AI Step 2 Verified:</span>
                <p class="mt-0.5">Gaussian surface boundary condition correctly applied. +2 marks.</p>
              </div>

              <div class="absolute right-4 bottom-8 w-60 rounded-lg border border-indigo-400 bg-indigo-50/90 p-3 text-[11px] text-indigo-900 shadow-md backdrop-blur-xs dark:bg-indigo-950/80 dark:text-indigo-200">
                <span class="font-bold">✓ Final Result & Units:</span>
                <p class="mt-0.5">Correct final expression and dimensional validity confirmed. +1 mark.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Step-by-Step Rubrics Panel -->
        <div class="space-y-4 lg:col-span-5">
          <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h2 class="text-sm font-bold text-slate-900 dark:text-white">Step-Wise Rubric Scoring</h2>
            <div class="mt-4 space-y-3">
              @for (rubric of rubrics(); track rubric.id) {
                <div class="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-slate-800 dark:text-slate-200">{{ rubric.criterion }}</span>
                    <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ rubric.awardedMarks }} / {{ rubric.maxMarks }}</span>
                  </div>
                  <p class="mt-1 text-slate-600 dark:text-slate-400">{{ rubric.reasoning }}</p>
                  <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Confidence: {{ rubric.confidence * 100 }}%</span>
                    <span class="cursor-pointer font-medium text-indigo-600 hover:underline">Override</span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class EvaluationCockpitComponent {
  public rubrics = signal<IEvalRubricItem[]>([
    {
      id: 'rub-01',
      criterion: 'Gauss Law Formulation & Surface Charge Density',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Correctly specified sigma = Q/A and uniform field between plates.',
      confidence: 0.98,
    },
    {
      id: 'rub-02',
      criterion: 'Electric Field & Potential Integration (V = E * d)',
      maxMarks: 2,
      awardedMarks: 2,
      reasoning: 'Proper substitution of E into potential integral with zero boundary error.',
      confidence: 0.95,
    },
    {
      id: 'rub-03',
      criterion: 'Final Capacitance Expression & Units',
      maxMarks: 1,
      awardedMarks: 1,
      reasoning: 'C = epsilon_0 * A / d accurately derived with clean conclusion.',
      confidence: 0.99,
    },
  ]);
}
