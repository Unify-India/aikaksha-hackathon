import { Service, inject } from '@angular/core';
import { GeminiSchema, GeminiService } from '../../../core/services/ai/gemini.service';
import { IExamIntakeResult, IOptionContent, IQuestionItemPayload, QuestionType } from '../../../shared/models/exam-creation.model';

/**
 * Generates the question bank for a confirmed intake, in the shape POST /api/exams/create-complete
 * expects (docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §3).
 *
 * ⚠ Runs Gemini from the browser with the dev-only key (same as GeminiService). Move server-side
 * before deploying.
 */

export const BATCH_SIZE = 5;
const OPTION_IDS = ['opt1', 'opt2', 'opt3', 'opt4'];

interface IGeneratedQuestion {
  subtopic?: string;
  difficulty?: string;
  text: string;
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  answer?: string;
  explanation: string;
}

const RESPONSE_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          subtopic: { type: 'STRING' },
          difficulty: { type: 'STRING', enum: ['easy', 'medium', 'hard'] },
          text: { type: 'STRING', description: 'Question statement; math in $...$ (inline) or $$...$$ (display) LaTeX.' },
          options: {
            type: 'ARRAY',
            description: 'MCQ only: exactly 4 options opt1–opt4.',
            items: {
              type: 'OBJECT',
              properties: { id: { type: 'STRING', enum: OPTION_IDS }, text: { type: 'STRING' } },
              required: ['id', 'text'],
            },
          },
          correctOptionId: { type: 'STRING', enum: OPTION_IDS, description: 'MCQ only.' },
          answer: { type: 'STRING', description: 'Numeric / Short Text: the exact answer. Subjective: key points.' },
          explanation: { type: 'STRING', description: 'Step-by-step solution with LaTeX.' },
        },
        required: ['text', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

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
  async generate(intake: IExamIntakeResult, onProgress: (p: IGenerationProgress) => void = () => {}): Promise<IQuestionItemPayload[]> {
    const total = intake.examParams.targetQuestions;
    const sizes = Array.from({ length: Math.ceil(total / BATCH_SIZE) }, (_, i) => Math.min(BATCH_SIZE, total - i * BATCH_SIZE));
    let done = 0;
    onProgress({ done, total });

    const batches = await Promise.all(
      sizes.map(async (count, index) => {
        const questions = await this.generateBatch(intake, count, index, sizes.length);
        done += questions.length;
        onProgress({ done, total });
        return questions;
      }),
    );
    return batches.flat();
  }

  private async generateBatch(intake: IExamIntakeResult, count: number, index: number, batchCount: number): Promise<IQuestionItemPayload[]> {
    let lastProblem = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.gemini.generateJson<{ questions?: IGeneratedQuestion[] }>({
        systemInstruction: SYSTEM_INSTRUCTION,
        parts: [{ text: batchPrompt(intake, count, index, batchCount) + (lastProblem ? `\n\nYour previous attempt was rejected: ${lastProblem}. Fix it.` : '') }],
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      });
      const mapped = (raw.questions ?? []).map((q) => toPayload(q, intake)).filter((q): q is IQuestionItemPayload => q !== null);
      if (mapped.length >= count) return mapped.slice(0, count);
      lastProblem = `you returned ${mapped.length} valid questions out of ${count} requested (each needs all required fields)`;
    }
    throw new Error(`Gemini could not produce ${count} valid questions for batch ${index + 1}.`);
  }
}

const SYSTEM_INSTRUCTION = `You write exam questions for Indian school and coaching-institute tests (CBSE, NEET, JEE and similar).
- Stay strictly within the requested subject, class level, exam pattern, topic and focus.
- Every question must be unambiguous, solvable, and have exactly one correct answer.
- MCQ: exactly 4 options with ids opt1, opt2, opt3, opt4; distractors based on common student misconceptions; vary which option is correct.
- Use LaTeX for all mathematics: $...$ inline, $$...$$ for display. Escape nothing extra; output plain JSON strings.
- The explanation is a concise step-by-step solution that ends by stating the correct answer.
- Never repeat or trivially rephrase a question.`;

function batchPrompt(intake: IExamIntakeResult, count: number, index: number, batchCount: number): string {
  const { examParams: p, generation: g } = intake;
  const focusPool = g.subtopics.length ? g.subtopics : [g.topic];
  const focus = focusPool[index % focusPool.length];
  const language = p.primaryLanguage === 'hi' ? 'Hindi (Devanagari script)' : 'English';
  return [
    `Write ${count} ${g.questionType} questions.`,
    `Subject: ${p.subject}. Class: ${p.classLevel ?? 'not specified'}. Exam pattern: ${p.examPattern ?? 'general'}.`,
    `Topic: ${g.topic}.${g.subtopics.length ? ` Subtopics in this exam: ${g.subtopics.join(', ')}.` : ''}`,
    `This is batch ${index + 1} of ${batchCount} written in parallel; to avoid overlap with other batches, focus on: ${focus}${
      batchCount > focusPool.length ? ` (batch ${index + 1}: choose different sub-concepts and question styles from other batches)` : ''
    }.`,
    `Overall difficulty: ${g.difficulty}; mix easier and harder questions around it.`,
    `Language for question text, options and explanation: ${language}.`,
  ].join('\n');
}

function toPayload(q: IGeneratedQuestion, intake: IExamIntakeResult): IQuestionItemPayload | null {
  const { examParams: p, generation: g } = intake;
  const type: QuestionType = g.questionType;
  const text = q.text?.trim();
  const explanation = q.explanation?.trim();
  if (!text || !explanation) return null;

  let options: IOptionContent[] | undefined;
  let correctOptionId: string | undefined;
  let answer: string | undefined;
  if (type === 'MCQ') {
    options = (q.options ?? []).filter((o) => OPTION_IDS.includes(o.id) && o.text?.trim()).map((o) => ({ id: o.id, text: o.text.trim() }));
    const uniqueIds = new Set(options.map((o) => o.id));
    if (options.length !== 4 || uniqueIds.size !== 4 || !q.correctOptionId || !uniqueIds.has(q.correctOptionId)) return null;
    correctOptionId = q.correctOptionId;
  } else {
    answer = q.answer?.trim();
    if (!answer && type !== 'Subjective') return null;
  }

  const content = { text, ...(options ? { options } : {}), explanation };
  return {
    id: crypto.randomUUID(),
    type,
    marks: p.defaultMarks,
    negativeMarks: p.defaultNegativeMarks ?? 0,
    subject: p.subject,
    topic: g.topic,
    ...(q.subtopic?.trim() ? { subtopic: q.subtopic.trim() } : {}),
    difficulty: q.difficulty === 'easy' || q.difficulty === 'hard' ? q.difficulty : 'medium',
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
