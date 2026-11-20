/** Test double: jsdom cannot render PDFs, so pretend every PDF has 3 pages and render to a fake URL. */
export const fakePdfService = {
  countPages: async () => 3,
  toJpegPages: async () => [1, 2, 3].map(() => new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })),
  open: async () => ({ numPages: 3, loadingTask: { destroy: async () => undefined } }),
  renderPage: async (_doc: unknown, page: number) => ({ page, url: `blob:page-${page}`, width: 1000, height: 0 }),
};
