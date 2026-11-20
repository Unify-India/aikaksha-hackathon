/** Test double: jsdom cannot render PDFs, so pretend every PDF has 3 pages. */
export const fakePdfService = {
  countPages: async () => 3,
  toJpegPages: async () => [1, 2, 3].map(() => new Blob([new Uint8Array(1024)], { type: 'image/jpeg' })),
};
