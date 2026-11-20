import { Component, input, output } from '@angular/core';

export const DEFAULT_SUGGESTIONS: readonly { icon: string; text: string }[] = [
  { icon: '🧪', text: 'NEET Electrostatics test for Lakshya 2026 tomorrow at 10 AM, 15 questions' },
  { icon: '📘', text: 'Generate a Class 10 Physics question paper on linear motion' },
  { icon: '⚡', text: 'Aaj Doppler effect aur beats padhaya, Lakshya batch ke liye DPP bana do' },
];

@Component({
  selector: 'app-suggestion-chips',
  template: `
    <ul class="flex flex-col gap-1" aria-label="Suggested requests">
      @for (s of suggestions(); track s.text) {
        <li>
          <button
            type="button"
            [disabled]="disabled()"
            (click)="pick.emit(s.text)"
            class="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
          >
            <svg
              aria-hidden="true"
              class="h-4 w-4 shrink-0 text-indigo-600 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-indigo-300"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0-5-5m5 5-5 5" />
            </svg>
            <span>{{ s.text }}</span>
          </button>
        </li>
      }
    </ul>
  `,
})
export class SuggestionChipsComponent {
  readonly suggestions = input(DEFAULT_SUGGESTIONS);
  readonly disabled = input(false);
  readonly pick = output<string>();
}
