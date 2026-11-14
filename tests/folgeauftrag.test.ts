// Folgeauftrag: a ship that will be free within 5 days (delivering or in the yard) can take its next job now.
import { describe, expect, it } from 'vitest';
import { CONFIG, acceptDemand, buyShip, canQueue, company, daysUntilFree, queueTransport, run, transport, unqueueTransport, type World } from '../src/sim/index';
import { deliver, shipDemand, soonFreeShips } from '../src/ui/play';
import { oilWellWithTanker, player, runUntil, soloWorld, terraOilDemand } from './helpers';

/** Player with an oil well and a tank-a that is delivering 4,000 l to Terra (about 4 days of flight). */
function busy() {
  const w = soloWorld();
  const me = player(w);
  const well = oilWellWithTanker(w);
  well.stock.oil = 30_000;
  company(w, me).cash += 5_000_000;
  w.demands = w.demands.filter((d) => d.good !== 'oil');
  const tanker = w.ships.find((s) => s.owner === me && s.model === 'tank-a')!;
  const first = terraOilDemand(w, 4000);
  expect(deliver(w, me, first.id, well.id, { ships: [tanker.id], rest: 'public' }).ok).toBe(true);
  runUntil(w, () => tanker.phase === 'toDelivery', 40);
  // a second order of the same plant, accepted but without a ship
  const second = terraOilDemand(w, 5000);
  expect(acceptDemand(w, me, second.id, well.id).ok).toBe(true);
  return { w, me, well, tanker, second };
}

describe('Folgeauftrag', () => {
  it('frühestens 5 Tage vor dem Ende des aktuellen Auftrags', () => {
    const { w, me, tanker } = busy();
    expect(CONFIG.ships.queueDays).toBe(5);
    const free = daysUntilFree(w, tanker)!;
    expect(free).toBeGreaterThan(0);
    expect(free).toBeLessThanOrEqual(5);
    expect(soonFreeShips(w, me, 'tank', 5000).map((s) => s.id)).toContain(tanker.id);
    // far from the end: not offered
    tanker.route!.traveled = 0;
    tanker.route!.distance = 2000;
    expect(daysUntilFree(w, tanker)).toBeGreaterThan(5);
    expect(soonFreeShips(w, me, 'tank', 5000)).toEqual([]);
  });

  it('Schiffe, die laden, zum Abholen fliegen oder kritisch sind, gibt es nicht', () => {
    const { w, me, tanker } = busy();
    tanker.condition = 20;
    expect(soonFreeShips(w, me, 'tank', 5000)).toEqual([]);
    tanker.condition = 90;
    tanker.phase = 'toPickup';
    expect(daysUntilFree(w, tanker)).toBeNull();
  });

  it('nach dem Entladen startet der Folgeauftrag von selbst', () => {
    const { w, me, tanker, second } = busy();
    expect(shipDemand(w, me, second.id, { ships: [tanker.id], rest: 'later' }).ok).toBe(true);
    expect(tanker.next).toBeTruthy();
    expect(second.status).toBe('shipping');
    const next = transport(w, tanker.next!)!;
    expect(next.ship).toBe(tanker.id);
    runUntil(w, () => tanker.transport === next.id, 15);
    expect(tanker.next).toBeUndefined();
    expect(['toPickup', 'loading']).toContain(tanker.phase);
  });

  it('ein Folgeauftrag lässt sich wieder lösen', () => {
    const { w, me, tanker, second } = busy();
    expect(shipDemand(w, me, second.id, { ships: [tanker.id], rest: 'later' }).ok).toBe(true);
    const id = tanker.next!;
    expect(unqueueTransport(w, me, tanker.id).ok).toBe(true);
    expect(tanker.next).toBeUndefined();
    expect(transport(w, id)!.ship).toBeNull();
    expect(transport(w, id)!.status).toBe('accepted');
  });

  it('auch ein Schiff in der Werft, das in höchstens 5 Tagen fertig ist', () => {
    const w = soloWorld();
    const me = player(w);
    company(w, me).cash = 5_000_000;
    const s = buyShip(w, me, 'tank-a');
    if (!s.ok) throw new Error(s.error);
    Object.assign(s.value, { phase: 'repair', waitDays: 3 });
    expect(daysUntilFree(w, s.value)).toBe(3);
    Object.assign(s.value, { waitDays: 8 });
    expect(daysUntilFree(w, s.value)).toBe(8);
    expect(soonFreeShips(w, me, 'tank', 1000)).toEqual([]);
  });

  it('nur ein Folgeauftrag pro Schiff; ein stornierter Folgeauftrag bleibt folgenlos', () => {
    const { w, me, tanker, second } = busy();
    expect(shipDemand(w, me, second.id, { ships: [tanker.id], rest: 'later' }).ok).toBe(true);
    const t = transport(w, tanker.next!)!;
    expect(canQueue(w, tanker, t)).toBe(false);
    expect(queueTransport(w, me, tanker.id, t.id).ok).toBe(false);
    t.status = 'cancelled';
    run(w, 10);
    expect(tanker.next).toBeUndefined();
    expect(tanker.transport).not.toBe(t.id);
  });
});

