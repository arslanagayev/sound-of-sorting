import type { Algorithm, Op, Probe } from './ops';

/** Yields a comparison and reports whether a[i] > a[j]. */
function* greater(a: Probe, i: number, j: number): Generator<Op, boolean, undefined> {
  yield { kind: 'compare', i, j };
  return a.get(i) > a.get(j);
}

function* bubble(a: Probe): Generator<Op, void, undefined> {
  for (let end = a.length - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      if (yield* greater(a, i, i + 1)) {
        yield { kind: 'swap', i, j: i + 1 };
        swapped = true;
      }
    }
    if (!swapped) return;
  }
}

function* insertion(a: Probe): Generator<Op, void, undefined> {
  for (let i = 1; i < a.length; i++) {
    for (let j = i; j > 0; j--) {
      if (!(yield* greater(a, j - 1, j))) break;
      yield { kind: 'swap', i: j - 1, j };
    }
  }
}

function* selection(a: Probe): Generator<Op, void, undefined> {
  for (let i = 0; i < a.length - 1; i++) {
    let min = i;
    for (let j = i + 1; j < a.length; j++) {
      if (yield* greater(a, min, j)) min = j;
    }
    if (min !== i) yield { kind: 'swap', i, j: min };
  }
}

function* merge(a: Probe): Generator<Op, void, undefined> {
  // Bottom-up merge sort: merge runs of 1, 2, 4, ... using a scratch copy of each pair of runs.
  for (let width = 1; width < a.length; width *= 2) {
    for (let lo = 0; lo < a.length - width; lo += 2 * width) {
      const mid = lo + width;
      const hi = Math.min(lo + 2 * width, a.length);
      const left: number[] = [];
      const right: number[] = [];
      for (let k = lo; k < mid; k++) left.push(a.get(k));
      for (let k = mid; k < hi; k++) right.push(a.get(k));
      let i = 0;
      let j = 0;
      for (let k = lo; k < hi; k++) {
        const l = left[i];
        const r = right[j];
        let takeLeft: boolean;
        if (l === undefined) takeLeft = false;
        else if (r === undefined) takeLeft = true;
        else {
          yield { kind: 'compare', i: lo + i, j: mid + j };
          takeLeft = l <= r;
        }
        const value = takeLeft ? left[i++] : right[j++];
        if (value !== undefined) yield { kind: 'write', i: k, value };
      }
    }
  }
}

function* quick(a: Probe): Generator<Op, void, undefined> {
  // Iterative quicksort with a median-of-three pivot moved to the end, Lomuto partition.
  const stack: [number, number][] = [[0, a.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop() ?? [0, -1];
    if (lo >= hi) continue;
    const mid = (lo + hi) >> 1;
    if (yield* greater(a, lo, mid)) yield { kind: 'swap', i: lo, j: mid };
    if (yield* greater(a, lo, hi)) yield { kind: 'swap', i: lo, j: hi };
    if (yield* greater(a, hi, mid)) yield { kind: 'swap', i: mid, j: hi };
    let store = lo;
    for (let i = lo; i < hi; i++) {
      if (!(yield* greater(a, i, hi))) {
        if (i !== store) yield { kind: 'swap', i, j: store };
        store++;
      }
    }
    if (store !== hi) yield { kind: 'swap', i: store, j: hi };
    stack.push([lo, store - 1], [store + 1, hi]);
  }
}

function* heap(a: Probe): Generator<Op, void, undefined> {
  function* siftDown(start: number, end: number): Generator<Op, void, undefined> {
    let root = start;
    for (;;) {
      const child = 2 * root + 1;
      if (child > end) return;
      let largest = root;
      if (yield* greater(a, child, largest)) largest = child;
      if (child + 1 <= end && (yield* greater(a, child + 1, largest))) largest = child + 1;
      if (largest === root) return;
      yield { kind: 'swap', i: root, j: largest };
      root = largest;
    }
  }
  const n = a.length;
  for (let start = (n >> 1) - 1; start >= 0; start--) yield* siftDown(start, n - 1);
  for (let end = n - 1; end > 0; end--) {
    yield { kind: 'swap', i: 0, j: end };
    yield* siftDown(0, end - 1);
  }
}

export const ALGORITHMS: readonly Algorithm[] = [
  {
    key: 'bubble',
    name: 'Bubble sort',
    best: 'n',
    average: 'n²',
    worst: 'n²',
    space: '1',
    stable: true,
    idea: 'Swap neighbours that are out of order; the largest value bubbles to the end each pass.',
    sort: bubble,
  },
  {
    key: 'insertion',
    name: 'Insertion sort',
    best: 'n',
    average: 'n²',
    worst: 'n²',
    space: '1',
    stable: true,
    idea: 'Take the next value and slide it left until it sits in the sorted part. Fast on nearly sorted data.',
    sort: insertion,
  },
  {
    key: 'selection',
    name: 'Selection sort',
    best: 'n²',
    average: 'n²',
    worst: 'n²',
    space: '1',
    stable: false,
    idea: 'Find the smallest remaining value and swap it into place. Few swaps, many comparisons.',
    sort: selection,
  },
  {
    key: 'merge',
    name: 'Merge sort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n log n',
    space: 'n',
    stable: true,
    idea: 'Merge sorted runs of 1, 2, 4, 8… into longer sorted runs until one run is left.',
    sort: merge,
  },
  {
    key: 'quick',
    name: 'Quicksort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n²',
    space: 'log n',
    stable: false,
    idea: 'Pick a pivot, move smaller values left and larger ones right, then sort both sides.',
    sort: quick,
  },
  {
    key: 'heap',
    name: 'Heapsort',
    best: 'n log n',
    average: 'n log n',
    worst: 'n log n',
    space: '1',
    stable: false,
    idea: 'Build a max-heap, then keep moving its top (the largest value) to the end.',
    sort: heap,
  },
];

export function algorithm(key: string): Algorithm {
  const found = ALGORITHMS.find((a) => a.key === key);
  if (!found) throw new Error(`unknown algorithm: ${key}`);
  return found;
}
