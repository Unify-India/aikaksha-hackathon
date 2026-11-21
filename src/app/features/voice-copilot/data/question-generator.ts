import { Service, inject } from '@angular/core';
import { GeminiService } from '../../../core/services/ai/gemini.service';
import { DifficultyLevel, IExamIntakeResult, IOptionContent, IQuestionItemPayload, QuestionType } from '../../../shared/models/exam-creation.model';
import { OPTION_IDS, QUESTION_RESPONSE_SCHEMA, QUESTION_SYSTEM_INSTRUCTION } from './question-generation.prompt';

/**
 * Generates the question bank for a confirmed intake with the gemini-question-generator skill
 * (.agents/skills/gemini-question-generator/SKILL.md), in the shape POST /api/exams/create-complete
 * expects (docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §3).
 *
 * Each question carries a step-wise solution and its misconceptions. create-complete stores one
 * `explanation` string, so those are rendered into it (skill §7) and shown in Exam Studio.
 *
 * ⚠ Runs Gemini from the browser with the dev-only key (same as GeminiService). Move server-side
 * before deploying.
 */

export const BATCH_SIZE = 5;
const LETTERS = ['A', 'B', 'C', 'D'];

interface IGeneratedQuestion {
  subtopic?: string;
  difficulty?: string;
  text?: string;
  options?: { id: string; text: string }[];
  correct_option_id?: string;
  answer?: string;
  explanation?: string;
  solution_steps?: { title?: string; working?: string }[];
  common_misconceptions?: { mistake?: string; fix?: string }[];
  distractor_rationales?: Partial<Record<string, string>>;
}

export interface IGenerationProgress {
  done: number;
  total: number;
}

@Service()
export class QuestionGenerator {
  private readonly gemini = inject(GeminiService);

  isConfigured(): boolean {
    return this.gemini.isConfigured();
  }

  /** All batches run in parallel; `onProgress` fires as each batch lands. */
  /** `apiKey` (optional) calls Gemini directly with that key, e.g. after the teacher switches keys on a 429. */
  async generate(
    intake: IExamIntakeResult,
    onProgress: (p: IGenerationProgress) => void = () => {},
    apiKey?: string,
  ): Promise<IQuestionItemPayload[]> {
    const total = intake.examParams.targetQuestions;
    const sizes = Array.from({ length: Math.ceil(total / BATCH_SIZE) }, (_, i) => Math.min(BATCH_SIZE, total - i * BATCH_SIZE));
    let done = 0;
    onProgress({ done, total });

    const batches = await Promise.all(
      sizes.map(async (count, index) => {
        const questions = await this.generateBatch(intake, count, index, sizes.length, apiKey);
        done += questions.length;
        onProgress({ done, total });
        return questions;
      }),
    );
    return batches.flat();
  }

  private async generateBatch(
    intake: IExamIntakeResult,
    count: number,
    index: number,
    batchCount: number,
    apiKey?: string,
  ): Promise<IQuestionItemPayload[]> {
    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.gemini.generateJson<{ questions?: IGeneratedQuestion[] }>({
        systemInstruction: QUESTION_SYSTEM_INSTRUCTION,
        parts: [{ text: batchPrompt(intake, count, index, batchCount) + (lastProblem ? `\n\nYour previous attempt was rejected: ${lastProblem}. Fix it.` : '') }],
        responseSchema: QUESTION_RESPONSE_SCHEMA,
        // The skill's setting: suppresses mathematical hallucinations while keeping distractors varied.
        temperature: 0.35,
        apiKey,
      });
      const results = (raw.questions ?? []).map((q) => toPayload(q, intake));
      const valid = results.filter((r): r is IQuestionItemPayload => typeof r !== 'string');
      if (valid.length >= count) return valid.slice(0, count);
      const reasons = [...new Set(results.filter((r): r is string => typeof r === 'string'))];
      lastProblem = `only ${valid.length} of ${count} questions were valid${reasons.length ? ` (${reasons.slice(0, 3).join('; ')})` : ''}`;
    }
    throw new Error(`Gemini could not produce ${count} valid questions for batch ${index + 1}.`);
  }
}

function batchPrompt(intake: IExamIntakeResult, count: number, index: number, batchCount: number): string {
  const { examParams: p, generation: g } = intake;
  const focusPool = g.subtopics.length ? g.subtopics : [g.topic];
  const focus = focusPool[index % focusPool.length];
  const language = p.primaryLanguage === 'hi' ? 'Hindi (Devanagari script, NCERT Hindi terminology)' : 'English';
  return [
    `Write ${count} ${g.questionType} questions.`,
    `Target exam: ${p.examPattern ?? 'school test'}. Subject: ${p.subject}. Class: ${p.classLevel ?? 'not specified'}.`,
    `Topic: ${g.topic}.${g.subtopics.length ? ` Subtopics in this exam: ${g.subtopics.join(', ')}.` : ''}`,
    `This is batch ${index + 1} of ${batchCount} written in parallel; to avoid overlap with other batches, focus on: ${focus}${
      batchCount > focusPool.length ? ` (batch ${index + 1}: choose different sub-concepts and question styles from other batches)` : ''
    }.`,
    `Overall difficulty: ${g.difficulty}; mix easier and harder questions around it.`,
    `Language for every text field (stem, options, steps, misconceptions, rationales): ${language}.`,
    g.questionType === 'MCQ'
      ? 'Include distractor_rationales for all four options.'
      : `No options and no distractor_rationales; put the exact answer in "answer".`,
  ].join('\n');
}

