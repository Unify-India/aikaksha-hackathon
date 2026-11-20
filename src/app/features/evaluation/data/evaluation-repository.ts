import { InjectionToken, Service, inject } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { environment } from '../../../../environments/environment';
import {
  IMarkingScheme,
  ISheetEvaluation,
  StoredSheetStatus,
  toStoredSheetStatus,
} from '../models/evaluation.models';

/*
 * Where question papers and student answer sheets are saved:
 *
 *   question_papers/{paperId}                      status: draft → pending → approved
 *     └─ answer_sheets/{sheetId}                   status: draft → in_progress → graded → approved (| failed)
 *
 *   Storage: question_papers/{paperId}/question-paper.pdf
 *            question_papers/{paperId}/answer_sheets/{sheetId}.pdf   (renamed — never the student's name)
 */

export const QUESTION_PAPERS = 'question_papers';
export const ANSWER_SHEETS = 'answer_sheets';

export interface EvaluationRepository {
  listPapers(): Promise<IMarkingScheme[]>;
  /** Creates a 'draft' question paper and uploads its PDF. Returns the new paper id. */
  createPaper(file: File): Promise<{ id: string; fileSaved: boolean }>;
  savePaper(paper: IMarkingScheme): Promise<void>;
  listSheets(paperId: string): Promise<ISheetEvaluation[]>;
  /** Saves a new sheet and uploads its (renamed) PDF. Returns whether the PDF was stored. */
  createSheet(paperId: string, sheet: ISheetEvaluation, file: File): Promise<{ fileSaved: boolean }>;
  saveSheet(paperId: string, sheet: ISheetEvaluation): Promise<void>;
  /** Downloads a saved sheet's PDF (to view it again later). */
  downloadSheetFile(sheet: ISheetEvaluation): Promise<File | null>;
  /** A link that opens a stored file (e.g. a question paper PDF) in the browser. */
  fileUrl(path: string): Promise<string>;
}

export const EVALUATION_REPOSITORY = new InjectionToken<EvaluationRepository>('EVALUATION_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(FirebaseEvaluationRepository),
});

interface FirebaseHandles {
  db: Firestore;
  storage: FirebaseStorage;
  fs: typeof import('firebase/firestore');
  st: typeof import('firebase/storage');
}

/** Firestore keeps no `undefined` values: strip them (and class instances) before writing. */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Saves evaluation data straight to Firebase from the browser (POC: no login; the rules open
 * only the question_papers area). The Firebase SDK is loaded lazily on first use.
 */
@Service()
export class FirebaseEvaluationRepository implements EvaluationRepository {
  private handles: Promise<FirebaseHandles> | null = null;

