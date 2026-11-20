import { Service, computed, inject, signal } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  IMarkingScheme,
  IMarkingSchemeQuestion,
  IQuestionResult,
  ISheetEvaluation,
  questionLabel,
} from '../models/evaluation.models';
import { EVALUATION_REPOSITORY } from '../data/evaluation-repository';
import { PdfDocumentService } from '../data/pdf-document.service';
import { isAnswerFlagged, isHandwritingFlagged, summariseSheet } from '../data/sheet-summary';

/** One thing a teacher must check: a low-confidence answer, or a sheet whose handwriting was hard to read. */
export interface IReviewItem {
  key: string;
  kind: 'answer' | 'handwriting';
  paperId: string;
  paperTitle: string;
  sheetId: string;
  studentLabel: string;
  /** For answers: the question, as graded. */
  questionId?: string;
  label: string;
  /** 1-based pages to show (where the answer is; page 1 for handwriting checks). */
  pages: number[];
  confidence: number;
}

/**
 * The Review Gate queue: every answer (or sheet) below 90% AI confidence, across all approved
 * question papers, for the teacher to accept or correct. Changes are saved to Firebase immediately.
 */
@Service()
export class ReviewQueueStore {
  private readonly repo = inject(EVALUATION_REPOSITORY);
  private readonly pdf = inject(PdfDocumentService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly papers = signal<IMarkingScheme[]>([]);
  readonly items = signal<IReviewItem[]>([]);
  readonly paperFilter = signal<string>('all');
  readonly savingKey = signal<string | null>(null);
  /** Latest version of each sheet in the queue (several items can belong to one sheet). */
  private readonly sheets = signal<Record<string, ISheetEvaluation>>({});

  readonly visibleItems = computed(() => {
    const filter = this.paperFilter();
    return filter === 'all' ? this.items() : this.items().filter((i) => i.paperId === filter);
  });
  readonly papersWithItems = computed(() => {
    const ids = new Set(this.items().map((i) => i.paperId));
    return this.papers().filter((p) => ids.has(p.id));
  });

  private readonly files = new Map<string, Promise<File | null>>();
  private readonly docs = new Map<string, Promise<PDFDocumentProxy>>();
  private readonly pageUrls = new Map<string, Promise<string>>();

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const papers = (await this.repo.listPapers()).filter((p) => p.status === 'approved');
      this.papers.set(papers);
      const sheets: Record<string, ISheetEvaluation> = {};
      const items: IReviewItem[] = [];
      for (const paper of papers) {
        for (const raw of await this.repo.listSheets(paper.id)) {
          if (raw.status !== 'graded' && raw.status !== 'needs_review') continue;
          const sheet = summariseSheet(raw); // re-applies the current 90% rule to older results
          sheets[sheet.submissionId] = sheet;
          items.push(...itemsFor(paper, sheet));
        }
      }
      this.sheets.set(sheets);
      this.items.set(items);
    } catch (e) {
      this.error.set(`Could not load the review queue: ${errorText(e)}`);
    } finally {
      this.loading.set(false);
    }
  }

  sheetFor(item: IReviewItem): ISheetEvaluation | null {
    return this.sheets()[item.sheetId] ?? null;
  }

  resultFor(item: IReviewItem): IQuestionResult | null {
    return this.sheetFor(item)?.questions.find((q) => q.questionId === item.questionId) ?? null;
  }

  questionFor(item: IReviewItem): IMarkingSchemeQuestion | null {
    return this.papers().find((p) => p.id === item.paperId)?.questions.find((q) => q.id === item.questionId) ?? null;
  }

  /** The teacher accepts the AI's marks for a low-confidence answer. */
  approveAiMark(item: IReviewItem): Promise<void> {
    return this.updateAnswer(item, (q) => ({ ...q, teacherVerified: true }));
  }

  /** The teacher sets different marks for a low-confidence answer. */
  setMark(item: IReviewItem, marks: number): Promise<void> {
    return this.updateAnswer(item, (q) => ({
      ...q,
      teacherOverride: marks === q.awarded ? undefined : marks,
      teacherVerified: true,
    }));
  }

  /** The teacher confirms a sheet's handwriting was read correctly. */
  async approveHandwriting(item: IReviewItem): Promise<void> {
    const sheet = this.sheetFor(item);
    if (!sheet) return;
    await this.save(item, summariseSheet({ ...sheet, ocrVerified: true }));
  }

  /** Renders one page of a sheet (downloaded once from Storage) as an image URL. */
  pageImage(item: IReviewItem, page: number): Promise<string> {
    const key = `${item.sheetId}:${page}`;
    let url = this.pageUrls.get(key);
    if (!url) {
      url = this.documentFor(item).then((doc) => this.pdf.renderPage(doc, page, 1000).then((r) => r.url));
      url.catch(() => this.pageUrls.delete(key)); // allow a retry after a failure
      this.pageUrls.set(key, url);
    }
    return url;
  }

  private documentFor(item: IReviewItem): Promise<PDFDocumentProxy> {
    let doc = this.docs.get(item.sheetId);
    if (!doc) {
      doc = this.fileFor(item).then((file) => {
        if (!file) throw new Error('This sheet has no saved PDF.');
        return this.pdf.open(file);
      });
      doc.catch(() => this.docs.delete(item.sheetId));
      this.docs.set(item.sheetId, doc);
    }
    return doc;
  }

  private fileFor(item: IReviewItem): Promise<File | null> {
    let file = this.files.get(item.sheetId);
    if (!file) {
      const sheet = this.sheetFor(item);
      file = sheet ? this.repo.downloadSheetFile(sheet) : Promise.resolve(null);
      file.catch(() => this.files.delete(item.sheetId));
      this.files.set(item.sheetId, file);
    }
    return file;
  }

  private async updateAnswer(item: IReviewItem, change: (q: IQuestionResult) => IQuestionResult): Promise<void> {
    const sheet = this.sheetFor(item);
    if (!sheet) return;
    const questions = sheet.questions.map((q) => (q.questionId === item.questionId ? change(q) : q));
    await this.save(item, summariseSheet({ ...sheet, questions }));
  }

  private async save(item: IReviewItem, sheet: ISheetEvaluation): Promise<void> {
    this.savingKey.set(item.key);
    this.error.set(null);
    try {
      await this.repo.saveSheet(item.paperId, sheet);
      this.sheets.update((all) => ({ ...all, [sheet.submissionId]: sheet }));
      this.items.update((list) => list.filter((i) => i.key !== item.key));
    } catch (e) {
      this.error.set(`Could not save: ${errorText(e)}`);
    } finally {
      this.savingKey.set(null);
    }
  }
}

function itemsFor(paper: IMarkingScheme, sheet: ISheetEvaluation): IReviewItem[] {
  const questions = new Map(paper.questions.map((q) => [q.id, q]));
  const items: IReviewItem[] = sheet.questions.filter(isAnswerFlagged).map((q) => ({
    key: `${sheet.submissionId}:${q.questionId}`,
    kind: 'answer',
    paperId: paper.id,
    paperTitle: paper.title,
    sheetId: sheet.submissionId,
    studentLabel: sheet.studentLabel,
    questionId: q.questionId,
    label: questionLabel(questions.get(q.questionId), q.questionId),
    pages: [...new Set(q.evidence.map((e) => e.page))].sort((a, b) => a - b),
    confidence: q.confidence,
  }));
  if (isHandwritingFlagged(sheet)) {
    items.unshift({
      key: `${sheet.submissionId}:handwriting`,
      kind: 'handwriting',
      paperId: paper.id,
      paperTitle: paper.title,
      sheetId: sheet.submissionId,
      studentLabel: sheet.studentLabel,
      label: 'Handwriting',
      pages: [1],
      confidence: sheet.ocrConfidence,
    });
  }
  return items;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
