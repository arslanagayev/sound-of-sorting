import { Synth } from '../audio/synth';
import { ALGORITHMS, algorithm } from '../core/algorithms';
import { PRESETS, type Preset } from '../core/data';
import type { Runner } from '../core/runner';
import { RACE, Session, writeSettings, type Mode, type Settings } from '../core/session';
import { drawLane, fit } from './draw';

export interface AppOptions {
  readonly synth?: Synth;
  /** Schedules the next frame; tests pass a manual scheduler. */
  readonly schedule?: (frame: () => void) => void;
  /** Called with the new query string whenever the settings change. */
  readonly onSettings?: (query: string) => void;
}

/** Slider 0..100 to operations per frame: 1 at the left end, 400 at the right, exponential between. */
export function opsPerFrame(slider: number): number {
  return Math.max(
    1,
    Math.round(Math.exp((Math.min(100, Math.max(0, slider)) / 100) * Math.log(400))),
  );
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
const fmt = new Intl.NumberFormat('en-US');

function el<T extends Element>(root: ParentNode, selector: string, type: new () => T): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing ${selector}`);
  return found;
}

interface Lane {
  readonly runner: Runner;
  readonly canvas: HTMLCanvasElement;
  readonly comparisons: HTMLElement;
  readonly moves: HTMLElement;
  readonly place: HTMLElement;
}

/** Wires the page: builds a lane per runner, runs the animation loop and keeps the controls in sync. */
export class App {
  settings: Settings;
  session: Session;
  playing = false;
  readonly synth: Synth;
  #lanes: Lane[] = [];
  #speed = 40;
  readonly #root: ParentNode;
  readonly #schedule: (frame: () => void) => void;
  readonly #onSettings: (query: string) => void;
  #looping = false;

  readonly #ui: {
    lanes: HTMLElement;
    info: HTMLElement;
    stage: HTMLElement;
    play: HTMLButtonElement;
    step: HTMLButtonElement;
    shuffle: HTMLButtonElement;
    algo: HTMLSelectElement;
    algoField: HTMLElement;
    preset: HTMLSelectElement;
    size: HTMLInputElement;
    sizeOut: HTMLOutputElement;
    speed: HTMLInputElement;
    speedOut: HTMLOutputElement;
    sound: HTMLButtonElement;
  };

  constructor(root: ParentNode, settings: Settings, options: AppOptions = {}) {
    this.#root = root;
    this.settings = settings;
    this.synth = options.synth ?? new Synth();
    this.#schedule = options.schedule ?? ((frame) => requestAnimationFrame(frame));
    this.#onSettings = options.onSettings ?? (() => undefined);
    this.#ui = {
      lanes: el(root, '[data-lanes]', HTMLElement),
      info: el(root, '[data-info]', HTMLElement),
      stage: el(root, '[data-stage]', HTMLElement),
      play: el(root, '[data-play]', HTMLButtonElement),
      step: el(root, '[data-step]', HTMLButtonElement),
      shuffle: el(root, '[data-shuffle]', HTMLButtonElement),
      algo: el(root, '[data-algo]', HTMLSelectElement),
      algoField: el(root, '[data-algo-field]', HTMLElement),
      preset: el(root, '[data-preset]', HTMLSelectElement),
      size: el(root, '[data-size]', HTMLInputElement),
      sizeOut: el(root, '[data-size-out]', HTMLOutputElement),
      speed: el(root, '[data-speed]', HTMLInputElement),
      speedOut: el(root, '[data-speed-out]', HTMLOutputElement),
      sound: el(root, '[data-sound]', HTMLButtonElement),
    };
    this.#fillSelects();
    this.#bind();
    this.session = new Session(settings);
    this.#rebuild();
  }

  get opsPerFrame(): number {
    return opsPerFrame(this.#speed);
  }

  /** Replaces the settings, starts a fresh session and redraws (stops playback). */
  update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.session = new Session(this.settings);
    this.pause();
    this.#rebuild();
    this.#onSettings(writeSettings(this.settings));
  }

  play(): void {
    this.synth.unlock();
    if (this.session.complete) this.update({});
    this.playing = true;
    this.#ui.play.textContent = 'Pause';
    this.#loop();
  }

  pause(): void {
    this.playing = false;
    this.#ui.play.textContent = 'Play';
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** One operation per lane, for following an algorithm by hand. */
  stepOnce(): void {
    this.synth.unlock();
    this.pause();
    this.#frame(1);
  }

  shuffle(): void {
    this.update({ seed: this.settings.seed + 1 });
  }

  setSound(on: boolean): void {
    this.synth.enabled = on;
    this.#ui.sound.setAttribute('aria-pressed', String(on));
    this.#ui.sound.textContent = on ? 'Sound on' : 'Sound off';
    if (on) this.synth.unlock();
  }

  /** Draws every lane and refreshes its numbers. */
  render(): void {
    this.#lanes.forEach((lane, i) => {
      fit(lane.canvas);
      const ctx = lane.canvas.getContext('2d');
      if (ctx) drawLane(ctx, lane.runner);
      const s = lane.runner.stats;
      lane.comparisons.textContent = fmt.format(s.comparisons);
      lane.moves.textContent = fmt.format(s.swaps + s.writes);
      const place = this.session.place(i);
      lane.place.textContent =
        place && this.session.runners.length > 1 ? (ORDINAL[place - 1] ?? '') : '';
      lane.place.hidden = !lane.place.textContent;
    });
  }

  #frame(ops: number): void {
    const tones = this.session.tick(ops);
    const race = this.session.runners.length > 1;
    this.synth.play(
      tones.map((t) => t.frequency),
      { level: race ? 0.7 : 1, maxVoices: race ? 3 : 1 },
    );
    this.render();
    if (this.session.complete) this.pause();
  }

  #loop(): void {
    if (this.#looping) return;
    this.#looping = true;
    const frame = (): void => {
      if (!this.playing) {
        this.#looping = false;
        return;
      }
      this.#frame(this.opsPerFrame);
      this.#schedule(frame);
    };
    this.#schedule(frame);
  }

  #rebuild(): void {
    const { lanes, info, stage, algo, algoField, preset, size, sizeOut } = this.#ui;
    const race = this.settings.mode === 'race';
    stage.dataset.mode = this.settings.mode;
    for (const b of this.#root.querySelectorAll<HTMLElement>('[data-mode]')) {
      b.setAttribute('aria-checked', String(b.dataset.mode === this.settings.mode));
    }
    algoField.hidden = race;
    algo.value = this.settings.algo;
    preset.value = this.settings.preset;
    size.value = String(this.settings.n);
    sizeOut.value = String(this.settings.n);

    lanes.replaceChildren();
    this.#lanes = this.session.runners.map((runner) => {
      const a = runner.algorithm;
      const article = document.createElement('article');
      article.className = 'lane';
      article.innerHTML = `
        <header>
          <h2></h2>
          <span class="big-o"></span>
          <span class="place" hidden></span>
        </header>
        <canvas role="img"></canvas>
        <dl class="stats">
          <div><dt>comparisons</dt><dd data-c>0</dd></div>
          <div><dt>${a.key === 'merge' ? 'writes' : 'swaps'}</dt><dd data-m>0</dd></div>
        </dl>`;
      el(article, 'h2', HTMLElement).textContent = a.name;
      el(article, '.big-o', HTMLElement).textContent = `O(${a.average})`;
      const canvas = el(article, 'canvas', HTMLCanvasElement);
      canvas.setAttribute('aria-label', `${a.name} sorting ${String(runner.values.length)} bars`);
      lanes.append(article);
      return {
        runner,
        canvas,
        comparisons: el(article, '[data-c]', HTMLElement),
        moves: el(article, '[data-m]', HTMLElement),
        place: el(article, '.place', HTMLElement),
      };
    });

    if (race) {
      info.innerHTML = '<h3>The race</h3><p></p>';
      el(info, 'p', HTMLElement).textContent =
        'All six sort copies of the same array, one operation each per step. The O(n log n) algorithms finish long before the O(n²) ones, and the gap grows with more bars.';
    } else {
      const a = algorithm(this.settings.algo);
      info.innerHTML = `<h3></h3><p></p><table><tbody></tbody></table>`;
      el(info, 'h3', HTMLElement).textContent = a.name;
      el(info, 'p', HTMLElement).textContent = a.idea;
      const rows: [string, string][] = [
        ['Best', `O(${a.best})`],
        ['Average', `O(${a.average})`],
        ['Worst', `O(${a.worst})`],
        ['Extra memory', `O(${a.space})`],
        ['Stable', a.stable ? 'yes' : 'no'],
      ];
      el(info, 'tbody', HTMLElement).append(
        ...rows.map(([k, v]) => {
          const tr = document.createElement('tr');
          const th = document.createElement('th');
          const td = document.createElement('td');
          th.textContent = k;
          td.textContent = v;
          tr.append(th, td);
          return tr;
        }),
      );
    }
    this.render();
  }

  #fillSelects(): void {
    const options = (items: readonly { value: string; label: string }[]): HTMLOptionElement[] =>
      items.map(({ value, label }) => {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = label;
        return o;
      });
    const byRace = [...ALGORITHMS].sort((a, b) => RACE.indexOf(a.key) - RACE.indexOf(b.key));
    this.#ui.algo.replaceChildren(...options(byRace.map((a) => ({ value: a.key, label: a.name }))));
    this.#ui.preset.replaceChildren(
      ...options(PRESETS.map((p) => ({ value: p.key, label: p.label }))),
    );
  }

  #bind(): void {
    const ui = this.#ui;
    ui.play.addEventListener('click', () => {
      this.toggle();
    });
    ui.step.addEventListener('click', () => {
      this.stepOnce();
    });
    ui.shuffle.addEventListener('click', () => {
      this.shuffle();
    });
    ui.sound.addEventListener('click', () => {
      this.setSound(!this.synth.enabled);
    });
    ui.algo.addEventListener('change', () => {
      this.update({ algo: ui.algo.value });
    });
    ui.preset.addEventListener('change', () => {
      this.update({ preset: ui.preset.value as Preset });
    });
    ui.size.addEventListener('input', () => {
      ui.sizeOut.value = ui.size.value;
    });
    ui.size.addEventListener('change', () => {
      this.update({ n: Number(ui.size.value) });
    });
    ui.speed.addEventListener('input', () => {
      this.#speed = Number(ui.speed.value);
      ui.speedOut.value = `${String(this.opsPerFrame)} ops/frame`;
    });
    ui.speedOut.value = `${String(this.opsPerFrame)} ops/frame`;
    for (const b of this.#root.querySelectorAll<HTMLElement>('[data-mode]')) {
      b.addEventListener('click', () => {
        this.update({ mode: (b.dataset.mode ?? 'solo') as Mode });
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // A focused button already reacts to Space itself.
      if (key === ' ' && e.target instanceof HTMLButtonElement) return;
      if (key === ' ') this.toggle();
      else if (key === 'arrowright') this.stepOnce();
      else if (key === 'r') this.shuffle();
      else if (key === 'm') this.setSound(!this.synth.enabled);
      else return;
      e.preventDefault();
    });
  }
}
