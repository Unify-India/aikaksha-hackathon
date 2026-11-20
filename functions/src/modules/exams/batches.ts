/**
 * Teacher batches: create a new batch (same shape as the seeded one in config/seed.ts).
 * Used by the MCP "create a new batch" step of the guided exam setup.
 *
 * Owner: Sakshi.
 */
import { db } from '../../config/firebase.js';
import { FIRESTORE_COLLECTIONS } from '../../config/index.js';

export const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'] as const;
export const TARGET_EXAMS = ['NEET', 'JEE', 'CBSE', 'ICSE', 'State Board', 'Other'] as const;

export interface NewBatchInput {
  name: string;
  subject: string;
  classLevel: string;
  targetExam?: string;
  studentCount?: number;
}

export interface BatchDoc {
  id: string;
  name: string;
  subject: string;
  classLevel: string;
  targetExam: string;
  studentCount: number;
  teacherId: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

/** "Arjuna 2027" -> "batch-arjuna-2027". */
export function batchIdFor(name: string): string {
  const slug = name.toLowerCase().replace(/^batch[\s-]*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `batch-${slug}`;
}

/** Pure validation + normalisation (unit-tested). */
export function validateNewBatch(input: NewBatchInput): { ok: true; value: Required<NewBatchInput> } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const name = input.name?.trim() ?? '';
  if (name.length < 2 || name.length > 60) problems.push('Batch name must be 2–60 characters.');
  if (!/[a-z0-9]/i.test(name)) problems.push('Batch name must contain letters or numbers.');
  const subject = SUBJECTS.find((s) => s.toLowerCase() === input.subject?.trim().toLowerCase()) ?? input.subject?.trim() ?? '';
  if (!subject) problems.push('Subject is required.');
  const classLevel = normaliseClass(input.classLevel);
  if (!classLevel) problems.push('Class is required, e.g. Class 11 or Class 12.');
  const targetExam = input.targetExam?.trim() || 'Other';
  const studentCount = input.studentCount ?? 0;
  if (!Number.isInteger(studentCount) || studentCount < 0 || studentCount > 1000) problems.push('Number of students must be 0–1000.');
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: { name, subject, classLevel, targetExam, studentCount } };
}

function normaliseClass(value: string | undefined): string {
  const v = value?.trim() ?? '';
  const n = /^(?:class\s*)?(\d{1,2})(?:th)?$/i.exec(v)?.[1];
  return n ? `Class ${Number(n)}` : v;
}

/** Creates the batch for this teacher. Throws if the name is invalid or the batch already exists. */
export async function createBatch(teacherId: string, input: NewBatchInput, tenantId?: string): Promise<BatchDoc> {
  const checked = validateNewBatch(input);
  if (!checked.ok) throw new Error(`INVALID_BATCH: ${checked.problems.join(' ')}`);
  const v = checked.value;
  const id = batchIdFor(v.name);
  const ref = db.collection(FIRESTORE_COLLECTIONS.BATCHES).doc(id);
  const now = new Date().toISOString();
  const doc: BatchDoc = {
    id,
    name: v.name,
    subject: v.subject,
    classLevel: v.classLevel,
    targetExam: v.targetExam,
    studentCount: v.studentCount,
    teacherId,
    ...(tenantId && { tenantId }),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await ref.create(doc); // fails if it already exists
  } catch {
    throw new Error(`BATCH_EXISTS: a batch called "${v.name}" already exists. Choose it from the list or use another name.`);
  }
  return doc;
}
