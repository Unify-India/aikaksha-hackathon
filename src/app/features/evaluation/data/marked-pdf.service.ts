import { Service, inject } from '@angular/core';
import {
  IMarkingScheme,
  ISheetEvaluation,
  QuestionVerdict,
  effectiveMarks,
  effectiveVerdict,
  questionLabel,
} from '../models/evaluation.models';
import { IJpegPage, buildImagePdf } from './image-pdf-writer';
import { PdfDocumentService } from './pdf-document.service';

/** Same colours and icons as the on-screen overlay (✓ correct, ◐ partly correct, ✗ wrong). */
const STYLE: Record<QuestionVerdict, { colour: string; fill: string; icon: string }> = {
  correct: { colour: '#047857', fill: 'rgba(16, 185, 129, 0.12)', icon: '✓' },
  partial: { colour: '#b45309', fill: 'rgba(251, 191, 36, 0.14)', icon: '◐' },
  wrong: { colour: '#be123c', fill: 'rgba(244, 63, 94, 0.12)', icon: '✗' },
  not_attempted: { colour: '#be123c', fill: 'rgba(244, 63, 94, 0.12)', icon: '–' },
};

const PAGE_WIDTH_PX = 1400;
const JPEG_QUALITY = 0.82;

/**
 * Builds a downloadable "marked copy" of a graded sheet: every page of the original PDF with the
 * final marks drawn on top (boxes + labels), and a score header on page 1. Runs in the browser —
 * no AI call, no cost. The original file is never changed.
 */
@Service()
export class MarkedPdfService {
  private readonly pdf = inject(PdfDocumentService);

  async build(file: Blob, sheet: ISheetEvaluation, scheme: IMarkingScheme | null): Promise<Blob> {
    const questions = new Map(scheme?.questions.map((q) => [q.id, q]) ?? []);
    const doc = await this.pdf.open(file);
    try {
      const pages: IJpegPage[] = [];
      for (let page = 1; page <= doc.numPages; page++) {
        const canvas = await this.pdf.renderToCanvas(doc, page, PAGE_WIDTH_PX);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas is not available in this browser.');

        for (const result of sheet.questions) {
          for (const region of result.evidence.filter((e) => e.page === page)) {
            const verdict = effectiveVerdict(result);
            const label = `${STYLE[verdict].icon} ${questionLabel(questions.get(result.questionId), result.questionId)} · ${effectiveMarks(result)}/${result.max}`;
            drawMark(ctx, canvas, region.box_2d, label, STYLE[verdict]);
          }
        }
        if (page === 1) drawHeader(ctx, canvas, sheet);

        pages.push({
          jpeg: new Uint8Array(await (await canvasToJpeg(canvas)).arrayBuffer()),
          width: canvas.width,
          height: canvas.height,
        });
      }
      return buildImagePdf(pages, `${sheet.studentLabel} - marked copy`);
    } finally {
      await doc.loadingTask.destroy();
    }
  }
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  [ymin, xmin, ymax, xmax]: number[],
  label: string,
  style: { colour: string; fill: string },
): void {
  const x = (xmin / 1000) * canvas.width;
  const y = (ymin / 1000) * canvas.height;
  const w = ((xmax - xmin) / 1000) * canvas.width;
  const h = ((ymax - ymin) / 1000) * canvas.height;
  const line = Math.max(3, canvas.width / 450);

  ctx.fillStyle = style.fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = line;
  ctx.strokeRect(x, y, w, h);

  const fontSize = Math.round(canvas.width / 58);
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const padding = fontSize * 0.35;
  const textWidth = ctx.measureText(label).width;
  const tagHeight = fontSize + padding * 2;
  const tagY = Math.max(0, y - tagHeight * 0.6);
  ctx.fillStyle = style.colour;
  ctx.fillRect(x + line, tagY, textWidth + padding * 2, tagHeight);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + line + padding, tagY + tagHeight / 2);
}

function drawHeader(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, sheet: ISheetEvaluation): void {
  const fontSize = Math.round(canvas.width / 45);
  const padding = fontSize * 0.5;
  const text = `${sheet.studentLabel} · ${sheet.totalAwarded}/${sheet.totalMax} · AI-marked copy (original unchanged)`;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const width = ctx.measureText(text).width + padding * 2;
  const x = canvas.width - width - padding;
  ctx.fillStyle = 'rgba(30, 27, 75, 0.9)';
  ctx.fillRect(x, padding, width, fontSize + padding * 2);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padding, padding + (fontSize + padding * 2) / 2);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode page.'))), 'image/jpeg', JPEG_QUALITY),
  );
}
