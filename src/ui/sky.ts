// Background of the star map: three star layers that move at different speeds when the map is dragged
// (parallax) and a few soft nebulae. Drawn once per map size into offscreen canvases.

import { hashRng } from './planets';

export interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  /** 0 far … 2 near */
  layer: 0 | 1 | 2;
}

/** How far each layer moves with the map (far stars move least). */
export const PARALLAX = [0.2, 0.45, 0.7] as const;

export const skyKey = (w: number, h: number, dpr: number) => `${Math.round(w)}x${Math.round(h)}@${dpr}`;

export function makeStars(count: number, w: number, h: number, seed = 'dynacorp-sky'): Star[] {
  const rnd = hashRng(seed);
  return Array.from({ length: count }, () => {
    const b = rnd();
    const layer = (b < 0.6 ? 0 : b < 0.9 ? 1 : 2) as Star['layer'];
    return {
      x: rnd() * w,
      y: rnd() * h,
      size: [0.7, 1.1, 1.6][layer]! + rnd() * 0.4,
      alpha: [0.35, 0.55, 0.85][layer]! * (0.6 + rnd() * 0.4),
      layer,
    };
  });
}

const NEBULAE: [string, number, number, number][] = [
  // colour, x and y as share of the area, radius as share of the larger side
  ['58, 29, 92', 0.22, 0.28, 0.42],
  ['18, 58, 92', 0.72, 0.66, 0.48],
  ['42, 18, 64', 0.5, 0.08, 0.3],
];

/** Three tiling star layers and one nebula layer, sized to the map (css px × dpr). */
export function buildSkyLayers(w: number, h: number, dpr: number): HTMLCanvasElement[] {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    return [c, g] as const;
  };
  const stars = makeStars(Math.round((w * h) / 1400), w, h);
  const layers = ([0, 1, 2] as const).map((l) => {
    const [c, g] = make();
    for (const s of stars) {
      if (s.layer !== l) continue;
      g.fillStyle = `rgba(225, 232, 255, ${s.alpha.toFixed(2)})`;
      g.beginPath();
      g.arc(s.x, s.y, s.size / 2, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  });
  const [neb, g] = make();
  const big = Math.max(w, h);
  for (const [rgb, x, y, r] of NEBULAE) {
    const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * big);
    gr.addColorStop(0, `rgba(${rgb}, 0.18)`);
    gr.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  }
  return [...layers, neb];
}

const wrap = (v: number, m: number) => ((v % m) + m) % m;

/** Draws the nebulae and the star layers; `camX/camY` = map centre in screen px (world × scale). */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number, layers: HTMLCanvasElement[]) {
  ctx.drawImage(layers[3]!, 0, 0, w, h);
  for (let i = 0; i < 3; i++) {
    const ox = wrap(-camX * PARALLAX[i]!, w);
    const oy = wrap(-camY * PARALLAX[i]!, h);
    for (const dx of [ox - w, ox]) for (const dy of [oy - h, oy]) ctx.drawImage(layers[i]!, dx, dy, w, h);
  }
}
