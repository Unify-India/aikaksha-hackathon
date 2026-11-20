/** "7 pages · 1.8 MB as JPEG" — shown in the activity panel after a PDF is converted. */
export function pagesSummary(pages: Blob[]): string {
  const mb = pages.reduce((sum, p) => sum + p.size, 0) / (1024 * 1024);
  return `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} · ${mb.toFixed(1)} MB as JPEG`;
}
