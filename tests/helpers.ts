import { createWorld, run, type World } from '../src/sim/index';

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
