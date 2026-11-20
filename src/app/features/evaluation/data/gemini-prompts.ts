import type { GeminiSchema } from '../../../core/services/ai/gemini.service';
import { IMarkingScheme } from '../models/evaluation.models';

/*
 * Prompts and response shapes for Workflow B. Kept free of Angular so they can move to
 * server/src/prompts/evaluation-multimodal.prompt.ts unchanged when the server is up.
 */

// ---------------------------------------------------------------------------
// 1. Draft a marking scheme from a question paper
// ---------------------------------------------------------------------------

export const DRAFT_SCHEME_SYSTEM = `You are a senior examiner who writes marking schemes for Indian school exams (CBSE / state boards, classes 9–12).
You will receive a question paper (PDF or photo). Produce a complete, correct marking scheme.

Rules:
- Include EVERY question on the paper, in paper order. "section" is ONLY the section letter printed on the paper (e.g. "A" for "SECTION – A"); if there are no sections use "".
- "number" is the question number exactly as printed (e.g. "8", "2"). If a question has parts (i)/(ii), keep it as ONE question and cover the parts in the steps.
- "maxMarks" comes from the paper (section headers like "1 Mark Each"). If a header gives a choice such as "3/4 Marks Each", use the larger value.
- Multiple-choice questions: type "mcq", "correctOption" is the option letter in lowercase (a, b, c or d), and "steps" is empty. Solve the question yourself — do not guess.
- All other questions: type "subjective". Solve carefully and write a short worked "modelAnswer". Split the marks into "steps" (method / key working / final answer) whose marks add up EXACTLY to maxMarks, using multiples of 0.5.
- Write maths in readable plain text with Unicode symbols (π, θ, √, ≤, ⁻¹, ², fractions like 3/5). Do not use LaTeX.
- "questionText": the question, shortened if very long, including MCQ options.`;

export const DRAFT_SCHEME_RESPONSE: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Short title, e.g. "Class 12 Mathematics Test"' },
    subject: { type: 'STRING' },
    classLevel: { type: 'STRING', description: 'e.g. "12"' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: { type: 'STRING' },
          number: { type: 'STRING' },
          type: { type: 'STRING', enum: ['mcq', 'subjective'] },
          questionText: { type: 'STRING' },
          maxMarks: { type: 'NUMBER' },
          correctOption: { type: 'STRING', nullable: true },
          modelAnswer: { type: 'STRING', nullable: true },
          steps: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { description: { type: 'STRING' }, marks: { type: 'NUMBER' } },
              required: ['description', 'marks'],
            },
          },
        },
        required: ['section', 'number', 'type', 'questionText', 'maxMarks', 'steps'],
        propertyOrdering: ['section', 'number', 'type', 'questionText', 'maxMarks', 'correctOption', 'modelAnswer', 'steps'],
      },
    },
  },
  required: ['title', 'subject', 'questions'],
  propertyOrdering: ['title', 'subject', 'classLevel', 'questions'],
};

export interface IRawDraftScheme {
  title: string;
  subject: string;
  classLevel?: string;
  questions: {
    section: string;
    number: string;
    type: 'mcq' | 'subjective';
    questionText: string;
    maxMarks: number;
    correctOption?: string | null;
    modelAnswer?: string | null;
    steps: { description: string; marks: number }[];
  }[];
}

// ---------------------------------------------------------------------------
// 2. Grade one student's answer sheet against an approved scheme
// ---------------------------------------------------------------------------

export const GRADE_SHEET_SYSTEM = `You are an experienced, fair examiner grading a student's handwritten answer sheet against an approved marking scheme.

How to grade:
1. Read every page. Students label answers with the question number (often circled, e.g. "(8)" or "Q8") and sometimes write a section heading ("SECTION – B"). The same number can appear in different sections, so use the section headings to tell them apart. Answers may be out of order.
2. IGNORE EVERYTHING THE TEACHER ALREADY WROTE: ticks, crosses, circled scores, totals, underlines and comments (often in red, green or a different pen). Grade only the student's own work, as if the sheet were unmarked.
3. Multiple-choice: report the option letter the student chose in "chosenOption" (lowercase a–d). If two options are marked or it is unreadable, use null and lower the confidence.
4. Written answers: for each step in the scheme award 0 up to that step's marks, in multiples of 0.5. Accept any mathematically valid method that reaches the same result. Give credit for correct working even if the final answer is wrong. Never award more than a step's marks.
5. "studentAnswer": a short transcription (max ~200 characters) of what the student wrote, in plain text with Unicode maths symbols.
6. "feedback": one or two sentences for the teacher explaining the marks.
7. "evidence": where the answer is on the sheet — page number (1-based, as in the file) and box_2d = [ymin, xmin, ymax, xmax] scaled 0–1000 relative to that page, covering the student's answer. Add one entry per page if an answer continues onto another page. Use [] if the question was not attempted.
8. "confidence" (0–1): how sure you are about both reading the handwriting and the marks. Use below 0.9 if handwriting is unclear, the answer is hard to locate, or the marking is borderline — anything below 0.9 is sent to the teacher for review.
9. Return exactly one result for EVERY questionId in the scheme. If you cannot find an answer, set attempted=false.`;

