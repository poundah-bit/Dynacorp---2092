// Sammelladung: all accepted deliveries of one route go onto the chosen ships in one tap.
import { describe, expect, it } from 'vitest';
import { acceptDemand, buyShip, company, run, terraOrderScale, type Demand, type Ship, type World } from '../src/sim/index';
import { arrangeSheet } from '../src/ui/sheets';
import { shipAll, unshippedDemands } from '../src/ui/play';
import { oilWellWithTanker, player, soloWorld, terraOilDemand } from './helpers';

/** Accepted Terra oil demand from the well with a fixed deadline (days from now). */
function accepted(w: World, wellId: string, amount: number, deadlineIn: number) {
  const d = terraOilDemand(w, amount);
  const r = acceptDemand(w, player(w), d.id, wellId);
  if (!r.ok) throw new Error(r.error);
  d.deadlineDay = w.day + deadlineIn;
  return d;
}

function setup(model: string) {
  const w = soloWorld();
  const me = player(w);
  const well = oilWellWithTanker(w);
  well.stock.oil = 30000;
  company(w, me).cash += 2_000_000;
  w.demands = w.demands.filter((d) => d.status !== 'open');
  const s = buyShip(w, me, model);
  if (!s.ok) throw new Error(s.error);
  // the helper's tank-a stays out of the way
  for (const x of w.ships) if (x.owner === me && x.id !== s.value.id) x.phase = 'toPickup';
  return { w, me, well, ship: s.value as Ship };
}

describe('Sammelladung', () => {
  it('lädt alle Lieferungen derselben Strecke auf ein Schiff, knappste Frist zuerst', () => {
    const { w, me, well, ship } = setup('tank-c');
    const first = accepted(w, well.id, 4000, 30);
    accepted(w, well.id, 3000, 10);
    accepted(w, well.id, 5000, 20);
    const r = shipAll(w, me, first.id, [ship.id]);
    expect(r.ok && r.value).toEqual({ count: 3, amount: 12000 });
    expect(unshippedDemands(w, me)).toEqual([]);
    expect(ship.joined?.length).toBe(2);
  });

  it('nimmt nur ganze Aufträge mit und lässt den Rest in der Liste', () => {
    const { w, me, well, ship } = setup('tank-a'); // 16.000
    const first = accepted(w, well.id, 10000, 30);
    accepted(w, well.id, 5000, 10);
    accepted(w, well.id, 4000, 20);
    const r = shipAll(w, me, first.id, [ship.id]);
    expect(r.ok && r.value).toEqual({ count: 2, amount: 15000 });
    expect(unshippedDemands(w, me).map((d) => d.amount)).toEqual([4000]);
  });

  it('bündelt keine Lieferungen mit anderem Ziel', () => {
    const { w, me, well, ship } = setup('tank-c');
    const first = accepted(w, well.id, 4000, 30);
    const other = accepted(w, well.id, 3000, 10);
    other.toPlanet = 'pyros';
    const r = shipAll(w, me, first.id, [ship.id]);
    expect(r.ok && r.value.count).toBe(1);
    expect(unshippedDemands(w, me).map((d) => d.id)).toEqual([other.id]);
  });

  it('nutzt auch ein zweites gewähltes Schiff, das beim ersten Auftrag frei blieb', () => {
    const { w, me, well, ship } = setup('tank-a'); // 16.000
    const second = buyShip(w, me, 'tank-a');
    if (!second.ok) throw new Error(second.error);
    well.stock.oil = 26000;
    const first = accepted(w, well.id, 12000, 30);
    accepted(w, well.id, 10000, 10);
    accepted(w, well.id, 4000, 20);
    const r = shipAll(w, me, first.id, [ship.id, second.value.id]);
    expect(r.ok && r.value).toEqual({ count: 3, amount: 26000 });
    expect(unshippedDemands(w, me)).toEqual([]);
  });

  it('ohne Schiff passiert nichts', () => {
    const { w, me, well } = setup('tank-c');
    const first = accepted(w, well.id, 4000, 30);
    accepted(w, well.id, 3000, 10);
    expect(shipAll(w, me, first.id, []).ok).toBe(false);
    expect(w.transports.filter((t) => t.demand === first.id)).toEqual([]);
  });

  it('Transport organisieren bietet „Alle Lieferungen“ nur bei weiteren Lieferungen derselben Strecke', () => {
    const { w, me, well } = setup('tank-c');
    const first = accepted(w, well.id, 4000, 30);
    expect(arrangeSheet(w, me, first.id).alt).toBeUndefined();
    accepted(w, well.id, 5000, 10);
    expect(arrangeSheet(w, me, first.id).alt?.label).toBe('Alle Lieferungen (2 · 9.000 l)');
  });
});

describe('Mitwachsende Terra-Aufträge', () => {
  it('Terra-Aufträge für Endprodukte wachsen mit der größten Herstellerfirma', () => {
    const w = soloWorld();
    const me = player(w);
    const base = { owner: me, buildDaysLeft: 0, condition: 100, stock: {}, reserved: {}, storages: [], idleDays: 0 };
    w.facilities.push({ ...base, id: 'f-rob', type: 'robotworks', planet: 'automa', units: 4, status: 'running' });
    w.facilities.push({ ...base, id: 'f-rob2', type: 'robotworks', planet: 'kolossos', units: 1, status: 'construction', buildDaysLeft: 999 });
    expect(terraOrderScale(w, 'robots')).toBe(4);
    expect(terraOrderScale(w, 'medicine')).toBe(1);
    // one plant has to deliver an order: units on several planets do not add up
    w.facilities.push({ ...base, id: 'f-ph1', type: 'pharma', planet: 'asklepios', units: 2, status: 'running' });
    w.facilities.push({ ...base, id: 'f-ph2', type: 'pharma', planet: 'liora', units: 2, status: 'running' });
    expect(terraOrderScale(w, 'medicine')).toBe(2);
    w.facilities = w.facilities.filter((f) => f.type !== 'pharma');
    company(w, me).cash = 1e9; // the fake plants cost money every day
    w.demands = [];
    // old demands are pruned from the world, so collect every Terra order as it appears
    const seen = new Map<string, Demand>();
    for (let i = 0; i < 400; i++) {
      run(w, 1);
      for (const d of w.demands) if (d.requester === 'terra') seen.set(d.id, d);
    }
    const robots = [...seen.values()].filter((d) => d.good === 'robots');
    expect(robots.length).toBeGreaterThan(0);
    for (const d of robots) expect(d.amount).toBeGreaterThanOrEqual(d.big ? 4800 : 2400);
    // with one plant everything stays as before: 20–30 days of one plant
    const meds = [...seen.values()].filter((d) => d.good === 'medicine' && !d.big);
    expect(meds.length).toBeGreaterThan(0);
    for (const d of meds) expect(d.amount).toBeLessThanOrEqual(800);
  });
});
