import { UPDATE_DRAFT_TOOL, buildSystemInstruction, buildToolDeclarations } from './exam-intake.prompt';
import { TEACHER_BATCHES } from './teacher-context';

const prompt = buildSystemInstruction({ now: new Date('2026-11-21T04:00:00Z'), timeZone: 'Asia/Kolkata', teacherName: 'Prof. R. Sharma', batches: TEACHER_BATCHES });

describe('Voice Copilot intake prompt', () => {
  it('treats every request as an exam: no DPP, and no exam-vs-DPP question', () => {
    expect(prompt).not.toMatch(/DPP|Daily Practice/i);
    expect(prompt).toContain('Every request is for an exam');
    const update = buildToolDeclarations(TEACHER_BATCHES).find((t) => t.name === UPDATE_DRAFT_TOOL)!;
    expect(Object.keys(update.parameters?.properties ?? {})).not.toContain('intent');
  });

  it('keeps "generate an exam / questions" requests in scope, including classes without a batch', () => {
    expect(prompt).toContain('IN SCOPE (this is your job, never refuse it)');
    expect(prompt).toContain('Generate an exam for class 9th please');
    expect(prompt).not.toMatch(/OUT OF SCOPE:[^\n]*writing questions/);
    expect(prompt).toContain('If no batch matches the class mentioned');
  });

  it('infers the subject from a topic and asks the teacher to confirm before saving it', () => {
    expect(prompt).toContain('algebra, trigonometry, quadratic equations: Mathematics');
    expect(prompt).toContain('"Algebra is Mathematics, right?"');
    expect(prompt).toContain('Save subject only after they confirm or correct it');
  });

  it('asks for a warm, friendly tone with an Indian English accent', () => {
    expect(prompt).toContain('natural Indian English accent and Indian intonation');
    expect(prompt).toContain('Never switch to an American or British accent');
    expect(prompt).toContain('warm and a little friendly');
    expect(prompt).toContain('"Sharma ji"');
  });

  it('always asks for the test duration instead of assuming one', () => {
    expect(prompt).toContain('number of questions (targetQuestions), date, start time, duration');
    expect(prompt).toContain('ALWAYS ask how long the test is');
    expect(prompt).toContain('Never assume a duration');
    expect(prompt).not.toContain('duration (45 min)');
  });
});
