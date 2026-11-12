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

import { addRoute, assignShip, buyShip, lineRoute, postDemand, postTransportForDemand, removeRoute, routeGoods, sellShip, setRouteActive, shipDef, shipsOf, storageCapacity } from '../src/sim/index';

/** Level-1 player with an oil well, a plastic plant (fake) and a big tanker at Terra. */
export function routeSetup() {
  const w = soloWorld();
  const me = player(w);
  const well = oilWellWithTanker(w);
  fakePlants(w, 4, well);
  const plastic = w.facilities.find((f) => f.id === 'f-fake-0')!;
  plastic.type = 'plasticplant';
  company(w, me).loans = [];
  company(w, me).cash = 10_000_000;
  expect(buyAutomation(w, me).ok).toBe(true);
  const big = buyShip(w, me, 'tank-c');
  if (!big.ok) throw new Error(big.error);
  return { w, me, well, plastic, tanker: big.value };
}

describe('managing routes', () => {
  it('a route with defaults from ship and target storage', () => {
    const { w, me, well, plastic, tanker } = routeSetup();
    expect(routeGoods(w, well.id, plastic.id)).toEqual(['oil']);
    const r = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: tanker.id });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.amount).toBe(Math.min(shipDef(tanker.model).capacity, storageCapacity(plastic, 'oil')));
    expect(r.value.refillBelow).toBe(storageCapacity(plastic, 'oil') / 2);
    expect(lineRoute(w, tanker.id)?.id).toBe(r.value.id);
  });
  it('limits, cargo and one route per ship', () => {
    const { w, me, well, plastic, tanker } = routeSetup();
    const small = shipsOf(w, me).find((s) => s.model === 'tank-a')!;
    const piece = shipsOf(w, me).find((s) => s.model === 'piece-a')!;
    const wrong = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: piece.id });
    expect(!wrong.ok && wrong.error).toContain('Erdöl');
    expect(addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: tanker.id, amount: 10_000 }).ok).toBe(true);
    const second = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: small.id, amount: 10_000 });
    expect(!second.ok && second.error).toContain('Höchstens 1');
    company(w, me).cash = 10_000_000;
    expect(buyAutomation(w, me).ok).toBe(true);
    const same = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: tanker.id, amount: 10_000 });
    expect(!same.ok && same.error).toContain('Linienschiff');
    const tooBig = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: small.id, amount: 999_999 });
    expect(tooBig.ok).toBe(false);
  });
  it('a Linienschiff is protected until its route is paused, deleting frees it', () => {
    const { w, me, well, plastic, tanker } = routeSetup();
    const r = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: tanker.id, amount: 5_000 });
    if (!r.ok) throw new Error(r.error);
    well.stock.oil = 20_000;
    const d = postDemand(w, me, plastic.id, 'oil', 5_000, well.id);
    if (!d.ok) throw new Error(d.error);
    const t = postTransportForDemand(w, me, d.value.id, 'own');
    if (!t.ok) throw new Error(t.error);
    const tr = t.value;
    const blocked = assignShip(w, me, tanker.id, tr.id);
    expect(!blocked.ok && blocked.error).toContain('Linienschiff');
    const sell = sellShip(w, me, tanker.id);
    expect(!sell.ok && sell.error).toContain('Linienschiff');
    expect(setRouteActive(w, me, r.value.id, false).ok).toBe(true);
    expect(lineRoute(w, tanker.id)).toBeUndefined();
    expect(assignShip(w, me, tanker.id, tr.id).ok).toBe(true);
    expect(removeRoute(w, me, r.value.id).ok).toBe(true);
    expect(w.routes).toHaveLength(0);
  });
});

import { step } from '../src/sim/index';
import { runUntil } from './helpers';

const only = (w: World) => w.routes![0]!;

