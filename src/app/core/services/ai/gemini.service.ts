import { Service } from '@angular/core';
import { environment } from '../../../../environments/environment';

/**
 * Shared browser-side Gemini client (REST, no SDK).
 *
 * ⚠ LOCAL DEVELOPMENT ONLY: the API key from `environment.gemini.apiKey` is visible to anyone
 * who opens the app in a browser. Never commit a real key. Once the server is up, these calls
 * move behind `/api/*` and the key lives only in `server/.env` / Secret Manager.
 */

/** One piece of a Gemini request: text, an inline file, or an uploaded file. */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/** Gemini response schema (OpenAPI subset): https://ai.google.dev/api/caching#Schema */
export interface GeminiSchema {
  type: 'OBJECT' | 'ARRAY' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN';
  description?: string;
  nullable?: boolean;
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: GeminiSchema;
  minItems?: number;
  maxItems?: number;
}

export interface GeminiJsonRequest {
  parts: GeminiPart[];
  systemInstruction?: string;
  responseSchema?: GeminiSchema;
  temperature?: number;
  /** Tokens Gemini 2.5 may spend "thinking" before answering (0 disables). */
  thinkingBudget?: number;
  model?: string;
  signal?: AbortSignal;
  /** Call Gemini directly with this key instead of the relay / configured key. */
  apiKey?: string;
}

interface GeminiUploadedFile {
  name: string;
  uri: string;
  mimeType: string;
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

/** Files above this size are sent through the Files API instead of inline (request limit is ~20 MB). */
export const INLINE_LIMIT_BYTES = 15 * 1024 * 1024;
const PLACEHOLDER_KEY = 'YOUR_GEMINI_API_KEY';
/** Largest single file sent through the backend relay (base64 grows it by a third; the server caps bodies near 10 MB). */
export const RELAY_INLINE_LIMIT_BYTES = 6.5 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
/** A single Gemini call longer than this is treated as hung (grading a 7-page sheet takes ~45 s). */
const REQUEST_TIMEOUT_MS = 3 * 60_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

@Service()
export class GeminiService {
  private readonly config = environment.gemini;
  /** AI Kaksha backend relay (POST /api/ai/generate): the server adds the Gemini key, so the browser never holds one. */
  private readonly relay = environment.examApi?.baseUrl
    ? { url: `${environment.examApi.baseUrl}/api/ai/generate`, token: environment.examApi.demoToken }
    : null;

  /** True when Gemini can be called: through the backend relay, or with a key set locally. */
  isConfigured(): boolean {
    if (this.relay) return true;
    const key = this.config.apiKey?.trim();
    return !!key && key !== PLACEHOLDER_KEY;
  }

  /** Requests go through the backend relay (no key in the browser). */
  get usesRelay(): boolean {
    return !!this.relay;
  }

  get model(): string {
    return this.config.model || 'gemini-3.6-flash';
  }

