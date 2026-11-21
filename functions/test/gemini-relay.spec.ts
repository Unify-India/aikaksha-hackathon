import { describe, expect, it } from 'vitest';
import { RELAY_MAX_BODY_BYTES, validateRelayBody } from '../src/modules/ai/geminiRelay.js';

const ok = { model: 'gemini-3.6-flash', request: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] } };

describe('geminiRelay validation', () => {
  it('accepts an allowed model with a generateContent request', () => {
    expect(validateRelayBody(ok, 100)).toBeNull();
  });

  it('rejects models outside the allow-list (e.g. retired or expensive ones)', () => {
    expect(validateRelayBody({ ...ok, model: 'gemini-2.5-flash' }, 100)).toContain('Model not allowed');
    expect(validateRelayBody({ ...ok, model: 'gemini-3.1-pro-preview' }, 100)).toContain('Model not allowed');
    expect(validateRelayBody({ ...ok, model: 42 }, 100)).toContain('Model not allowed');
  });

  it('rejects malformed requests and oversized bodies', () => {
    expect(validateRelayBody(undefined, 0)).toContain('Body must be JSON');
    expect(validateRelayBody({ model: 'gemini-3.6-flash', request: { prompt: 'x' } }, 100)).toContain('request.contents');
    expect(validateRelayBody(ok, RELAY_MAX_BODY_BYTES + 1)).toContain('too large');
  });
});
