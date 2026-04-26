/**
 * Mic capture → 16 kHz mono f32 LE PCM.
 *
 * Whisper.cpp expects raw f32 little-endian, 16 kHz, single channel.
 * MediaRecorder gives us compressed audio; AudioContext + AudioWorklet
 * gives us raw float frames at our chosen sample rate. We use the latter.
 *
 * Returns:
 *   - `start()` - opens the mic, begins capture.
 *   - `stop()` - closes the mic, returns the assembled PCM buffer.
 *
 * Don't forget to call `stop()` even on error paths or the mic icon stays
 * on in the menu bar (macOS) until tab close.
 */

const SAMPLE_RATE = 16000;

const PCM_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch && ch.length > 0) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export class AudioCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private chunks: Float32Array[] = [];

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Enabling these helps a lot with whisper accuracy on laptop mics.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Inline-load the worklet from a blob URL - beats shipping a separate
    // public/ asset and dealing with Vite path resolution under Electron.
    const blob = new Blob([PCM_WORKLET], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      this.chunks.push(e.data);
    };
    src.connect(this.node);
  }

  async stop(): Promise<ArrayBuffer> {
    try {
      this.node?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      await this.ctx?.close();
    } finally {
      this.ctx = null;
      this.stream = null;
      this.node = null;
    }

    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const flat = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      flat.set(c, off);
      off += c.length;
    }
    this.chunks = [];
    // Return the underlying ArrayBuffer of f32 LE samples.
    return flat.buffer;
  }
}
