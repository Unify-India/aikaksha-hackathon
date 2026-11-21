import { Component, model } from '@angular/core';
import { QUESTION_GEN_KEYS } from '../data/gemini-keys';

/**
 * Chat-style picker for the Gemini key used to generate questions (like a model switcher).
 * "Server key" (empty id) goes through the backend relay; the others call Gemini directly.
 */
@Component({
  selector: 'app-gemini-key-picker',
  host: { class: 'flex items-center justify-end gap-2 text-xs' },
  template: `
    @if (keys.length) {
    <label for="gemini-key-picker" class="text-slate-600 dark:text-slate-400">Question key</label>
    <select
      id="gemini-key-picker"
      class="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      [value]="keyId()"
      (change)="keyId.set($any($event.target).value)"
    >
      <option value="">Server key (default)</option>
      @for (key of keys; track key.id) {
        <option [value]="key.id">{{ key.label }}'s key</option>
      }
    </select>
    }
  `,
})
export class GeminiKeyPickerComponent {
  /** Selected key id from QUESTION_GEN_KEYS; '' = server key. */
  readonly keyId = model('');
  protected readonly keys = QUESTION_GEN_KEYS;
}
