// Play-test wishes after Phase 3: several orders on one trip, ships in critical condition limp on instead of
// being scrapped, units per cargo type, own orders before the goods exist.
import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  assignShip,
  buyFacility,
  buyShip,
  company,
  facilitiesOf,
  postDemand,
  repairShip,
  sendShipToTerra,
  shipDef,
  shipSpeed,
  startFacility,
  takeLoan,
  type Demand,
  type Ship,
  type World,
} from '../src/sim/index';
import { amt, perUnit, qty } from '../src/ui/format';
import { defaultPlan, deliver, joinableShips } from '../src/ui/play';
import { deliverSheet } from '../src/ui/sheets';
import { player, runUntil, soloWorld } from './helpers';

function oilWell(w: World) {
  const me = player(w);
  expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
  const t = buyFacility(w, me, 'oilwell', 'vesta-nova');
  if (!t.ok) throw new Error(t.error);
  const s = buyShip(w, me, 'piece-a');
  if (!s.ok) throw new Error(s.error);
  expect(assignShip(w, me, s.value.id, t.value.id).ok).toBe(true);
  runUntil(w, () => facilitiesOf(w, me).some((f) => f.status === 'stopped'));
  const well = facilitiesOf(w, me)[0]!;
  expect(startFacility(w, me, well.id).ok).toBe(true);
  return well;
}

const demandFor = (w: World, good: string, amount: number, to = 'terra', requester = 'terra'): Demand => {
  const d: Demand = {
    id: `d-x${w.demands.length}`,
    requester,
    good,
    amount,
    toPlanet: to,
    toFacility: null,
    pricePerFe: 20,
    own: false,
    status: 'open',
    supplier: null,
    supplierFacility: null,
    transport: null,
    createdDay: w.day,
    deadlineDay: w.day + 60,
    late: false,
  };
  w.demands.push(d);
  return d;
};

describe('Mehrere Aufträge in einem Flug', () => {
  it('ein großer Tanker nimmt zwei Terra-Aufträge aus derselben Anlage mit und liefert beide', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWell(w);
    well.stock.oil = 12000;
    const tanker = buyShip(w, me, 'tank-c'); // 45.000 l
    if (!tanker.ok) throw new Error(tanker.error);
    const s = tanker.value;
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const a = demandFor(w, 'oil', 5000);
    const b = demandFor(w, 'oil', 5000);

    expect(deliver(w, me, a.id, well.id, { ships: [s.id], rest: 'later' }).ok).toBe(true);
    expect(s.phase).toBe('toPickup');
    // the second order: the tanker is already flying that route and is suggested first
    expect(joinableShips(w, me, 'tank', well.planet, 'terra').map((x) => x.id)).toEqual([s.id]);
    // the delivery dialog offers it as a ship that already flies the route
    expect(deliverSheet(w, me, b.id).body).toContain('fliegt diese Strecke schon, noch 40.000 l frei');
    const plan = defaultPlan(w, me, 'tank', 5000, well.planet, 'terra');
    expect(plan.ships[0]).toBe(s.id);
    expect(deliver(w, me, b.id, well.id, plan).ok).toBe(true);
    expect(s.joined).toHaveLength(1);

    runUntil(w, () => a.status === 'done' && b.status === 'done', 60);
    expect(w.ships.find((x) => x.id === s.id)!.phase).toBe('idle');
    // one trip, both orders delivered and paid
    expect(w.transports.filter((t) => t.ship === s.id && t.status === 'done')).toHaveLength(2);
    expect(w.log.filter((l) => l.text.includes('liefert 5000 l Erdöl an Terra'))).toHaveLength(2);
  });

  it('zuladen geht nur bei gleicher Strecke und genug Platz', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWell(w);
    well.stock.oil = 30000;
    const tanker = buyShip(w, me, 'tank-a'); // 16.000 l
    if (!tanker.ok) throw new Error(tanker.error);
    const s = tanker.value;
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const a = demandFor(w, 'oil', 10000);
    expect(deliver(w, me, a.id, well.id, { ships: [s.id], rest: 'later' }).ok).toBe(true);
    // 10.000 l more do not fit into the 6.000 l left
    expect(joinableShips(w, me, 'tank', well.planet, 'terra', 10000)).toHaveLength(0);
    expect(joinableShips(w, me, 'tank', well.planet, 'terra', 6000)).toHaveLength(1);
    // another destination: no
    expect(joinableShips(w, me, 'tank', well.planet, 'pyros')).toHaveLength(0);
    // choosing it anyway: it takes what fits, the rest is arranged later
    const c = demandFor(w, 'oil', 10000);
    expect(deliver(w, me, c.id, well.id, { ships: [s.id], rest: 'later' }).ok).toBe(true);
    expect(s.joined).toHaveLength(1);
    expect(w.transports.find((t) => t.id === s.joined![0])!.amount).toBe(6000);
    expect(c.shipped).toBe(6000);
  });

  it('nach dem Beladen ist das Schiff für Zuladungen zu', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWell(w);
    well.stock.oil = 30000;
    const s = buyShip(w, me, 'tank-c');
    if (!s.ok) throw new Error(s.error);
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const a = demandFor(w, 'oil', 5000);
    expect(deliver(w, me, a.id, well.id, { ships: [s.value.id], rest: 'later' }).ok).toBe(true);
    runUntil(w, () => s.value.phase === 'toDelivery', 30);
    expect(joinableShips(w, me, 'tank', well.planet, 'terra')).toHaveLength(0);
  });
});

