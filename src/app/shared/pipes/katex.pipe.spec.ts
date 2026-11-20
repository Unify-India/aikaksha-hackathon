import { renderMathText } from './katex.pipe';

describe('renderMathText', () => {
  it('renders inline and display maths with MathML for screen readers', () => {
    const html = renderMathText('Flux is $\\frac{q}{6\\varepsilon_0}$ and $$E = mc^2$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('<math');
    expect(html).toContain('katex-display');
    expect(html).not.toContain('$');
  });

  it('escapes HTML outside maths so question text cannot inject markup', () => {
    const html = renderMathText('<img src=x onerror=alert(1)> 2 < 3 & "q"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; 2 &lt; 3 &amp; &quot;q&quot;');
  });

  it('does not execute \\href or raw HTML inside maths, and survives bad LaTeX', () => {
    const html = renderMathText('$\\href{javascript:alert(1)}{x}$');
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain('href=');
    expect(renderMathText('$\\htmlClass{x}{y}$')).not.toContain('class="x"');
    expect(renderMathText('$\\frac{1}{$')).toBeTruthy();
  });

  it('keeps line breaks in explanations', () => {
    expect(renderMathText('Step 1\nStep 2')).toBe('Step 1<br>Step 2');
  });
});
