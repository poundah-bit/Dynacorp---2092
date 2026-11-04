import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  acceptDemand,
  assignShip,
  buyFacility,
  buyShip,
  buyStorage,
  company,
  createWorld,
  creditLimit,
  facilitiesOf,
  postTransportForDemand,
  run,
  startFacility,
  storageCapacity,
  takeLoan,
  type Demand,
  type World,
} from '../src/sim/index';
import { player, runUntil, soloWorld } from './helpers';

/** The manual's example: loan, oil well, piece-goods freighter, fly it out, start it. */
function setupOilWell(w: World) {
  const me = player(w);
  expect(takeLoan(w, me, 1000000, 2).ok).toBe(true);
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

describe('Ablauf wie im Handbuch-Beispiel', () => {
  it('Kredit, Anlage kaufen, hinfliegen, bauen, in Betrieb nehmen, fördern', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    expect(well.planet).toBe('vesta-nova');
    // 216 Parsec at 80 Pc/day ≈ 3 days + 2 loading days + 5 building days
    expect(w.day).toBeGreaterThanOrEqual(8);
    expect(w.day).toBeLessThanOrEqual(12);
    run(w, 3);
    expect(well.stock.oil).toBe(3 * 350);
    expect(company(w, me).cash).toBeGreaterThan(0);
  });

  it('eine Anlage darf nur auf einen passenden Planeten', () => {
    const w = soloWorld();
    const r = buyFacility(w, player(w), 'oilwell', 'aquilon');
    expect(r.ok).toBe(false);
  });

  it('höchstens 10 Niederlassungen, Erweiterungen am selben Ort zählen nicht', () => {
    const w = soloWorld();
    const me = player(w);
    company(w, me).cash = 100_000_000;
    const sites = ['vesta-nova', 'kharon', 'aquilon', 'tethys-prime', 'ferrox', 'magnar', 'pyros', 'sulcis', 'halcyon', 'vulkan-rho'];
    const types: Record<string, string> = {
      'vesta-nova': 'oilwell', kharon: 'oilwell', aquilon: 'waterstation', 'tethys-prime': 'waterstation', ferrox: 'mine',
      magnar: 'mine', pyros: 'refinery', sulcis: 'plasticplant', halcyon: 'chemplant', 'vulkan-rho': 'steelworks',
    };
    for (const p of sites) expect(buyFacility(w, me, types[p]!, p).ok).toBe(true);
    expect(buyFacility(w, me, 'plantation', 'liora').ok).toBe(false);
    expect(buyFacility(w, me, 'oilwell', 'vesta-nova').ok).toBe(true); // extension
  });

  it('Zusatzlager erhöht die Kapazität nach Ankunft', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    const before = storageCapacity(well, 'oil');
    const t = buyStorage(w, me, 'tank-s', well.id);
    if (!t.ok) throw new Error(t.error);
    const ship = w.ships.find((s) => s.owner === me)!;
    runUntil(w, () => ship.phase === 'idle');
    expect(assignShip(w, me, ship.id, t.value.id).ok).toBe(true);
    runUntil(w, () => well.storages.length === 1);
    expect(storageCapacity(well, 'oil')).toBe(before + 20000);
  });
});

describe('Aufträge', () => {
  it('Terra-Nachfrage annehmen, selbst transportieren, Erlös kassieren', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    run(w, 30); // ~10.500 FE oil
    const d: Demand = {
      id: 'dx', requester: 'terra', good: 'oil', amount: 8000, toPlanet: 'terra', toFacility: null, pricePerFe: 20,
      own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: w.day,
      deadlineDay: w.day + 40, late: false,
    };
    w.demands.push(d);
    expect(acceptDemand(w, me, 'dx', well.id).ok).toBe(true);
    expect(well.reserved.oil).toBe(8000);
    const tanker = buyShip(w, me, 'tank-a');
    if (!tanker.ok) throw new Error(tanker.error);
    const t = postTransportForDemand(w, me, 'dx', 'own');
    if (!t.ok) throw new Error(t.error);
    const revenueBefore = company(w, me).revenue;
    expect(assignShip(w, me, tanker.value.id, t.value.id).ok).toBe(true);
    runUntil(w, () => d.status === 'done');
    expect(company(w, me).revenue).toBeGreaterThan(0);
    // Terra pays exactly 8.000 FE × 20 Cr
    expect(company(w, me).revenue - revenueBefore).toBe(160000);
    expect(well.reserved.oil).toBe(0);
  });

  it('falsche Frachtart oder zu kleiner Laderaum wird abgelehnt', () => {
    const w = soloWorld();
    const me = player(w);
    company(w, me).cash = 5_000_000;
    const t = buyFacility(w, me, 'brewery', 'ostara'); // 50.000 FE
    if (!t.ok) throw new Error(t.error);
    const tanker = buyShip(w, me, 'tank-a');
    const small = buyShip(w, me, 'piece-a');
    if (!tanker.ok || !small.ok) throw new Error('Kauf fehlgeschlagen');
    expect(assignShip(w, me, tanker.value.id, t.value.id).ok).toBe(false);
    expect(assignShip(w, me, small.value.id, t.value.id).ok).toBe(false);
  });
});

describe('Bank', () => {
  it('Kreditrahmen wird durch Schulden kleiner', () => {
    const w = soloWorld();
    const me = player(w);
    const before = creditLimit(w, me);
    expect(before).toBe(CONFIG.credit.startLimit);
    expect(takeLoan(w, me, 400000, 0).ok).toBe(true);
    expect(creditLimit(w, me)).toBeLessThan(before);
    expect(takeLoan(w, me, 10_000_000, 0).ok).toBe(false);
  });

  it('Zahlungsverzug kostet Strafzins, dann pfändet die Bank', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 500000, 0).ok).toBe(true);
    buyShip(w, me, 'piece-a');
    company(w, me).cash = 0;
    const loan = company(w, me).loans[0]!;
    const owed = loan.remaining;
    run(w, 1);
    expect(loan.remaining).toBeGreaterThan(owed);
    run(w, 3);
    expect(w.ships.filter((s) => s.owner === me)).toHaveLength(0);
  });
});

describe('Simulation', () => {
  it('ist deterministisch pro Seed', () => {
    const a = createWorld({ seed: 42 });
    const b = createWorld({ seed: 42 });
    run(a, 60);
    run(b, 60);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
