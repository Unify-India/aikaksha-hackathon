import { environment } from '../../../../environments/environment';

/**
 * Gemini keys the teacher can switch to for Voice Copilot question generation (key picker, and the
 * buttons shown on a quota error). Calls go straight to Gemini with the chosen key.
 * The keys come from `environment.gemini.questionKeys` (local environment files only); with none
 * set, the picker is hidden and the server key is used.
 */
export interface IGeminiKeyOption {
  id: string;
  label: string;
  apiKey: string;
}

export const QUESTION_GEN_KEYS: readonly IGeminiKeyOption[] = (environment.gemini.questionKeys ?? []).filter(
  (k) => k.id && k.apiKey,
);