describe('routes run by themselves', () => {
  function started() {
    const s = routeSetup();
    const r = addRoute(s.w, s.me, { from: s.well.id, to: s.plastic.id, good: 'oil', ship: s.tanker.id, amount: 20_000 });
    if (!r.ok) throw new Error(r.error);
    s.plastic.stock.oil = 0;
    return { ...s, route: r.value };
  }
  it('waits for goods, then starts a trip with the Linienschiff', () => {
    const { w, well, tanker } = started();
    well.stock.oil = 0;
    step(w);
    expect(only(w).status).toContain('Wartet auf Ware');
    expect(only(w).demand).toBeNull();
    well.stock.oil = 25_000;
    step(w);
    expect(only(w).status).toContain('Fahrt gestartet');
    const d = w.demands.find((x) => x.id === only(w).demand)!;
    expect(d.own).toBe(true);
    expect(w.transports.some((t) => t.demand === d.id && t.ship === tanker.id)).toBe(true);
  });
  it('counts the finished trip', () => {
    const { w, well } = started();
    well.stock.oil = 25_000;
    runUntil(w, () => only(w).trips === 1, 120);
    expect(only(w).delivered).toBe(20_000);
    expect(only(w).demand).toBeNull();
  });
  it('waits while the target has enough', () => {
    const { w, well, plastic } = started();
    well.stock.oil = 25_000;
    plastic.stock.oil = only(w).refillBelow + 1_000;
    step(w);
    expect(only(w).status).toContain('Ziel hat genug');
    expect(only(w).demand).toBeNull();
  });
  it('costs 1.500 Cr per day only while active', () => {
    const { w, me, plastic } = started();
    plastic.stock.oil = only(w).refillBelow + 5_000;
    const paused = structuredClone(w);
    setRouteActive(paused, me, paused.routes![0]!.id, false);
    step(w);
    step(paused);
    expect(company(paused, me).cash - company(w, me).cash).toBe(1_500);
  });
  it('a trip under way finishes after pausing, then the ship is free', () => {
    const { w, me, well, tanker } = started();
    well.stock.oil = 25_000;
    step(w);
    expect(setRouteActive(w, me, only(w).id, false).ok).toBe(true);
    runUntil(w, () => only(w).trips === 1, 120);
    expect(lineRoute(w, tanker.id)).toBeUndefined();
  });
  it('two routes from one source share its stock', () => {
    const { w, me, well, plastic } = started();
    company(w, me).cash = 10_000_000;
    expect(buyAutomation(w, me).ok).toBe(true);
    const refinery = w.facilities.find((f) => f.id === 'f-fake-1')!;
    refinery.type = 'refinery';
    refinery.stock = {};
    const second = buyShip(w, me, 'tank-c');
    if (!second.ok) throw new Error(second.error);
    expect(addRoute(w, me, { from: well.id, to: refinery.id, good: 'oil', ship: second.value.id, amount: 20_000 }).ok).toBe(true);
    plastic.stock.oil = 0;
    well.stock.oil = 25_000;
    step(w);
    expect(w.routes!.filter((r) => r.demand).length).toBe(1);
  });
  it('ends when its target is gone', () => {
    const { w, plastic } = started();
    w.facilities = w.facilities.filter((f) => f !== plastic);
    step(w);
    expect(w.routes).toHaveLength(0);
    expect(w.log.some((l) => l.text.includes('beendet'))).toBe(true);
  });
});

import { areaStats, carryState, idleFittingShips, idleShipsOfCargo, joinableShips } from '../src/ui/play';
import { fleetView, type ViewCtx } from '../src/ui/views';

describe('player side', () => {
  it('a Linienschiff is offered nowhere and not counted as free, until the route is paused', () => {
    const { w, me, well, plastic, tanker } = routeSetup();
    const r = addRoute(w, me, { from: well.id, to: plastic.id, good: 'oil', ship: tanker.id, amount: 20_000 });
    if (!r.ok) throw new Error(r.error);
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    const freeBefore = shipsOf(w, me).filter((s) => s.phase === 'idle').length;
    expect(ids(idleFittingShips(w, me, 'tank', 30_000))).not.toContain(tanker.id);
    expect(ids(idleShipsOfCargo(w, me, 'tank'))).not.toContain(tanker.id);
    expect(areaStats(w, me).fleet.idle).toBe(freeBefore - 1);
    const t = { id: 't-x', issuer: 'x', kind: 'goods', good: 'oil', asset: null, amount: 30_000, cargo: 'tank', fromPlanet: 'terra', fromFacility: null, toPlanet: 'aquilon', fee: 1, own: false, demand: null, carrier: null, ship: null, status: 'open', createdDay: 0, deadlineDay: 99, late: false } as const;
    expect(carryState(w, me, { ...t } as never)).not.toBe('idle');
    expect(ids(joinableShips(w, me, 'tank', 'terra', 'aquilon'))).not.toContain(tanker.id);
    const ctx = { w, me, marketAll: true, marketGood: '', marketSort: 'ready', priceTrend: () => 0, chainGood: '' } as ViewCtx;
    expect(fleetView(ctx)).toContain('Linienschiff');
    setRouteActive(w, me, r.value.id, false);
    expect(ids(idleFittingShips(w, me, 'tank', 30_000))).toContain(tanker.id);
    expect(areaStats(w, me).fleet.idle).toBe(freeBefore);
  });
});
