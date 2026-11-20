/**
 * extract_intent tool: understands the teacher's sentence and previews the exam plan
 * (resolved batch, exact IST start/end) without writing anything.
 *
 * Owner: Sakshi.
 */
import { extractIntent } from '../../prompts/intent-extraction.prompt.js';
import type { IVoiceIntent } from '../../types/voice-intent.js';
import { DEFAULT_TIMEZONE } from '../../utils/schedule.js';
import { resolveTeacherContext } from '../exams/examTools.js';
import { planExam, type ExamPlan } from './examPlan.js';

export interface UnderstandResult {
  intent: IVoiceIntent;
  /** Present when everything needed is known: pass `intent` back to /api/workflows/create-exam. */
  plan?: ExamPlan;
  /** Present when something is missing or inconsistent: ask the teacher. */
  needsInput?: { missingRequiredSlots: string[]; message: string };
}

export async function understandTeacherRequest(teacherId: string, transcript: string): Promise<UnderstandResult> {
  const nowIso = new Date().toISOString();
  const [intent, context] = await Promise.all([
    extractIntent(transcript, nowIso, DEFAULT_TIMEZONE),
    resolveTeacherContext(teacherId),
  ]);
  const planned = planExam(intent, {}, context.batches, nowIso, DEFAULT_TIMEZONE);
  return planned.ok
    ? { intent, plan: planned.plan }
    : { intent, needsInput: { missingRequiredSlots: planned.missingRequiredSlots, message: planned.message } };
}
