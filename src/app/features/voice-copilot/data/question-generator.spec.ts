import { TestBed } from '@angular/core/testing';
import { GeminiService } from '../../../core/services/ai/gemini.service';
import { IExamIntakeResult, QuestionType } from '../../../shared/models/exam-creation.model';
import { QUESTION_SYSTEM_INSTRUCTION } from './question-generation.prompt';
import { QuestionGenerator, formatSolution, toPayload } from './question-generator';

const intake = (targetQuestions: number, primaryLanguage = 'en', questionType: QuestionType = 'MCQ'): IExamIntakeResult => ({
  examParams: {
    title: 'T', batchId: 'b', subject: 'Physics', duration: 45, targetQuestions, defaultMarks: 4, defaultNegativeMarks: 1,
    date: '2099-01-01', startTime: '10:00', endTime: '10:45', classLevel: 'Class 12', examPattern: 'NEET', primaryLanguage,
  },
  generation: { intent: 'CREATE_EXAM', topic: 'Electrostatics', subtopics: ["Gauss's Law", 'Capacitance'], difficulty: 'medium', questionType },
});

/** A question exactly as the skill's schema asks for it. */
const skillQuestion = (i = 0) => ({
  subtopic: "Gauss's Law",
  difficulty: 'Hard',
  text: `Q${i}: flux through one face of a cube with $q$ at its centre?`,
  options: [
    { id: 'opt1', text: '$\\frac{q}{\\varepsilon_0}$' },
    { id: 'opt2', text: '$\\frac{q}{6\\varepsilon_0}$' },
    { id: 'opt3', text: '$\\frac{q}{4\\pi\\varepsilon_0}$' },
    { id: 'opt4', text: '$0$' },
  ],
  correct_option_id: 'opt2',
  explanation: 'Total flux is shared equally by six faces.',
  solution_steps: [
    { title: "Apply Gauss's law", working: '$\\Phi_{total} = \\frac{q}{\\varepsilon_0}$' },
    { title: 'Use symmetry', working: 'Six identical faces: $\\Phi = \\frac{q}{6\\varepsilon_0}$' },
  ],
  common_misconceptions: [{ mistake: 'Taking the total flux as the flux through one face', fix: 'Divide by the 6 symmetric faces' }],
  distractor_rationales: {
    opt1: 'Total flux through the whole cube, not one face.',
    opt2: 'Correct: symmetry splits the flux into six equal parts.',
    opt3: 'Confuses flux with the Coulomb field constant.',
    opt4: 'Thinks a face with no charge on it has zero flux.',
  },
});

