import { Service, inject, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { GeminiService, blobToBase64 } from '../../../core/services/ai/gemini.service';
import {
  IMarkingScheme,
  ISheetEvaluation,
  effectiveMarks,
  effectiveVerdict,
  questionLabel,
} from '../models/evaluation.models';
import { EVALUATION_ENGINE } from './evaluation-backend';
import { IRedPenItem, redPenPrompt } from './gemini-prompts';

/** Default "Nano Banana" model; override with `gemini.imageModel` in environment.ts. */
export const DEFAULT_RED_PEN_MODEL = 'gemini-3.1-flash-image';

export interface IRedPenCopy {
  status: 'drawing' | 'ready' | 'failed';
  /** Object URL of the generated PNG (when ready). */
  url?: string;
  error?: string;
  /** Marks the copy was drawn with — if the marks change, the copy is outdated. */
  signature: string;
  startedAt: number;
}

/**
 * Draws an AI red-pen COPY of a page with a Gemini image model ("Nano Banana").
 * The original file is never changed, and the marks always come from the graded results.
 */
@Service()
export class RedPenCopyService {
  private readonly gemini = inject(GeminiService);
  private readonly model = (environment.gemini as { imageModel?: string }).imageModel ?? DEFAULT_RED_PEN_MODEL;

  /** Only when Gemini is called from this browser (the server will take over later). */
  readonly available = inject(EVALUATION_ENGINE) === 'gemini' && this.gemini.isConfigured();
  readonly copies = signal<Record<string, IRedPenCopy>>({});

  key(submissionId: string, page: number): string {
    return `${submissionId}:${page}`;
  }

  /** The marks visible on a page, as a string — changes whenever a mark or verdict on that page changes. */
  signature(sheet: ISheetEvaluation, page: number): string {
    return JSON.stringify(
      this.itemsFor(sheet, null, page).map((i) => [i.label, i.verdict, i.marks]),
    ) + (page === 1 ? `|${sheet.totalAwarded}/${sheet.totalMax}` : '');
  }

  hasMarks(sheet: ISheetEvaluation, page: number): boolean {
    return sheet.questions.some((q) => q.evidence.some((e) => e.page === page));
  }

  async draw(sheet: ISheetEvaluation, scheme: IMarkingScheme | null, page: number, pageImage: Blob): Promise<void> {
    const key = this.key(sheet.submissionId, page);
    const signature = this.signature(sheet, page);
    this.set(key, { status: 'drawing', signature, startedAt: Date.now() });
    try {
      const items = this.itemsFor(sheet, scheme, page);
      const total = page === 1 ? `${sheet.totalAwarded}/${sheet.totalMax}` : null;
      const image = await this.gemini.generateImage({
        model: this.model,
        parts: [
          { inlineData: { mimeType: pageImage.type || 'image/png', data: await blobToBase64(pageImage) } },
          { text: redPenPrompt(items, total) },
        ],
      });
      this.set(key, { status: 'ready', url: URL.createObjectURL(image), signature, startedAt: Date.now() });
    } catch (e) {
      this.set(key, {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        signature,
        startedAt: Date.now(),
      });
    }
  }

  private itemsFor(sheet: ISheetEvaluation, scheme: IMarkingScheme | null, page: number): IRedPenItem[] {
    const questions = new Map(scheme?.questions.map((q) => [q.id, q]) ?? []);
    return sheet.questions.flatMap((r) =>
      r.evidence
        .filter((e) => e.page === page)
        .map((e) => ({
          label: questionLabel(questions.get(r.questionId), r.questionId),
          verdict: effectiveVerdict(r),
          marks: `${effectiveMarks(r)}/${r.max}`,
          box_2d: e.box_2d,
          note: effectiveVerdict(r) === 'correct' ? '' : r.feedback,
        })),
    );
  }

  private set(key: string, copy: IRedPenCopy): void {
    this.copies.update((all) => {
      const previous = all[key]?.url;
      if (previous && previous !== copy.url) URL.revokeObjectURL(previous);
      return { ...all, [key]: copy };
    });
  }
}
