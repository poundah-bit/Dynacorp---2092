// Planets for the star map, generated in code: every planet looks like the industry it hosts
// (oil world, ocean world, ore desert …). Pixels are computed once per size tier and kept as sprites.
// The tier of the planet (raw, intermediate, final, Terra) is drawn by the map as a coloured atmosphere.

import type { PlanetDef } from '../sim/index';

export interface PlanetLook {
  /** dark → light */
  palette: [string, string, string];
  pattern: 'bands' | 'spots';
  /** share of cloud cover, 0..1 */
  clouds?: number;
  craters?: boolean;
  /** colour of glowing lava veins */
  lava?: string;
  /** colour of city lights on the night side */
  lights?: string;
  ring?: boolean;
  /** milky haze over the surface */
  haze?: boolean;
  /** land colours (low → high) on top of the palette's ocean */
  land?: [string, string];
}

export const LOOKS: Record<string, PlanetLook> = {
  terra: { palette: ['#1d4f91', '#2f7fbf', '#3f8f4f'], pattern: 'spots', clouds: 0.5, lights: '#ffd278', land: ['#3f8f4f', '#c9b27a'] },
  oilwell: { palette: ['#1a1410', '#3b2a1a', '#6b4a24'], pattern: 'bands' },
  waterstation: { palette: ['#0b2f6b', '#155ea8', '#2c86c9'], pattern: 'spots', clouds: 0.6 },
  mine: { palette: ['#4a1c10', '#8a3b1c', '#b8642e'], pattern: 'spots', craters: true },
  refinery: { palette: ['#2a241e', '#5a4632', '#9a7046'], pattern: 'bands', haze: true },
  plasticplant: { palette: ['#3a5a5a', '#6a9a92', '#c8e0d0'], pattern: 'bands' },
  chemplant: { palette: ['#3a4a0f', '#7a8f1a', '#c8c43a'], pattern: 'bands', haze: true },
  steelworks: { palette: ['#1c1c22', '#3a3a44', '#5c5c66'], pattern: 'spots', lava: '#ff7a2a', ring: true },
  agrofarm: { palette: ['#5a4a14', '#9a8a2a', '#d0c060'], pattern: 'spots', clouds: 0.35 },
  plantation: { palette: ['#0f3a1c', '#1f6b2c', '#3f9a3a'], pattern: 'spots', clouds: 0.5, ring: true },
  ranch: { palette: ['#3a3418', '#6a6a2a', '#9aa04a'], pattern: 'spots' },
  brewery: { palette: ['#4a2a0a', '#8a5a1a', '#d09a3a'], pattern: 'bands' },
  foodplant: { palette: ['#4a2a14', '#8a5a2a', '#c8a060'], pattern: 'spots', clouds: 0.3 },
  textilemill: { palette: ['#4a2a4a', '#8a5a8a', '#d0a0c8'], pattern: 'bands', ring: true },
  factory: { palette: ['#2a3a4a', '#5a7a8a', '#c0d8e0'], pattern: 'bands' },
  machineworks: { palette: ['#22303c', '#44586a', '#7a90a4'], pattern: 'spots', lights: '#ffe0a0' },
  robotworks: { palette: ['#0d1424', '#1a2640', '#2a3a5c'], pattern: 'spots', lights: '#5ad0ff' },
  pharma: { palette: ['#9fb8d8', '#c8dcf0', '#e8f2ff'], pattern: 'bands' },
};

export const lookOf = (p: PlanetDef): PlanetLook => LOOKS[p.facility ?? 'terra'] ?? LOOKS.terra!;

