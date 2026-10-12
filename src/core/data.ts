/** Deterministic pseudo-random numbers (mulberry32), so a seed always gives the same array. */
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Preset = 'random' | 'reversed' | 'nearly' | 'few';

export const PRESETS: readonly { key: Preset; label: string }[] = [
  { key: 'random', label: 'Random' },
  { key: 'reversed', label: 'Reversed' },
  { key: 'nearly', label: 'Nearly sorted' },
  { key: 'few', label: 'Few unique' },
];

/** Values 1..n arranged by the preset; the same seed always returns the same array. */
export function makeArray(n: number, preset: Preset, seed: number): number[] {
  const rand = random(seed);
  const values = Array.from({ length: n }, (_, i) => i + 1);
  const swap = (i: number, j: number): void => {
    const a = values[i];
    const b = values[j];
    if (a !== undefined && b !== undefined) {
      values[i] = b;
      values[j] = a;
    }
  };
  const shuffle = (): void => {
    for (let i = n - 1; i > 0; i--) swap(i, Math.floor(rand() * (i + 1)));
  };

  switch (preset) {
    case 'random':
      shuffle();
      break;
    case 'reversed':
      values.reverse();
      break;
    case 'nearly':
      for (let k = 0; k < Math.max(1, Math.floor(n / 12)); k++) {
        const i = Math.floor(rand() * (n - 1));
        swap(i, i + 1);
      }
      break;
    case 'few':
      for (let i = 0; i < n; i++) values[i] = Math.ceil(((i + 1) / n) * 5) * Math.ceil(n / 5);
      shuffle();
      break;
  }
  return values;
}
