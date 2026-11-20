import { Type } from '@google/genai';
import { generateStructuredJson } from '../providers/gemini.provider.js';
import { IExamQuestion, QuestionType } from '../types/index.js';

export interface IQuestionBatchGenerationParams {
  subject: string;
  topic: string;
  subtopic?: string;
  count: number; // Max 5 per call for reliable generation & low latency
  difficulty?: 'easy' | 'medium' | 'hard';
  examPattern?: string; // NEET, JEE, CBSE
  classLevel?: string;
  marks?: number;
  negativeMarks?: number;
  languages?: Array<'en' | 'hi'>;
}

export const questionGenerationSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          stemEn: {
            type: Type.STRING,
            description: 'The question stem text in English. Must format math and scientific notation in LaTeX ($...$ or $$...$$).',
          },
          stemHi: {
            type: Type.STRING,
            description: 'Optional Hindi translation of the question stem.',
          },
          type: {
            type: Type.STRING,
            enum: ['MCQ', 'Numeric', 'Short Text', 'Subjective'],
            description: 'Question type.',
          },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  enum: ['opt1', 'opt2', 'opt3', 'opt4'],
                  description: 'Option identifier.',
                },
                textEn: {
                  type: Type.STRING,
                  description: 'Option text in English (with LaTeX if mathematical).',
                },
                textHi: {
                  type: Type.STRING,
                  description: 'Option text in Hindi.',
                },
                rationale: {
                  type: Type.STRING,
                  description: 'Pedagogical explanation of why this option is correct or what misconception caused this distractor.',
                },
              },
              required: ['id', 'textEn'],
            },
            description: 'List of 4 distinct choices for MCQ.',
          },
          correctOptionId: {
            type: Type.STRING,
            enum: ['opt1', 'opt2', 'opt3', 'opt4'],
            description: 'The unambiguous correct option ID for MCQs.',
          },
          answer: {
            type: Type.STRING,
            description: 'Exact numerical or short text answer if Numeric or Short Text.',
          },
          explanationEn: {
            type: Type.STRING,
            description: 'Rigorous step-by-step scientific/mathematical derivation and explanation in English.',
          },
          explanationHi: {
            type: Type.STRING,
            description: 'Explanation in Hindi.',
          },
          subtopic: {
            type: Type.STRING,
            description: 'Specific subtopic addressed.',
          },
          difficulty: {
            type: Type.STRING,
            enum: ['easy', 'medium', 'hard'],
            description: 'Difficulty tier.',
          },
        },
        required: ['stemEn', 'type', 'options', 'correctOptionId', 'explanationEn'],
      },
      description: 'Batch of generated questions (maximum 5).',
    },
  },
  required: ['questions'],
};

export const QUESTION_GEN_SYSTEM_INSTRUCTION = `You are a Senior Exam Author and Curriculum Specialist for competitive Indian entrance exams (JEE Main/Advanced, NEET-UG, CBSE Board).

You generate rigorous, original, syllabus-aligned multiple choice and numerical questions adhering to NCERT and national test standards.

Strict Directives:
1. LaTeX Formatting:
   - All formulas, variables, equations, and units MUST be enclosed in LaTeX math mode: inline $E = mc^2$ or display $$V = \\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r}$$.
   - Never use unicode approximation for greek letters (use $\\alpha$, $\\beta$, $\\lambda$, $\\mu$, etc.).
2. Distractor Engineering:
   - Distractors (incorrect options) must NEVER be random numbers or obviously absurd answers.
   - Each distractor MUST represent a common student misconception (e.g. sign error, inverse proportional confusion, forgetting square root, ignoring vector direction).
   - Provide a clear distractor rationale in the 'rationale' property.
3. Batch Size Limit:
   - Generate no more than 5 high-quality questions per call to maintain depth, accuracy, and formatting compliance.
4. Correctness & Clarity:
   - Exactly one option must be unambiguously correct.
   - No question should suffer from dual interpretations or missing boundary conditions.
`;

