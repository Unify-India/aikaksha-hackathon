import { Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  template: `
    <div class="lift rounded-lg border border-t-2 border-slate-200 border-t-indigo-500 bg-white px-4 py-3 dark:border-slate-800 dark:border-t-indigo-400 dark:bg-slate-900">
      <p class="text-xs text-slate-600 dark:text-slate-400">{{ title() }}</p>
      <p class="mt-1 font-serif text-2xl font-semibold leading-tight text-slate-900 dark:text-white">{{ value() }}</p>
      @if (subtitle()) {
        <p class="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{{ subtitle() }}</p>
      }
    </div>
  `,
})
export class StatCardComponent {
  public title = input.required<string>();
  public value = input.required<string | number>();
  public subtitle = input<string>();
  /** Kept so existing callers still compile. Icons are no longer drawn: the label says what the figure is. */
  public icon = input<string>();
}
