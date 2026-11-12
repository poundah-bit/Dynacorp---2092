import { describe, expect, it } from 'vitest';
import { FACILITIES } from '../src/sim/index';
import { LOOKS, planetPixels, planetRadius, spriteTier } from '../src/ui/planets';

describe('planet looks', () => {
  it('every facility type and Terra has a look with hex colours', () => {
    for (const id of [...FACILITIES.map((f) => f.id), 'terra']) {
      const l = LOOKS[id];
      expect(l, id).toBeDefined();
      for (const c of l!.palette) expect(c, id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it('pixels are deterministic, round and differ per planet', () => {
    const a = planetPixels('ferrox', LOOKS.mine!, 16);
    expect(a.length).toBe(34 * 34 * 4);
    expect(planetPixels('ferrox', LOOKS.mine!, 16)).toEqual(a);
    expect(planetPixels('aquilon', LOOKS.mine!, 16)).not.toEqual(a);
    expect(a[3]).toBe(0);
    const centre = (17 * 34 + 17) * 4;
    expect(a[centre + 3]).toBe(255);
  });
  it('sprite tiers and radii', () => {
    expect(spriteTier(7)).toBe(8);
    expect(spriteTier(12)).toBe(12);
    expect(spriteTier(30)).toBe(32);
    expect(spriteTier(500)).toBe(48);
    expect(planetRadius(false, 1)).toBe(7);
    expect(planetRadius(false, 100)).toBe(16);
    expect(planetRadius(true, 1.5)).toBe(16.5);
    expect(planetRadius(true, 0.3)).toBe(11);
  });
});

import { makeStars, skyKey } from '../src/ui/sky';

describe('sky', () => {
  it('stars are deterministic, inside the area and in three layers', () => {
    const a = makeStars(400, 1000, 600);
    expect(makeStars(400, 1000, 600)).toEqual(a);
    expect(a).toHaveLength(400);
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(1000);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(600);
    }
    const avg = (l: number) => {
      const xs = a.filter((s) => s.layer === l);
      expect(xs.length, `layer ${l}`).toBeGreaterThan(0);
      return xs.reduce((t, s) => t + s.size, 0) / xs.length;
    };
    expect(avg(2)).toBeGreaterThan(avg(0));
  });
  it('sky key', () => {
    expect(skyKey(800.4, 600, 2)).toBe('800x600@2');
  });
});
