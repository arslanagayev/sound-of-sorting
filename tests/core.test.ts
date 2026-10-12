import { describe, expect, it } from 'vitest';
import { ALGORITHMS, algorithm } from '../src/core/algorithms';
import { PRESETS, makeArray, random, type Preset } from '../src/core/data';
import { apply, probeOf, type Op } from '../src/core/ops';
import { Runner, pitch, voice } from '../src/core/runner';

const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

describe('every algorithm', () => {
  for (const algo of ALGORITHMS) {
    describe(algo.name, () => {
      it('sorts every preset at many sizes', () => {
        for (const preset of PRESETS.map((p) => p.key)) {
          for (const n of [0, 1, 2, 3, 7, 16, 33, 100]) {
            const input = makeArray(n, preset, n * 31 + 7);
            const runner = new Runner(algo, input);
            runner.finish();
            expect(runner.values, `${preset} n=${n}`).toEqual(sorted(input));
          }
        }
      });

      it('only touches valid indices and only writes values from the array', () => {
        const input = makeArray(50, 'random', 3);
        const allowed = new Set(input);
        const runner = new Runner(algo, input);
        while (!runner.done) {
          for (const op of runner.step(1)) {
            expect(op.i).toBeGreaterThanOrEqual(0);
            expect(op.i).toBeLessThan(50);
            if (op.kind === 'write') expect(allowed.has(op.value)).toBe(true);
            else {
              expect(op.j).toBeGreaterThanOrEqual(0);
              expect(op.j).toBeLessThan(50);
            }
          }
        }
      });

      it('describes its complexity', () => {
        for (const field of [algo.best, algo.average, algo.worst, algo.space, algo.idea]) {
          expect(field.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it('can be looked up by key', () => {
    expect(algorithm('quick').name).toBe('Quicksort');
    expect(() => algorithm('bogo')).toThrow(/unknown algorithm/u);
  });

  it('has unique keys', () => {
    expect(new Set(ALGORITHMS.map((a) => a.key)).size).toBe(ALGORITHMS.length);
  });
});

describe('the textbook behaviour shows up in the counts', () => {
  const count = (key: string, preset: Preset, n = 64): number => {
    const runner = new Runner(algorithm(key), makeArray(n, preset, 11));
    runner.finish();
    return runner.stats.comparisons;
  };

  it('bubble and insertion sort finish in one pass on sorted data', () => {
    const sortedInput = Array.from({ length: 64 }, (_, i) => i + 1);
    for (const key of ['bubble', 'insertion']) {
      const runner = new Runner(algorithm(key), sortedInput);
      runner.finish();
      expect(runner.stats.comparisons).toBe(63);
      expect(runner.stats.swaps).toBe(0);
    }
  });

  it('selection sort always compares n(n-1)/2 times', () => {
    expect(count('selection', 'random')).toBe((64 * 63) / 2);
    expect(count('selection', 'reversed')).toBe((64 * 63) / 2);
  });

  it('n log n algorithms need far fewer comparisons than n² ones on random data', () => {
    for (const fast of ['merge', 'quick', 'heap']) {
      expect(count(fast, 'random', 256)).toBeLessThan(count('insertion', 'random', 256) / 4);
    }
  });

  it('merge sort writes, the others swap', () => {
    const runner = new Runner(algorithm('merge'), makeArray(32, 'random', 5));
    runner.finish();
    expect(runner.stats.swaps).toBe(0);
    expect(runner.stats.writes).toBeGreaterThan(0);
    expect(runner.stats.steps).toBe(runner.stats.comparisons + runner.stats.writes);
  });
});

describe('Runner', () => {
  it('steps in batches and reports the last operation', () => {
    const runner = new Runner(algorithm('bubble'), [3, 2, 1]);
    const first = runner.step(2);
    expect(first).toEqual([
      { kind: 'compare', i: 0, j: 1 },
      { kind: 'swap', i: 0, j: 1 },
    ]);
    expect(runner.last).toEqual({ kind: 'swap', i: 0, j: 1 });
    expect(runner.values).toEqual([2, 3, 1]);
    runner.finish();
    expect(runner.done).toBe(true);
    expect(runner.last).toBeUndefined();
    expect(runner.step(5)).toEqual([]);
    expect(runner.max).toBe(3);
  });

  it('never changes the input array', () => {
    const input = [5, 4, 3, 2, 1];
    new Runner(algorithm('quick'), input).finish();
    expect(input).toEqual([5, 4, 3, 2, 1]);
  });
});

describe('ops', () => {
  it('apply swaps and writes, and rejects bad indices', () => {
    const v = [1, 2, 3];
    apply(v, { kind: 'swap', i: 0, j: 2 });
    apply(v, { kind: 'write', i: 1, value: 9 });
    apply(v, { kind: 'compare', i: 0, j: 1 });
    expect(v).toEqual([3, 9, 1]);
    expect(() => {
      apply(v, { kind: 'swap', i: 0, j: 3 });
    }).toThrow(RangeError);
    expect(() => {
      apply(v, { kind: 'write', i: -1, value: 1 });
    }).toThrow(RangeError);
  });

  it('probe reads live values and rejects bad indices', () => {
    const v = [4, 5];
    const probe = probeOf(v);
    v[0] = 7;
    expect(probe.get(0)).toBe(7);
    expect(probe.length).toBe(2);
    expect(() => probe.get(2)).toThrow(RangeError);
  });
});

describe('data', () => {
  it('is deterministic for a seed and different for another', () => {
    expect(makeArray(20, 'random', 1)).toEqual(makeArray(20, 'random', 1));
    expect(makeArray(20, 'random', 1)).not.toEqual(makeArray(20, 'random', 2));
    const r = random(9);
    for (let i = 0; i < 100; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('builds each preset', () => {
    expect(makeArray(5, 'reversed', 0)).toEqual([5, 4, 3, 2, 1]);
    expect(sorted(makeArray(30, 'random', 4))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const nearly = makeArray(48, 'nearly', 4);
    const misplaced = nearly.filter((v, i) => v !== i + 1).length;
    expect(misplaced).toBeGreaterThan(0);
    expect(misplaced).toBeLessThanOrEqual(8);
    expect(new Set(makeArray(40, 'few', 4)).size).toBe(5);
  });
});

describe('sound mapping', () => {
  it('maps the smallest and largest values to the ends of the range', () => {
    expect(pitch(1, 100)).toBeCloseTo(140);
    expect(pitch(100, 100)).toBeCloseTo(1300);
    expect(pitch(50, 100)).toBeGreaterThan(pitch(49, 100));
    expect(pitch(1, 1)).toBe(140);
  });

  it('voices the larger bar of a comparison, or the written value', () => {
    const values = [3, 8, 5];
    const ops: Op[] = [
      { kind: 'compare', i: 0, j: 1 },
      { kind: 'swap', i: 2, j: 0 },
      { kind: 'write', i: 0, value: 2 },
    ];
    expect(ops.map((op) => voice(op, values))).toEqual([8, 5, 2]);
  });
});
