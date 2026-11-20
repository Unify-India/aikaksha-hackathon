import { describe, expect, it } from 'vitest';
import { authenticate, LOCAL_DEV_TOKEN } from '../src/auth/middleware.js';

const SECRET = 'f3a9c1d27e8b4f6a0c5d9e2b7a1f4c8d';
const deployed = { configuredToken: SECRET, emulator: false, allowMockTokens: false };
const emulator = { configuredToken: undefined, emulator: true, allowMockTokens: true };

describe('authenticate (deployed)', () => {
  it('accepts only the exact DEMO_AUTH_TOKEN', () => {
    expect(authenticate(SECRET, deployed)).toMatchObject({ ok: true, auth: { teacherId: 'teacher-sharma-101' } });
  });

  it('rejects the old public demo tokens and any demo- prefix', () => {
    for (const t of [LOCAL_DEV_TOKEN, 'demo-token', 'demo-anything', `${SECRET}x`, SECRET.slice(0, -1)]) {
      expect(authenticate(t, deployed)).toEqual({ ok: false, reason: 'invalid-token' });
    }
  });

  it('rejects mock tokens unless explicitly enabled', () => {
    expect(authenticate('mock-token-teacher-sharma-101', deployed).ok).toBe(false);
    expect(authenticate('mock-token-t1', { ...deployed, allowMockTokens: true })).toMatchObject({ ok: true, auth: { teacherId: 't1' } });
  });

  it('fails closed when DEMO_AUTH_TOKEN is not set', () => {
    const notSet = { configuredToken: undefined, emulator: false, allowMockTokens: false };
    expect(authenticate(LOCAL_DEV_TOKEN, notSet)).toEqual({ ok: false, reason: 'not-configured' });
    expect(authenticate('anything', { ...notSet, configuredToken: '   ' })).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('reports a missing token', () => {
    expect(authenticate(undefined, deployed)).toEqual({ ok: false, reason: 'missing-token' });
  });
});

describe('authenticate (emulator)', () => {
  it('keeps local development working with the default token and mock tokens', () => {
    expect(authenticate(LOCAL_DEV_TOKEN, emulator).ok).toBe(true);
    expect(authenticate('mock-token-teacher-sharma-101', emulator)).toMatchObject({ ok: true, auth: { teacherId: 'teacher-sharma-101' } });
    expect(authenticate('demo-anything', emulator).ok).toBe(false);
  });

  it('uses DEMO_AUTH_TOKEN instead of the default when it is set', () => {
    const withSecret = { ...emulator, configuredToken: SECRET };
    expect(authenticate(SECRET, withSecret).ok).toBe(true);
    expect(authenticate(LOCAL_DEV_TOKEN, withSecret).ok).toBe(false);
  });
});
