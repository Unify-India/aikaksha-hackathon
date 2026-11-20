import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatusBadgeComponent } from '../../../../shared/components/status-badge.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';

@Component({
  selector: 'app-audio-visualizer',
  standalone: true,
  imports: [CommonModule, StatusBadgeComponent, AppButtonComponent],
  template: `
    <div class="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900">
      <!-- Ambient background glow when recording -->
      @if (isListening()) {
        <div class="pointer-events-none absolute -inset-px -z-10 bg-radial from-rose-500/15 via-transparent to-transparent opacity-75 blur-xl"></div>
      }

      <!-- Header: Title + Status Indicators -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5">
          <span class="text-sm font-semibold text-slate-800 dark:text-slate-200">Real-Time Waveform & Voice Spectrum</span>
          <app-status-badge
            [label]="isListening() ? 'RECORDING' : 'READY'"
            [variant]="isListening() ? 'danger' : 'info'"
          />
        </div>

        <div class="flex items-center gap-2">
          <!-- Live Audio Bitrate / Codec badge -->
          <span class="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <span class="h-1.5 w-1.5 rounded-full" [class]="isListening() ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'"></span>
            16kHz PCM
          </span>
          <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            VAD Active
          </span>
        </div>
      </div>

      <!-- Waveform Visualizer Display -->
      <div class="mt-4 flex h-24 items-center justify-center gap-1.5 rounded-xl bg-slate-950 p-4 shadow-inner">
        @for (bar of waveformBars(); track $index) {
          <div
            [style.height.%]="bar"
            [class]="barClass($index)"
            class="w-1.5 min-h-[6px] rounded-full transition-all duration-100 ease-out"
          ></div>
        }
      </div>

      <!-- Control Bar with Pulse Ring & Mic Action -->
      <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <!-- Mic Pulse Ring Button -->
          <div class="relative flex items-center justify-center">
            @if (isListening()) {
              <span class="absolute inline-flex h-12 w-12 animate-ping rounded-full bg-rose-400/40"></span>
              <span class="absolute inline-flex h-14 w-14 animate-pulse rounded-full bg-rose-500/20"></span>
            }
            <button
              type="button"
              (click)="onMicClick()"
              [class]="isListening() ? 'bg-rose-600 text-white hover:bg-rose-500 ring-4 ring-rose-400/30' : 'bg-indigo-600 text-white hover:bg-indigo-500'"
              class="relative z-10 flex h-11 w-11 items-center justify-center rounded-full shadow-md transition-all duration-200 cursor-pointer active:scale-95"
              [title]="isListening() ? 'Stop Recording' : 'Start Voice Intake'"
            >
              @if (isListening()) {
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              } @else {
                <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3v6a3 3 0 003 3z" />
                </svg>
              }
            </button>
          </div>

          <div class="flex flex-col">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {{ isListening() ? 'Listening to Teacher Voice...' : 'Voice Intake Standby' }}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              {{ isListening() ? 'Click square to stop & trigger parsing' : 'Tap mic to speak exam requirements' }}
            </span>
          </div>
        </div>

        <!-- Speech Status Chips & Sample Action -->
        <div class="flex items-center gap-2">
          <span
            [class]="isListening() ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'"
            class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            <span class="h-1.5 w-1.5 rounded-full" [class]="isListening() ? 'bg-rose-500 animate-ping' : 'bg-slate-400'"></span>
            {{ isListening() ? 'Speech Detected' : 'Silence' }}
          </span>

          <app-button
            variant="secondary"
            size="sm"
            icon="✨"
            label="Load Sample NEET"
            (clicked)="samplePromptRequested.emit()"
          />
        </div>
      </div>
    </div>
  `,
})
export class AudioVisualizerComponent {
  public isListening = input<boolean>(false);
  public waveformBars = input<number[]>([25, 40, 75, 90, 60, 30, 85, 95, 45, 65, 80, 50, 35, 70, 90, 40, 20]);

  public toggleListening = output<void>();
  public samplePromptRequested = output<void>();

  public onMicClick(): void {
    this.toggleListening.emit();
  }

  public barClass(index: number): string {
    if (!this.isListening()) {
      return 'bg-slate-700';
    }
    // Dynamic color gradient based on index and height
    const colors = [
      'bg-indigo-400',
      'bg-indigo-300',
      'bg-teal-300',
      'bg-emerald-400',
      'bg-amber-300',
      'bg-rose-400',
    ];
    return colors[index % colors.length];
  }
}
