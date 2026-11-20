import { TestBed } from '@angular/core/testing';
import { PalettePickerComponent } from './palette-picker.component';

describe('PalettePickerComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.setAttribute('data-palette', 'aurora');
    await TestBed.configureTestingModule({ imports: [PalettePickerComponent] }).compileComponents();
  });

  afterEach(() => {
    document.documentElement.removeAttribute('data-palette');
    localStorage.clear();
  });

  it('shows three palettes with Aurora selected, and switches on click', async () => {
    const fixture = TestBed.createComponent(PalettePickerComponent);
    await fixture.whenStable();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button[role="radio"]'));
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Aurora palette', 'Ember palette', 'Iris palette']);
    expect(buttons[0].getAttribute('aria-checked')).toBe('true');

    (buttons[1] as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(document.documentElement.getAttribute('data-palette')).toBe('ember');
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    expect(buttons[0].getAttribute('aria-checked')).toBe('false');
  });

  it('moves with the arrow keys', async () => {
    const fixture = TestBed.createComponent(PalettePickerComponent);
    await fixture.whenStable();
    const first = (fixture.nativeElement as HTMLElement).querySelector('button[role="radio"]') as HTMLButtonElement;
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await fixture.whenStable();
    expect(document.documentElement.getAttribute('data-palette')).toBe('ember');
  });
});
