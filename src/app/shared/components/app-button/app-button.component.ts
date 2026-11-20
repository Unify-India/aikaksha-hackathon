import { Component, input, output, computed } from '@angular/core';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'danger-quiet'
  | 'ghost'
  | 'accent'
  | 'light'
  | 'outline-light';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="buttonClasses()"
      (click)="onClick($event)"
      class="inline-flex cursor-pointer select-none items-center justify-center font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
    >
      @if (loading()) {
        <svg
          class="-ml-0.5 mr-2 h-4 w-4 animate-spin text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
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
  /** Kept so existing callers still compile. Emoji icons are no longer drawn; the label carries the meaning. */
  public icon = input<string>('');
  public loading = input<boolean>(false);
  public disabled = input<boolean>(false);
  public type = input<'button' | 'submit' | 'reset'>('button');

  public clicked = output<MouseEvent>();

  protected hasContent = false;

  public buttonClasses = computed(() => {
    const sizeMap: Record<ButtonSize, string> = {
      sm: 'min-h-9 px-3 py-1.5 text-xs rounded-md gap-1.5',
      md: 'min-h-10 px-4 py-2 text-sm rounded-md gap-2',
      lg: 'min-h-11 px-5 py-2.5 text-sm rounded-md gap-2.5',
    };

    const variantMap: Record<ButtonVariant, string> = {
      primary:
        'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 dark:bg-indigo-400 dark:text-slate-950 dark:shadow-indigo-400/20 dark:hover:bg-indigo-300',
      secondary:
        'border border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300',
      accent:
        'bg-emerald-700 text-white shadow-sm shadow-emerald-700/30 hover:bg-emerald-800',
      danger:
        'bg-rose-700 text-white shadow-sm shadow-rose-700/30 hover:bg-rose-800 dark:bg-rose-600 dark:hover:bg-rose-500',
      'danger-quiet':
        'border border-rose-300 bg-transparent text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40',
      ghost:
        'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300',
      /* For use on the gradient hero panels. */
      light:
        'bg-white text-indigo-700 shadow-sm hover:bg-indigo-50',
      'outline-light':
        'border border-white/50 bg-transparent text-white hover:bg-white/15',
    };

    return `${sizeMap[this.size()]} ${variantMap[this.variant()]}`;
  });

  public onClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit(event);
    }
  }
}
