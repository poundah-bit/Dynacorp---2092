// Tor von Phase 0: 200 Spieltage im Test ohne Wirtschaftskollaps.
import { describe, expect, it } from 'vitest';
import { createWorld, run, type Difficulty } from '../src/sim/index';

const cases: [number, Difficulty][] = [
  [1, 'med'],
  [2, 'med'],
  [3, 'easy'],
  [4, 'hard'],
  [5, 'prof'],
];

describe('Balancing-Tor', () => {
  it.each(cases)('Seed %i (%s): 200 Tage ohne Kollaps, höchstens 3 Bankrotte, Wirtschaft wächst', (seed, difficulty) => {
    const w = createWorld({ seed, difficulty });
    run(w, 200);
    expect(w.collapsed).toBe(false);
    expect(w.companies.filter((c) => c.bankrupt).length).toBeLessThanOrEqual(3);
    const units = w.facilities.reduce((s, f) => s + f.units, 0);
    expect(units).toBeGreaterThan(w.companies.length); // more than one plant per company on average
    expect(w.facilities.some((f) => !['oilwell', 'waterstation', 'mine'].includes(f.type))).toBe(true);
  });
});
