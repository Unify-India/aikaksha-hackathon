import { Service } from '@angular/core';
import { FunctionCall, FunctionDeclaration, FunctionResponse, GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { environment } from '../../../../environments/environment';

/**
 * Thin wrapper over the Gemini Live API (bidirectional WebSocket) for the Voice Copilot.
 *
 * ⚠ LOCAL DEVELOPMENT ONLY: connects with `environment.gemini.apiKey`, which is visible in the
 * browser. Before deploying, mint short-lived ephemeral tokens on the server instead.
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

  isConfigured(): boolean {
    const key = environment.gemini.apiKey?.trim();
    return !!key && key !== PLACEHOLDER_KEY && !!environment.gemini.liveModel;
  }

  get isOpen(): boolean {
    return this.session !== null;
  }

  async connect(config: ILiveSessionConfig, handlers: ILiveHandlers): Promise<void> {
    this.close();
    const ai = new GoogleGenAI({ apiKey: environment.gemini.apiKey, httpOptions: { apiVersion: LIVE_API_VERSION } });
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
