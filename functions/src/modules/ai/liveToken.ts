import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { GoogleGenAI } from '@google/genai';

/**
 * Short-lived Gemini Live token for the Voice Copilot.
 *
 * The browser cannot hold GEMINI_API_KEY, and Live is a WebSocket the relay cannot forward. So the
 * server mints a single-use ephemeral token (auth_tokens/...); the browser opens the Live session
 * with it and sends its own system instruction and tools. Mounted behind authMiddleware (demo token).
 */

/** Live models the Voice Copilot may open. */
export const LIVE_ALLOWED_MODELS = new Set(['gemini-3.8-live', 'gemini-3.6-flash-live', 'gemini-live-3.6-flash-native-audio']);

/** New sessions must start within this window; an open session may run until the session limit. */
export const LIVE_NEW_SESSION_WINDOW_MS = 60_000;
export const LIVE_SESSION_LIMIT_MS = 30 * 60_000;

/** Returns an error message for an invalid request, or null when a token can be minted. */
export function validateLiveTokenBody(body: { model?: unknown } | undefined): string | null {
  if (!body || typeof body.model !== 'string' || !LIVE_ALLOWED_MODELS.has(body.model)) {
    return `Model not allowed. Use one of: ${[...LIVE_ALLOWED_MODELS].join(', ')}.`;
  }
  return null;
}

export async function liveToken(req: Request, res: Response): Promise<void> {
  const body = req.body as { model?: unknown } | undefined;
  const problem = validateLiveTokenBody(body);
  if (problem) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: problem } });
    return;
  }
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    logger.error('liveToken: GEMINI_API_KEY is not configured.');
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Gemini is not configured on the server.' } });
    return;
  }

  const model = body!.model as string;
  const now = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + LIVE_SESSION_LIMIT_MS).toISOString(),
        newSessionExpireTime: new Date(now + LIVE_NEW_SESSION_WINDOW_MS).toISOString(),
        // No liveConnectConstraints: a constrained token makes Gemini ignore the client's session
        // config (system instruction + tools), so the copilot could not create exams. The token is
        // still single-use and must start a session within 60 s.
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    logger.info(JSON.stringify({ evt: 'live_token', model }));
    res.status(200).json({ token: token.name, model, expiresAt: new Date(now + LIVE_SESSION_LIMIT_MS).toISOString() });
  } catch (e) {
    logger.warn(JSON.stringify({ evt: 'live_token', model, outcome: 'error', message: e instanceof Error ? e.message : String(e) }));
    res.status(502).json({ error: { code: 'UPSTREAM_ERROR', message: 'Could not get a Gemini Live token.' } });
  }
}
