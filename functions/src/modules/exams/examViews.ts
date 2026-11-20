/**
 * Teacher-facing read models for Exam Studio (GET /api/exams, GET /api/exams/:examId).
 * Pure functions over the Firestore documents written by createAndSegregateExam, kept free of
 * firebase-admin so they can be unit tested.
 */

export interface IExamSummaryView {
  id: string;
  title: string;
  subject: string;
  status: string;
  batchId: string;
  classLevel: string;
  examPattern: string;
  totalQuestions: number;
  totalMarks: number;
  duration: number;
  defaultMarks: number;
  defaultNegativeMarks: number;
  date: string;
  startTime: string;
  endTime: string;
  createdAt: string;
}

export interface IExamQuestionView {
  id: string;
  type: string;
  marks: number;
  negativeMarks: number;
  topic: string;
  subtopic: string;
  difficulty: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId?: string;
  answer?: string;
  explanation?: string;
}

export interface IExamDetailView {
  exam: IExamSummaryView;
  questions: IExamQuestionView[];
}

type Data = Record<string, unknown>;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || fallback);
const obj = (v: unknown): Data => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Data) : {});

export function toExamSummary(id: string, d: Data): IExamSummaryView {
  return {
    id,
    title: str(d['title'], 'Untitled exam'),
    subject: str(d['subject']),
    status: str(d['status'], 'draft'),
    batchId: str(d['batchId']),
    classLevel: str(d['class'] ?? d['classLevel']),
    examPattern: str(d['examPattern']),
    totalQuestions: num(d['totalQuestions']),
    totalMarks: num(d['totalMarks']),
    duration: num(d['duration']),
    defaultMarks: num(d['defaultMarks']),
    defaultNegativeMarks: num(d['defaultNegativeMarks'] ?? d['negativeMarks']),
    date: str(d['date']),
    startTime: str(d['startTime']),
    endTime: str(d['endTime']),
    createdAt: str(d['createdAt']),
  };
}

/** Newest first; exams without createdAt go last. */
export function sortNewestFirst(exams: IExamSummaryView[]): IExamSummaryView[] {
  return [...exams].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Explanations are stored as a string or as { en, hi }. */
function explanationText(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined;
  const e = obj(v);
  return str(e['en']) || str(e['hi']) || str(e['text']) || undefined;
}

/**
 * Merges a stripped question (exam_questions/{examId}.questions[i]) with its answer key entry
 * (answerKey/{examId}.keys[questionId]).
 */
export function toQuestionView(raw: unknown, index: number, keys: Data): IExamQuestionView {
  const q = obj(raw);
  const en = obj(q['en']);
  const rawOptions = (Array.isArray(en['options']) ? en['options'] : Array.isArray(q['options']) ? q['options'] : []) as unknown[];
  const id = str(q['id'], `q_${index + 1}`);
  const key = obj(keys[id]);
  const options = rawOptions.map(obj).map((o, i) => ({ id: str(o['id'], `opt${i + 1}`), text: str(o['text']) }));
  const rawCorrect = str(key['correctOptionId']) || undefined;
  // createAndSegregateExam falls back to the answer for correctOptionId when a question has no
  // options (Numeric / Short Text), so only treat it as an option id when such an option exists.
  const correctOptionId = rawCorrect && options.some((o) => o.id === rawCorrect) ? rawCorrect : undefined;
  const answer = str(key['answer']) || (correctOptionId ? undefined : rawCorrect);
  const view: IExamQuestionView = {
    id,
    type: str(q['type'], rawOptions.length ? 'MCQ' : 'Subjective'),
    marks: num(q['marks']),
    negativeMarks: num(q['negativeMarks']),
    topic: str(q['topic']),
    subtopic: str(q['subtopic']),
    difficulty: str(q['difficulty'], 'medium'),
    text: str(en['text'] ?? q['text']),
    options,
  };
  if (correctOptionId) view.correctOptionId = correctOptionId;
  // For MCQs the server copies the option id into `answer`; only expose real answers.
  if (answer && answer !== correctOptionId) view.answer = answer;
  const explanation = explanationText(key['explanation']);
  if (explanation) view.explanation = explanation;
  return view;
}

export function toExamDetail(examId: string, exam: Data, questionsDoc: Data, answerKeyDoc: Data): IExamDetailView {
  const questions = Array.isArray(questionsDoc['questions']) ? (questionsDoc['questions'] as unknown[]) : [];
  const keys = obj(answerKeyDoc['keys']);
  return {
    exam: toExamSummary(examId, exam),
    questions: questions.map((q, i) => toQuestionView(q, i, keys)),
  };
}
