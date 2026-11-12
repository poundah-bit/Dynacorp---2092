import { expect } from 'vitest';
import { assignShip, buyFacility, buyShip, createWorld, facilitiesOf, run, startFacility, takeLoan, type Demand, type World } from '../src/sim/index';

/** A world with the human player and no AI competitors, so tests control everything. */
export function soloWorld(seed = 7): World {
  return createWorld({ seed, playerName: 'Testfirma', aiCompanies: 0 });
}

export const player = (w: World) => w.playerId!;

/** Advance day by day until the predicate holds (or fail after maxDays). */
export function runUntil(w: World, predicate: () => boolean, maxDays = 200): number {
  const start = w.day;
  while (!predicate()) {
    if (w.day - start >= maxDays) throw new Error(`Bedingung nach ${maxDays} Tagen nicht erfüllt`);
    run(w, 1);
  }
  return w.day - start;
}

/** A running oil well on Vesta Nova plus an idle tanker. */
export function oilWellWithTanker(w: World) {
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
  expect(buyShip(w, me, 'tank-a').ok).toBe(true);
  return well;
}

export const terraOilDemand = (w: World, amount: number): Demand => {
  const d: Demand = {
    id: `d-test-${w.demands.length}`,
    requester: 'terra',
    good: 'oil',
    amount,
    toPlanet: 'terra',
    toFacility: null,
    pricePerFe: 25,
    own: false,
    status: 'open',
    supplier: null,
    supplierFacility: null,
    transport: null,
    createdDay: w.day,
    deadlineDay: w.day + 40,
    late: false,
  };
  w.demands.push(d);
  return d;
};

