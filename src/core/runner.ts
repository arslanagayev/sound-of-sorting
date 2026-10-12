import { apply, probeOf, type Algorithm, type Op } from './ops';

export interface Stats {
  comparisons: number;
  swaps: number;
  writes: number;
  steps: number;
}

/**
 * Steps one algorithm through one array. It owns the array, applies every yielded operation and
 * keeps the numbers the screen shows: counts, the last operation and, once done, a finishing sweep.
 */
export class Runner {
  readonly values: number[];
  readonly stats: Stats = { comparisons: 0, swaps: 0, writes: 0, steps: 0 };
  readonly algorithm: Algorithm;
  last: Op | undefined;
  done = false;
  /** How far the green "sorted" sweep has travelled after finishing (0..length). */
  sweep = 0;
  readonly #ops: Generator<Op, void, undefined>;

  constructor(algorithm: Algorithm, values: readonly number[]) {
    this.algorithm = algorithm;
    this.values = [...values];
    this.#ops = algorithm.sort(probeOf(this.values));
  }

  get max(): number {
    return Math.max(...this.values);
  }

  /** Runs up to `count` operations and returns them, so the caller can draw or play each one. */
  step(count = 1): Op[] {
    const ran: Op[] = [];
    while (ran.length < count && !this.done) {
      const next = this.#ops.next();
      if (next.done) {
        this.done = true;
        this.last = undefined;
        break;
      }
      const op = next.value;
      apply(this.values, op);
      this.#count(op);
      this.last = op;
      ran.push(op);
    }
    return ran;
  }

  /** Runs to the end (used by tests and by "skip"). */
  finish(): void {
    while (!this.done) this.step(4096);
  }

  #count(op: Op): void {
    this.stats.steps++;
    if (op.kind === 'compare') this.stats.comparisons++;
    else if (op.kind === 'swap') this.stats.swaps++;
    else this.stats.writes++;
  }
}

/** Pitch for a value: low values sound low, on an exponential scale between `low` and `high` Hz. */
export function pitch(value: number, max: number, low = 140, high = 1300): number {
  const x = max <= 1 ? 0 : Math.min(1, Math.max(0, (value - 1) / (max - 1)));
  return low * (high / low) ** x;
}

/** The value an operation "sounds like": the larger of the two touched bars, or the written one. */
export function voice(op: Op, values: readonly number[]): number {
  if (op.kind === 'write') return op.value;
  return Math.max(values[op.i] ?? 0, values[op.j] ?? 0);
}
