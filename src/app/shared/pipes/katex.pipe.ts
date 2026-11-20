import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import katex from 'katex';

/**
 * Renders text with LaTeX: `$$…$$` as display maths, `$…$` as inline maths (docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §5).
 *
 * Safe without Angular's sanitizer: all non-maths text is HTML-escaped here, and KaTeX runs with
 * `trust: false` (no \href, \url or raw HTML). Angular's sanitizer cannot be used because it strips
 * the inline styles KaTeX needs for layout. Output includes MathML so screen readers can read formulas.
 */
@Pipe({ name: 'katex' })
export class KatexPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(content: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMathText(content ?? ''));
  }
}

const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

export function renderMathText(content: string): string {
  let html = '';
  let last = 0;
  for (const match of content.matchAll(MATH)) {
    html += escapeText(content.slice(last, match.index));
    const display = match[1] !== undefined;
    html += katex.renderToString((display ? match[1] : match[2]).trim(), {
      displayMode: display,
      throwOnError: false,
      trust: false,
      output: 'htmlAndMathml',
    });
    last = match.index + match[0].length;
  }
  return html + escapeText(content.slice(last));
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}
