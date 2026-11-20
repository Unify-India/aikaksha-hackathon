import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAutoDppIntent } from '../src/prompts/auto-dpp.prompt.js';
import { extractIntent, toVoiceIntent } from '../src/prompts/intent-extraction.prompt.js';
import { setGeminiClientForTests, type GeminiClientLike } from '../src/providers/gemini.provider.js';
import { negativeMarksFor } from '../src/types/voice-intent.js';

function fakeClient(reply: unknown): GeminiClientLike & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    models: {
      generateContent: vi.fn(async (params) => {
        prompts.push(String(params.contents));
        return { text: JSON.stringify(reply) };
      }),
    },
  };
}

afterEach(() => setGeminiClientForTests(undefined));

const NEET =
  'Create a 45-minute NEET practice exam for Batch Lakshya 2026 on Electrostatics, with 15 moderate MCQs, 4 marks each and standard 1/4 negative marking, scheduled for tomorrow from 10:00 AM to 10:45 AM.';

describe('extractIntent', () => {
  it('normalises the NEET demo answer and marks it complete', async () => {
    setGeminiClientForTests(
      fakeClient({
        detectedAction: 'CREATE_EXAM', confidence: 0.95, batchName: 'Lakshya 2026', subject: 'physics', topic: 'Electrostatics',
        questionCount: 15, durationMinutes: 45, marksPerQuestion: 4, negativeRule: '1/4', questionType: 'MCQ',
        difficulty: 'medium', dateText: 'tomorrow', startTime: '10:00', endTime: '10:45', examPattern: 'NEET',
      }),
    );
    const intent = await extractIntent(NEET, '2026-11-20T09:00:00+05:30', 'Asia/Kolkata');
    expect(intent.isComplete).toBe(true);
    expect(intent.missingRequiredSlots).toEqual([]);
    expect(intent.extractedSlots).toMatchObject({ subject: 'Physics', title: 'NEET Practice: Electrostatics', dateText: 'tomorrow' });
  });

  it('tells the model today’s date and time zone', async () => {
    const fake = fakeClient({ detectedAction: 'UNKNOWN', confidence: 0.2 });
    setGeminiClientForTests(fake);
    await extractIntent('hello', '2026-11-20T09:00:00+05:30', 'Asia/Kolkata');
    expect(fake.prompts[0]).toContain('Friday, 20 November 2026');
    expect(fake.prompts[0]).toContain('Asia/Kolkata');
  });

  it('decides missing settings in code, not the model', () => {
    const intent = toVoiceIntent('x', { detectedAction: 'CREATE_EXAM', confidence: 0.9, topic: 'Optics', questionCount: 0 });
    expect(intent.isComplete).toBe(false);
    expect(intent.missingRequiredSlots).toEqual(
      expect.arrayContaining(['batchName', 'subject', 'questionCount', 'marksPerQuestion', 'dateText', 'startTime', 'durationMinutes']),
    );
  });
});

describe('buildAutoDppIntent', () => {
  it('builds a fixed 10-question intent with pattern-based negative marking', async () => {
    setGeminiClientForTests(
      fakeClient({ subject: 'Physics', topic: 'Motion in a Plane', subtopic: 'Projectile motion at an angle', examPattern: 'JEE', confidence: 0.9 }),
    );
    const intent = await buildAutoDppIntent('Taught projectile motion at an angle — Class 12 JEE', 'batch-lakshya-2026');
    expect(intent).toMatchObject({
      detectedAction: 'AUTO_DPP',
      isComplete: true,
      extractedSlots: {
        batchId: 'batch-lakshya-2026', questionCount: 10, marksPerQuestion: 4, negativeRule: '1/4',
        difficulty: 'medium', title: 'DPP: Projectile motion at an angle',
      },
    });
  });

  it('uses no negative marking when no exam pattern is named', async () => {
    setGeminiClientForTests(fakeClient({ subject: 'Physics', topic: 'Optics', subtopic: 'Refraction', confidence: 0.8 }));
    const intent = await buildAutoDppIntent('Taught refraction today, class 10', 'b1');
    expect(intent.extractedSlots.negativeRule).toBe('none');
  });
});

describe('negativeMarksFor', () => {
  it('converts rules to marks', () => {
    expect(negativeMarksFor(4, '1/4')).toBe(1);
    expect(negativeMarksFor(4, '1/2')).toBe(2);
    expect(negativeMarksFor(3, '1/3')).toBe(1);
    expect(negativeMarksFor(4, 'none')).toBe(0);
    expect(negativeMarksFor(4, undefined)).toBe(0);
  });
});
