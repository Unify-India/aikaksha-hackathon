import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256Canonical, stripForStudent } from '../src/utils/security.js';
import type { IExamQuestion } from '../src/types/index.js';

const fullQuestion: IExamQuestion = {
  id: 'q_1',
  type: 'MCQ',
  marks: 4,
  negativeMarks: 1,
  subject: 'Physics',
  topic: 'Electrostatics',
  difficulty: 'medium',
  en: {
    text: 'Two charges are placed at distance $r$. What is the force?',
    options: [
      { id: 'opt1', text: '$F/2$' },
      { id: 'opt2', text: '$4F$' },
      { id: 'opt3', text: '$2F$' },
      { id: 'opt4', text: '$F$' },
    ],
  },
  correctOptionId: 'opt2',
  answer: 42,
  explanation: { en: 'Using Coulomb law ...', hi: 'कूलॉम का नियम ...' },
};

describe('stripForStudent (students must never receive the answer key)', () => {
  it('removes correctOptionId, answer and explanation', () => {
    const stripped = stripForStudent(fullQuestion);
    expect(stripped).not.toHaveProperty('correctOptionId');
    expect(stripped).not.toHaveProperty('answer');
    expect(stripped).not.toHaveProperty('explanation');
  });

  it('keeps everything a student needs to see', () => {
    const stripped = stripForStudent(fullQuestion);
    expect(stripped.id).toBe('q_1');
    expect(stripped.marks).toBe(4);
    expect(stripped.en?.text).toContain('Two charges');
    expect(stripped.en?.options).toHaveLength(4);
  });

  it('leaves no trace of the answer anywhere in the serialized JSON', () => {
    const json = JSON.stringify(stripForStudent(fullQuestion));
    expect(json).not.toContain('correctOptionId');
    expect(json).not.toContain('explanation');
    expect(json).not.toContain('Coulomb law');
    expect(json).not.toContain('"answer"');
  });

  it('does not modify the original question (the answer key copy stays intact)', () => {
    stripForStudent(fullQuestion);
    expect(fullQuestion.correctOptionId).toBe('opt2');
    expect(fullQuestion.answer).toBe(42);
    expect(fullQuestion.explanation?.en).toBeDefined();
  });

  it('works when a question has no answer fields at all', () => {
    const { correctOptionId: _c, answer: _a, explanation: _e, ...bare } = fullQuestion;
    expect(() => stripForStudent(bare as IExamQuestion)).not.toThrow();
  });
});

describe('canonicalJson / sha256Canonical (the hash the teacher approves)', () => {
  it('gives the same output regardless of key order', () => {
    const a = { b: 1, a: 2, nested: { y: 1, x: 2 } };
    const b = { nested: { x: 2, y: 1 }, a: 2, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(sha256Canonical(a)).toBe(sha256Canonical(b));
  });

  it('keeps array order significant', () => {
    expect(sha256Canonical([1, 2, 3])).not.toBe(sha256Canonical([3, 2, 1]));
  });

  it('changes the hash when any value changes', () => {
    const before = sha256Canonical({ correctOptionId: 'opt1' });
    const after = sha256Canonical({ correctOptionId: 'opt2' });
    expect(before).not.toBe(after);
  });

  it('produces a 64-character hex SHA-256', () => {
    expect(sha256Canonical({ any: 'thing' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles null, strings and numbers', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(7)).toBe('7');
  });
});
