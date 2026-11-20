import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IVoiceIntent } from '../../../../shared/models/voice-agent.model';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-intent-card',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, AppButtonComponent],
  template: `
    <div class="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-slate-900 dark:text-white">Normalized Parameter Slots</h2>
            <app-status-badge
              [label]="confidenceLabel()"
              [variant]="isComplete() ? 'success' : 'warning'"
            />
          </div>
          <p class="text-xs text-slate-500 mt-0.5">Autonomous extraction via Gemini 2.5 Flash Structured JSON Schema</p>
        </div>

        <div class="flex items-center gap-2">
          @if (isComplete()) {
            <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <svg class="h-3.5 w-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              All Slots Validated
            </span>
          } @else {
            <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Slots Incomplete
            </span>
          }
        </div>
      </div>

      <!-- Parameter Slots Grid -->
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <!-- Exam Title -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Exam Title</span>
          <p class="mt-1 font-semibold text-slate-800 dark:text-slate-200 truncate" [title]="intent()?.extractedSlots?.title || 'Pending'">
            {{ intent()?.extractedSlots?.title || 'Auto-generated Title' }}
          </p>
        </div>

        <!-- Target Batch -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Target Batch</span>
          <div class="mt-1 flex items-center gap-1.5">
            <span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              👥 {{ intent()?.extractedSlots?.batchName || 'Unassigned' }}
            </span>
          </div>
        </div>

        <!-- Subject & Topic -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Subject & Topic</span>
          <p class="mt-1 font-semibold text-slate-800 dark:text-slate-200 truncate">
            {{ intent()?.extractedSlots?.subject || 'Physics' }} &bull; {{ intent()?.extractedSlots?.topic || 'Electrostatics' }}
          </p>
        </div>

        <!-- Question Count & Difficulty -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Questions & Pattern</span>
          <p class="mt-1 font-semibold text-slate-800 dark:text-slate-200">
            {{ intent()?.extractedSlots?.questionCount ?? 0 }} Items &bull;
            <span class="capitalize">{{ intent()?.extractedSlots?.difficulty || 'medium' }}</span> ({{ intent()?.extractedSlots?.examPattern || 'NEET' }})
          </p>
        </div>

        <!-- Duration & Timing Window -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Duration & Time-Lock</span>
          <p class="mt-1 font-semibold text-slate-800 dark:text-slate-200">
            ⏱️ {{ intent()?.extractedSlots?.durationMinutes ?? 0 }} Mins ({{ intent()?.extractedSlots?.startTime || '10:00' }} - {{ intent()?.extractedSlots?.endTime || '10:45' }})
          </p>
        </div>

        <!-- Marking & Negative Rule -->
        <div class="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <span class="font-medium text-slate-400">Marking & Penalty Rule</span>
          <div class="mt-1 flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <span class="text-emerald-600 dark:text-emerald-400">+{{ intent()?.extractedSlots?.marksPerQuestion ?? 4 }} pts</span>
            <span class="text-slate-400">/</span>
            <span class="text-rose-600 dark:text-rose-400 font-mono">{{ intent()?.extractedSlots?.negativeRule || '1/4 Negative' }}</span>
          </div>
        </div>
      </div>

      <!-- Ambiguity Resolution / Missing Slots Warning -->
      @if (missingSlots().length > 0) {
        <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-800/60 dark:bg-amber-950/30">
          <div class="flex items-start gap-2">
            <span class="text-base">⚠️</span>
            <div class="flex-1">
              <span class="text-xs font-bold text-amber-900 dark:text-amber-200">
                Ambiguity Detected - Clarification Required:
              </span>
              <p class="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                The agent requires explicit values for the following slots before generating questions:
              </p>
              <div class="mt-2 flex flex-wrap gap-1.5">
                @for (slot of missingSlots(); track slot) {
                  <button
                    type="button"
                    (click)="resolveSlot(slot)"
                    class="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-semibold text-amber-800 shadow-2xs hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/60 dark:text-amber-200 cursor-pointer"
                  >
                    <span>+ Provide {{ slot }}</span>
                  </button>
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Action Footer -->
      <div class="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
        <span class="text-[11px] text-slate-400">
          Action: <span class="font-mono font-semibold text-indigo-600 dark:text-indigo-400">{{ intent()?.detectedAction || 'CREATE_EXAM' }}</span>
        </span>

        <div class="flex items-center gap-2">
          <app-button
            variant="ghost"
            size="sm"
            label="Re-parse Audio"
            (clicked)="reparseRequested.emit()"
          />
          <app-button
            variant="primary"
            size="sm"
            icon="🚀"
            label="Execute MCP Plan"
            [disabled]="!isComplete()"
            (clicked)="planAccepted.emit()"
          />
        </div>
      </div>
    </div>
  `,
})
export class IntentCardComponent {
  public intent = input<IVoiceIntent | null>(null);

  public planAccepted = output<void>();
  public reparseRequested = output<void>();
  public slotSelected = output<string>();

  public isComplete = computed(() => {
    return this.intent()?.isComplete ?? false;
  });

  public missingSlots = computed(() => {
    return this.intent()?.missingRequiredSlots ?? [];
  });

  public confidenceLabel = computed(() => {
    const conf = this.intent()?.confidence ?? 0;
    return `Confidence ${Math.round(conf * 100)}%`;
  });

  public resolveSlot(slot: string): void {
    this.slotSelected.emit(slot);
  }
}
