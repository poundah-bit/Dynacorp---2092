// Zufallswelt: planets for a new module world. Same mix of facility types as world 1, raw-goods planets
// further in and final-goods planets further out, distances comparable to world 1, new names.

import { CONFIG, FACILITIES, PLANETS, PLANET_NAMES, TERRA, good } from './data';
import type { PlanetDef, Tier, World } from './types';
import { random } from './world';

/** Tier of a facility: the tier of its (first) output good. */
export function tierOfFacility(type: string): Tier {
  const def = FACILITIES.find((f) => f.id === type)!;
  return good(Object.keys(def.outputs)[0]!).tier;
}

export interface GalaxyStats {
  meanPair: number;
  meanTerra: number;
  minSpacing: number;
  ringMean: Record<Tier, number>;
  /** mean distance from every facility input to its nearest producer – how long the supply lines are */
  supplyMean: number;
}

const radius = (p: PlanetDef) => Math.hypot(p.x, p.y);

export function galaxyStats(planets: PlanetDef[]): GalaxyStats {
  let sum = 0;
  let n = 0;
  let min = Infinity;
  for (let i = 0; i < planets.length; i++)
    for (let j = i + 1; j < planets.length; j++) {
      const d = Math.hypot(planets[i]!.x - planets[j]!.x, planets[i]!.y - planets[j]!.y);
      sum += d;
      n++;
      min = Math.min(min, d);
    }
  const outer = planets.filter((p) => p.facility);
  const ring = (t: Tier) => {
    const r = outer.filter((p) => tierOfFacility(p.facility!) === t).map(radius);
    return r.reduce((s, x) => s + x, 0) / (r.length || 1);
  };
  let supply = 0;
  let inputs = 0;
  for (const p of outer) {
    const def = FACILITIES.find((f) => f.id === p.facility)!;
    for (const g of Object.keys(def.inputs)) {
      const prods = outer.filter((q) => g in FACILITIES.find((f) => f.id === q.facility)!.outputs);
      if (!prods.length) continue;
      supply += Math.min(...prods.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      inputs++;
    }
  }
  return {
    supplyMean: supply / (inputs || 1),
    meanPair: sum / (n || 1),
    meanTerra: outer.reduce((s, p) => s + radius(p), 0) / (outer.length || 1),
    minSpacing: min,
    ringMean: { raw: ring('raw'), intermediate: ring('intermediate'), final: ring('final') },
  };
}

const REF = galaxyStats(PLANETS);

/** Radius range of each tier in world 1. */
const RANGE: Record<Tier, [number, number]> = (() => {
  const out = {} as Record<Tier, [number, number]>;
  for (const t of ['raw', 'intermediate', 'final'] as Tier[]) {
    const r = PLANETS.filter((p) => p.facility && tierOfFacility(p.facility) === t).map(radius);
    out[t] = [Math.min(...r), Math.max(...r)];
  }
  return out;
})();

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** How far a layout is from world 1 (0 = same mean distances). */
function deviation(s: GalaxyStats): number {
  // supply lines may be shorter than in world 1, never much longer
  return Math.max(Math.abs(s.meanPair / REF.meanPair - 1), Math.abs(s.meanTerra / REF.meanTerra - 1), s.supplyMean / REF.supplyMean - 1);
}

/** One random layout; null if the planets could not be placed with enough spacing. */
function layout(w: World, types: string[]): { x: number; y: number }[] | null {
  const minSpacing = REF.minSpacing * CONFIG.campaign.minSpacingFactor;
  const placed: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (const type of types) {
    const [r0, r1] = RANGE[tierOfFacility(type)];
    let ok = false;
    for (let k = 0; k < 60 && !ok; k++) {
      const r = r0 + random(w) * (r1 - r0);
      const a = random(w) * Math.PI * 2;
      const pos = { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
      if (placed.every((q) => Math.hypot(q.x - pos.x, q.y - pos.y) >= minSpacing)) {
        placed.push(pos);
        ok = true;
      }
    }
    if (!ok) return null;
  }
  return placed.slice(1);
}

/**
 * Planets of a new module world, drawn with the world's RNG. `usedNames`: names of earlier worlds of the
 * campaign; they and the names of world 1 never come back.
 */
export function generatePlanets(w: World, usedNames: string[]): PlanetDef[] {
  const types = PLANETS.filter((p) => p.facility).map((p) => p.facility!);
  const tol = CONFIG.campaign.pathTolerance;
  let best: { planets: PlanetDef[]; dev: number } | null = null;
  const pool = PLANET_NAMES.filter((n) => !usedNames.includes(n));
  if (pool.length < PLANETS.length - 1) throw new Error(`Zu wenige Planetennamen frei (${pool.length})`);
  for (let attempt = 0; attempt < CONFIG.campaign.attempts; attempt++) {
    const pos = layout(w, types);
    if (!pos) continue;
    const planets: PlanetDef[] = [{ id: TERRA, name: 'Terra', x: 0, y: 0, facility: null }, ...types.map((facility, i) => ({ id: '', name: '', ...pos[i]!, facility }))];
    const dev = deviation(galaxyStats(planets));
    if (!best || dev < best.dev) best = { planets, dev };
    if (dev <= tol) break;
  }
  if (!best) throw new Error('Keine Planetenverteilung gefunden');
  // names without putting back
  const names = [...pool];
  for (const p of best.planets) {
    if (p.id === TERRA) continue;
    p.name = names.splice(Math.floor(random(w) * names.length), 1)[0]!;
    p.id = slug(p.name);
  }
  return best.planets;
}
