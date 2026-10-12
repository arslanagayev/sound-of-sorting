import { describe, expect, it, vi } from 'vitest';
import { Synth, type AudioLike } from '../src/audio/synth';
import { algorithm } from '../src/core/algorithms';
import { Runner } from '../src/core/runner';
import { DEFAULTS, RACE, Session, readSettings, writeSettings } from '../src/core/session';
import { PALETTE, drawLane, fit, highlights } from '../src/ui/draw';

describe('settings in the URL', () => {
  it('round-trips through the query string', () => {
    const s = { mode: 'race', algo: 'heap', n: 128, preset: 'reversed', seed: 9 } as const;
    expect(readSettings(writeSettings(s))).toEqual({ ...s, algo: DEFAULTS.algo });
    const solo = { ...s, mode: 'solo' } as const;
    expect(readSettings(writeSettings(solo))).toEqual(solo);
  });

  it('falls back to defaults for anything invalid', () => {
    expect(readSettings('?mode=x&algo=bogo&n=5&data=nope&seed=-2')).toEqual(DEFAULTS);
    expect(readSettings('?n=999')).toEqual(DEFAULTS);
    expect(readSettings('')).toEqual(DEFAULTS);
  });
});

describe('Session', () => {
  it('runs one algorithm in solo mode and all six in a race', () => {
    expect(new Session(DEFAULTS).runners.map((r) => r.algorithm.key)).toEqual(['quick']);
    const race = new Session({ ...DEFAULTS, mode: 'race' });
    expect(race.runners.map((r) => r.algorithm.key)).toEqual(RACE);
    const first = race.runners[0]!.values;
    for (const r of race.runners) expect(r.values).toEqual(first);
  });

  it('ranks the race by operations used', () => {
    const race = new Session({ ...DEFAULTS, mode: 'race', n: 48 });
    expect(race.place(0)).toBeUndefined();
    while (!race.complete) race.tick(50);
    const places = race.runners.map((_, i) => race.place(i));
    expect(places[0]).toBe(1);
    expect(places.at(-1)).toBe(6);
    expect(new Set(places).size).toBe(6);
    expect(race.place(99)).toBeUndefined();
  });

  it('plays a tone per running lane, then a rising sweep once sorted', () => {
    const s = new Session({ ...DEFAULTS, n: 16 });
    const tones = s.tick(1);
    expect(tones).toHaveLength(1);
    expect(tones[0]!.frequency).toBeGreaterThan(100);
    s.runners[0]!.finish();
    const sweep: number[] = [];
    while (!s.complete) sweep.push(...s.tick(1).map((t) => t.frequency));
    expect(sweep.length).toBe(16);
    expect(sweep).toEqual([...sweep].sort((a, b) => a - b));
    expect(s.tick(1)).toEqual([]);
  });

  it('rotates the tones so every lane gets heard', () => {
    const race = new Session({ ...DEFAULTS, mode: 'race' });
    const firstLanes = Array.from({ length: 6 }, () => race.tick(1)[0]!.lane);
    expect(new Set(firstLanes).size).toBeGreaterThan(1);
  });
});

function fakeAudio() {
  const started: number[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn() });
  const ctx = {
    currentTime: 1,
    destination: {},
    state: 'suspended',
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => ({
      ...node(),
      type: '',
      frequency: param(),
      start: (t: number) => started.push(t),
      stop: vi.fn(),
    }),
  };
  return { ctx: ctx as unknown as AudioLike, started, resume: ctx.resume };
}

describe('Synth', () => {
  it('stays silent until unlocked, then plays at most maxVoices blips', () => {
    const { ctx, started, resume } = fakeAudio();
    const synth = new Synth(() => ctx);
    expect(synth.play([440])).toBe(0);
    synth.unlock();
    expect(synth.ready).toBe(true);
    expect(resume).toHaveBeenCalled();
    expect(synth.play([200, 300, 400, 500], { maxVoices: 2 })).toBe(2);
    expect(started).toEqual([1, 1]);
    synth.unlock();
    expect(synth.play([])).toBe(0);
  });

  it('respects the mute switch and missing audio support', () => {
    const { ctx } = fakeAudio();
    const synth = new Synth(() => ctx);
    synth.unlock();
    synth.enabled = false;
    expect(synth.play([440])).toBe(0);
    const none = new Synth(() => null);
    none.unlock();
    expect(none.ready).toBe(false);
    expect(none.play([440])).toBe(0);
  });
});

describe('drawing', () => {
  const fakeCtx = (width = 100, height = 50) => {
    const rects: { style: string; x: number; h: number }[] = [];
    const ctx = {
      canvas: { width, height },
      fillStyle: '',
      fillRect(x: number, _y: number, _w: number, h: number) {
        rects.push({ style: this.fillStyle, x, h });
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
  };

  it('draws the background and one bar per value, tallest for the largest', () => {
    const runner = new Runner(algorithm('bubble'), [2, 4, 1, 3]);
    const { ctx, rects } = fakeCtx();
    drawLane(ctx, runner);
    expect(rects[0]!.style).toBe(PALETTE.bg);
    const bars = rects.slice(1);
    expect(bars).toHaveLength(4);
    expect(Math.max(...bars.map((b) => b.h))).toBe(bars[1]!.h);
  });

  it('highlights compared and moved bars, then the finishing sweep', () => {
    const runner = new Runner(algorithm('bubble'), [2, 1, 3]);
    runner.step(1);
    expect(highlights(runner)).toEqual({ compared: [0, 1], moved: [] });
    let { ctx, rects } = fakeCtx();
    drawLane(ctx, runner);
    expect(rects.filter((r) => r.style === PALETTE.active)).toHaveLength(2);
    runner.step(1);
    expect(highlights(runner)).toEqual({ compared: [], moved: [0, 1] });
    ({ ctx, rects } = fakeCtx());
    drawLane(ctx, runner);
    expect(rects.filter((r) => r.style === PALETTE.hot)).toHaveLength(2);

    const merge = new Runner(algorithm('merge'), [2, 1]);
    merge.step(2);
    expect(highlights(merge).moved).toEqual([0]);

    runner.finish();
    runner.sweep = 2;
    expect(highlights(runner)).toEqual({ compared: [], moved: [] });
    ({ ctx, rects } = fakeCtx());
    drawLane(ctx, runner);
    expect(rects.filter((r) => r.style === PALETTE.active)).toHaveLength(2);
  });

  it('handles an empty array and sizes canvases to the pixel ratio', () => {
    const { ctx, rects } = fakeCtx();
    drawLane(ctx, new Runner(algorithm('quick'), []));
    expect(rects).toHaveLength(1);
    const canvas = { clientWidth: 100, clientHeight: 40, width: 0, height: 0 };
    fit(canvas as unknown as HTMLCanvasElement, 2);
    expect([canvas.width, canvas.height]).toEqual([200, 80]);
    fit(canvas as unknown as HTMLCanvasElement, 2);
    expect(canvas.width).toBe(200);
  });
});