describe('Schiffe in kritischem Zustand', () => {
  const critical = (s: Ship) => s.condition < CONFIG.ships.criticalBelow;

  it('verschwinden nicht, fliegen langsam weiter und nehmen keine neuen Aufträge an', () => {
    const w = soloWorld();
    const me = player(w);
    const r = buyShip(w, me, 'tank-a');
    if (!r.ok) throw new Error(r.error);
    const s = r.value;
    expect(sendShipToTerra(w, me, s.id).ok).toBe(true); // already there: no trip
    s.at = 'vesta-nova';
    expect(sendShipToTerra(w, me, s.id).ok).toBe(true);
    s.condition = CONFIG.ships.criticalBelow - 5;
    expect(critical(s)).toBe(true);
    expect(shipSpeed(s)).toBeCloseTo(shipDef(s.model).speed * CONFIG.ships.criticalSpeedFactor);
    runUntil(w, () => s.phase === 'idle', 60);
    expect(w.ships.includes(s)).toBe(true);
    expect(w.log.some((l) => l.text.includes('kritischem Zustand'))).toBe(true);
    company(w, me).cash += 500_000;
    expect(repairShip(w, me, s.id).ok).toBe(true);
    runUntil(w, () => s.phase === 'idle', 10);
    expect(s.condition).toBe(100);
    expect(critical(s)).toBe(false);
  });

  it('ein kritisches Schiff kann nicht zugewiesen werden', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWell(w);
    well.stock.oil = 5000;
    const r = buyShip(w, me, 'tank-a');
    if (!r.ok) throw new Error(r.error);
    r.value.condition = 10;
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const d = demandFor(w, 'oil', 2000);
    const res = deliver(w, me, d.id, well.id, { ships: [r.value.id], rest: 'later' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('kritisch');
  });
});

describe('Einheiten und Eigenbestellung', () => {
  it('Flüssigkeiten in Litern, Schüttgut in Tonnen, alles andere in FE', () => {
    expect(amt(16000, 'oil')).toBe('16.000 l');
    expect(amt(14000, 'ore')).toBe('14.000 t');
    expect(amt(2000, 'steel')).toBe('2.000 FE');
    expect(amt(2000, 'food')).toBe('2.000 FE');
    expect(qty(25000, 'live')).toBe('25.000 FE');
    expect(perUnit(20, 'water')).toBe('20,00 Cr/l');
  });

  it('aus eigener Anlage bestellen geht auch, bevor die Ware da ist', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWell(w);
    well.stock.oil = 0;
    company(w, me).cash += 2_000_000;
    const ref = buyFacility(w, me, 'refinery', 'pyros');
    if (!ref.ok) throw new Error(ref.error);
    const s = buyShip(w, me, 'piece-a');
    if (!s.ok) throw new Error(s.error);
    expect(assignShip(w, me, s.value.id, ref.value.id).ok).toBe(true);
    runUntil(w, () => facilitiesOf(w, me).some((f) => f.type === 'refinery' && f.status === 'stopped'), 60);
    const refinery = facilitiesOf(w, me).find((f) => f.type === 'refinery')!;
    expect(startFacility(w, me, refinery.id).ok).toBe(true);
    const d = postDemand(w, me, refinery.id, 'oil', 5000, well.id);
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.value.status).toBe('accepted');
  });
});
