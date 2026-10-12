// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import html from '../index.html?raw';
import { Synth } from '../src/audio/synth';
import { DEFAULTS } from '../src/core/session';
import { App, opsPerFrame } from '../src/ui/app';

const body = /<body>([\s\S]*)<\/body>/u.exec(html)?.[1] ?? '';
const $ = <T extends Element>(s: string): T => document.querySelector<T>(s)!;
const $$ = (s: string): Element[] => [...document.querySelectorAll(s)];
const text = (s: string): string[] => $$(s).map((e) => e.textContent.trim());

let frames: (() => void)[];
let queries: string[];
let synth: Synth;
let play: ReturnType<typeof vi.spyOn>;
let app: App;

/** Runs scheduled animation frames until nothing is scheduled any more. */
const flush = (limit = 100_000): void => {
  for (let i = 0; i < limit && frames.length; i++) frames.shift()!();
};

beforeEach(() => {
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/u, '');
  frames = [];
  queries = [];
  synth = new Synth(() => null);
  play = vi.spyOn(synth, 'play');
  app = new App(document, DEFAULTS, {
    synth,
    schedule: (f) => frames.push(f),
    onSettings: (q) => queries.push(q),
  });
});

describe('opsPerFrame', () => {
  it('goes from 1 to 400 and clamps', () => {
    expect(opsPerFrame(0)).toBe(1);
    expect(opsPerFrame(100)).toBe(400);
    expect(opsPerFrame(-5)).toBe(1);
    expect(opsPerFrame(500)).toBe(400);
    expect(opsPerFrame(50)).toBe(20);
  });
});

describe('App', () => {
  it('fails loudly when the markup is missing', () => {
    document.body.innerHTML = '';
    expect(() => new App(document, DEFAULTS)).toThrow(/Missing/u);
  });

  it('starts in solo mode with one lane and the algorithm card', () => {
    expect($$('.lane')).toHaveLength(1);
    expect(text('.lane h2')).toEqual(['Quicksort']);
    expect($('[data-info] h3').textContent).toBe('Quicksort');
    expect(text('[data-info] td')).toContain('O(n²)');
    expect($<HTMLSelectElement>('[data-algo]').options).toHaveLength(6);
    expect($<HTMLSelectElement>('[data-preset]').options).toHaveLength(4);
  });

  it('plays to the end, then stops', () => {
    $<HTMLButtonElement>('[data-play]').click();
    expect(app.playing).toBe(true);
    expect($('[data-play]').textContent).toBe('Pause');
    flush();
    expect(app.playing).toBe(false);
    expect(app.session.complete).toBe(true);
    expect(Number($('[data-c]').textContent.replace(',', ''))).toBeGreaterThan(64);
    expect(play).toHaveBeenCalled();
    expect(frames).toHaveLength(0);

    // Playing a finished run starts it again from the same array.
    app.play();
    expect(app.session.complete).toBe(false);
    app.pause();
    flush();
  });

  it('pauses mid-run and never schedules two loops', () => {
    app.play();
    app.play();
    expect(frames).toHaveLength(1);
    frames.shift()!();
    $<HTMLButtonElement>('[data-play]').click();
    expect(app.playing).toBe(false);
    flush();
    expect(app.session.complete).toBe(false);
  });

  it('steps one operation at a time', () => {
    $<HTMLButtonElement>('[data-step]').click();
    expect(app.session.runners[0]!.stats.steps).toBe(1);
    expect($('[data-c]').textContent).toBe('1');
  });

  it('races all six and shows the finishing places', () => {
    $<HTMLButtonElement>('[data-mode="race"]').click();
    expect($$('.lane')).toHaveLength(6);
    expect($<HTMLElement>('[data-algo-field]').hidden).toBe(true);
    expect($('[data-mode="race"]').getAttribute('aria-checked')).toBe('true');
    expect(queries.at(-1)).toContain('mode=race');
    app.play();
    flush();
    expect(text('.place').sort()).toEqual(['1st', '2nd', '3rd', '4th', '5th', '6th']);
    expect(text('.lane h2')[0]).toBe('Quicksort');
    expect($$('.lane')[1]!.querySelector('dt:nth-of-type(1)')).toBeTruthy();
    expect(text('.stats dt')).toContain('writes');
  });

  it('applies the controls', () => {
    const algo = $<HTMLSelectElement>('[data-algo]');
    algo.value = 'heap';
    algo.dispatchEvent(new Event('change'));
    expect(text('.lane h2')).toEqual(['Heapsort']);

    const preset = $<HTMLSelectElement>('[data-preset]');
    preset.value = 'reversed';
    preset.dispatchEvent(new Event('change'));
    expect(app.session.runners[0]!.values.slice(0, 3)).toEqual([64, 63, 62]);

    const size = $<HTMLInputElement>('[data-size]');
    size.value = '32';
    size.dispatchEvent(new Event('input'));
    expect($<HTMLOutputElement>('[data-size-out]').value).toBe('32');
    size.dispatchEvent(new Event('change'));
    expect(app.session.runners[0]!.values).toHaveLength(32);

    const speed = $<HTMLInputElement>('[data-speed]');
    speed.value = '100';
    speed.dispatchEvent(new Event('input'));
    expect(app.opsPerFrame).toBe(400);
    expect($<HTMLOutputElement>('[data-speed-out]').value).toBe('400 ops/frame');

    const seed = app.settings.seed;
    $<HTMLButtonElement>('[data-shuffle]').click();
    expect(app.settings.seed).toBe(seed + 1);
    expect(queries.at(-1)).toContain(`seed=${String(seed + 1)}`);
  });

  it('toggles the sound', () => {
    const sound = $<HTMLButtonElement>('[data-sound]');
    sound.click();
    expect(synth.enabled).toBe(false);
    expect(sound.getAttribute('aria-pressed')).toBe('false');
    expect(sound.textContent).toBe('Sound off');
    sound.click();
    expect(synth.enabled).toBe(true);
  });

  it('has keyboard shortcuts that stay out of form fields', () => {
    const press = (
      key: string,
      target: EventTarget = document.body,
      init: KeyboardEventInit = {},
    ) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
      );
    press(' ');
    expect(app.playing).toBe(true);
    press(' ');
    expect(app.playing).toBe(false);
    press('ArrowRight');
    expect(app.session.runners[0]!.stats.steps).toBe(1);
    const seed = app.settings.seed;
    press('r');
    expect(app.settings.seed).toBe(seed + 1);
    press('m');
    expect(synth.enabled).toBe(false);
    press('r', $('[data-size]'));
    press('r', document.body, { ctrlKey: true });
    press(' ', $('[data-step]'));
    press('x');
    expect(app.settings.seed).toBe(seed + 1);
    expect(app.playing).toBe(false);
  });
});