/** A valid create-complete question, or the reason it was rejected (skill §6 guardrails). */
export function toPayload(q: IGeneratedQuestion, intake: IExamIntakeResult): IQuestionItemPayload | string {
  const { examParams: p, generation: g } = intake;
  const type: QuestionType = g.questionType;
  const text = q.text?.trim();
  if (!text) return 'a question stem is empty';

  const steps = (q.solution_steps ?? [])
    .map((s) => ({ title: s.title?.trim() ?? '', working: s.working?.trim() ?? '' }))
    .filter((s) => s.title && s.working);
  if (steps.length < 2) return 'solution_steps needs at least 2 steps, each with a title and working';

  const misconceptions = (q.common_misconceptions ?? [])
    .map((m) => ({ mistake: m.mistake?.trim() ?? '', fix: m.fix?.trim() ?? '' }))
    .filter((m) => m.mistake && m.fix && !GENERIC_ADVICE.test(m.mistake));
  if (!misconceptions.length) return 'common_misconceptions needs at least one concrete mistake with its fix (no generic advice)';

  let options: IOptionContent[] | undefined;
  let correctOptionId: string | undefined;
  let answer: string | undefined;
  let rationales: string[] = [];
  if (type === 'MCQ') {
    options = (q.options ?? [])
      .filter((o) => (OPTION_IDS as readonly string[]).includes(o.id) && o.text?.trim())
      .map((o) => ({ id: o.id, text: o.text.trim() }))
      .sort((a, b) => a.id.localeCompare(b.id));
    const ids = new Set(options.map((o) => o.id));
    if (options.length !== 4 || ids.size !== 4) return 'an MCQ needs exactly 4 options opt1-opt4';
    if (!q.correct_option_id || !ids.has(q.correct_option_id)) return 'correct_option_id must be one of opt1-opt4';
    correctOptionId = q.correct_option_id;
    rationales = OPTION_IDS.map((id) => q.distractor_rationales?.[id]?.trim() ?? '');
    if (rationales.some((r) => !r)) return 'distractor_rationales must explain all four options';
  } else {
    answer = q.answer?.trim();
    if (!answer && type !== 'Subjective') return 'a non-MCQ question needs an answer';
  }

  const explanation = formatSolution({ steps, misconceptions, rationales, correctOptionId, answer, options });
  const content = { text, ...(options ? { options } : {}), explanation };
  const difficulty = (q.difficulty ?? '').toLowerCase();
  return {
    id: crypto.randomUUID(),
    type,
    marks: p.defaultMarks,
    negativeMarks: p.defaultNegativeMarks ?? 0,
    subject: p.subject,
    topic: g.topic,
    ...(q.subtopic?.trim() ? { subtopic: q.subtopic.trim() } : {}),
    difficulty: (['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium') as DifficultyLevel,
    ...(p.classLevel ? { classLevel: p.classLevel } : {}),
    ...(p.examPattern ? { examPattern: p.examPattern } : {}),
    // `en` is the mandatory primary slot; Hindi-subject papers carry Hindi text there and in `hi`.
    en: content,
    ...(p.primaryLanguage === 'hi' ? { hi: content } : {}),
    ...(correctOptionId ? { correctOptionId } : {}),
    ...(answer ? { answer } : {}),
    explanation,
  };
}

const GENERIC_ADVICE = /^(read|be careful|check (your|the) (work|answer)|don'?t rush|revise|practice)/i;

/** The worked solution, why each option is right or wrong, and common misconceptions (skill §7 format). */
export function formatSolution(s: {
  steps: { title: string; working: string }[];
  misconceptions: { mistake: string; fix: string }[];
  rationales: string[];
  correctOptionId?: string;
  answer?: string;
  options?: IOptionContent[];
}): string {
  const lines = s.steps.map((step, i) => `Step ${i + 1} – ${step.title}: ${step.working}`);
  const correctIndex = s.correctOptionId ? OPTION_IDS.indexOf(s.correctOptionId as (typeof OPTION_IDS)[number]) : -1;
  if (correctIndex >= 0) lines.push(`Answer: (${LETTERS[correctIndex]}) ${s.options?.[correctIndex]?.text ?? ''}`.trim());
  else if (s.answer) lines.push(`Answer: ${s.answer}`);

  const wrong = s.rationales.map((r, i) => ({ r, i })).filter(({ i }) => i !== correctIndex);
  if (wrong.length) {
    lines.push('', 'Why the other options are wrong:', ...wrong.map(({ r, i }) => `• (${LETTERS[i]}) ${r}`));
  }
  lines.push('', 'Common misconceptions:', ...s.misconceptions.map((m) => `• ${m.mistake} → ${m.fix}`));
  return lines.join('\n');
}
