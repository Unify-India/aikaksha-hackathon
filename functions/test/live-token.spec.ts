import { describe, expect, it } from 'vitest';
import { validateLiveTokenBody } from '../src/modules/ai/liveToken.js';

describe('liveToken validation', () => {
  it('accepts an allowed Live model', () => {
    expect(validateLiveTokenBody({ model: 'gemini-3.8-live' })).toBeNull();
  });

  it('rejects missing or non-Live models', () => {
    expect(validateLiveTokenBody(undefined)).toContain('Model not allowed');
    expect(validateLiveTokenBody({ model: 'gemini-3.6-flash' })).toContain('Model not allowed');
    expect(validateLiveTokenBody({ model: 7 })).toContain('Model not allowed');
  });
});
