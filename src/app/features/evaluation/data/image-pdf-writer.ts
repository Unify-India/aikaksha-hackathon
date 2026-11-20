/**
 * Minimal PDF writer: one JPEG image per page, page size = A4 width with the image's aspect ratio.
 * Enough for "marked copy" downloads without pulling in a PDF library.
 */
export interface IJpegPage {
  /** Raw JPEG bytes. */
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  width: number;
  height: number;
}

const A4_WIDTH_PT = 595.28;

export function buildImagePdf(pages: IJpegPage[], title = 'Marked answer sheet'): Blob {
  if (pages.length === 0) throw new Error('No pages to write.');
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: (string | Uint8Array)[]) => {
    offsets[id] = length;
    write(`${id} 0 obj\n`);
    body.forEach(write);
    write('\nendobj\n');
  };

  // Object ids: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const pageIds = pages.map((_, i) => 4 + i * 3);
  write('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  object(3, [`<< /Title (${escapePdfText(title)}) /Producer (AI Kaksha) >>`]);

  pages.forEach((page, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const w = A4_WIDTH_PT;
    const h = +(A4_WIDTH_PT * (page.height / page.width)).toFixed(2);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(pageId, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    ]);
    object(contentId, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      '\nendstream',
    ]);
  });

  const objectCount = 3 + pages.length * 3;
  const xrefOffset = length;
  write(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

function escapePdfText(text: string): string {
  // Keep the title ASCII-safe for the PDF string literal.
  return text.replace(/[^\x20-\x7E]/g, '').replace(/([\\()])/g, '\\$1');
}
