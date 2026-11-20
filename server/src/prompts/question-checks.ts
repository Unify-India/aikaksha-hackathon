/**
 * Deterministic checks on model-written questions. The model's output is untrusted:
 * these run after zod validation, before anything is saved or shown.
 *
 * Owner: Sakshi.
 */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;

export interface McqLike {
  stem: string;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string;
}

export interface CheckResult {
  /** The question must be dropped. */
  fatal: string[];
  /** The question is kept but flagged for the teacher. */
  warnings: string[];
}

/** Structural + LaTeX checks for one MCQ. */
export function checkMcq(q: McqLike, opts: { requireKey: boolean }): CheckResult {
  const fatal: string[] = [];
  const warnings: string[] = [];

  if (!q.stem.trim()) fatal.push('EMPTY_STEM');

  if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
    fatal.push(`OPTION_COUNT: ${q.options.length} options (allowed ${MIN_OPTIONS}–${MAX_OPTIONS})`);
  }
  const ids = q.options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) fatal.push('DUPLICATE_OPTION_ID');
  if (q.options.some((o) => !o.text.trim())) fatal.push('EMPTY_OPTION');

  // Strict: only spaces and $ delimiters are ignored. Case matters (R ≠ r in physics),
  // and `\frac{a}{b}` and `ab` must stay different.
  const texts = q.options.map((o) => o.text.replace(/\$/g, '').replace(/\s+/g, ''));
  if (new Set(texts).size !== texts.length) fatal.push('DUPLICATE_OPTION_TEXT');

  if (opts.requireKey) {
    if (!q.correctOptionId || !ids.includes(q.correctOptionId)) fatal.push('CORRECT_OPTION_NOT_IN_OPTIONS');
    if (!q.explanation?.trim()) warnings.push('MISSING_EXPLANATION');
  }

  for (const [where, text] of [
    ['stem', q.stem],
    ...q.options.map((o) => [`option ${o.id}`, o.text] as const),
    ...(q.explanation ? [['explanation', q.explanation] as const] : []),
  ] as const) {
    for (const issue of checkLatex(text)) warnings.push(`LATEX_ERROR in ${where}: ${issue}`);
  }

  return { fatal, warnings };
}

/** Finds common LaTeX breakages: unbalanced $ / $$, braces, \left/\right, \( \), \[ \]. */
export function checkLatex(text: string): string[] {
  const issues: string[] = [];
  const unescaped = text.replace(/\\\$/g, '');

  const display = (unescaped.match(/\$\$/g) ?? []).length;
  if (display % 2 !== 0) issues.push('unbalanced $$');
  const inline = (unescaped.replace(/\$\$/g, '').match(/\$/g) ?? []).length;
  if (inline % 2 !== 0) issues.push('unbalanced $');

  let depth = 0;
  for (let i = 0; i < unescaped.length; i++) {
    const ch = unescaped[i];
    if (ch === '\\' && (unescaped[i + 1] === '{' || unescaped[i + 1] === '}')) {
      i++; // escaped brace
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth < 0) break;
  }
  if (depth !== 0) issues.push('unbalanced braces');

  const lefts = (unescaped.match(/\\left\b/g) ?? []).length;
  const rights = (unescaped.match(/\\right\b/g) ?? []).length;
  if (lefts !== rights) issues.push('\\left/\\right mismatch');

  if ((unescaped.match(/\\\(/g) ?? []).length !== (unescaped.match(/\\\)/g) ?? []).length) issues.push('\\( \\) mismatch');
  if ((unescaped.match(/\\\[/g) ?? []).length !== (unescaped.match(/\\\]/g) ?? []).length) issues.push('\\[ \\] mismatch');

  return issues;
}

/** Lower-cases and strips LaTeX commands, maths delimiters and punctuation. Loose: for stem similarity only. */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\[a-z]+/g, ' ')
    .replace(/[$^_{}()[\]\\.,;:!?'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word-set Jaccard similarity of two stems, 0–1. */
export function stemSimilarity(a: string, b: string): number {
  const sa = new Set(normaliseText(a).split(' ').filter(Boolean));
  const sb = new Set(normaliseText(b).split(' ').filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared);
}

export const DUPLICATE_THRESHOLD = 0.8;

/** Keeps the first of any near-duplicate stems; returns kept items and how many were dropped. */
export function dedupeByStem<T>(items: T[], stemOf: (item: T) => string): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  for (const item of items) {
    const stem = stemOf(item);
    if (!kept.some((k) => stemSimilarity(stemOf(k), stem) >= DUPLICATE_THRESHOLD)) kept.push(item);
  }
  return { kept, dropped: items.length - kept.length };
}
