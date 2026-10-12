import { algorithm } from './algorithms';
import { makeArray, PRESETS, type Preset } from './data';
import { Runner, pitch, voice } from './runner';

export type Mode = 'solo' | 'race';

export interface Settings {
  readonly mode: Mode;
  readonly algo: string;
  readonly n: number;
  readonly preset: Preset;
  readonly seed: number;
}

/** Fast to slow, so the race reads top to bottom like a leaderboard. */
export const RACE: readonly string[] = [
  'quick',
  'merge',
  'heap',
  'insertion',
  'selection',
  'bubble',
];
export const SIZES = { min: 8, max: 256, default: 64 } as const;

export const DEFAULTS: Settings = {
  mode: 'solo',
  algo: 'quick',
  n: SIZES.default,
  preset: 'random',
  seed: 1,
};

/** Reads settings from a query string, ignoring anything invalid. */
export function readSettings(search: string): Settings {
  const q = new URLSearchParams(search);
  const mode = q.get('mode') === 'race' ? 'race' : 'solo';
  const algoKey = q.get('algo') ?? DEFAULTS.algo;
  const algo = RACE.includes(algoKey) ? algoKey : DEFAULTS.algo;
  const nRaw = Number(q.get('n'));
  const n = Number.isInteger(nRaw) && nRaw >= SIZES.min && nRaw <= SIZES.max ? nRaw : DEFAULTS.n;
  const presetRaw = q.get('data');
  const preset = PRESETS.find((p) => p.key === presetRaw)?.key ?? DEFAULTS.preset;
  const seedRaw = Number(q.get('seed'));
  const seed = Number.isInteger(seedRaw) && seedRaw > 0 ? seedRaw : DEFAULTS.seed;
  return { mode, algo, n, preset, seed };
}

export function writeSettings(s: Settings): string {
  const q = new URLSearchParams({
    mode: s.mode,
    n: String(s.n),
    data: s.preset,
    seed: String(s.seed),
  });
  if (s.mode === 'solo') q.set('algo', s.algo);
  return `?${q.toString()}`;
}

export interface Tone {
  readonly frequency: number;
  readonly lane: number;
}

/**
 * One run: a single algorithm, or every algorithm racing on copies of the same array. Each tick
 * gives every lane the same number of operations, so the finishing order is a fair comparison.
 */
export class Session {
  readonly settings: Settings;
  readonly runners: Runner[];
  ticks = 0;

  constructor(settings: Settings) {
    this.settings = settings;
    const values = makeArray(settings.n, settings.preset, settings.seed);
    const keys = settings.mode === 'race' ? RACE : [settings.algo];
    this.runners = keys.map((key) => new Runner(algorithm(key), values));
  }

  /** Sorting finished and every finishing sweep has played out. */
  get complete(): boolean {
    return this.runners.every((r) => r.done && r.sweep >= r.values.length);
  }

  /** 1-based finishing place of a lane (fewer operations wins), or undefined while it runs. */
  place(lane: number): number | undefined {
    const runner = this.runners[lane];
    if (!runner?.done) return undefined;
    return 1 + this.runners.filter((r) => r.done && r.stats.steps < runner.stats.steps).length;
  }

  /** Advances every lane and returns the tones to play for this frame. */
  tick(opsPerLane: number): Tone[] {
    this.ticks++;
    const tones: Tone[] = [];
    const sweepStep = Math.max(1, Math.ceil(this.settings.n / 48));
    this.runners.forEach((runner, lane) => {
      const max = runner.max;
      if (!runner.done) {
        const ops = runner.step(opsPerLane);
        const last = ops.at(-1);
        if (last) tones.push({ frequency: pitch(voice(last, runner.values), max), lane });
      } else if (runner.sweep < runner.values.length) {
        runner.sweep = Math.min(runner.values.length, runner.sweep + sweepStep);
        const v = runner.values[runner.sweep - 1] ?? 1;
        tones.push({ frequency: pitch(v, max), lane });
      }
    });
    // Rotate so that, when only a few voices can sound, every lane gets its turn.
    const shift = tones.length ? this.ticks % tones.length : 0;
    return [...tones.slice(shift), ...tones.slice(0, shift)];
  }
}
