import { Component, input, computed } from '@angular/core';

export type StatusVariant = 'draft' | 'pending' | 'success' | 'warning' | 'danger' | 'info';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span
      [class]="badgeClasses()"
      class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
    >
      <span [class]="dotClasses()" class="h-1.5 w-1.5 rounded-full" aria-hidden="true"></span>
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
        return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
      case 'warning':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'danger':
        return 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
      case 'draft':
      case 'pending':
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      case 'info':
      default:
        return 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
    }
  });

  public dotClasses = computed(() => {
    switch (this.variant()) {
      case 'success':
        return 'bg-emerald-600';
      case 'warning':
        return 'bg-amber-600';
      case 'danger':
        return 'bg-rose-600';
      case 'draft':
      case 'pending':
        return 'bg-slate-400';
      case 'info':
      default:
        return 'bg-indigo-600';
    }
  });
}
