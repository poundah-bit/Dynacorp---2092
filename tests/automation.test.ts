import { describe, expect, it } from 'vitest';
import { buyAutomation, company, facilitiesOf, nextAutomation, routeLimit, automationLevel, run, type Facility, type World } from '../src/sim/index';
import { oilWellWithTanker, player, soloWorld } from './helpers';

/** Gives the player n extra running facilities (copies of the first) so the 5-plant rule is met. */
export function fakePlants(w: World, n: number, base: Facility) {
  const planets = ['aquilon', 'ferrox', 'kharon', 'magnar', 'tethys-prime', 'sulcis', 'pyros', 'mirabel'];
  for (let i = 0; i < n; i++) w.facilities.push({ ...base, id: `f-fake-${i}`, planet: planets[i]!, stock: {}, reserved: {}, storages: [] });
}

describe('buying the Logistikzentrale', () => {
  it('starts at level 0 with the first level on offer', () => {
    const w = soloWorld();
    const me = player(w);
    expect(automationLevel(w, me)).toBe(0);
    expect(routeLimit(w, me)).toBe(0);
    expect(nextAutomation(w, me)).toMatchObject({ price: 2_500_000, routes: 1, level: 1 });
  });
  it('needs 5 plants, no debt and enough cash', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w); // takes a loan
    const r1 = buyAutomation(w, me);
    expect(!r1.ok && r1.error).toContain('ab 5');
    fakePlants(w, 4, well);
    expect(facilitiesOf(w, me)).toHaveLength(5);
    const r2 = buyAutomation(w, me);
    expect(!r2.ok && r2.error).toContain('schuldenfrei');
    company(w, me).loans = [];
    company(w, me).cash = 1_000_000;
    const r3 = buyAutomation(w, me);
    expect(!r3.ok && r3.error).toContain('Barkapital');
    company(w, me).cash = 3_000_000;
    expect(buyAutomation(w, me)).toEqual({ ok: true, value: 1 });
    expect(company(w, me).cash).toBe(500_000);
    expect(routeLimit(w, me)).toBe(1);
    expect(nextAutomation(w, me)).toMatchObject({ price: 4_000_000, routes: 3, level: 2 });
    company(w, me).cash = 20_000_000;
    expect(buyAutomation(w, me).ok).toBe(true);
    expect(buyAutomation(w, me).ok).toBe(true);
    expect(routeLimit(w, me)).toBe(6);
    expect(nextAutomation(w, me)).toBeNull();
    const r4 = buyAutomation(w, me);
    expect(!r4.ok && r4.error).toContain('voll ausgebaut');
  });
  it('old saves without routes or level still run', () => {
    const w = soloWorld();
    const me = player(w);
    delete (w as Partial<World>).routes;
    delete company(w, me).automation;
    run(w, 3);
    expect(automationLevel(w, me)).toBe(0);
  });
});
