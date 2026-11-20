import { TestBed } from '@angular/core/testing';
import { GeminiService } from '../../../core/services/ai/gemini.service';
import { IExamIntakeResult } from '../../../shared/models/exam-creation.model';
import { QuestionGenerator } from './question-generator';

const intake = (targetQuestions: number, primaryLanguage = 'en'): IExamIntakeResult => ({
  examParams: {
    title: 'T', batchId: 'b', subject: 'Physics', duration: 45, targetQuestions, defaultMarks: 4, defaultNegativeMarks: 1,
    date: '2099-01-01', startTime: '10:00', endTime: '10:45', classLevel: 'Class 12', examPattern: 'NEET', primaryLanguage,
  },
  generation: { intent: 'CREATE_EXAM', topic: 'Optics', subtopics: ['Lenses', 'Mirrors'], difficulty: 'medium', questionType: 'MCQ' },
});

const good = (n: number) => ({
  questions: Array.from({ length: n }, (_, i) => ({
    text: `Q${i} $f = 1/v$`,
    options: ['opt1', 'opt2', 'opt3', 'opt4'].map((id) => ({ id, text: id })),
    correctOptionId: 'opt2',
    explanation: 'step',
    difficulty: 'hard',
  })),
});

describe('QuestionGenerator', () => {
  let prompts: string[];
  let replies: unknown[];

  beforeEach(() => {
    prompts = [];
    replies = [];
    const fakeGemini = {
      isConfigured: () => true,
      generateJson: async (req: { parts: { text: string }[] }) => {
        prompts.push(req.parts[0].text);
        const count = Number(/Write (\d+)/.exec(req.parts[0].text)![1]);
        return replies.length ? replies.shift() : good(count);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: GeminiService, useValue: fakeGemini }] });
  });

  it('splits into parallel batches of at most 5 with distinct focus, and reports progress', async () => {
    const progress: number[] = [];
    const questions = await TestBed.inject(QuestionGenerator).generate(intake(12), (p) => progress.push(p.done));
    expect(questions.length).toBe(12);
    expect(prompts.map((p) => /Write (\d+)/.exec(p)![1])).toEqual(['5', '5', '2']);
    expect(prompts[0]).toContain('focus on: Lenses');
    expect(prompts[1]).toContain('focus on: Mirrors');
    expect(progress.at(-1)).toBe(12);
  });

  it('maps to the create-complete question shape with marks from the exam', async () => {
    const [q] = await TestBed.inject(QuestionGenerator).generate(intake(1));
    expect(q).toMatchObject({
      type: 'MCQ', marks: 4, negativeMarks: 1, subject: 'Physics', topic: 'Optics', difficulty: 'hard',
      classLevel: 'Class 12', examPattern: 'NEET', correctOptionId: 'opt2', explanation: 'step',
    });
    expect(q.en.options?.length).toBe(4);
    expect(q.hi).toBeUndefined();
  });

  it('rejects malformed MCQs and retries the batch once', async () => {
    const bad = good(2);
    bad.questions[0].options = bad.questions[0].options.slice(0, 3);
    bad.questions[1].correctOptionId = 'opt9';
    replies.push(bad);
    const questions = await TestBed.inject(QuestionGenerator).generate(intake(2));
    expect(questions.length).toBe(2);
    expect(prompts.length).toBe(2);
    expect(prompts[1]).toContain('previous attempt was rejected');
  });

  it('fails clearly when a batch stays invalid', async () => {
    replies.push({ questions: [] }, { questions: [] });
    await expect(TestBed.inject(QuestionGenerator).generate(intake(3))).rejects.toThrow('could not produce 3 valid questions');
  });

  it('writes Hindi papers in Hindi and fills the hi slot too', async () => {
    const [q] = await TestBed.inject(QuestionGenerator).generate(intake(1, 'hi'));
    expect(prompts[0]).toContain('Hindi (Devanagari script)');
    expect(q.hi).toEqual(q.en);
  });
});
