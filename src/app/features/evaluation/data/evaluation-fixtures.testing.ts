import { IMarkingScheme } from '../models/evaluation.models';

/**
 * TEST-ONLY sample marking schemes (used by specs; never wired into the app).
 * The maths scheme is a subset of a real Class 12 test paper (questions paraphrased, no branding);
 * every answer below has been worked out and checked.
 */
export const SAMPLE_MATHS_SCHEME: IMarkingScheme = {
  id: 'scheme-class12-maths-sample',
  title: 'Class 12 Mathematics Test (sample subset)',
  subject: 'Mathematics',
  classLevel: '12',
  source: 'question_paper',
  status: 'approved',
  totalMarks: 23,
  questions: [
    {
      id: 'A1',
      number: '1',
      section: 'A',
      type: 'mcq',
      questionText: 'If sin⁻¹x = y, then the range of y is: (a) 0 ≤ y ≤ π (b) −π/2 ≤ y ≤ π/2 (c) 0 < y < π (d) −π/2 < y < π/2',
      maxMarks: 1,
      correctOption: 'b',
      steps: [],
    },
    {
      id: 'A2',
      number: '2',
      section: 'A',
      type: 'mcq',
      questionText: 'cos⁻¹(cos 2π/3) + sin⁻¹(sin 2π/3) = ? (a) 8π/3 (b) π/2 (c) 3π/4 (d) π',
      maxMarks: 1,
      correctOption: 'd',
      steps: [],
    },
    {
      id: 'A3',
      number: '3',
      section: 'A',
      type: 'mcq',
      questionText: 'sin(cos⁻¹ 3/5) = ? (a) 3/4 (b) 4/5 (c) 3/5 (d) Not possible',
      maxMarks: 1,
      correctOption: 'b',
      steps: [],
    },
    {
      id: 'A5',
      number: '5',
      section: 'A',
      type: 'mcq',
      questionText: 'If A is a matrix, then A·A⁻¹ equals: (a) I (b) A⁻¹A (c) ½ (d) Not defined',
      maxMarks: 1,
      correctOption: 'a',
      steps: [],
    },
    {
      id: 'A6',
      number: '6',
      section: 'A',
      type: 'mcq',
      questionText:
        'A = [aᵢⱼ] is skew-symmetric if: (a) aᵢⱼ = 0 (b) aᵢⱼ = −aⱼᵢ and aᵢᵢ = 0 (c) aᵢⱼ = aⱼᵢ (d) aᵢⱼ = 1',
      maxMarks: 1,
      correctOption: 'b',
      steps: [],
    },
    {
      id: 'B2',
      number: '2',
      section: 'B',
      type: 'subjective',
      questionText: 'Evaluate: (i) sin[π/3 − sin⁻¹(−1/2)]  (ii) sin[2 cos⁻¹(−3/5)]',
      maxMarks: 2,
      modelAnswer:
        '(i) sin⁻¹(−1/2) = −π/6, so sin(π/3 + π/6) = sin(π/2) = 1. (ii) Let θ = cos⁻¹(−3/5), cos θ = −3/5, sin θ = 4/5; sin 2θ = 2·(4/5)·(−3/5) = −24/25.',
      steps: [
        { id: 'B2-1', description: '(i) Uses principal value −π/6 and gets 1', marks: 1 },
        { id: 'B2-2', description: '(ii) Finds sin θ = 4/5 and gets sin 2θ = −24/25', marks: 1 },
      ],
    },
    {
      id: 'B3',
      number: '3',
      section: 'B',
      type: 'subjective',
      questionText: 'Find the value of tan⁻¹(1) + cos⁻¹(−1/2) + sin⁻¹(−1/2).',
      maxMarks: 2,
      modelAnswer: 'π/4 + 2π/3 + (−π/6) = (3π + 8π − 2π)/12 = 3π/4.',
      steps: [
        { id: 'B3-1', description: 'Correct principal values π/4, 2π/3, −π/6', marks: 1 },
        { id: 'B3-2', description: 'Correct sum 3π/4', marks: 1 },
      ],
    },
    {
      id: 'B5',
      number: '5',
      section: 'B',
      type: 'subjective',
      questionText: 'Show that f(x) = x² is differentiable at x = 1 and find f′(1).',
      maxMarks: 2,
      modelAnswer:
        'LHD = lim h→0⁻ [(1+h)² − 1]/h = lim (2 + h) = 2; RHD likewise = 2. LHD = RHD, so f is differentiable at 1 and f′(1) = 2.',
      steps: [
        { id: 'B5-1', description: 'Evaluates left and right limits of the difference quotient (both 2)', marks: 1 },
        { id: 'B5-2', description: 'Concludes differentiability and f′(1) = 2', marks: 1 },
      ],
    },
    {
      id: 'B6',
      number: '6',
      section: 'B',
      type: 'subjective',
      questionText: 'Find dy/dx: (i) y = sin 5x · cos 3x  (ii) y = log(2x + 1)',
      maxMarks: 2,
      modelAnswer: '(i) dy/dx = 5 cos 5x cos 3x − 3 sin 5x sin 3x. (ii) dy/dx = 2/(2x + 1).',
      steps: [
        { id: 'B6-1', description: '(i) Product rule with chain rule: 5cos5x·cos3x − 3sin5x·sin3x', marks: 1 },
        { id: 'B6-2', description: '(ii) Chain rule: 2/(2x + 1)', marks: 1 },
      ],
    },
    {
      id: 'C8',
      number: '8',
      section: 'C',
      type: 'subjective',
      questionText: 'Prove that tan⁻¹[(3a²x − x³)/(a³ − 3ax²)] = 3 tan⁻¹(x/a).',
      maxMarks: 4,
      modelAnswer:
        'Put x = a tan θ. The expression becomes (3 tan θ − tan³θ)/(1 − 3 tan²θ) = tan 3θ, so LHS = 3θ = 3 tan⁻¹(x/a).',
      steps: [
        { id: 'C8-1', description: 'Substitution x = a tan θ', marks: 1 },
        { id: 'C8-2', description: 'Simplifies to (3 tan θ − tan³θ)/(1 − 3 tan²θ)', marks: 1 },
        { id: 'C8-3', description: 'Recognises the tan 3θ identity', marks: 1 },
        { id: 'C8-4', description: 'Concludes 3θ = 3 tan⁻¹(x/a)', marks: 1 },
      ],
    },
    {
      id: 'D16',
      number: '16',
      section: 'D',
      type: 'subjective',
      questionText:
        'If A = [[1, 2, −3], [2, 3, 2], [3, −3, −4]], find A⁻¹ and hence solve x + 2y − 3z = −4, 2x + 3y + 2z = 2, 3x − 3y − 4z = 11.',
      maxMarks: 6,
      modelAnswer: '|A| = 67 ≠ 0; A⁻¹ = (1/67)·adj A; X = A⁻¹B gives x = 3, y = −2, z = 1.',
      steps: [
        { id: 'D16-1', description: 'Computes |A| = 67', marks: 1 },
        { id: 'D16-2', description: 'Correct cofactors / adj A', marks: 2 },
        { id: 'D16-3', description: 'Writes A⁻¹ = adj A / 67', marks: 1 },
        { id: 'D16-4', description: 'Sets up X = A⁻¹B', marks: 1 },
        { id: 'D16-5', description: 'Obtains x = 3, y = −2, z = 1', marks: 1 },
      ],
    },
  ],
};

