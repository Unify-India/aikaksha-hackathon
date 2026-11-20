import { ApiError } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  backoffDelay,
  GeminiError,
  generateJson,
  setGeminiClientForTests,
  toGeminiJsonSchema,
  type GeminiClientLike,
} from './gemini.provider.js';

const Schema = z.object({ answer: z.number().int() });
const noSleep = () => Promise.resolve();

function fakeClient(...replies: (string | Error)[]): GeminiClientLike & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    models: {
      generateContent: vi.fn(async (params) => {
        calls.push(params);
        const next = replies.shift();
        if (next === undefined) throw new Error('no more fake replies');
        if (next instanceof Error) throw next;
        return { text: next };
      }),
    },
  };
}

const call = (maxAttempts = 3) =>
  generateJson({ label: 't', systemInstruction: 's', parts: 'p', zodSchema: Schema, maxAttempts, sleep: noSleep });

afterEach(() => setGeminiClientForTests(undefined));

describe('generateJson', () => {
  it('returns validated JSON and sends a JSON schema', async () => {
    const fake = fakeClient('{"answer": 42}');
    setGeminiClientForTests(fake);
    await expect(call()).resolves.toEqual({ answer: 42 });

    const sent = fake.calls[0] as { config: Record<string, unknown> };
    expect(sent.config['responseMimeType']).toBe('application/json');
    expect(sent.config['responseJsonSchema']).toMatchObject({ type: 'object', required: ['answer'] });
  });

  it('retries a 429 and then succeeds', async () => {
    const fake = fakeClient(new ApiError({ message: 'quota', status: 429 }), '{"answer": 1}');
    setGeminiClientForTests(fake);
    await expect(call()).resolves.toEqual({ answer: 1 });
    expect(fake.calls).toHaveLength(2);
  });

  it('retries invalid JSON, then gives up with MODEL_INVALID_OUTPUT', async () => {
    setGeminiClientForTests(fakeClient('not json', '{"answer": "x"}', '{}'));
    await expect(call()).rejects.toMatchObject({ code: 'MODEL_INVALID_OUTPUT', attempts: 3 });
  });

  it('reports MODEL_RATE_LIMITED after exhausting retries on 429', async () => {
    const err = () => new ApiError({ message: 'quota', status: 429 });
    setGeminiClientForTests(fakeClient(err(), err()));
    await expect(call(2)).rejects.toMatchObject({ code: 'MODEL_RATE_LIMITED', status: 429 });
  });

  it('does not retry a 400', async () => {
    const fake = fakeClient(new ApiError({ message: 'bad request', status: 400 }), '{"answer": 1}');
    setGeminiClientForTests(fake);
    await expect(call()).rejects.toBeInstanceOf(GeminiError);
    expect(fake.calls).toHaveLength(1);
  });

  it('maps timeouts to MODEL_TIMEOUT', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
    setGeminiClientForTests(fakeClient(timeout));
    await expect(call(1)).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
  });
});

describe('backoffDelay', () => {
  it('grows exponentially with jitter inside [ceiling/2, ceiling]', () => {
    expect(backoffDelay(1, new Error('x'), () => 0)).toBe(500);
    expect(backoffDelay(1, new Error('x'), () => 1)).toBe(1000);
    expect(backoffDelay(3, new Error('x'), () => 1)).toBe(4000);
  });

  it('honours a retryDelay hint, capped at 30 s', () => {
    expect(backoffDelay(1, new Error('{"retryDelay": "7s"}'))).toBe(7000);
    expect(backoffDelay(1, new Error('{"retryDelay": "90s"}'))).toBe(30_000);
  });
});

describe('toGeminiJsonSchema', () => {
  it('drops $schema and keeps enums/descriptions', () => {
    const s = toGeminiJsonSchema(z.object({ level: z.enum(['a', 'b']).describe('lvl') }));
    expect(s['$schema']).toBeUndefined();
    expect(s).toMatchObject({ properties: { level: { enum: ['a', 'b'], description: 'lvl' } } });
  });
});
