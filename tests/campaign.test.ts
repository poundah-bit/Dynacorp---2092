// Modulwelten: planets per world, the generator, closing a world and the campaign.
import { describe, expect, it } from 'vitest';
import { PLANETS, createWorld, distance, planetsFor, worldPlanets } from '../src/sim/index';

describe('Planeten pro Welt', () => {
  it('Welt 1 nutzt planets.json, eine eigene Planetenliste ersetzt sie', () => {
    const w = createWorld({ seed: 1 });
    expect(worldPlanets(w)).toBe(PLANETS);
    w.planets = [{ ...PLANETS[0]! }, { id: 'x', name: 'X', x: 3, y: 4, facility: 'mine' }];
    expect(distance(w, 'terra', 'x')).toBe(5);
    expect(planetsFor(w, 'mine').map((p) => p.id)).toEqual(['x']);
  });
});