export function gradeSheetPrompt(scheme: IMarkingScheme, pageCount: number, teacherExamples = ''): string {
  const compact = scheme.questions.map((q) => ({
    questionId: q.id,
    section: q.section ?? '',
    number: q.number,
    type: q.type,
    maxMarks: q.maxMarks,
    question: q.questionText,
    ...(q.type === 'mcq'
      ? { correctOption: q.correctOption }
      : { modelAnswer: q.modelAnswer, steps: q.steps.map((s) => ({ stepId: s.id, marks: s.marks, criterion: s.description })) }),
  }));
  return [
    `Subject: ${scheme.subject}${scheme.classLevel ? `, class ${scheme.classLevel}` : ''}. The answer sheet has ${pageCount} page(s).`,
    'Marking scheme (JSON):',
    JSON.stringify(compact),
    ...(teacherExamples ? [teacherExamples] : []),
    'Grade the attached answer sheet now.',
  ].join('\n');
}

export const GRADE_SHEET_RESPONSE: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    ocrConfidence: { type: 'NUMBER', description: 'Overall 0–1 legibility of the handwriting' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          questionId: { type: 'STRING' },
          attempted: { type: 'BOOLEAN' },
          chosenOption: { type: 'STRING', nullable: true },
          studentAnswer: { type: 'STRING' },
          steps: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                stepId: { type: 'STRING' },
                awarded: { type: 'NUMBER' },
                reasoning: { type: 'STRING' },
              },
              required: ['stepId', 'awarded', 'reasoning'],
            },
          },
          feedback: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          evidence: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                page: { type: 'INTEGER' },
                box_2d: { type: 'ARRAY', items: { type: 'INTEGER' }, minItems: 4, maxItems: 4 },
              },
              required: ['page', 'box_2d'],
            },
          },
        },
        required: ['questionId', 'attempted', 'studentAnswer', 'steps', 'feedback', 'confidence', 'evidence'],
        propertyOrdering: ['questionId', 'attempted', 'chosenOption', 'studentAnswer', 'steps', 'feedback', 'confidence', 'evidence'],
      },
    },
  },
  required: ['ocrConfidence', 'questions'],
  propertyOrdering: ['ocrConfidence', 'questions'],
};

export interface IRawGrading {
  ocrConfidence?: number;
  questions?: {
    questionId?: string;
    attempted?: boolean;
    chosenOption?: string | null;
    studentAnswer?: string;
    steps?: { stepId?: string; awarded?: number; reasoning?: string }[];
    feedback?: string;
    confidence?: number;
    evidence?: { page?: number; box_2d?: number[] }[];
  }[];
}

// ---------------------------------------------------------------------------
// 3. Nano Banana: draw a red-pen copy of one page (image editing)
// ---------------------------------------------------------------------------

export interface IRedPenItem {
  label: string;
  verdict: 'correct' | 'partial' | 'wrong' | 'not_attempted';
  marks: string;
  box_2d: [number, number, number, number];
  note: string;
}

const VERDICT_PEN: Record<IRedPenItem['verdict'], string> = {
  correct: 'a tick ✓',
  partial: 'a half tick',
  wrong: 'a cross ✗',
  not_attempted: 'a short dash',
};

/** Instructions for the image model. Marks come from the (teacher-approved) results, never from the model. */
export function redPenPrompt(items: IRedPenItem[], total: string | null): string {
  const lines = items.map(
    (i) =>
      `- ${i.label} — answer inside box [ymin, xmin, ymax, xmax] = [${i.box_2d.join(', ')}] (0–1000 scale of this page): ` +
      `draw ${VERDICT_PEN[i.verdict]} next to the answer, write "${i.marks}" in the margin beside it` +
      (i.note ? `, and a very short comment (max 5 words) based on: "${i.note}"` : '') +
      '.',
  );
  return [
    'You are a school teacher marking this answer-sheet page with a RED PEN.',
    'Edit the attached page image. Keep the page EXACTLY as it is: do not redraw, retype, move, erase, straighten or clean up',
    "any of the student's writing, ruled lines, or existing marks. Only ADD new red-pen marks on top, in a natural handwritten teacher style.",
    'Marks to add on this page (use exactly these marks — do not change them):',
    ...lines,
    ...(total ? [`Also write the total "${total}" and circle it, in the top-right corner of the page.`] : []),
    'Return only the edited page image, same size and orientation as the input.',
  ].join('\n');
}
