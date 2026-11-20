import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="buttonClasses()"
      (click)="onClick($event)"
      class="group relative inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none active:scale-[0.98]"
    >
      @if (loading()) {
        <svg
          class="animate-spin -ml-0.5 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      } @else if (icon()) {
        <span class="inline-flex items-center" [class.mr-2]="!!label() || hasContent">
          {{ icon() }}
        </span>
      }

      @if (label()) {
        <span>{{ label() }}</span>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class AppButtonComponent {
  public variant = input<ButtonVariant>('primary');
  public size = input<ButtonSize>('md');
  public label = input<string>('');
  public icon = input<string>('');
  public loading = input<boolean>(false);
  public disabled = input<boolean>(false);
  public type = input<'button' | 'submit' | 'reset'>('button');

  public clicked = output<MouseEvent>();

  protected hasContent = false;

  public buttonClasses = computed(() => {
    const sizeMap: Record<ButtonSize, string> = {
      sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
      md: 'px-4 py-2 text-sm rounded-xl gap-2 shadow-xs',
      lg: 'px-6 py-3 text-base rounded-xl gap-2.5 shadow-sm',
    };

    const variantMap: Record<ButtonVariant, string> = {
      primary:
        'bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-indigo-500 shadow-indigo-500/20 hover:shadow-md hover:shadow-indigo-500/25 dark:bg-indigo-500 dark:hover:bg-indigo-400',
      secondary:
        'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700/80',
      accent:
        'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 focus:ring-teal-500 shadow-teal-500/20 hover:shadow-md hover:shadow-teal-500/25',
      danger:
        'bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-500 shadow-rose-500/20 hover:shadow-md hover:shadow-rose-500/25 dark:bg-rose-600 dark:hover:bg-rose-500',
      ghost:
        'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
    };

    return `${sizeMap[this.size()]} ${variantMap[this.variant()]}`;
  });

  public onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit(event);
    }
  }
}
