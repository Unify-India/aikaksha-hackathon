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
            class="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span aria-hidden="true">{{ s.icon }}</span>
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