/**
 * Generates a single batch of up to 5 questions.
 */
export async function generateQuestionBatch(
  params: IQuestionBatchGenerationParams
): Promise<IExamQuestion[]> {
  const count = Math.min(5, Math.max(1, params.count));
  const defaultMarks = params.marks ?? 4;
  const defaultNegMarks = params.negativeMarks ?? 1;

  const prompt = `Subject: ${params.subject}
Target Topic: ${params.topic}
${params.subtopic ? `Specific Subtopic: ${params.subtopic}` : ''}
Class Level: ${params.classLevel ?? 'Class 12'}
Exam Pattern: ${params.examPattern ?? 'NEET'}
Target Difficulty: ${params.difficulty ?? 'medium'}
Number of Questions to Generate: ${count}
Languages: ${params.languages?.includes('hi') ? 'English and Hindi' : 'English'}

Generate exactly ${count} original, conceptually profound questions with LaTeX notation and distractor rationales.`;

  const response = await generateStructuredJson<{
    questions: Array<{
      stemEn: string;
      stemHi?: string;
      type: string;
      options: Array<{
        id: string;
        textEn: string;
        textHi?: string;
        rationale?: string;
      }>;
      correctOptionId: string;
      answer?: string;
      explanationEn: string;
      explanationHi?: string;
      subtopic?: string;
      difficulty?: string;
    }>;
  }>({
    model: 'gemini-2.5-flash',
    systemInstruction: QUESTION_GEN_SYSTEM_INSTRUCTION,
    prompt,
    schema: questionGenerationSchema,
    temperature: 0.3,
    thinkingBudget: 1024,
  });

  const nowIso = new Date().toISOString();

  return (response.questions || []).map((q, idx): IExamQuestion => {
    const qType = (q.type as QuestionType) || QuestionType.MCQ;
    const formattedOptions = (q.options || []).map((opt) => ({
      id: opt.id,
      text: opt.textEn,
    }));

    return {
      id: `q_${Date.now()}_${idx + 1}`,
      type: qType,
      marks: defaultMarks,
      negativeMarks: defaultNegMarks,
      subject: params.subject,
      topic: params.topic,
      subtopic: q.subtopic || params.subtopic || '',
      difficulty: q.difficulty || params.difficulty || 'medium',
      classLevel: params.classLevel,
      examPattern: params.examPattern,
      createdAt: nowIso,
      updatedAt: nowIso,
      en: {
        text: q.stemEn,
        options: formattedOptions,
      },
      hi: q.stemHi
        ? {
            text: q.stemHi,
            options: (q.options || []).map((opt) => ({
              id: opt.id,
              text: opt.textHi || opt.textEn,
            })),
          }
        : undefined,
      correctOptionId: q.correctOptionId,
      answer: q.answer,
      explanation: {
        en: q.explanationEn,
        hi: q.explanationHi,
      },
    };
  });
}

/**
 * Generates N questions in parallel batches (≤5 questions per batch)
 * with partitioned subtopics to maximize throughput and prevent duplicates.
 */
export async function generateQuestionsInParallel(
  params: IQuestionBatchGenerationParams,
  subtopicList: string[] = []
): Promise<IExamQuestion[]> {
  const totalQuestions = params.count;
  const BATCH_SIZE = 5;
  const numBatches = Math.ceil(totalQuestions / BATCH_SIZE);

  const batchPromises: Array<Promise<IExamQuestion[]>> = [];

  for (let i = 0; i < numBatches; i++) {
    const batchCount = Math.min(BATCH_SIZE, totalQuestions - i * BATCH_SIZE);
    const assignedSubtopic = subtopicList[i % subtopicList.length] || params.subtopic;

    const batchParam: IQuestionBatchGenerationParams = {
      ...params,
      count: batchCount,
      subtopic: assignedSubtopic,
    };

    batchPromises.push(generateQuestionBatch(batchParam));
  }

  const batchResults = await Promise.all(batchPromises);
  return batchResults.flat();
}
