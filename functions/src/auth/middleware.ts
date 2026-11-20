import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import * as logger from 'firebase-functions/logger';

export interface AuthContext {
  teacherId: string;
  tenantId: string;
  role?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const DEMO_AUTH_CONTEXT: AuthContext = {
  teacherId: 'teacher-sharma-101',
  tenantId: 'institute-alpha-delhi',
  role: 'teacher',
};

/** Only used in the local emulator when DEMO_AUTH_TOKEN is not set. Never accepted when deployed. */
export const LOCAL_DEV_TOKEN = 'demo-teacher-token-alpha';

/** True inside `firebase emulators:start`. */
export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/**
 * Demo auth (hackathon): one shared bearer token.
 *
 * Deployed: only the exact DEMO_AUTH_TOKEN secret is accepted (timing-safe compare). If the secret is
 * missing, every request is rejected (fail closed) so the API and MCP server are never left open.
 * Emulator: DEMO_AUTH_TOKEN if set, otherwise LOCAL_DEV_TOKEN; `mock-token-<teacherId>` is also accepted.
 *
 * Token from `Authorization: Bearer <token>` or `?token=` (EventSource cannot send headers).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req);
  const result = authenticate(token, {
    configuredToken: process.env.DEMO_AUTH_TOKEN,
    emulator: isEmulator(),
    allowMockTokens: isEmulator() || process.env.ALLOW_MOCK_TOKENS === 'true',
  });

  if (result.ok) {
    req.auth = result.auth;
    return next();
  }

  if (result.reason === 'not-configured') {
    logger.error('DEMO_AUTH_TOKEN is not configured; rejecting all requests. Set it with `firebase functions:secrets:set DEMO_AUTH_TOKEN`.');
  } else {
    logger.warn('Authentication failed: missing or invalid token', { tokenProvided: Boolean(token) });
  }
  res.status(401).json({
    error: 'UNAUTHENTICATED',
    message: 'Missing or invalid authorization bearer token (or ?token= query param)',
    timestamp: new Date().toISOString(),
  });
}

export type AuthResult =
  | { ok: true; auth: AuthContext }
  | { ok: false; reason: 'missing-token' | 'invalid-token' | 'not-configured' };

/** Pure decision logic (unit-tested). */
export function authenticate(
  token: string | undefined,
  opts: { configuredToken: string | undefined; emulator: boolean; allowMockTokens: boolean },
): AuthResult {
  const expected = opts.configuredToken?.trim() || (opts.emulator ? LOCAL_DEV_TOKEN : undefined);

  if (token && opts.allowMockTokens && token.startsWith('mock-token-')) {
    const teacherId = token.slice('mock-token-'.length).trim() || DEMO_AUTH_CONTEXT.teacherId;
    return { ok: true, auth: { ...DEMO_AUTH_CONTEXT, teacherId } };
  }
  if (!expected) return { ok: false, reason: 'not-configured' };
  if (!token) return { ok: false, reason: 'missing-token' };
  return safeEqual(token, expected) ? { ok: true, auth: { ...DEMO_AUTH_CONTEXT } } : { ok: false, reason: 'invalid-token' };
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  const query = req.query.token;
  return typeof query === 'string' && query.trim() ? query.trim() : undefined;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
