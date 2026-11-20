import { GeminiSchema } from '../../../core/services/ai/gemini.service';

/**
 * Prompt and schema for question generation, following the gemini-question-generator skill
 * (.agents/skills/gemini-question-generator/SKILL.md §2–3, §6). Keep the two in sync.
 *
 * Differences from the skill, by design:
 * - One language per paper (the paper's primary language) instead of en + hi, for cost and latency.
 * - Also supports Numeric / Short Text / Subjective questions (`answer` instead of options).
 */

export const OPTION_IDS = ['opt1', 'opt2', 'opt3', 'opt4'] as const;

export const QUESTION_SYSTEM_INSTRUCTION = `You are an elite Chief Examiner for prestigious Indian exams (JEE Main/Advanced, NEET-UG, CBSE Board and school tests).
Generate conceptually rigorous, original questions strictly conforming to the requested subject, class, topic, question type and difficulty.

CRITICAL FORMATTING & LATEX INVARIANTS:
1. LATEX DELIMITERS:
   - Use $...$ for inline mathematical and chemical expressions (e.g. $E = mc^2$, $\\vec{B}$, $H_2SO_4$) and $$...$$ for display equations.
   - NEVER use unsupported environments such as \\begin{align}, \\begin{eqnarray}, \\begin{equation*} or \\linebreak. Use KaTeX-compatible constructs only.
   - Output plain JSON strings; no markdown.

2. CORRECTNESS:
   - Every question must be unambiguous, solvable from the stem, and have exactly one correct answer.
   - MCQ: exactly 4 options with ids opt1, opt2, opt3, opt4; vary which option is correct across questions.

3. BLOOM'S TAXONOMY & DIFFICULTY CALIBRATION:
   - Easy: direct conceptual recall, single-formula substitution, definitional checks.
   - Medium: two-step calculations, concept bridging (e.g. kinematics + energy conservation).
   - Hard: multi-variable synthesis, non-intuitive boundary conditions, graphical analysis.

4. DIAGNOSTIC DISTRACTOR RATIONALES ('distractor_rationales', MCQ only):
   - Each incorrect option MUST come from a common student misconception (missing factor of 1/2, inverted sign, wrong vector direction, wrong unit conversion, etc.).
   - For each distractor, name the exact misconception AND the wrong working that produces it, so a teacher can diagnose a student from the option they chose.
   - For the correct option, state in one line why it is correct.

5. STEP-WISE WORKED SOLUTION ('solution_steps'):
   - 2 to 6 ordered steps; each step does ONE thing (identify concept -> state law/formula -> substitute with units -> simplify -> conclude).
   - Every step carries its own LaTeX working; never skip algebra a student would need.
   - The last step states the final answer and matches the key exactly.
   - 'explanation' is the same solution as continuous prose and must agree with the steps.

6. MISCONCEPTIONS WHILE ANSWERING ('common_misconceptions'):
   - 1 to 3 traps specific to THIS question, never generic advice such as "read carefully".
   - Each has the 'mistake' (what the student actually does) and the 'fix' (the reasoning or check that avoids it).
   - Prefer the misconceptions the distractors are built from, plus traps in the stem (units, sign conventions, NOT/EXCEPT wording, boundary conditions).
   - Never repeat or trivially rephrase a question.`;

export const QUESTION_RESPONSE_SCHEMA: GeminiSchema = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          subtopic: { type: 'STRING', description: 'Target concept or formula tested' },
          difficulty: { type: 'STRING', enum: ['Easy', 'Medium', 'Hard'], description: "Bloom's taxonomy difficulty" },
          text: { type: 'STRING', description: 'Question stem with KaTeX LaTeX' },
          options: {
            type: 'ARRAY',
            description: 'MCQ only: exactly 4 options opt1-opt4.',
            items: {
              type: 'OBJECT',
              properties: { id: { type: 'STRING', enum: [...OPTION_IDS] }, text: { type: 'STRING' } },
              required: ['id', 'text'],
            },
          },
          correct_option_id: { type: 'STRING', enum: [...OPTION_IDS], description: 'MCQ only.' },
          answer: { type: 'STRING', description: 'Numeric / Short Text: the exact answer with units. Subjective: the key points.' },
          explanation: { type: 'STRING', description: 'The full solution as continuous prose with LaTeX.' },
          solution_steps: {
            type: 'ARRAY',
            description: '2-6 ordered steps of the worked solution.',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: "Short action title, e.g. Apply Gauss's law" },
                working: { type: 'STRING', description: 'The working for this step, with LaTeX and units' },
              },
              required: ['title', 'working'],
            },
          },
          common_misconceptions: {
            type: 'ARRAY',
            description: '1-3 mistakes students make while answering this question.',
            items: {
              type: 'OBJECT',
              properties: {
                mistake: { type: 'STRING', description: 'What the student does wrong' },
                fix: { type: 'STRING', description: 'The reasoning or check that avoids it' },
              },
              required: ['mistake', 'fix'],
            },
          },
          distractor_rationales: {
            type: 'OBJECT',
            description: 'MCQ only: why each option is right or wrong.',
            properties: {
              opt1: { type: 'STRING' },
              opt2: { type: 'STRING' },
              opt3: { type: 'STRING' },
              opt4: { type: 'STRING' },
            },
          },
        },
        required: ['difficulty', 'text', 'explanation', 'solution_steps', 'common_misconceptions'],
      },
    },
  },
  required: ['questions'],
};
