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
  largestShipCapacity,
  maxOrderAmount,
  postTransportForDemand,
  run,
  sendShipToTerra,
  setRepairAtTerra,
  startFacility,
  storageCapacity,
  takeLoan,
  terraDemandAmount,
  type Demand,
  type World,
} from '../src/sim/index';
import { deliver, shipDemand } from '../src/ui/play';
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

  const terraDemand = (w: World, id: string, amount: number): Demand => {
    const d: Demand = {
      id, requester: 'terra', good: 'oil', amount, toPlanet: 'terra', toFacility: null, pricePerFe: 20,
      own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: w.day,
      deadlineDay: w.day + 40, late: false,
    };
    w.demands.push(d);
    return d;
  };

  it('Annehmen ohne genug Ware ist erlaubt: das Schiff wartet, bis produziert ist', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    expect(well.stock.oil ?? 0).toBe(0);
    const d = terraDemand(w, 'dx', 7000);
    expect(acceptDemand(w, me, 'dx', well.id).ok).toBe(true);
    expect(well.reserved.oil).toBe(7000); // more promised than on stock
    const tanker = buyShip(w, me, 'tank-a');
    if (!tanker.ok) throw new Error(tanker.error);
    const t = postTransportForDemand(w, me, 'dx', 'own');
    if (!t.ok) throw new Error(t.error);
    expect(assignShip(w, me, tanker.value.id, t.value.id).ok).toBe(true);
    // ~4 days to Vesta Nova, then it waits there for 20 days of production
    runUntil(w, () => tanker.value.phase === 'loading', 10);
    run(w, 5);
    expect(tanker.value.phase).toBe('loading');
    expect(t.value.status).toBe('assigned');
    runUntil(w, () => d.status === 'done', 60);
    expect(well.reserved.oil).toBe(0);
  });

  it('wer zu viel annimmt und die Frist verpasst, zahlt Strafe und verliert Ruf', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    const d = terraDemand(w, 'dbig', 30000); // ~86 days of production
    expect(acceptDemand(w, me, 'dbig', well.id).ok).toBe(true);
    const rep = company(w, me).reputation;
    let penalty = 0;
    let spentThatDay = 0;
    for (let i = 0; i < 120 && !d.late; i++) {
      const before = company(w, me).expenses;
      penalty = Math.round(d.amount * w.prices.oil! * CONFIG.difficulties.med.penaltyRate);
      run(w, 1);
      spentThatDay = company(w, me).expenses - before;
    }
    expect(d.late).toBe(true);
    expect(spentThatDay).toBeGreaterThanOrEqual(penalty); // penalty on top of the daily running costs
    expect(company(w, me).reputation).toBe(rep - 3);
  });

  it('mehr als ins Anlagenlager passt, kann nicht angenommen werden – ein Zusatzlager hilft', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    terraDemand(w, 'dhuge', 40000); // base storage is 30.000 FE
    const r = acceptDemand(w, me, 'dhuge', well.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('passt nicht ins Lager');
    const t = buyStorage(w, me, 'tank-m', well.id);
    if (!t.ok) throw new Error(t.error);
    const ship = w.ships.find((s) => s.owner === me)!;
    runUntil(w, () => ship.phase === 'idle');
    expect(assignShip(w, me, ship.id, t.value.id).ok).toBe(true);
    runUntil(w, () => well.storages.length === 1);
    expect(acceptDemand(w, me, 'dhuge', well.id).ok).toBe(true);
  });

  it('eine Ausschreibung, die niemand bis zur Frist übernimmt, wird teurer neu ausgeschrieben', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    run(w, 25);
    terraDemand(w, 'dpub', 8000);
    expect(acceptDemand(w, me, 'dpub', well.id).ok).toBe(true);
    const t = postTransportForDemand(w, me, 'dpub', 'public');
    if (!t.ok) throw new Error(t.error);
    const { fee, deadlineDay } = t.value;
    runUntil(w, () => w.day > deadlineDay);
    expect(t.value.status).toBe('open'); // no AI in this world, nobody took it
    expect(t.value.fee).toBe(Math.round(fee * (1 + CONFIG.orders.reofferFeeIncrease)));
    expect(t.value.deadlineDay).toBeGreaterThan(w.day);
  });

  it('Terra fragt Mengen nach, die zum Produktionstempo passen', () => {
    const [lo, hi] = CONFIG.terra.demandDaysOfOutput as [number, number];
    // pharma plant: 25 FE medicine per day → 500–800 FE (rounded to 100), oil well: 350 FE per day → 7.000–10.500 FE
    expect(terraDemandAmount('medicine', lo)).toBe(500);
    expect(terraDemandAmount('medicine', hi)).toBe(800);
    expect(terraDemandAmount('oil', lo)).toBe(7000);
    expect(terraDemandAmount('oil', hi)).toBe(10500);
    expect(terraDemandAmount('water', hi)).toBe(12000);
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

describe('Große Lieferungen, Bestellmengen, Reparatur', () => {
  const bigTerraDemand = (w: World, id: string, amount: number): Demand => {
    const d: Demand = {
      id, requester: 'terra', good: 'oil', amount, toPlanet: 'terra', toFacility: null, pricePerFe: 20,
      own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: w.day,
      deadlineDay: w.day + 60, late: false,
    };
    w.demands.push(d);
    return d;
  };

  it('eine Lieferung kann auf mehrere Schiffe verteilt werden und wird in Teilen bezahlt', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    company(w, me).cash += 1_000_000;
    well.stock.oil = 30000;
    const d = bigTerraDemand(w, 'dmulti', 30000);
    const a = buyShip(w, me, 'tank-a'); // 16.000 FE
    const b = buyShip(w, me, 'tank-b'); // 28.000 FE
    if (!a.ok || !b.ok) throw new Error('Kauf fehlgeschlagen');
    const r = deliver(w, me, 'dmulti', well.id, { ships: [a.value.id, b.value.id], rest: 'public' });
    if (!r.ok) throw new Error(r.error);
    const parts = w.transports.filter((t) => t.demand === 'dmulti');
    // biggest ship first: 28.000 + the remaining 2.000
    expect(parts.map((t) => t.amount).sort((x, y) => y - x)).toEqual([28000, 2000]);
    expect(d.status).toBe('shipping');
    const before = company(w, me).revenue;
    runUntil(w, () => d.status === 'done', 40);
    expect(d.delivered).toBe(30000);
    expect(company(w, me).revenue - before).toBe(30000 * 20);
  });

  it('was die gewählten Schiffe nicht schaffen, kann später organisiert werden', () => {
    const w = soloWorld();
    const me = player(w);
    const well = setupOilWell(w);
    well.stock.oil = 30000;
    const d = bigTerraDemand(w, 'dlater', 30000);
    const a = buyShip(w, me, 'tank-a');
    if (!a.ok) throw new Error(a.error);
    expect(deliver(w, me, 'dlater', well.id, { ships: [a.value.id], rest: 'later' }).ok).toBe(true);
    expect(d.status).toBe('accepted'); // 14.000 FE still need a transport
    expect(d.shipped).toBe(16000);
    expect(shipDemand(w, me, 'dlater', { ships: [], rest: 'public' }).ok).toBe(true);
    expect(d.status).toBe('shipping');
    expect(w.transports.find((t) => t.demand === 'dlater' && t.status === 'open')?.amount).toBe(14000);
  });

  it('eine vorgemerkte Reparatur passiert automatisch beim nächsten Stopp auf Terra', () => {
    const w = soloWorld();
    const me = player(w);
    setupOilWell(w); // the piece-goods freighter waits worn on Vesta Nova
    const ship = w.ships.find((s) => s.owner === me)!;
    expect(ship.condition).toBeLessThan(100);
    expect(sendShipToTerra(w, me, ship.id).ok).toBe(true);
    const r = setRepairAtTerra(w, me, ship.id, true);
    expect(r.ok && r.value).toBe('marked');
    runUntil(w, () => ship.phase === 'repair', 10);
    runUntil(w, () => ship.phase === 'idle', 5);
    expect(ship.condition).toBe(100);
    expect(ship.repairAtTerra).toBe(false);
  });

  it('die Bestellmenge richtet sich nach dem größten eigenen Schiff der Frachtart', () => {
    const w = soloWorld();
    const me = player(w);
    company(w, me).cash = 10_000_000;
    const t = buyFacility(w, me, 'refinery', 'pyros');
    if (!t.ok) throw new Error(t.error);
    expect(maxOrderAmount(w, me, 'oil')).toBe(CONFIG.orders.maxAmount);
    expect(buyShip(w, me, 'tank-c').ok).toBe(true); // 45.000 FE
    expect(maxOrderAmount(w, me, 'oil')).toBe(45000);
    expect(maxOrderAmount(w, me, 'ore')).toBe(CONFIG.orders.maxAmount); // other cargo type
  });

  it('Terra-Großaufträge sind ein Vielfaches, aber nie größer als das größte Schiff', () => {
    expect(terraDemandAmount('oil', 30, 4)).toBe(42000);
    expect(terraDemandAmount('medicine', 30, 4)).toBe(3000);
    expect(terraDemandAmount('water', 30, 100)).toBe(largestShipCapacity('tank'));
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
