// Zufallswelt: the planet generator keeps the mix, the rings and comparable distances of world 1.
import { describe, expect, it } from 'vitest';
import { CONFIG, PLANETS, createWorld, galaxyStats, generatePlanets, initStories, planet, run, worldPlanets, type PlanetDef } from '../src/sim/index';

const ref = galaxyStats(PLANETS);
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const gen = (seed: number, used: string[] = []) => generatePlanets(createWorld({ seed }), used);
const mix = (ps: PlanetDef[]) => {
  const m: Record<string, number> = {};
  for (const p of ps) m[p.facility ?? 'terra'] = (m[p.facility ?? 'terra'] ?? 0) + 1;
  return m;
};

describe('Planetengenerator', () => {
  it('gleiche Zusammensetzung wie Welt 1, Terra in der Mitte', () => {
    for (const seed of SEEDS) {
      const ps = gen(seed);
      expect(ps.find((p) => p.id === 'terra')).toMatchObject({ x: 0, y: 0, facility: null, name: 'Terra' });
      expect(mix(ps)).toEqual(mix(PLANETS));
    }
  });

  it('Ringe: Rohstoffe innen, Endprodukte außen', () => {
    for (const seed of SEEDS) {
      const s = galaxyStats(gen(seed));
      expect(s.ringMean.raw).toBeLessThan(s.ringMean.intermediate);
      expect(s.ringMean.intermediate).toBeLessThan(s.ringMean.final);
    }
  });

  it('Wege vergleichbar mit Welt 1', () => {
    const tol = CONFIG.campaign.pathTolerance;
    for (const seed of SEEDS) {
      const s = galaxyStats(gen(seed));
      expect(Math.abs(s.meanPair / ref.meanPair - 1), `seed ${seed}`).toBeLessThanOrEqual(tol);
      expect(Math.abs(s.meanTerra / ref.meanTerra - 1), `seed ${seed}`).toBeLessThanOrEqual(tol);
      expect(s.supplyMean / ref.supplyMean - 1, `seed ${seed}`).toBeLessThanOrEqual(tol);
      expect(s.minSpacing, `seed ${seed}`).toBeGreaterThanOrEqual(ref.minSpacing * CONFIG.campaign.minSpacingFactor);
    }
  });

  it('eindeutige neue Namen und Kennungen, nie aus Welt 1 oder schon benutzt', () => {
    const used = ['Orvana'];
    const old = new Set(PLANETS.map((p) => p.name));
    for (const seed of SEEDS) {
      const ps = gen(seed, used).filter((p) => p.id !== 'terra');
      expect(new Set(ps.map((p) => p.name)).size).toBe(ps.length);
      expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
      for (const p of ps) {
        expect(old.has(p.name)).toBe(false);
        expect(used).not.toContain(p.name);
      }
      const w = createWorld({ seed });
      w.planets = gen(seed);
      for (const p of w.planets) expect(planet(w, p.id)).toBe(p);
    }
  });

  it('Story-Orte nur aus dieser Welt', () => {
    const w = createWorld({ seed: 7, aiCompanies: 5 });
    w.planets = generatePlanets(w, []);
    initStories(w, true);
    const ids = new Set(worldPlanets(w).map((p) => p.id));
    run(w, 400);
    expect(w.stories!.events.length).toBeGreaterThan(0);
    for (const e of w.stories!.events) expect(ids.has(e.place)).toBe(true);
    for (const id of Object.keys(w.stories!.lore)) expect(ids.has(id)).toBe(true);
  });
});
