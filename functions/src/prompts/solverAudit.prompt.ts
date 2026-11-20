import { Type } from '@google/genai';
import { generateStructuredJson } from '../providers/gemini.provider.js';
import { IExamQuestion } from '../types/index.js';

export interface ISolverAuditItemInput {
  questionId: string;
  stem: string;
  options: Array<{ id: string; text: string }>;
  type: string;
}

export interface ISolverQuestionEvaluation {
  questionId: string;
  solvedOptionId: string; // The auditor's independently derived correct option
  solvedNumericValue?: string;
  solverReasoning: string;
  confidence: number;
  hasAmbiguity: boolean;
  ambiguityDescription?: string;
  isLatexValid: boolean;
  latexIssue?: string;
  difficultyRating: 'easy' | 'medium' | 'hard';
}

export interface ISolverAuditSummary {
  overallPass: boolean;
  totalQuestions: number;
  matchedCount: number;
  discrepancies: Array<{
    questionId: string;
    expectedOptionId?: string;
    auditorOptionId: string;
    reasoning: string;
    issue: 'MISMATCH' | 'AMBIGUOUS' | 'LATEX_ERROR';
  }>;
  flaggedQuestionIds: string[];
  auditedQuestions: ISolverQuestionEvaluation[];
}

export const solverAuditSchema = {
  type: Type.OBJECT,
  properties: {
    evaluations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionId: {
            type: Type.STRING,
            description: 'The question ID being audited.',
          },
          solvedOptionId: {
            type: Type.STRING,
            description: 'The option ID (e.g. opt1, opt2) independently determined to be correct.',
          },
          solvedNumericValue: {
            type: Type.STRING,
            description: 'For numeric questions, the calculated value.',
          },
          solverReasoning: {
            type: Type.STRING,
            description: 'Step-by-step mathematical/scientific derivation solving the problem from first principles.',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Confidence in this solution (0.0 to 1.0).',
          },
          hasAmbiguity: {
            type: Type.BOOLEAN,
            description: 'True if multiple options could be correct or question lacks boundary conditions.',
          },
          ambiguityDescription: {
            type: Type.STRING,
            description: 'Explanation if the question is ambiguous or flawed.',
          },
          isLatexValid: {
            type: Type.BOOLEAN,
            description: 'True if all LaTeX expressions compile cleanly without syntax errors.',
          },
          latexIssue: {
            type: Type.STRING,
            description: 'Details of any LaTeX syntax error found.',
          },
          difficultyRating: {
            type: Type.STRING,
            enum: ['easy', 'medium', 'hard'],
            description: 'Auditor assessment of cognitive load.',
          },
        },
        required: [
          'questionId',
          'solvedOptionId',
          'solverReasoning',
          'confidence',
          'hasAmbiguity',
          'isLatexValid',
        ],
      },
      description: 'Audit evaluation for each question.',
    },
  },
  required: ['evaluations'],
};

export const SOLVER_AUDIT_SYSTEM_INSTRUCTION = `You are a Blind Lead Physics & Math Solver and Verification Auditor for competitive exam papers.

CRITICAL SECURITY DIRECTIVE:
You have NEVER seen the teacher's official answer key. You must solve every question strictly from scratch from first principles, independent of external hints.

Auditing Tasks:
1. Blind Solution:
   - Carefully read the stem and calculate the precise answer.
   - Match your calculation with opt1, opt2, opt3, or opt4.
2. Defect Detection:
   - Identify Ambiguities: Are there multiple correct options? Are units missing? Is a sign convention unspecified?
   - Identify Distractor Flaws: Are options mathematically identical or trivially eliminable?
3. LaTeX Syntax Inspection:
   - Verify that all $...$ and $$...$$ blocks have matching delimiters, valid commands (e.g. \\frac, \\sqrt), and proper escaping.
4. Confidence Rating:
   - Assign a true confidence between 0.0 and 1.0. If confidence < 0.85, clearly detail the source of doubt.
`;

/**
 * Runs blind solver audit on questions where answer keys are STRIPPED.
 */
export async function runBlindSolverAudit(
  questions: IExamQuestion[],
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro' = 'gemini-2.5-flash'
): Promise<ISolverAuditSummary> {
  // Strip answer keys and explanations before passing to auditor
  const auditorPayload: ISolverAuditItemInput[] = questions.map((q) => ({
    questionId: q.id ?? 'unknown_id',
    stem: q.en?.text ?? '',
    options: (q.en?.options ?? []).map((o) => ({ id: o.id, text: o.text })),
    type: String(q.type),
  }));

  const prompt = `Solve and audit the following competitive exam questions blindly.
Do not assume any option is pre-selected.

QUESTIONS TO AUDIT:
${JSON.stringify(auditorPayload, null, 2)}
`;

  const response = await generateStructuredJson<{
    evaluations: ISolverQuestionEvaluation[];
  }>({
    model,
    systemInstruction: SOLVER_AUDIT_SYSTEM_INSTRUCTION,
    prompt,
    schema: solverAuditSchema,
    temperature: 0.1, // Near-zero temperature for deterministic mathematical rigor
    thinkingBudget: 2048,
  });

  const evaluations = response.evaluations || [];
  const discrepancies: ISolverAuditSummary['discrepancies'] = [];
  const flaggedQuestionIds: string[] = [];
  let matchedCount = 0;

  for (const q of questions) {
    const qId = q.id ?? '';
    const auditItem = evaluations.find((e) => e.questionId === qId);

    if (!auditItem) {
      discrepancies.push({
        questionId: qId,
        expectedOptionId: q.correctOptionId,
        auditorOptionId: 'none',
        reasoning: 'Auditor did not return evaluation for question',
        issue: 'MISMATCH',
      });
      flaggedQuestionIds.push(qId);
      continue;
    }

    // Check LaTeX
    if (!auditItem.isLatexValid) {
      discrepancies.push({
        questionId: qId,
        expectedOptionId: q.correctOptionId,
        auditorOptionId: auditItem.solvedOptionId,
        reasoning: auditItem.latexIssue || 'Invalid LaTeX syntax in question',
        issue: 'LATEX_ERROR',
      });
      flaggedQuestionIds.push(qId);
    }

    // Check Ambiguity
    if (auditItem.hasAmbiguity) {
      discrepancies.push({
        questionId: qId,
        expectedOptionId: q.correctOptionId,
        auditorOptionId: auditItem.solvedOptionId,
        reasoning: auditItem.ambiguityDescription || 'Question flagged as ambiguous',
        issue: 'AMBIGUOUS',
      });
      flaggedQuestionIds.push(qId);
    }

    // Check Answer Key Match
    if (q.correctOptionId) {
      if (q.correctOptionId.toLowerCase() === auditItem.solvedOptionId.toLowerCase()) {
        matchedCount++;
      } else {
        discrepancies.push({
          questionId: qId,
          expectedOptionId: q.correctOptionId,
          auditorOptionId: auditItem.solvedOptionId,
          reasoning: `Author answer key (${q.correctOptionId}) disagrees with auditor solved option (${auditItem.solvedOptionId}): ${auditItem.solverReasoning}`,
          issue: 'MISMATCH',
        });
        flaggedQuestionIds.push(qId);
      }
    } else {
      matchedCount++;
    }
  }

  const overallPass = discrepancies.length === 0;

  return {
    overallPass,
    totalQuestions: questions.length,
    matchedCount,
    discrepancies,
    flaggedQuestionIds: Array.from(new Set(flaggedQuestionIds)),
    auditedQuestions: evaluations,
  };
}