  /** One generateContent call — via the backend relay when configured, otherwise straight to Gemini. */
  private generateContent(model: string, body: unknown, signal?: AbortSignal, apiKey?: string): Promise<Response> {
    if (apiKey) {
      return this.fetchWithRetry(`${this.config.endpoint}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal,
      });
    }
    if (this.relay) {
      return this.fetchWithRetry(this.relay.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.relay.token}` },
        body: JSON.stringify({ model, request: body }),
        signal,
      });
    }
    return this.fetchWithRetry(`${this.config.endpoint}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey },
      body: JSON.stringify(body),
      signal,
    });
  }

  /** Asks Gemini for a JSON answer and parses it. Retries on 429/5xx with backoff. */
  async generateJson<T>(request: GeminiJsonRequest): Promise<T> {
    if (!request.apiKey) this.assertConfigured();
    const model = request.model ?? this.model;
    const body = {
      contents: [{ role: 'user', parts: request.parts }],
      ...(request.systemInstruction ? { systemInstruction: { parts: [{ text: request.systemInstruction }] } } : {}),
      generationConfig: {
        responseMimeType: 'application/json',
        ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
        temperature: request.temperature ?? 0,
        ...(request.thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget: request.thinkingBudget } } : {}),
      },
    };

    const response = await this.generateContent(model, body, request.signal, request.apiKey);
    const json = (await response.json()) as GeminiGenerateResponse;

    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts
      ?.filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (!text) {
      const reason = candidate?.finishReason ?? json.promptFeedback?.blockReason ?? 'no content';
      throw new GeminiError(`Gemini returned no answer (${reason}).`);
    }
    return parseJsonResponse<T>(text);
  }

  /**
   * Image generation / editing with a Gemini image model ("Nano Banana").
   * Returns the first image Gemini sends back.
   */
  async generateImage(request: { parts: GeminiPart[]; model: string; signal?: AbortSignal }): Promise<Blob> {
    this.assertConfigured();
    const response = await this.generateContent(
      request.model,
      { contents: [{ role: 'user', parts: request.parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
      request.signal,
    );
    const json = (await response.json()) as GeminiGenerateResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const image = parts.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'))?.inlineData;
    if (!image) {
      const said = parts.map((p) => p.text ?? '').join(' ').trim().slice(0, 160);
      throw new GeminiError(`The image model returned no image${said ? `: "${said}"` : '.'}`);
    }
    return base64ToBlob(image.data, image.mimeType);
  }

  /** Turns a PDF/photo into a request part: inline when small, uploaded via the Files API when large. */
  async fileToPart(file: Blob, mimeType = file.type, displayName = 'upload', signal?: AbortSignal): Promise<GeminiPart> {
    this.assertConfigured();
    if (this.relay && file.size > RELAY_INLINE_LIMIT_BYTES) {
      // The relay forwards one JSON request (server limit ~10 MB); the Files API would need the key in the browser.
      throw new GeminiError(`This file is too large for the server (max ${RELAY_INLINE_LIMIT_BYTES / (1024 * 1024)} MB).`);
    }
    if (file.size <= INLINE_LIMIT_BYTES) {
      return { inlineData: { mimeType, data: await blobToBase64(file) } };
    }
    const uploaded = await this.uploadFile(file, mimeType, displayName, signal);
    return { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } };
  }

  /** Resumable upload to the Gemini Files API (files auto-delete after 48 h). */
  private async uploadFile(file: Blob, mimeType: string, displayName: string, signal?: AbortSignal): Promise<GeminiUploadedFile> {
    const origin = new URL(this.config.endpoint).origin;
    const start = await this.fetchWithRetry(`${origin}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.config.apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
      signal,
    });
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw new GeminiError('Gemini file upload did not return an upload URL.');

    const finish = await this.fetchWithRetry(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
      body: file,
      signal,
    });
    let uploaded = ((await finish.json()) as { file: GeminiUploadedFile }).file;

    // Large PDFs are processed asynchronously; wait until Gemini can read them.
    for (let i = 0; uploaded.state === 'PROCESSING' && i < 60; i++) {
      await delay(2000);
      signal?.throwIfAborted();
      const poll = await this.fetchWithRetry(`${this.config.endpoint}/${uploaded.name}`, {
        headers: { 'x-goog-api-key': this.config.apiKey },
        signal,
      });
      uploaded = (await poll.json()) as GeminiUploadedFile;
    }
    if (uploaded.state === 'FAILED') throw new GeminiError('Gemini could not process the uploaded file.');
    if (uploaded.state === 'PROCESSING') throw new GeminiError('Gemini took too long to process the uploaded file.');
    return uploaded;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
      } catch (e) {
        if (timeout.aborted) {
          throw new GeminiError(`Gemini did not answer within ${REQUEST_TIMEOUT_MS / 60_000} minutes. Please try again.`);
        }
        throw e;
      }
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw await toGeminiError(response);
      init.signal?.throwIfAborted();
      await delay(1500 * 2 ** (attempt - 1) + Math.random() * 500);
      init.signal?.throwIfAborted();
    }
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new GeminiError('Gemini API key is missing. Add it to environment.gemini.apiKey (local only).');
    }
  }
}

interface GeminiGenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean; inlineData?: { mimeType: string; data: string } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

async function toGeminiError(response: Response): Promise<GeminiError> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const detail = body?.error?.message ?? response.statusText;
  if (response.status === 429) {
    // "limit: 0" means this key has no quota at all for the model (typical for image models on free keys).
    if (/limit:\s*0\b/.test(detail)) {
      return new GeminiError(
        'This API key has no quota for this model. Image models ("Nano Banana") usually need billing enabled in Google AI Studio.',
        429,
      );
    }
    return new GeminiError('Gemini quota exceeded. Please wait a minute and try again.', 429);
  }
  return new GeminiError(`Gemini error ${response.status}: ${detail}`, response.status);
}

/** Strips code fences, repairs LaTeX backslashes, and parses Gemini's JSON text. */
export function parseJsonResponse<T>(text: string): T {
  const clean = text.replace(/```json|```/g, '').trim();
  // Repair first: "\frac" or "\theta" are *valid* JSON escapes (\f, \t) and would parse
  // silently into the wrong text, so never try the raw string first.
  try {
    return JSON.parse(preprocessJsonString(clean)) as T;
  } catch {
    return JSON.parse(clean) as T;
  }
}

/**
 * Escapes stray backslashes so JSON containing LaTeX (e.g. "\frac", "\theta") still parses.
 * Inside $…$ / $$…$$ every backslash is doubled; elsewhere only invalid JSON escapes are fixed.
 */
export function preprocessJsonString(str: string): string {
  let result = '';
  let i = 0;
  let inDoubleDollar = false;
  let inSingleDollar = false;

  while (i < str.length) {
    if (str.startsWith('$$', i)) {
      inDoubleDollar = !inDoubleDollar;
      result += '$$';
      i += 2;
    } else if (str[i] === '$') {
      let isEscaped = false;
      let j = i - 1;
      while (j >= 0 && str[j] === '\\') {
        isEscaped = !isEscaped;
        j--;
      }
      if (!isEscaped) {
        inSingleDollar = !inSingleDollar;
      }
      result += '$';
      i += 1;
    } else if (str[i] === '\\') {
      if (inDoubleDollar || inSingleDollar) {
        if (i + 1 < str.length && str[i + 1] === '\\') {
          result += '\\\\';
          i += 2;
        } else {
          result += '\\\\';
          i += 1;
        }
      } else if (i + 1 < str.length) {
        const nextChar = str[i + 1];
        const isValidEscape = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(nextChar);
        if (isValidEscape) {
          result += '\\' + nextChar;
          i += 2;
        } else {
          result += '\\\\';
          i += 1;
        }
      } else {
        result += '\\\\';
        i += 1;
      }
    } else {
      result += str[i];
      i += 1;
    }
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
