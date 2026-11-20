import { Service, signal } from '@angular/core';

/**
 * Browser audio for the Gemini Live session:
 * - microphone → 16 kHz PCM16 base64 chunks (AudioWorklet in public/worklets/)
 * - 24 kHz PCM16 base64 chunks from Gemini → gapless playback queue, flushable on barge-in
 * - input/output levels (0–1) for the waveform
 *
 * Both AudioContexts must be created from a user gesture (mic tap, send, chip click).
 */

/** Resolved against <base href> so it also works when the app is served from a sub-path. */
const WORKLET_PATH = 'worklets/pcm-recorder.worklet.js';
const MIC_RATE = 16000;
const SPEAKER_RATE = 24000;

@Service()
export class AudioIo {
  private micContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  /** Guards a double tap while the permission prompt is open. */
  private micStarting = false;

  private speakerContext: AudioContext | null = null;
  private speakerAnalyser: AnalyserNode | null = null;
  private playhead = 0;
  private readonly sources = new Set<AudioBufferSourceNode>();

  private readonly _micOn = signal(false);
  private readonly _playing = signal(false);
  readonly micOn = this._micOn.asReadonly();
  /** True while Gemini audio is audible. */
  readonly playing = this._playing.asReadonly();

  static get micSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';
  }

  /** Prepare playback; call from a user gesture so the browser allows sound. */
  async unlockSpeaker(): Promise<void> {
    if (!this.speakerContext) {
      this.speakerContext = new AudioContext({ sampleRate: SPEAKER_RATE });
      this.speakerAnalyser = this.speakerContext.createAnalyser();
      this.speakerAnalyser.fftSize = 256;
      this.speakerAnalyser.connect(this.speakerContext.destination);
    }
    if (this.speakerContext.state === 'suspended') await this.speakerContext.resume();
  }

  /** Start streaming the microphone. Throws if permission is denied or unsupported. */
  async startMic(onChunk: (base64Pcm: string) => void): Promise<void> {
    if (this._micOn() || this.micStarting) return;
    this.micStarting = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } finally {
      this.micStarting = false;
    }
    try {
      // Chrome/Edge/Safari resample the mic for us at 16 kHz. Firefox refuses a mic source in a
      // context whose rate differs from the device, so fall back to the native rate (the worklet resamples).
      await this.buildMicGraph(stream, onChunk, MIC_RATE).catch(() => this.buildMicGraph(stream, onChunk));
      this._micOn.set(true);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw err;
    }
  }

  private async buildMicGraph(stream: MediaStream, onChunk: (base64Pcm: string) => void, sampleRate?: number): Promise<void> {
    const context = new AudioContext(sampleRate ? { sampleRate } : undefined);
    try {
      if (context.state === 'suspended') await context.resume();
      await context.audioWorklet.addModule(new URL(WORKLET_PATH, document.baseURI).href);
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      const recorder = new AudioWorkletNode(context, 'pcm-recorder');
      recorder.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(toBase64(event.data));
      // Muted path to the destination keeps the worklet pulled by the audio graph in every browser.
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(analyser);
      source.connect(recorder).connect(mute).connect(context.destination);
      this.micContext = context;
      this.micStream = stream;
      this.micAnalyser = analyser;
    } catch (err) {
      await context.close();
      throw err;
    }
  }

  stopMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.micContext?.close();
    this.micContext = null;
    this.micStream = null;
    this.micAnalyser = null;
    this._micOn.set(false);
  }

  /** Queue one chunk of 24 kHz PCM16 audio right after the previous one. */
  play(base64Pcm: string): void {
    const ctx = this.speakerContext;
    if (!ctx || !this.speakerAnalyser) return;
    const pcm = new Int16Array(fromBase64(base64Pcm));
    if (!pcm.length) return;
    const buffer = ctx.createBuffer(1, pcm.length, SPEAKER_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.speakerAnalyser);
    this.playhead = Math.max(this.playhead, ctx.currentTime);
    source.start(this.playhead);
    this.playhead += buffer.duration;
    this.sources.add(source);
    this._playing.set(true);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.sources.size) this._playing.set(false);
    };
  }

  /** Stop everything queued (the teacher interrupted the agent). */
  flush(): void {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
    }
    this.sources.clear();
    this.playhead = 0;
    this._playing.set(false);
  }

  /** RMS level 0–1 of the mic or speaker, for the waveform. */
  level(which: 'mic' | 'speaker'): number {
    const analyser = which === 'mic' ? this.micAnalyser : this.speakerAnalyser;
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  dispose(): void {
    this.stopMic();
    this.flush();
    void this.speakerContext?.close();
    this.speakerContext = null;
    this.speakerAnalyser = null;
  }
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length & ~1); // PCM16 needs an even byte count
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
