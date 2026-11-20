import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
        <span class="text-xs font-semibold tracking-wider uppercase">{{ title() }}</span>
        @if (icon()) {
          <span class="text-base">{{ icon() }}</span>
        }
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{{ value() }}</span>
        @if (subtitle()) {
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ subtitle() }}</span>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  public title = input.required<string>();
  public value = input.required<string | number>();
  public subtitle = input<string>();
  public icon = input<string>();
}