// ---------- Transportaufträge anderer Firmen mit einem bald freien Schiff ----------

import { carry, carryState } from '../src/ui/play';
import { marketView } from '../src/ui/views';

describe('Transport übernehmen als Folgeauftrag', () => {
  /** An open public transport of an AI firm: 5,000 l oil from Vesta Nova to Terra. */
  function withTransport() {
    const b = busy();
    const ai = 'c-ai';
    b.w.companies.push({ ...company(b.w, b.me), id: ai, name: 'Ewing Orbital', isPlayer: false });
    const t = { id: 't-ai', kind: 'goods', issuer: ai, carrier: null, demand: null, good: 'oil', cargo: 'tank', amount: 5000, fromPlanet: 'vesta-nova', toPlanet: 'terra', fromFacility: null, toFacility: null, fee: 50_000, own: false, status: 'open', ship: null, deadlineDay: b.w.day + 40, late: false, createdDay: b.w.day } as never as import('../src/sim/index').Transport;
    b.w.transports.push(t);
    return { ...b, t };
  }

  it('ein Schiff, das in höchstens 5 Tagen frei ist, kann übernehmen', () => {
    const { w, me, tanker, t } = withTransport();
    expect(carryState(w, me, t)).toBe('soon');
    const html = marketView({ w, me, marketAll: true } as never);
    expect(html).toMatch(/data-act="carry" data-a="t-ai" class="primary"(?![^>]*disabled)/);
    expect(html).toContain('Folgeauftrag');
    const r = carry(w, me, t.id, `ship:${tanker.id}`);
    expect(r.ok).toBe(true);
    expect(tanker.next).toBe(t.id);
    expect(t.carrier).toBe(me);
  });

  it('länger unterwegs: noch nicht übernehmbar, die Zeile sagt wann', () => {
    const { w, me, tanker, t } = withTransport();
    tanker.route!.traveled = 0;
    tanker.route!.distance = 2000;
    expect(carryState(w, me, t)).toBe('busy');
    const html = marketView({ w, me, marketAll: true } as never);
    expect(html).toContain('frei in');
  });
});

import { carrySheet } from '../src/ui/sheets';

describe('Übernehmen-Dialog mit bald freiem Schiff', () => {
  it('wählt das bald freie Schiff vor', () => {
    const w0 = busy();
    const ai = 'c-ai2';
    w0.w.companies.push({ ...company(w0.w, w0.me), id: ai, name: 'KI', isPlayer: false });
    w0.w.transports.push({ id: 't-ai2', kind: 'goods', issuer: ai, carrier: null, demand: null, good: 'oil', cargo: 'tank', amount: 5000, fromPlanet: 'vesta-nova', toPlanet: 'terra', fromFacility: null, toFacility: null, fee: 50_000, own: false, status: 'open', ship: null, deadlineDay: w0.w.day + 40, late: false, createdDay: w0.w.day } as never);
    const body = carrySheet(w0.w, w0.me, 't-ai2').body;
    expect(body).toContain(`value="ship:${w0.tanker.id}" checked`);
    expect(body).toContain('Folgeauftrag');
  });
});
