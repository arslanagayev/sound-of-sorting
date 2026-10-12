/** The part of AudioContext the synth uses, so tests can pass a fake. */
export interface AudioLike {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: string;
  resume(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

/**
 * Short triangle-wave blips, one per sounded operation. The context is created lazily on the
 * first user gesture (browsers block audio before that), and at most `maxVoices` blips start per
 * call so a fast race does not turn into noise.
 */
export class Synth {
  enabled = true;
  volume = 0.18;
  #ctx: AudioLike | null = null;
  #master: GainNode | null = null;
  readonly #create: () => AudioLike | null;

  constructor(create: () => AudioLike | null = defaultContext) {
    this.#create = create;
  }

  /** Call from a click or key handler: creates or wakes the audio context. */
  unlock(): void {
    if (!this.#ctx) {
      this.#ctx = this.#create();
      if (!this.#ctx) return;
      this.#master = this.#ctx.createGain();
      this.#master.connect(this.#ctx.destination);
    }
    if (this.#ctx.state === 'suspended') void this.#ctx.resume();
  }

  get ready(): boolean {
    return this.#ctx !== null;
  }

  /** Plays each frequency as a blip; `length` is in seconds, `level` scales this batch. */
  play(frequencies: readonly number[], { length = 0.07, level = 1, maxVoices = 3 } = {}): number {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!this.enabled || !ctx || !master || frequencies.length === 0) return 0;
    const voices = frequencies.slice(0, maxVoices);
    const now = ctx.currentTime;
    const peak = (this.volume * level) / Math.sqrt(voices.length);
    for (const f of voices) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + length + 0.02);
    }
    return voices.length;
  }
}

function defaultContext(): AudioLike | null {
  return typeof AudioContext === 'undefined' ? null : new AudioContext();
}