describe('QuestionGenerator (gemini-question-generator skill)', () => {
  let requests: { prompt: string; system: string; temperature?: number }[];
  let replies: unknown[];

  beforeEach(() => {
    requests = [];
    replies = [];
    const fakeGemini = {
      isConfigured: () => true,
      generateJson: async (req: { parts: { text: string }[]; systemInstruction: string; temperature?: number }) => {
        requests.push({ prompt: req.parts[0].text, system: req.systemInstruction, temperature: req.temperature });
        const count = Number(/Write (\d+)/.exec(req.parts[0].text)![1]);
        return replies.length ? replies.shift() : { questions: Array.from({ length: count }, (_, i) => skillQuestion(i)) };
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: GeminiService, useValue: fakeGemini }] });
  });

  it("uses the skill's system instruction and temperature, in parallel batches of at most 5", async () => {
    const progress: number[] = [];
    const questions = await TestBed.inject(QuestionGenerator).generate(intake(12), (p) => progress.push(p.done));
    expect(questions.length).toBe(12);
    expect(requests.map((r) => /Write (\d+)/.exec(r.prompt)![1])).toEqual(['5', '5', '2']);
    expect(requests[0].system).toBe(QUESTION_SYSTEM_INSTRUCTION);
    expect(requests[0].system).toContain('STEP-WISE WORKED SOLUTION');
    expect(requests[0].system).toContain('MISCONCEPTIONS WHILE ANSWERING');
    expect(requests[0].temperature).toBe(0.35);
    expect(requests[0].prompt).toContain("focus on: Gauss's Law");
    expect(requests[1].prompt).toContain('focus on: Capacitance');
    expect(progress.at(-1)).toBe(12);
  });

  it('maps to the create-complete shape with a step-wise solution and misconceptions in the explanation', async () => {
    const [q] = await TestBed.inject(QuestionGenerator).generate(intake(1));
    expect(q).toMatchObject({ type: 'MCQ', marks: 4, negativeMarks: 1, difficulty: 'hard', correctOptionId: 'opt2', classLevel: 'Class 12' });
    expect(q.explanation).toContain("Step 1 – Apply Gauss's law: $\\Phi_{total} = \\frac{q}{\\varepsilon_0}$");
    expect(q.explanation).toContain('Step 2 – Use symmetry');
    expect(q.explanation).toContain('Answer: (B) $\\frac{q}{6\\varepsilon_0}$');
    expect(q.explanation).toContain('• (A) Total flux through the whole cube');
    expect(q.explanation).not.toContain('• (B)'); // the correct option is not listed as wrong
    expect(q.explanation).toContain('Common misconceptions:\n• Taking the total flux as the flux through one face → Divide by the 6 symmetric faces');
    expect(q.en.explanation).toBe(q.explanation);
  });

  it('rejects questions that break the skill guardrails, then retries with the reasons', async () => {
    const oneStep = { ...skillQuestion(), solution_steps: [skillQuestion().solution_steps[0]] };
    const generic = { ...skillQuestion(), common_misconceptions: [{ mistake: 'Read the question carefully', fix: 'Be careful' }] };
    const noRationale = { ...skillQuestion(), distractor_rationales: { opt1: 'x', opt2: 'y', opt3: 'z' } };
    replies.push({ questions: [oneStep, generic, noRationale] });
    const questions = await TestBed.inject(QuestionGenerator).generate(intake(3));
    expect(questions.length).toBe(3);
    expect(requests.length).toBe(2);
    expect(requests[1].prompt).toContain('previous attempt was rejected');
    expect(requests[1].prompt).toContain('solution_steps needs at least 2 steps');
    expect(requests[1].prompt).toContain('no generic advice');
    expect(requests[1].prompt).toContain('distractor_rationales must explain all four options');
  });

  it('fails clearly when a batch stays invalid', async () => {
    replies.push({ questions: [] }, { questions: [] });
    await expect(TestBed.inject(QuestionGenerator).generate(intake(3))).rejects.toThrow('could not produce 3 valid questions');
  });

  it('handles Numeric questions: answer instead of options, no option rationales', () => {
    const numeric = { ...skillQuestion(), options: undefined, correct_option_id: undefined, distractor_rationales: undefined, answer: '9 mN' };
    const q = toPayload(numeric, intake(1, 'en', 'Numeric'));
    expect(typeof q).not.toBe('string');
    if (typeof q === 'string') return;
    expect(q).toMatchObject({ type: 'Numeric', answer: '9 mN' });
    expect(q.en.options).toBeUndefined();
    expect(q.explanation).toContain('Answer: 9 mN');
    expect(q.explanation).not.toContain('Why the other options are wrong');
    expect(toPayload({ ...numeric, answer: '' }, intake(1, 'en', 'Numeric'))).toBe('a non-MCQ question needs an answer');
  });

  it('asks for Hindi in every field for Hindi papers and fills the hi slot', async () => {
    const [q] = await TestBed.inject(QuestionGenerator).generate(intake(1, 'hi'));
    expect(requests[0].prompt).toContain('Hindi (Devanagari script, NCERT Hindi terminology)');
    expect(requests[0].prompt).toContain('steps, misconceptions, rationales');
    expect(q.hi).toEqual(q.en);
  });

  it('formats the solution in the skill §7 layout', () => {
    expect(
      formatSolution({
        steps: [{ title: 'A', working: '$x$' }, { title: 'B', working: '$y$' }],
        misconceptions: [{ mistake: 'm', fix: 'f' }],
        rationales: [],
        answer: '42',
      }),
    ).toBe('Step 1 – A: $x$\nStep 2 – B: $y$\nAnswer: 42\n\nCommon misconceptions:\n• m → f');
  });
});
