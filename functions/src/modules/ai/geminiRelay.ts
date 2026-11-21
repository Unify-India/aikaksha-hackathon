import type { Request, Response } from 'express';
import * as logger from 'firebase-functions/logger';

/**
 * Gemini relay for the answer-sheet evaluation screen.
 *
 * The browser builds the Gemini request (prompts, page images, response schema) and posts it here;
 * the server adds GEMINI_API_KEY (Secret Manager) and forwards it to Gemini's generateContent.
 * The key never reaches the browser. Guard rails: demo-token auth (mounted with authMiddleware),
 * a model allow-list, a request-size cap and a timeout — so this cannot be used as an open proxy.
 */

/** Models the evaluation screen may use (text grading + Nano Banana image drawing). */
export const RELAY_ALLOWED_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-image',
  'nano-banana-pro-preview',
]);

/** Cloud Functions (1st gen) reject bodies above ~10 MB; stay below with headroom. */
export const RELAY_MAX_BODY_BYTES = 9.5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 280_000;
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface RelayBody {
  model?: unknown;
  request?: unknown;
}

/** Returns an error message for an invalid relay body, or null when it can be forwarded. */
export function validateRelayBody(body: RelayBody | undefined, rawBytes: number): string | null {
  if (!body || typeof body !== 'object') return 'Body must be JSON: { model, request }.';
  if (typeof body.model !== 'string' || !RELAY_ALLOWED_MODELS.has(body.model)) {
    return `Model not allowed. Use one of: ${[...RELAY_ALLOWED_MODELS].join(', ')}.`;
  }
  const request = body.request as { contents?: unknown } | undefined;
  if (!request || typeof request !== 'object' || !Array.isArray(request.contents)) {
    return 'request.contents must be a Gemini generateContent request.';
  }
  if (rawBytes > RELAY_MAX_BODY_BYTES) return 'Request too large for the server (max ~9.5 MB).';
  return null;
}

export async function geminiRelay(req: Request, res: Response): Promise<void> {
  const body = req.body as RelayBody | undefined;
  const rawBytes = (req as Request & { rawBody?: Buffer }).rawBody?.length ?? JSON.stringify(body ?? {}).length;
  const problem = validateRelayBody(body, rawBytes);
  if (problem) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: problem } });
    return;
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    logger.error('geminiRelay: GEMINI_API_KEY is not configured.');
    res.status(500).json({ error: { code: 'UPSTREAM_ERROR', message: 'Gemini is not configured on the server.' } });
    return;
  }

  const model = body!.model as string;
  const started = Date.now();
  try {
    const upstream = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body!.request),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await upstream.text();
    logger.info(JSON.stringify({ evt: 'gemini_relay', model, status: upstream.status, durationMs: Date.now() - started, inBytes: rawBytes }));
    // Pass Gemini's status and body through unchanged so the browser client can retry 429/5xx as before.
    res.status(upstream.status).type('application/json').send(text);
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    logger.warn(JSON.stringify({ evt: 'gemini_relay', model, outcome: timedOut ? 'timeout' : 'network_error' }));
    res.status(timedOut ? 504 : 502).json({
      error: { code: 'UPSTREAM_ERROR', message: timedOut ? 'Gemini did not answer in time.' : 'Could not reach Gemini.' },
    });
  }
}
