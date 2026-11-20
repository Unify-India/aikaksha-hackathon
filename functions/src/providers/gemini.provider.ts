import { GoogleGenAI } from '@google/genai';

/**
 * Singleton Google GenAI SDK Client Wrapper.
 * Reads API key from process.env.GEMINI_API_KEY.
 * Provides resilient calls with exponential backoff and jitter.
 */
let genAIInstance: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY environment variable is not set. Mock or test mode may be required.');
    }
    genAIInstance = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-for-initialization' });
  }
  return genAIInstance;
}

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
}

/**
 * Generic structured-output caller with backoff and retry.
 */
export async function generateStructuredJson<T>(options: IGenerateJsonOptions): Promise<T> {
  const {
    model = 'gemini-2.5-flash',
    systemInstruction,
    prompt,
    schema,
    inlineDataParts,
    temperature = 0.2,
    thinkingBudget,
    maxRetries = 3,
  } = options;

  const ai = getGenAIClient();

  // Assemble content parts
  const contents: Array<Record<string, unknown> | string> = [];
  if (inlineDataParts && inlineDataParts.length > 0) {
    for (const part of inlineDataParts) {
      contents.push({
        inlineData: {
          mimeType: part.mimeType,
          data: part.data,
        },
      });
    }
  }
  contents.push(prompt);

  const config: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature,
  };

  if (schema) {
    config.responseSchema = schema;
  }

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  if (typeof thinkingBudget === 'number') {
    config.thinkingConfig = {
      thinkingBudget,
    };
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty response text.');
      }

      const parsed: T = JSON.parse(responseText);
      return parsed;
    } catch (err: unknown) {
      attempt++;
      lastError = err;
      const status = (err as { status?: number })?.status;
      const message = (err as Error)?.message || String(err);

      console.warn(
        `Gemini API generateContent attempt ${attempt}/${maxRetries} failed: ${message}`
      );

      // Check if retryable (429 rate limit or 5xx server error)
      const isRateLimit = status === 429 || message.includes('RESOURCE_EXHAUSTED') || message.includes('429');
      const isServerError = (status && status >= 500) || message.includes('503') || message.includes('UNAVAILABLE');

      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        const baseDelayMs = Math.pow(2, attempt) * 1000;
        const jitterMs = Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs + jitterMs));
        continue;
      }

      break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Gemini structured JSON generation failed after ${maxRetries} attempts`);
}