/** A small deterministic random generator from a string seed. */
export function hashRng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const N = 64;
/** Smooth value noise on a wrapping 64×64 grid. */
function valueNoise(rnd: () => number): (u: number, v: number) => number {
  const g = Float32Array.from({ length: N * N }, rnd);
  const at = (i: number, j: number) => g[(((j % N) + N) % N) * N + (((i % N) + N) % N)]!;
  const s = (t: number) => t * t * (3 - 2 * t);
  return (u, v) => {
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = s(u - i);
    const fv = s(v - j);
    const a = at(i, j);
    const b = at(i + 1, j);
    const c = at(i, j + 1);
    const d = at(i + 1, j + 1);
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };
}

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
function mix(cols: [number, number, number][], t: number): [number, number, number] {
  const x = Math.max(0, Math.min(0.999, t)) * (cols.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = cols[i]!;
  const b = cols[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const toward = (c: [number, number, number], to: number, k: number): [number, number, number] => [c[0] + (to - c[0]) * k, c[1] + (to - c[1]) * k, c[2] + (to - c[2]) * k];

// light from the upper left, the same for every planet
const LIGHT = (() => {
  const l = [-0.55, -0.45, 0.7];
  const n = Math.hypot(...l);
  return l.map((x) => x / n) as [number, number, number];
})();

/** RGBA pixels of a planet with radius `r` px on a (2r+2)² square; pure and deterministic. */
export function planetPixels(id: string, look: PlanetLook, r: number): Uint8ClampedArray<ArrayBuffer> {
  const S = Math.ceil(r * 2 + 2);
  const out = new Uint8ClampedArray(S * S * 4);
  const rnd = hashRng(id);
  const n1 = valueNoise(rnd);
  const n2 = valueNoise(rnd);
  const pal = look.palette.map(rgb);
  const land = look.land?.map(rgb);
  const lava = look.lava ? rgb(look.lava) : null;
  const lights = look.lights ? rgb(look.lights) : null;
  const c = S / 2;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const dx = (px + 0.5 - c) / r;
      const dy = (py + 0.5 - c) / r;
      const q = dx * dx + dy * dy;
      if (q > 1) continue;
      const z = Math.sqrt(1 - q);
      // bend the surface at the limb so features look spherical
      const k = 1 / (z * 0.6 + 0.4);
      const u = dx * k * 2.2 + 20;
      const v = dy * k * 2.2 + 20;
      const h =
        look.pattern === 'bands'
          ? n1(u * 0.3, v * 2.2) * 0.55 + n2(u * 1.4, v * 1.4) * 0.25 + (dy * 0.5 + 0.5) * 0.2
          : n1(u, v) * 0.5 + n2(u * 2, v * 2) * 0.3 + n1(u * 4 + 30, v * 4 + 30) * 0.2;
      let col = mix(pal, h);
      const isLand = !!land && h > 0.55;
      if (land && isLand) col = mix(land, (h - 0.55) * 2.2);
      if (lava && n2(u * 2.5, v * 2.5) > 0.74) col = lava;
      if (look.craters) {
        const kr = n1(u * 2.5 + 9, v * 2.5 + 9);
        if (kr > 0.74) col = col.map((x) => x * (0.55 + (0.8 - kr) * 2)) as [number, number, number];
      }
      if (look.haze) col = toward(col, 200, 0.12 + n2(u * 0.7 + 40, v * 0.4) * 0.15);
      if (look.clouds) {
        const cl = n2(u * 1.5 + 50, v * 0.8);
        const edge = 1 - look.clouds * 0.6;
        if (cl > edge) col = toward(col, 240, Math.min(0.85, (cl - edge) * 2.2));
      }
      const lit = Math.max(0, dx * LIGHT[0] + dy * LIGHT[1] + z * LIGHT[2]) * 1.05 + 0.06;
      let o: [number, number, number] = [col[0] * lit, col[1] * lit, col[2] * lit];
      // lights glow on the night side only
      if (lights && lit < 0.35 && (!land || isLand) && n1(u * 4, v * 4) > 0.72) o = lights;
      const e = (py * S + px) * 4;
      out[e] = o[0];
      out[e + 1] = o[1];
      out[e + 2] = o[2];
      out[e + 3] = 255 * Math.min(1, (1 - Math.sqrt(q)) * r * 1.5);
    }
  }
  return out;
}

export const SPRITE_TIERS = [8, 12, 16, 24, 32, 48] as const;
/** The smallest sprite radius at least `px`, else the largest. */
export const spriteTier = (px: number): number => SPRITE_TIERS.find((t) => t >= px) ?? SPRITE_TIERS[SPRITE_TIERS.length - 1]!;

/** Radius on screen: grows with the zoom, within limits. `zoom` = scale relative to the fitted view. */
export function planetRadius(isTerra: boolean, zoom: number): number {
  const [base, max] = isTerra ? [11, 24] : [7, 16];
  return Math.min(max, Math.max(base, base * zoom));
}

const sprites = new Map<string, HTMLCanvasElement>();
/** The planet drawn for at least `rPx` css pixels (cached per size tier and pixel ratio). */
export function planetSprite(p: PlanetDef, rPx: number): HTMLCanvasElement {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const r = spriteTier(rPx * dpr);
  const key = `${p.id}@${r}`;
  let c = sprites.get(key);
  if (!c) {
    const px = planetPixels(p.id, lookOf(p), r);
    const S = Math.ceil(r * 2 + 2);
    c = document.createElement('canvas');
    c.width = c.height = S;
    c.getContext('2d')!.putImageData(new ImageData(px, S, S), 0, 0);
    sprites.set(key, c);
  }
  return c;
}
