import { IMarkingScheme, ISheetEvaluation, StoredSheetStatus, toStoredSheetStatus } from '../models/evaluation.models';
import type { EvaluationRepository } from './evaluation-repository';
import { SAMPLE_MATHS_SCHEME, SAMPLE_WORKFLOW_A_SCHEME } from './evaluation-fixtures.testing';

/**
 * TEST-ONLY stand-in for Firebase: keeps question papers and answer sheets in memory.
 * Records the stored status history so specs can check draft → in_progress → graded → approved.
 */
export class InMemoryEvaluationRepository implements EvaluationRepository {
  readonly papers = new Map<string, IMarkingScheme>([
    [SAMPLE_MATHS_SCHEME.id, structuredClone(SAMPLE_MATHS_SCHEME)],
    [SAMPLE_WORKFLOW_A_SCHEME.id, structuredClone(SAMPLE_WORKFLOW_A_SCHEME)],
  ]);
  readonly sheets = new Map<string, Map<string, ISheetEvaluation>>();
  readonly statusHistory = new Map<string, StoredSheetStatus[]>();
  private nextId = 1;

  async listPapers(): Promise<IMarkingScheme[]> {
    return [...this.papers.values()].map((p) => structuredClone(p));
  }

  async createPaper(file: File): Promise<{ id: string; fileSaved: boolean }> {
    const id = `paper-${this.nextId++}`;
    this.papers.set(id, {
      id,
      title: file.name,
      subject: '',
      source: 'question_paper',
      status: 'draft',
      totalMarks: 0,
      questions: [],
      filePath: `question_papers/${id}/question-paper.pdf`,
    });
    return { id, fileSaved: true };
  }

  async savePaper(paper: IMarkingScheme): Promise<void> {
    this.papers.set(paper.id, { ...this.papers.get(paper.id), ...structuredClone(paper) });
  }

  async listSheets(paperId: string): Promise<ISheetEvaluation[]> {
    return [...(this.sheets.get(paperId)?.values() ?? [])].map((s) => structuredClone(s));
  }

  async createSheet(paperId: string, sheet: ISheetEvaluation): Promise<{ fileSaved: boolean }> {
    await this.saveSheet(paperId, sheet);
    const saved = this.sheets.get(paperId)!.get(sheet.submissionId)!;
    saved.filePath = `question_papers/${paperId}/answer_sheets/${sheet.submissionId}.pdf`;
    return { fileSaved: true };
  }

  async saveSheet(paperId: string, sheet: ISheetEvaluation): Promise<void> {
    const forPaper = this.sheets.get(paperId) ?? new Map<string, ISheetEvaluation>();
    this.sheets.set(paperId, forPaper);
    forPaper.set(sheet.submissionId, { ...forPaper.get(sheet.submissionId), ...structuredClone(sheet) });
    const history = this.statusHistory.get(sheet.submissionId) ?? [];
    const stored = toStoredSheetStatus(sheet.status);
    if (history.at(-1) !== stored) history.push(stored);
    this.statusHistory.set(sheet.submissionId, history);
  }

  async downloadSheetFile(): Promise<File | null> {
    return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sheet.pdf', { type: 'application/pdf' });
  }
}
