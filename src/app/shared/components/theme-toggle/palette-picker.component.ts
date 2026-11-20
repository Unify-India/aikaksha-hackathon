import { Component, inject } from '@angular/core';
import { PALETTES, Palette, ThemeService } from '../../../core/services/theme.service';

/** Three colour swatches in the header. Behaves as a radio group, so arrow keys and screen readers work. */
@Component({
  selector: 'app-palette-picker',
  standalone: true,
  template: `
    <div role="radiogroup" aria-label="Colour palette" class="flex items-center gap-1">
      @for (p of palettes; track p.id) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="theme.palette() === p.id"
          [attr.aria-label]="p.label + ' palette'"
          [title]="p.label"
          [tabindex]="theme.palette() === p.id ? 0 : -1"
          (click)="theme.setPalette(p.id)"
          (keydown.arrowright)="move(1)"
          (keydown.arrowleft)="move(-1)"
          class="flex h-11 w-8 cursor-pointer items-center justify-center rounded-full"
        >
          <span
            class="block h-5 w-5 rounded-full ring-offset-2 ring-offset-slate-50 transition-transform duration-150 hover:scale-110 dark:ring-offset-slate-950"
            [style.background]="swatch(p.id)"
            [class.ring-2]="theme.palette() === p.id"
            [class.ring-slate-900]="theme.palette() === p.id"
            [class.dark:ring-white]="theme.palette() === p.id"
          ></span>
        </button>
      }
    </div>
  `,
})
export class PalettePickerComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly palettes = PALETTES;

  /** Fixed colours, so each swatch always shows its own palette whichever one is active. */
  protected swatch(id: Palette): string {
    switch (id) {
      case 'ember':
        return 'linear-gradient(135deg, #ff8238, #c72a6b)';
      case 'iris':
        return 'linear-gradient(135deg, #7e8cff, #6d3fe0)';
      case 'aurora':
      default:
        return 'linear-gradient(135deg, #2bbbd6, #2f52cc)';
    }
  }

  protected move(step: number): void {
    const index = PALETTES.findIndex((p) => p.id === this.theme.palette());
    const next = PALETTES[(index + step + PALETTES.length) % PALETTES.length];
    this.theme.setPalette(next.id);
  }
}
