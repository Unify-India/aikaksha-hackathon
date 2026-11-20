import { Service, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type Palette = 'aurora' | 'ember' | 'iris';

export const PALETTES: readonly { id: Palette; label: string }[] = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'ember', label: 'Ember' },
  { id: 'iris', label: 'Iris' },
];

const THEME_KEY = 'ai-kaksha-theme';
const PALETTE_KEY = 'ai-kaksha-palette';
const THEME_COLOR: Record<Theme, string> = { light: '#F7F8FA', dark: '#0A0C12' };

/**
 * Light / dark switch and colour palette. The initial values were already applied to
 * <html data-theme data-palette> by the inline script in index.html (saved choice, else the OS
 * setting for the theme), so this only reads them and changes them.
 */
@Service()
export class ThemeService {
  private readonly _theme = signal<Theme>(this.readTheme());
  private readonly _palette = signal<Palette>(this.readPalette());

  public readonly theme = this._theme.asReadonly();
  public readonly palette = this._palette.asReadonly();

  public toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  public set(theme: Theme): void {
    this._theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    this.save(THEME_KEY, theme);
  }

  public setPalette(palette: Palette): void {
    this._palette.set(palette);
    document.documentElement.setAttribute('data-palette', palette);
    this.save(PALETTE_KEY, palette);
  }

  private save(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the choice still applies for this visit.
    }
  }

  private readTheme(): Theme {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  private readPalette(): Palette {
    const value = document.documentElement.getAttribute('data-palette');
    return PALETTES.some((p) => p.id === value) ? (value as Palette) : 'aurora';
  }
}
