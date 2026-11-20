import type { Request, Response, NextFunction } from 'express';
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

const DEFAULT_DEMO_TOKEN = 'demo-teacher-token-alpha';

/**
 * Demo auth middleware:
 * Validates Bearer token or ?token= query parameter (for SSE connections where headers cannot be set).
 * Sets req.auth = { teacherId: 'teacher-sharma-101', tenantId: 'institute-alpha-delhi' }.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const tokenQuery = req.query.token as string | undefined;

  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (tokenQuery) {
    token = tokenQuery.trim();
  }

  const expectedToken = process.env.DEMO_AUTH_TOKEN || DEFAULT_DEMO_TOKEN;

  // In demo / test environment, if token matches or starts with "demo", grant access
  if (token && (token === expectedToken || token.startsWith('demo-') || token === 'demo-token')) {
    req.auth = { ...DEMO_AUTH_CONTEXT };
    return next();
  }

  // Local development (docs/UI_EXAM_CREATION_INTEGRATION_GUIDE.md §2.3): the Angular service sends
  // `Bearer mock-token-<teacherId>`. Only accepted in the emulator or when explicitly enabled.
  const mockTokensAllowed = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.ALLOW_MOCK_TOKENS === 'true';
  if (token && mockTokensAllowed && token.startsWith('mock-token-')) {
    const teacherId = token.slice('mock-token-'.length).trim() || DEMO_AUTH_CONTEXT.teacherId;
    req.auth = { ...DEMO_AUTH_CONTEXT, teacherId };
    return next();
  }

  logger.warn('Authentication failed: Missing or invalid token', { tokenProvided: Boolean(token) });
  res.status(401).json({
    error: 'UNAUTHENTICATED',
    message: 'Valid Bearer token or ?token= query param is required',
  });
}
