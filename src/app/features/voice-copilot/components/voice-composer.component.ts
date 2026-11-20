import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { AudioIo } from '../data/audio-io';

const BARS = 5;
const IDLE = Array<number>(BARS).fill(0.15);

/** Gemini-style input pill: type, or tap the mic and talk. Shows a live waveform while audio flows. */
@Component({
  selector: 'app-voice-composer',
  template: `
    <form
      (submit)="submit($event)"
      class="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-5 pr-2 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800"
      [class.opacity-60]="disabled()"
    >
      <label for="copilot-input" class="sr-only">Describe the exam or DPP you want</label>
      <input
        id="copilot-input"
        type="text"
        autocomplete="off"
        [disabled]="disabled()"
        [value]="text()"
        (input)="onInput($event)"
        [placeholder]="micOn() ? 'Listening… or type here' : placeholder()"
        class="min-w-0 flex-1 bg-transparent py-2 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-400"
      />

      @if (micOn() || agentSpeaking()) {
        <span class="flex h-8 items-center gap-0.5 px-1" aria-hidden="true">
          @for (level of levels(); track $index) {
            <span
              class="w-1 rounded-full transition-[height] duration-75"
              [class]="agentSpeaking() ? 'bg-indigo-500' : 'bg-rose-500'"
              [style.height.%]="15 + level * 85"
            ></span>
          }
        </span>
      }

      @if (text().trim()) {
        <button
          type="submit"
          [disabled]="disabled()"
          aria-label="Send message"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z" /></svg>
        </button>
      }

      <button
        type="button"
        (click)="toggleMic.emit()"
        [disabled]="disabled() || !micSupported()"
        [attr.aria-pressed]="micOn()"
        [attr.aria-label]="micOn() ? 'Stop microphone' : 'Start talking'"
        [title]="micSupported() ? '' : 'Voice input needs Chrome or Edge'"
        [class]="
          micOn()
            ? 'bg-rose-600 text-white hover:bg-rose-500'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
        "
        class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        @if (micOn()) {
          <span class="absolute inset-0 rounded-full bg-rose-500/40 motion-safe:animate-ping" aria-hidden="true"></span>
        }
        <svg aria-hidden="true" viewBox="0 0 24 24" class="relative h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
    </form>
  `,
})
export class VoiceComposerComponent {
  private readonly audio = inject(AudioIo);

  readonly micOn = input(false);
  readonly agentSpeaking = input(false);
  readonly micSupported = input(true);
  readonly disabled = input(false);
  readonly placeholder = input('Ask AI Kaksha to set up an exam');
  readonly send = output<string>();
  readonly toggleMic = output<void>();

  protected readonly text = signal('');
  protected readonly levels = signal<number[]>(IDLE);

  private frame = 0;
  private readonly reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    effect(() => {
      const active = this.micOn() || this.agentSpeaking();
      cancelAnimationFrame(this.frame);
      if (!active || this.reducedMotion) {
        this.levels.set(active ? Array<number>(BARS).fill(0.5) : IDLE);
        return;
      }
      const tick = () => {
        const level = this.audio.level(this.agentSpeaking() ? 'speaker' : 'mic');
        // Centre bars move most, like a voice meter.
        this.levels.set(Array.from({ length: BARS }, (_, i) => Math.min(1, level * (1 - Math.abs(i - 2) * 0.25) * (0.8 + Math.random() * 0.4))));
        this.frame = requestAnimationFrame(tick);
      };
      tick();
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.text().trim();
    if (!value || this.disabled()) return;
    this.send.emit(value);
    this.text.set('');
  }
}
