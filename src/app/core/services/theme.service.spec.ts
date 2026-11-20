import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#F4F5FD">');
  });

  afterEach(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('starts from the theme already applied to <html>', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
  });

  it('toggles between light and dark and updates <html>', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('remembers the choice for the next visit', () => {
    const service = TestBed.inject(ThemeService);
    service.set('dark');
    expect(localStorage.getItem('ai-kaksha-theme')).toBe('dark');
  });

  it('updates the browser theme colour', () => {
    const service = TestBed.inject(ThemeService);
    service.set('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0A0C12');
    service.set('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#F7F8FA');
  });

  it('starts on the Aurora palette and switches palettes, saving the choice', () => {
    document.documentElement.removeAttribute('data-palette');
    const service = TestBed.inject(ThemeService);
    expect(service.palette()).toBe('aurora');

    service.setPalette('ember');
    expect(service.palette()).toBe('ember');
    expect(document.documentElement.getAttribute('data-palette')).toBe('ember');
    expect(localStorage.getItem('ai-kaksha-palette')).toBe('ember');
  });

  it('still switches when storage is blocked', () => {
    const service = TestBed.inject(ThemeService);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => service.set('dark')).not.toThrow();
    expect(service.theme()).toBe('dark');
    spy.mockRestore();
  });
});
