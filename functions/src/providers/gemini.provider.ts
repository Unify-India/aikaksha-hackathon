/**
 * Gemini provider: the single place the backend talks to Gemini.
 *
 * - `@google/genai`, key from `GEMINI_API_KEY` (env / Secret Manager). Never shipped to Angular.
 * - `generateJson`: asks for JSON (`responseMimeType` + `responseJsonSchema` generated from a zod schema),
 *   then validates the reply with the same zod schema. One schema, no drift.
 * - Retries 429 / 5xx / timeouts / invalid JSON with exponential backoff + full jitter.
 * - `generateStructuredJson`: older helper kept for existing callers (evaluation, intent); same client.
 *
 * Owner: Sakshi.
 */
import { ApiError, GoogleGenAI, type Part } from '@google/genai';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Default model; override with GEMINI_MODEL. */
export const DEFAULT_MODEL = process.env['GEMINI_MODEL'] ?? 'gemini-3.8-flash';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GeminiErrorCode =
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_TIMEOUT'
  | 'MODEL_INVALID_OUTPUT'
  | 'MODEL_NOT_CONFIGURED'
  | 'UPSTREAM_ERROR';

export class GeminiError extends Error {
  constructor(
    public readonly code: GeminiErrorCode,
    message: string,
    public readonly attempts: number,
    public readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GeminiError';
  }
}

// ---------------------------------------------------------------------------
// Client (lazy, swappable in tests)
// ---------------------------------------------------------------------------

/** The one SDK method we use; lets tests pass a fake without touching the network. */
export interface GeminiClientLike {
  models: {
    generateContent(params: Parameters<GoogleGenAI['models']['generateContent']>[0]): Promise<{
      text?: string | undefined;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    }>;
  };
}

let realClient: GoogleGenAI | undefined;
let testClient: GeminiClientLike | undefined;

/** The real SDK client (Vertex AI or API key). */
export function getGenAIClient(): GoogleGenAI {
  if (realClient) return realClient;

  if (process.env['GOOGLE_GENAI_USE_VERTEXAI'] === 'true') {
    // Vertex AI path: Application Default Credentials, no key.
    realClient = new GoogleGenAI({
      vertexai: true,
      project: process.env['GOOGLE_CLOUD_PROJECT'],
      location: process.env['GOOGLE_CLOUD_LOCATION'] ?? 'asia-south1',
    });
    return realClient;
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new GeminiError(
      'MODEL_NOT_CONFIGURED',
      'GEMINI_API_KEY is not set (or set GOOGLE_GENAI_USE_VERTEXAI=true).',
      0,
    );
  }
  // SDK v3 defaults to API 'v1', which rejects systemInstruction and responseJsonSchema.
  realClient = new GoogleGenAI({ apiKey, apiVersion: process.env['GEMINI_API_VERSION'] ?? 'v1beta' });
  return realClient;
}

function getClient(): GeminiClientLike {
  return testClient ?? getGenAIClient();
}

/** Test hook: inject a fake client, or pass `undefined` to reset. */
export function setGeminiClientForTests(fake: GeminiClientLike | undefined): void {
  testClient = fake;
}

// ---------------------------------------------------------------------------
// generateJson
// ---------------------------------------------------------------------------

export interface GenerateJsonOptions<S extends z.ZodType> {
  /** Short name for logs, e.g. 'intent', 'questions[2]'. */
  label: string;
  /** Model id; defaults to DEFAULT_MODEL. */
  model?: string;
  systemInstruction: string;
  /** User content: a string, or parts (text + inlineData for images/PDFs). */
  parts: string | Part[];
  /** Validates the reply AND generates the JSON Schema sent to Gemini. */
  zodSchema: S;
  /** 0 disables thinking on 2.5 Flash; -1 = automatic. Omit for the model default. */
  thinkingBudget?: number;
  temperature?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Test hook: replaces the real sleep between retries. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Calls Gemini for structured JSON and returns it parsed and validated.
 * Throws `GeminiError` once retries are exhausted.
 */
export async function generateJson<S extends z.ZodType>(opts: GenerateJsonOptions<S>): Promise<z.output<S>> {
  const model = opts.model ?? DEFAULT_MODEL;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = opts.sleep ?? defaultSleep;
  const responseJsonSchema = toGeminiJsonSchema(opts.zodSchema);
  const contents = typeof opts.parts === 'string' ? opts.parts : [{ role: 'user', parts: opts.parts }];

  let lastError: GeminiError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const response = await getClient().models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema,
          ...(opts.temperature !== undefined && { temperature: opts.temperature }),
          ...(opts.thinkingBudget !== undefined && { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }),
          httpOptions: { timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS },
        },
      });

      const parsed = parseAndValidate(response.text, opts.zodSchema);
      log(opts.label, model, attempt, Date.now() - started, 'ok', response.usageMetadata);
      return parsed;
    } catch (err) {
      lastError = toGeminiError(err, attempt);
      log(opts.label, model, attempt, Date.now() - started, lastError.code);

      const retryable = lastError.code !== 'MODEL_NOT_CONFIGURED' && isRetryable(lastError);
      if (!retryable || attempt === maxAttempts) break;

      await sleep(backoffDelay(attempt, err));
    }
  }

  throw lastError ?? new GeminiError('UPSTREAM_ERROR', 'Gemini call failed', maxAttempts);
}

