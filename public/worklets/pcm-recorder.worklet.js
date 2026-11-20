// AudioWorklet: mono mic input → 16 kHz 16-bit PCM chunks (~100 ms) posted to the main thread.
// Served as a static file because AudioWorklet modules must be loaded by URL.
const TARGET_RATE = 16000;
const CHUNK_SAMPLES = 1600;

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE; // `sampleRate` is the AudioWorkletGlobalScope context rate
    this.position = 0; // fractional read position into the incoming stream
    this.previous = 0; // last sample of the previous block, for interpolation across blocks
    this.buffer = new Int16Array(CHUNK_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;

    // Linear-interpolation resampling; ratio is 1 when the context already runs at 16 kHz.
    while (this.position < input.length) {
      const index = Math.floor(this.position);
      const frac = this.position - index;
      const a = index === 0 ? this.previous : input[index - 1];
      const b = input[index];
      const sample = Math.max(-1, Math.min(1, a + (b - a) * frac));
      this.buffer[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      if (this.filled === CHUNK_SAMPLES) {
        this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
        this.buffer = new Int16Array(CHUNK_SAMPLES);
        this.filled = 0;
      }
      this.position += this.ratio;
    }
    this.position -= input.length;
    this.previous = input[input.length - 1];
    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorderProcessor);