  private connect(): Promise<FirebaseHandles> {
    this.handles ??= (async () => {
      const [{ initializeApp, getApps }, fs, st] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
        import('firebase/storage'),
      ]);
      const name = 'evaluation';
      const app: FirebaseApp = getApps().find((a) => a.name === name) ?? initializeApp(environment.firebase, name);
      return { db: fs.getFirestore(app), storage: st.getStorage(app), fs, st };
    })();
    return this.handles;
  }

  async listPapers(): Promise<IMarkingScheme[]> {
    const { db, fs } = await this.connect();
    const snap = await fs.getDocs(fs.query(fs.collection(db, QUESTION_PAPERS), fs.orderBy('updatedAt', 'desc'), fs.limit(100)));
    return snap.docs.map((d) => ({ ...(d.data() as IMarkingScheme), id: d.id }));
  }

  async createPaper(file: File): Promise<{ id: string; fileSaved: boolean }> {
    const { db, fs } = await this.connect();
    const ref = fs.doc(fs.collection(db, QUESTION_PAPERS));
    const now = new Date().toISOString();
    await fs.setDoc(ref, {
      title: file.name.replace(/\.[^.]+$/, ''),
      subject: '',
      source: 'question_paper',
      status: 'draft',
      totalMarks: 0,
      questions: [],
      createdAt: now,
      updatedAt: now,
    });
    const path = `${QUESTION_PAPERS}/${ref.id}/question-paper.pdf`;
    const fileSaved = await this.upload(path, file);
    if (fileSaved) await fs.updateDoc(ref, { filePath: path });
    return { id: ref.id, fileSaved };
  }

  async savePaper(paper: IMarkingScheme): Promise<void> {
    const { db, fs } = await this.connect();
    await fs.setDoc(
      fs.doc(db, QUESTION_PAPERS, paper.id),
      toPlain({ ...paper, updatedAt: new Date().toISOString() }),
      { merge: true },
    );
  }

  async listSheets(paperId: string): Promise<ISheetEvaluation[]> {
    const { db, fs } = await this.connect();
    const snap = await fs.getDocs(fs.query(fs.collection(db, QUESTION_PAPERS, paperId, ANSWER_SHEETS), fs.orderBy('studentIndex')));
    return snap.docs.map((d) => {
      const { storedStatus: _stored, studentIndex: _index, ...sheet } = d.data() as ISheetEvaluation & {
        storedStatus: StoredSheetStatus;
        studentIndex: number;
      };
      // A sheet left mid-grading (e.g. the tab was closed) can't resume; show it as failed.
      const status = sheet.status === 'grading' || sheet.status === 'queued' ? 'failed' : sheet.status;
      return {
        ...sheet,
        submissionId: d.id,
        status,
        error: status === 'failed' && !sheet.error ? 'Grading did not finish. Use "Retry grading" to grade it again.' : sheet.error,
      };
    });
  }

  async createSheet(paperId: string, sheet: ISheetEvaluation, file: File): Promise<{ fileSaved: boolean }> {
    // Write the record first (writes from one browser are applied in order), then upload the PDF and
    // only add its path — so a slow upload can never overwrite a newer grading status.
    await this.saveSheet(paperId, sheet);
    const path = `${QUESTION_PAPERS}/${paperId}/${ANSWER_SHEETS}/${sheet.submissionId}.pdf`;
    const fileSaved = await this.upload(path, file);
    if (fileSaved) {
      const { db, fs } = await this.connect();
      await fs.updateDoc(fs.doc(db, QUESTION_PAPERS, paperId, ANSWER_SHEETS, sheet.submissionId), { filePath: path });
    }
    return { fileSaved };
  }

  async saveSheet(paperId: string, sheet: ISheetEvaluation): Promise<void> {
    const { db, fs } = await this.connect();
    const data: Record<string, unknown> = toPlain({
      ...sheet,
      storedStatus: toStoredSheetStatus(sheet.status),
      studentIndex: studentIndexOf(sheet.studentLabel),
      updatedAt: new Date().toISOString(),
    });
    // A merge keeps fields that aren't sent, so clear an old error explicitly (e.g. after Retry grading).
    if (sheet.error === undefined) data['error'] = fs.deleteField();
    await fs.setDoc(fs.doc(db, QUESTION_PAPERS, paperId, ANSWER_SHEETS, sheet.submissionId), data, { merge: true });
  }

  async downloadSheetFile(sheet: ISheetEvaluation): Promise<File | null> {
    if (!sheet.filePath) return null;
    const { storage, st } = await this.connect();
    const blob = await st.getBlob(st.ref(storage, sheet.filePath));
    return new File([blob], sheet.fileName || 'sheet.pdf', { type: 'application/pdf' });
  }

  async fileUrl(path: string): Promise<string> {
    const { storage, st } = await this.connect();
    return st.getDownloadURL(st.ref(storage, path));
  }

  /** Uploads a PDF; returns false (instead of failing the whole flow) if Storage is unavailable. */
  private async upload(path: string, file: File): Promise<boolean> {
    const { storage, st } = await this.connect();
    try {
      await st.uploadBytes(st.ref(storage, path), file, { contentType: 'application/pdf' });
      return true;
    } catch (e) {
      console.warn(`PDF not saved to Storage (${path}):`, e);
      return false;
    }
  }
}

/** "Student C" → 2, "Student 27" → 26 — keeps saved sheets in upload order. */
export function studentIndexOf(label: string): number {
  const tail = label.replace(/^Student\s+/, '');
  if (/^[A-Z]$/.test(tail)) return tail.charCodeAt(0) - 65;
  const n = Number(tail);
  return Number.isFinite(n) ? n - 1 : 999;
}