/** A scheme reused from a Workflow A exam (answer key already stored server-side). */
export const SAMPLE_WORKFLOW_A_SCHEME: IMarkingScheme = {
  id: 'scheme-exam-neet-electrostatics',
  title: 'NEET Practice — Electrostatics (from Voice Copilot)',
  subject: 'Physics',
  classLevel: '12',
  source: 'workflow_a_exam',
  examId: 'exam-neet-electrostatics-demo',
  status: 'approved',
  totalMarks: 12,
  questions: [
    {
      id: 'Q1',
      number: '1',
      type: 'mcq',
      questionText: 'The SI unit of electric flux is: (a) N/C (b) N·m²/C (c) C/m² (d) V/m',
      maxMarks: 4,
      correctOption: 'b',
      steps: [],
    },
    {
      id: 'Q2',
      number: '2',
      type: 'mcq',
      questionText:
        'Capacitance of a parallel-plate capacitor fully filled with a dielectric K is: (a) ε₀A/d (b) Kε₀A/d (c) ε₀A/(Kd) (d) KA/(ε₀d)',
      maxMarks: 4,
      correctOption: 'b',
      steps: [],
    },
    {
      id: 'Q3',
      number: '3',
      type: 'mcq',
      questionText: 'Electric field inside a charged conducting sphere is: (a) zero (b) maximum (c) kq/r² (d) kq/R',
      maxMarks: 4,
      correctOption: 'a',
      steps: [],
    },
  ],
};