// ---------------------------------------------------------------------------
// generateStructuredJson (older helper, kept so existing callers keep working)
// ---------------------------------------------------------------------------

export interface IGenerateJsonOptions {
  model?: string;
  systemInstruction?: string;
  prompt: string;
  schema?: Record<string, unknown>;
  inlineDataParts?: Array<{
    mimeType: string;
    data: string; // base64
  }>;
  temperature?: number;
  thinkingBudget?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Structured-output caller using a hand-written `responseSchema` (no zod validation).
 * Prefer `generateJson` for new code.
 */
export async function generateStructuredJson<T>(options: IGenerateJsonOptions): Promise<T> {
  const {
    model = DEFAULT_MODEL,
    systemInstruction,
    prompt,
    schema,
    inlineDataParts,
    temperature = 0.2,
    thinkingBudget,
    maxRetries = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const parts: Part[] = [
    ...(inlineDataParts ?? []).map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } })),
    { text: prompt },
  ];

  let lastError: GeminiError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          temperature,
          ...(schema && { responseSchema: schema }),
          ...(systemInstruction && { systemInstruction }),
          ...(typeof thinkingBudget === 'number' && { thinkingConfig: { thinkingBudget } }),
          httpOptions: { timeout: timeoutMs },
        },
      });
      if (!response.text) throw new GeminiError('MODEL_INVALID_OUTPUT', 'Empty response from model', attempt);
      let parsed: T;
      try {
        parsed = JSON.parse(response.text) as T;
      } catch (cause) {
        throw new GeminiError('MODEL_INVALID_OUTPUT', 'Model returned invalid JSON', attempt, undefined, { cause });
      }
      log('structured', model, attempt, Date.now() - started, 'ok', response.usageMetadata);
      return parsed;
    } catch (err) {
      lastError = toGeminiError(err, attempt);
      log('structured', model, attempt, Date.now() - started, lastError.code);
      if (lastError.code === 'MODEL_NOT_CONFIGURED' || !isRetryable(lastError) || attempt === maxRetries) break;
      await defaultSleep(backoffDelay(attempt, err));
    }
  }

  throw lastError ?? new GeminiError('UPSTREAM_ERROR', 'Gemini call failed', maxRetries);
}

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

/** zod -> JSON Schema in the subset Gemini accepts. */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' }) as Record<string, unknown>;
  delete json['$schema'];
  return json;
}

export function parseAndValidate<S extends z.ZodType>(text: string | undefined, schema: S): z.output<S> {
  if (!text) {
    throw new GeminiError('MODEL_INVALID_OUTPUT', 'Empty response from model', 0);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new GeminiError('MODEL_INVALID_OUTPUT', 'Model returned invalid JSON', 0, undefined, { cause });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new GeminiError(
      'MODEL_INVALID_OUTPUT',
      `Model JSON failed validation: ${z.prettifyError(result.error)}`,
      0,
    );
  }
  return result.data;
}

/** Exponential backoff with full jitter, honoring a server `retryDelay` hint when present. */
export function backoffDelay(attempt: number, err: unknown, random: () => number = Math.random): number {
  const hinted = retryDelayHintMs(err);
  if (hinted !== undefined) return Math.min(hinted, MAX_DELAY_MS);
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/** Gemini 429 bodies carry RetryInfo, e.g. `"retryDelay": "23s"`. */
function retryDelayHintMs(err: unknown): number | undefined {
  if (!(err instanceof Error)) return undefined;
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(err.message);
  return match?.[1] ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

/** A per-day quota (e.g. "GenerateRequestsPerDayPerProjectPerModel") will not recover by retrying in seconds. */
export function isDailyQuotaError(err: { message: string }): boolean {
  return /PerDay|per day/i.test(err.message);
}

function isRetryable(err: GeminiError): boolean {
  if (err.code === 'MODEL_RATE_LIMITED' && isDailyQuotaError(err)) return false;
  if (err.code === 'MODEL_RATE_LIMITED' || err.code === 'MODEL_TIMEOUT' || err.code === 'MODEL_INVALID_OUTPUT') {
    return true;
  }
  return err.status === undefined || RETRYABLE_STATUS.has(err.status);
}

function toGeminiError(err: unknown, attempt: number): GeminiError {
  if (err instanceof GeminiError) {
    return new GeminiError(err.code, err.message, attempt, err.status, { cause: err.cause });
  }
  if (err instanceof ApiError) {
    const code: GeminiErrorCode = err.status === 429 ? 'MODEL_RATE_LIMITED' : 'UPSTREAM_ERROR';
    return new GeminiError(code, err.message, attempt, err.status, { cause: err });
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return new GeminiError('MODEL_TIMEOUT', 'Gemini request timed out', attempt, undefined, { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new GeminiError('UPSTREAM_ERROR', message, attempt, undefined, { cause: err });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(
  label: string,
  model: string,
  attempt: number,
  durationMs: number,
  outcome: string,
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number },
): void {
  if (process.env['NODE_ENV'] === 'test') return;
  console.info(
    JSON.stringify({
      evt: 'gemini_call',
      label,
      model,
      attempt,
      durationMs,
      outcome,
      inTokens: usage?.promptTokenCount,
      outTokens: usage?.candidatesTokenCount,
      thoughtsTokens: usage?.thoughtsTokenCount,
    }),
  );
}
