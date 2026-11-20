import { buildImagePdf } from './image-pdf-writer';

const fakeJpeg = (n: number) => new Uint8Array([0xff, 0xd8, n, 1, 2, 3, 0xff, 0xd9]);

async function text(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
}

describe('buildImagePdf', () => {
  it('writes a PDF with one image page per JPEG and a valid cross-reference table', async () => {
    const blob = buildImagePdf(
      [
        { jpeg: fakeJpeg(1), width: 1400, height: 1980 },
        { jpeg: fakeJpeg(2), width: 1400, height: 990 },
      ],
      'Student C - marked copy',
    );
    expect(blob.type).toBe('application/pdf');
    const pdf = await text(blob);

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/Type /Pages /Kids [4 0 R 7 0 R] /Count 2');
    expect(pdf).toContain('/Title (Student C - marked copy)');
    expect(pdf).toContain('/MediaBox [0 0 595.28 841.9]'); // A4 width x image aspect ratio (595.28 * 1980/1400)
    expect(pdf).toContain('/MediaBox [0 0 595.28 420.95]'); // 595.28 * 990/1400
    expect(pdf.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    // Every xref entry must point exactly at "<id> 0 obj", and startxref at the xref table.
    const startxref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
    const entries = pdf.slice(startxref).match(/^\d{10} 00000 n $/gm)!;
    expect(entries).toHaveLength(3 + 2 * 3);
    entries.forEach((entry, i) => {
      const offset = Number(entry.slice(0, 10));
      expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('keeps the title safe for the PDF format', async () => {
    const pdf = await text(buildImagePdf([{ jpeg: fakeJpeg(1), width: 10, height: 10 }], 'A (B) \\ C · ✓'));
    expect(pdf).toContain('/Title (A \\(B\\) \\\\ C  )');
  });

  it('refuses to write an empty PDF', () => {
    expect(() => buildImagePdf([])).toThrow('No pages');
  });
});
