import { Service } from '@angular/core';
import { FunctionCall, FunctionDeclaration, FunctionResponse, GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { environment } from '../../../../environments/environment';

/**
 * Thin wrapper over the Gemini Live API (bidirectional WebSocket) for the Voice Copilot.
 *
 * When a backend is configured (`environment.examApi`), the session opens with a short-lived,
 * single-use token from `POST /api/ai/live-token`, so no Gemini key is in the browser. Without a
 * backend (local only), it uses `environment.gemini.apiKey`.
 */

export interface ILiveSessionConfig {
  systemInstruction: string;
  tools: FunctionDeclaration[];
}

export interface ILiveHandlers {
  onAudio(base64Pcm: string): void;
  onInputTranscript(text: string): void;
  onOutputTranscript(text: string): void;
  onToolCalls(calls: FunctionCall[]): void;
  onInterrupted(): void;
  onTurnComplete(): void;
  onClose(reason: string): void;
}

const PLACEHOLDER_KEY = 'YOUR_GEMINI_API_KEY';
/** Live is only served on v1beta; @google/genai 3.x defaults to v1, which 404s on the WebSocket. */
const LIVE_API_VERSION = 'v1beta';

@Service()
export class GeminiLiveClient {
  private session: Session | null = null;

  /** Backend that mints Live tokens; null when running without one (local key mode). */
  private readonly tokenEndpoint = environment.examApi?.baseUrl
    ? { url: `${environment.examApi.baseUrl}/api/ai/live-token`, demoToken: environment.examApi.demoToken }
    : null;

  isConfigured(): boolean {
    if (!environment.gemini.liveModel) return false;
    return !!this.tokenEndpoint || this.hasFallbackKey();
  }

  /** A real key in environment.gemini.apiKey (not the placeholder). */
  private hasFallbackKey(): boolean {
    const key = environment.gemini.apiKey?.trim();
    return !!key && key !== PLACEHOLDER_KEY && !key.startsWith('YOUR');
  }

  /**
   * Key for the Live session: environment.gemini.apiKey (v1beta) when a real key is set there
   * (environment.prod.ts on the live site); otherwise a server-minted ephemeral token (v1alpha).
   */
  private async credentials(): Promise<{ apiKey: string; apiVersion: string }> {
    const fallback = { apiKey: environment.gemini.apiKey, apiVersion: LIVE_API_VERSION };
    if (this.hasFallbackKey() || !this.tokenEndpoint) return fallback;
    try {
      const response = await fetch(this.tokenEndpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.tokenEndpoint.demoToken}` },
        body: JSON.stringify({ model: environment.gemini.liveModel }),
      });
      const json = (await response.json().catch(() => ({}))) as { token?: string; error?: { message?: string } };
      if (!response.ok || !json.token) {
        throw new Error(json.error?.message ?? `Could not get a voice session token (HTTP ${response.status}).`);
      }
      // Ephemeral tokens only work on v1alpha (the SDK then uses BidiGenerateContentConstrained).
      return { apiKey: json.token, apiVersion: 'v1alpha' };
    } catch (e) {
      if (!this.hasFallbackKey()) throw e;
      console.warn('[GeminiLive] server token unavailable; using the fallback key.', e);
      return fallback;
    }
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  async connect(config: ILiveSessionConfig, handlers: ILiveHandlers): Promise<void> {
    this.close();
    const { apiKey, apiVersion } = await this.credentials();
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
    let opened: Session | null = null;
    const session = await ai.live.connect({
      model: environment.gemini.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // gemini-3.8-live spoke its own reasoning without this (and still did occasionally; hence the native-audio default).
        thinkingConfig: { includeThoughts: false },
        systemInstruction: config.systemInstruction,
        tools: [{ functionDeclarations: config.tools }],
        // Native-audio models reject languageCode (e.g. en-IN); the Indian accent comes from the system prompt.
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sulafat' } } },
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => dispatch(message, handlers),
        // A close event always follows an error; it is reported once from onclose.
        onerror: (event: ErrorEvent) => console.warn('[GeminiLive] socket error', event.message),
        onclose: (event: CloseEvent) => {
          // Ignore the close of a session we already replaced or closed ourselves.
          if (opened && this.session === opened) {
            this.session = null;
            handlers.onClose(event.reason || (event.code === 1000 ? 'Session ended' : `Connection closed (${event.code})`));
          }
        },
      },
    });
    opened = session;
    this.session = session;
  }

  /** 16 kHz, 16-bit mono little-endian PCM, base64-encoded. */
  sendAudio(base64Pcm: string): void {
    this.session?.sendRealtimeInput({ audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' } });
  }

  sendText(text: string): void {
    this.session?.sendRealtimeInput({ text });
  }

  sendToolResponses(functionResponses: FunctionResponse[]): void {
    this.session?.sendToolResponse({ functionResponses });
  }

  close(): void {
    const session = this.session;
    this.session = null;
    session?.close();
  }
}

function dispatch(message: LiveServerMessage, handlers: ILiveHandlers): void {
  if (message.toolCall?.functionCalls?.length) handlers.onToolCalls(message.toolCall.functionCalls);
  const content = message.serverContent;
  if (!content) return;
  if (content.interrupted) handlers.onInterrupted();
  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/')) handlers.onAudio(part.inlineData.data);
  }
  if (content.inputTranscription?.text) handlers.onInputTranscript(content.inputTranscription.text);
  if (content.outputTranscription?.text) handlers.onOutputTranscript(content.outputTranscription.text);
  if (content.turnComplete) handlers.onTurnComplete();
}
