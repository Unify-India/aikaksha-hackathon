import { Service } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface IRenderedPage {
  /** 1-based page number. */
  page: number;
  /** PNG object URL; revoke with `URL.revokeObjectURL` when done. */
  url: string;
  width: number;
  height: number;
}

/**
 * Thin wrapper around pdf.js. The library (~1 MB) is loaded lazily the first
 * time a PDF is opened, so it never weighs down the other screens.
 */
@Service()
export class PdfDocumentService {
  private pdfjs: Promise<typeof import('pdfjs-dist')> | null = null;

  private load(): Promise<typeof import('pdfjs-dist')> {
    this.pdfjs ??= import('pdfjs-dist').then((lib) => {
      // Served from angular.json assets: node_modules/pdfjs-dist/build → /pdfjs
      lib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return lib;
    });
    return this.pdfjs;
  }

  async open(file: Blob): Promise<PDFDocumentProxy> {
    const lib = await this.load();
    const data = new Uint8Array(await file.arrayBuffer());
    return lib.getDocument({ data }).promise;
  }

  async countPages(file: Blob): Promise<number> {
    const doc = await this.open(file);
    try {
      return doc.numPages;
    } finally {
      await doc.loadingTask.destroy();
    }
  }

  /**
   * Converts every page of a PDF into a JPEG, keeping the total under `maxTotalBytes`
   * (Firebase HTTP functions reject requests above ~10 MB). Starts sharp and steps the
   * size/quality down only if the paper is too big.
   */
  async toJpegPages(file: Blob, maxTotalBytes = 8 * 1024 * 1024): Promise<Blob[]> {
    const attempts = [
      { width: 1600, quality: 0.82 },
      { width: 1400, quality: 0.72 },
      { width: 1200, quality: 0.62 },
      { width: 1000, quality: 0.55 },
    ];
    const doc = await this.open(file);
    try {
      let pages: Blob[] = [];
      for (const { width, quality } of attempts) {
        pages = [];
        for (let page = 1; page <= doc.numPages; page++) {
          pages.push(await this.renderToBlob(doc, page, width, 'image/jpeg', quality));
        }
        if (pages.reduce((sum, p) => sum + p.size, 0) <= maxTotalBytes) return pages;
      }
      return pages; // smallest attempt; the server will report if it is still too large
    } finally {
      await doc.loadingTask.destroy();
    }
  }

  /** Renders one page to a PNG object URL at roughly `targetWidth` CSS pixels wide. */
  async renderPage(doc: PDFDocumentProxy, page: number, targetWidth = 900): Promise<IRenderedPage> {
    const blob = await this.renderToBlob(doc, page, targetWidth, 'image/png');
    return { page, url: URL.createObjectURL(blob), width: targetWidth, height: 0 };
  }

  private async renderToBlob(
    doc: PDFDocumentProxy,
    page: number,
    targetWidth: number,
    type: 'image/png' | 'image/jpeg',
    quality?: number,
  ): Promise<Blob> {
    const pdfPage = await doc.getPage(page);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    if (type === 'image/jpeg') {
      // JPEG has no transparency: paint white first so empty areas are not black.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    await pdfPage.render({ canvas, viewport }).promise;
    pdfPage.cleanup();
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Page render failed'))), type, quality),
    );
  }
}
