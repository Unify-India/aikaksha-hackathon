import * as crypto from 'crypto';
import type { IExamQuestion } from '../types/index.js';

/**
 * Strips confidential answer keys and explanations from questions for student-facing APIs.
 * This enforces the fundamental security invariant: Students NEVER receive answer keys.
 */
export function stripForStudent(question: IExamQuestion): Omit<IExamQuestion, 'correctOptionId' | 'answer' | 'explanation'> {
  const sanitized = { ...question };
  delete sanitized.correctOptionId;
  delete sanitized.answer;
  delete sanitized.explanation;
  return sanitized;
}

/**
 * Recursively sorts keys of an object to produce deterministic canonical JSON.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJson(item)).join(',')}]`;
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalJson(val)}`;
  });

  return `{${pairs.join(',')}}`;
}

/**
 * Generates a SHA-256 hash of the canonical JSON representation of questions or exam data.
 */
export function sha256Canonical(data: unknown): string {
  const canonical = canonicalJson(data);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
