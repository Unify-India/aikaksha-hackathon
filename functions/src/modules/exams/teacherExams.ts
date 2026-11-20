/**
 * The teacher's exams, newest first, for choosing which one to review or publish.
 * Sorted/filtered in code so no composite Firestore index is needed.
 *
 * Owner: Sakshi.
 */
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';

export type ExamStatusFilter = 'draft' | 'published' | 'all';

export interface ExamListRow {
  examId: string;
  title: string;
  subject?: string;
  batchId?: string;
  status: string;
  startTimestampMs?: number;
  endTimestampMs?: number;
  totalQuestions?: number;
  auditScore?: number;
  auditFlagCount?: number;
  createdAt?: string;
}

/** Raw rows from Firestore (most recent first). */
export async function fetchTeacherExams(teacherId: string, max = 100): Promise<ExamListRow[]> {
  const snap = await db.collection(FIRESTORE_COLLECTIONS.MASTER_EXAMS).where('teacherId', '==', teacherId).limit(max).get();
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    const flags = Array.isArray(x['auditFlags']) ? (x['auditFlags'] as unknown[]).length : undefined;
    return {
      examId: d.id,
      title: String(x['title'] ?? 'Untitled exam'),
      ...(typeof x['subject'] === 'string' && { subject: x['subject'] }),
      ...(typeof x['batchId'] === 'string' && { batchId: x['batchId'] }),
      status: String(x['status'] ?? 'draft'),
      ...(typeof x['startTimestampMs'] === 'number' && { startTimestampMs: x['startTimestampMs'] }),
      ...(typeof x['endTimestampMs'] === 'number' && { endTimestampMs: x['endTimestampMs'] }),
      ...(typeof x['totalQuestions'] === 'number' && { totalQuestions: x['totalQuestions'] }),
      ...(typeof x['auditScore'] === 'number' && { auditScore: x['auditScore'] }),
      ...(flags !== undefined && { auditFlagCount: flags }),
      ...(typeof x['createdAt'] === 'string' && { createdAt: x['createdAt'] }),
    };
  });
}

/** Pure filter + sort (unit-tested): newest first, optional status / batch / subject filters. */
export function selectExams(
  rows: ExamListRow[],
  opts: { status?: ExamStatusFilter; batchId?: string; subject?: string; limit?: number } = {},
): ExamListRow[] {
  const status = opts.status ?? 'all';
  return rows
    .filter((r) => (status === 'all' ? true : status === 'draft' ? r.status === 'draft' : r.status !== 'draft'))
    .filter((r) => (opts.batchId ? r.batchId === opts.batchId : true))
    .filter((r) => (opts.subject ? r.subject?.toLowerCase() === opts.subject.toLowerCase() : true))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, opts.limit ?? 10);
}
