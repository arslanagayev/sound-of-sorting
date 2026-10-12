/**
 * Sorting algorithms never touch the screen or the speakers. They read through a `Probe` and
 * yield one operation per step, so the same run can be drawn, played, counted or tested.
 */
export type Op =
  | { readonly kind: 'compare'; readonly i: number; readonly j: number }
  | { readonly kind: 'swap'; readonly i: number; readonly j: number }
  | { readonly kind: 'write'; readonly i: number; readonly value: number };

/** Read-only view of the array being sorted; writes only happen through yielded ops. */
export interface Probe {
  readonly length: number;
  get(i: number): number;
}

export type Sorter = (probe: Probe) => Generator<Op, void, undefined>;

export interface Algorithm {
  readonly key: string;
  readonly name: string;
  readonly best: string;
  readonly average: string;
  readonly worst: string;
  readonly space: string;
  readonly stable: boolean;
  readonly idea: string;
  readonly sort: Sorter;
}

/** Applies one operation to a plain array (the runner and the tests share this). */
export function apply(values: number[], op: Op): void {
  switch (op.kind) {
    case 'compare':
      return;
    case 'swap': {
      const a = values[op.i];
      const b = values[op.j];
      if (a === undefined || b === undefined)
        throw new RangeError(`swap out of range: ${op.i}, ${op.j}`);
      values[op.i] = b;
      values[op.j] = a;
      return;
    }
    case 'write':
      if (op.i < 0 || op.i >= values.length) throw new RangeError(`write out of range: ${op.i}`);
      values[op.i] = op.value;
      return;
  }
}

/** A probe over an array that the caller keeps in sync by applying every yielded op. */
export function probeOf(values: readonly number[]): Probe {
  return {
    get length() {
      return values.length;
    },
    get(i) {
      const v = values[i];
      if (v === undefined) throw new RangeError(`read out of range: ${i}`);
      return v;
    },
  };
}
