import type { Runner } from '../core/runner';

export interface Palette {
  readonly bg: string;
  readonly bar: string;
  readonly active: string;
  readonly hot: string;
}

/** Combo 05: Lime Sprout on Fresh Canopy. */
export const PALETTE: Palette = {
  bg: '#1d2a1c',
  bar: 'rgb(228 253 151 / 0.42)',
  active: '#e4fd97',
  hot: '#fbfff0',
};

/** Sizes the canvas backing store to its CSS size times the device pixel ratio. */
export function fit(canvas: HTMLCanvasElement, ratio = globalThis.devicePixelRatio || 1): void {
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/** Which bars to highlight for the runner's last operation. */
export function highlights(runner: Runner): { compared: number[]; moved: number[] } {
  const op = runner.last;
  if (!op) return { compared: [], moved: [] };
  if (op.kind === 'compare') return { compared: [op.i, op.j], moved: [] };
  if (op.kind === 'swap') return { compared: [], moved: [op.i, op.j] };
  return { compared: [], moved: [op.i] };
}

/** Draws one lane: bars scaled to the canvas, the touched ones highlighted, then the finish sweep. */
export function drawLane(
  ctx: CanvasRenderingContext2D,
  runner: Runner,
  palette: Palette = PALETTE,
): void {
  const { width, height } = ctx.canvas;
  const n = runner.values.length;
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);
  if (n === 0) return;

  const max = runner.max;
  const step = width / n;
  const gap = step > 6 ? Math.max(1, step * 0.18) : 0;
  const { compared, moved } = highlights(runner);
  const sweepTo = runner.done ? runner.sweep : -1;

  runner.values.forEach((v, i) => {
    const h = Math.max(2, (v / max) * (height - 4));
    if (moved.includes(i)) ctx.fillStyle = palette.hot;
    else if (compared.includes(i) || i < sweepTo) ctx.fillStyle = palette.active;
    else ctx.fillStyle = palette.bar;
    ctx.fillRect(i * step + gap / 2, height - h, Math.max(1, step - gap), h);
  });
}
