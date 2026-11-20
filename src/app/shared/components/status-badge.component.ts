import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusVariant = 'draft' | 'pending' | 'success' | 'warning' | 'danger' | 'info';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      [class]="badgeClasses()"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide border uppercase"
    >
      <span [class]="dotClasses()" class="w-1.5 h-1.5 rounded-full"></span>
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  public label = input.required<string>();
  public variant = input<StatusVariant>('info');

  public badgeClasses = computed(() => {
    switch (this.variant()) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'danger':
        return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'draft':
      case 'pending':
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      case 'info':
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
    }
  });

  public dotClasses = computed(() => {
    switch (this.variant()) {
      case 'success':
        return 'bg-emerald-500 animate-pulse';
      case 'warning':
        return 'bg-amber-500';
      case 'danger':
        return 'bg-rose-500';
      case 'draft':
      case 'pending':
        return 'bg-slate-400';
      case 'info':
      default:
        return 'bg-indigo-500';
    }
  });
}
