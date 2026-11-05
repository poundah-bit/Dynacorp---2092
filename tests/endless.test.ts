// Gate of Phase 2: the AI companies keep the economy stable in an endless game (1,000 days).
import { describe, expect, it } from 'vitest';
import { FACILITIES, createWorld, run, type Difficulty, type World } from '../src/sim/index';
import { newGame } from '../src/ui/play';

const DAYS = 1000;

function expectStable(w: World) {
  run(w, DAYS);
  expect(w.day).toBe(DAYS);
  expect(w.collapsed).toBe(false);
  expect(w.companies.filter((c) => c.bankrupt).length).toBeLessThanOrEqual(3);
  // the whole chain is built, final-goods plants included
  expect(new Set(w.facilities.map((f) => f.type)).size).toBe(FACILITIES.length);
}

describe('Endlosspiel: 1.000 Tage', () => {
  const cases: [number, Difficulty][] = [
    [1, 'med'],
    [2, 'med'],
    [3, 'easy'],
    [4, 'hard'],
    [5, 'prof'],
  ];
  it.each(cases)('Seed %i (%s), 20 KI-Firmen: stabil, alle Anlagenarten gebaut', (seed, difficulty) => {
    expectStable(createWorld({ seed, difficulty }));
  });

  it('Standardspiel (Spieler + 10 KI-Firmen) bleibt stabil, auch wenn der Spieler nichts tut', () => {
    const w = newGame('Testfirma', 'med', 6);
    run(w, DAYS);
    expect(w.collapsed).toBe(false);
    expect(w.companies.filter((c) => c.bankrupt && !c.isPlayer).length).toBeLessThanOrEqual(2);
  });
});
