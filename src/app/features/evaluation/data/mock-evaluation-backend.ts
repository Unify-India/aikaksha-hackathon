import { Service } from '@angular/core';
import {
  Box2d,
  IGradingJob,
  IMarkingScheme,
  IMarkingSchemeQuestion,
  IQuestionResult,
  ISheetEvaluation,
  QuestionVerdict,
} from '../models/evaluation.models';
import { sha256Hex } from './checksum';
import type {
  EvaluationBackend,
  IStartedJob,
  IUploadSheet,
  RunEventHandler,
} from './evaluation-backend';
import { MOCK_MATHS_SCHEME, MOCK_WORKFLOW_A_SCHEME } from './mock-fixtures';
import { pagesSummary } from './pages-summary';
import { summariseSheet } from './sheet-summary';

const REVIEW_THRESHOLD = 0.7;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Small deterministic PRNG so the same file always gets the same mock grades. */
function seededRandom(seedHex: string): () => number {
  let state = parseInt(seedHex.slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/**
 * Pretends to be the grading server: runs the tool chain with realistic delays and
 * produces plausible (but fake) marks and red-pen box positions.
 */
@Service()
export class MockEvaluationBackend implements EvaluationBackend {
  private schemes: IMarkingScheme[] = [MOCK_MATHS_SCHEME, MOCK_WORKFLOW_A_SCHEME];
  private sheets = new Map<string, ISheetEvaluation>();
  private nextId = 1;

  async listSchemes(): Promise<IMarkingScheme[]> {
    await wait(250);
    return structuredClone(this.schemes);
  }

  async draftScheme(questionPaper: File, onEvent: RunEventHandler): Promise<IMarkingScheme> {
    const started = Date.now();
    onEvent({ type: 'tool_started', tool: 'draft_marking_scheme', at: started });
    const checksum = await sha256Hex(questionPaper);
    await wait(2500);
    const draft: IMarkingScheme = {
      ...structuredClone(MOCK_MATHS_SCHEME),
      id: `scheme-draft-${this.nextId++}`,
      title: `Draft scheme — ${questionPaper.name.replace(/\.[^.]+$/, '')}`,
      status: 'draft',
      questionPaperChecksum: checksum,
    };
    this.schemes = [...this.schemes, draft];
    onEvent({ type: 'scheme_drafted', scheme: structuredClone(draft) });
    onEvent({
      type: 'tool_finished',
      tool: 'draft_marking_scheme',
      durationMs: Date.now() - started,
      summary: `Drafted ${draft.questions.length} questions, ${draft.totalMarks} marks`,
    });
    return structuredClone(draft);
  }

  async approveScheme(scheme: IMarkingScheme): Promise<IMarkingScheme> {
    await wait(300);
    const approved: IMarkingScheme = { ...structuredClone(scheme), status: 'approved' };
    this.schemes = this.schemes.map((s) => (s.id === scheme.id ? approved : s));
    return structuredClone(approved);
  }

  async startGrading(
    schemeId: string,
    uploads: IUploadSheet[],
    onEvent: RunEventHandler,
  ): Promise<IStartedJob> {
    const scheme = this.schemes.find((s) => s.id === schemeId);
    if (!scheme) throw new Error(`Unknown marking scheme ${schemeId}`);

    const jobId = `job-${this.nextId++}`;
    const sheets: ISheetEvaluation[] = uploads.map((upload) => ({
      submissionId: `sub-${this.nextId++}`,
      jobId,
      schemeId,
      studentLabel: upload.studentLabel,
      fileName: upload.file.name,
      mimeType: upload.file.type,
      pageCount: upload.pageCount,
      checksum: '',
      status: 'queued',
      questions: [],
      totalAwarded: 0,
      totalMax: scheme.totalMarks,
      ocrConfidence: 0,
      needsReview: false,
    }));
    sheets.forEach((s) => this.sheets.set(s.submissionId, s));

    const job: IGradingJob = { id: jobId, schemeId, createdAt: new Date().toISOString(), sheets };

    const done = (async () => {
      await wait(50); // let the caller store the job before the first event arrives
      for (const [i, sheet] of sheets.entries()) {
        await this.gradeOne(sheet, uploads[i], scheme, onEvent);
      }
      onEvent({ type: 'run_completed', jobId });
    })();

    return { job: structuredClone(job), done };
  }

  async saveReview(
    submissionId: string,
    overrides: Record<string, number>,
    approve: boolean,
  ): Promise<ISheetEvaluation> {
    await wait(250);
    const sheet = this.sheets.get(submissionId);
    if (!sheet) throw new Error(`Unknown submission ${submissionId}`);
    const questions = sheet.questions.map((q) => ({ ...q, teacherOverride: overrides[q.questionId] }));
    const updated: ISheetEvaluation = {
      ...summariseSheet({ ...sheet, questions }),
      status: approve ? 'approved' : sheet.status,
      approvedAt: approve ? new Date().toISOString() : sheet.approvedAt,
    };
    this.sheets.set(submissionId, updated);
    return structuredClone(updated);
  }

  private async gradeOne(
    sheet: ISheetEvaluation,
    upload: IUploadSheet,
    scheme: IMarkingScheme,
    onEvent: RunEventHandler,
  ): Promise<void> {
    const { submissionId } = sheet;
    let current: ISheetEvaluation = { ...sheet, status: 'grading' };
    this.publish(current, onEvent);

    const prepStarted = Date.now();
    onEvent({ type: 'tool_started', tool: 'prepare_pages', submissionId, at: prepStarted });
    const pages = await upload.loadPages();
    onEvent({
      type: 'tool_finished',
      tool: 'prepare_pages',
      submissionId,
      durationMs: Date.now() - prepStarted,
      summary: pagesSummary(pages),
    });

    const started = Date.now();
    onEvent({ type: 'tool_started', tool: 'grade_answer_sheet', submissionId, at: started });

    const checksum = await sha256Hex(upload.file);
    await wait(1800 + upload.pageCount * 120);

    const random = seededRandom(checksum);
    const questions = scheme.questions.map((q) =>
      mockQuestionResult(q, scheme.questions, upload.pageCount, random),
    );
    current = summariseSheet({
      ...current,
      checksum,
      questions,
      ocrConfidence: 0.78 + random() * 0.2,
      status: 'graded',
    });
    onEvent({
      type: 'tool_finished',
      tool: 'grade_answer_sheet',
      submissionId,
      durationMs: Date.now() - started,
      summary: `${current.studentLabel}: ${current.totalAwarded} / ${current.totalMax}`,
    });

    const flagStarted = Date.now();
    onEvent({ type: 'tool_started', tool: 'flag_for_review', submissionId, at: flagStarted });
    await wait(300);
    const flagged = questions.filter((q) => q.confidence < REVIEW_THRESHOLD).length;
    current = { ...current, status: current.needsReview ? 'needs_review' : 'graded' };
    onEvent({
      type: 'tool_finished',
      tool: 'flag_for_review',
      submissionId,
      durationMs: Date.now() - flagStarted,
      summary: flagged ? `${flagged} question(s) need a teacher's eye` : 'No low-confidence answers',
    });
    this.publish(current, onEvent);
  }

  private publish(sheet: ISheetEvaluation, onEvent: RunEventHandler): void {
    this.sheets.set(sheet.submissionId, sheet);
    onEvent({ type: 'sheet_updated', sheet: structuredClone(sheet) });
  }
}

function mockQuestionResult(
  q: IMarkingSchemeQuestion,
  all: IMarkingSchemeQuestion[],
  pageCount: number,
  random: () => number,
): IQuestionResult {
  const confidence = Math.round((0.6 + random() * 0.39) * 100) / 100;
  const region = mockRegion(q, all, pageCount);

  if (random() < 0.05) {
    return {
      questionId: q.id,
      verdict: 'not_attempted',
      awarded: 0,
      max: q.maxMarks,
      studentAnswer: '',
      feedback: 'No answer found for this question.',
      confidence,
      steps: q.steps.map((s) => ({ stepId: s.id, awarded: 0, max: s.marks, reasoning: 'Not attempted.' })),
      evidence: [],
    };
  }

  if (q.type === 'mcq') {
    const correct = random() < 0.75;
    const options = ['a', 'b', 'c', 'd'].filter((o) => o !== q.correctOption);
    const chosen = correct ? q.correctOption : options[Math.floor(random() * options.length)];
    return {
      questionId: q.id,
      verdict: correct ? 'correct' : 'wrong',
      awarded: correct ? q.maxMarks : 0,
      max: q.maxMarks,
      studentAnswer: `Marked (${chosen})`,
      feedback: correct ? 'Correct option.' : `Chose (${chosen}); correct is (${q.correctOption}).`,
      confidence,
      steps: [],
      evidence: [region],
    };
  }

  const steps = q.steps.map((s) => {
    const roll = random();
    const awarded = roll < 0.65 ? s.marks : roll < 0.8 ? Math.floor(s.marks) / 2 : 0;
    const reasoning =
      awarded === s.marks ? 'Step shown correctly.' : awarded > 0 ? 'Partly correct; working incomplete.' : 'Step missing or incorrect.';
    return { stepId: s.id, awarded, max: s.marks, reasoning };
  });
  const awarded = steps.reduce((sum, s) => sum + s.awarded, 0);
  const verdict: QuestionVerdict = awarded === q.maxMarks ? 'correct' : awarded === 0 ? 'wrong' : 'partial';
  return {
    questionId: q.id,
    verdict,
    awarded,
    max: q.maxMarks,
    studentAnswer: '(mock) Handwritten working transcribed here in live mode.',
    feedback:
      verdict === 'correct'
        ? 'Complete and correct working.'
        : verdict === 'partial'
          ? 'Method is right, but some steps are missing or wrong.'
          : 'Approach does not reach the required result.',
    confidence,
    steps,
    evidence: [region],
  };
}

/** Lays mock answers out like a real sheet: MCQs stacked on page 1, written answers spread over later pages. */
function mockRegion(
  q: IMarkingSchemeQuestion,
  all: IMarkingSchemeQuestion[],
  pageCount: number,
): { page: number; box_2d: Box2d } {
  const mcqs = all.filter((x) => x.type === 'mcq');
  if (q.type === 'mcq') {
    const row = mcqs.indexOf(q);
    const rowHeight = Math.min(120, 800 / Math.max(mcqs.length, 1));
    const top = 120 + row * rowHeight;
    return { page: 1, box_2d: [top, 80, top + rowHeight * 0.8, 600] };
  }
  const written = all.filter((x) => x.type === 'subjective');
  const slot = written.indexOf(q);
  const firstWrittenPage = mcqs.length && pageCount > 1 ? 2 : 1;
  const pagesAvailable = Math.max(pageCount - firstWrittenPage + 1, 1);
  const perPage = Math.ceil(written.length / pagesAvailable);
  const page = Math.min(firstWrittenPage + Math.floor(slot / perPage), pageCount);
  const position = slot % perPage;
  const height = 860 / perPage;
  const top = 70 + position * height;
  return { page, box_2d: [Math.round(top), 60, Math.round(top + height * 0.9), 940] };
}
