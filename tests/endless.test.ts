// Gate of Phase 2: the AI companies keep the economy stable in an endless game (1,000 days).
import { describe, expect, it } from 'vitest';
import { FACILITIES, GOODS, createWorld, run, step, type Difficulty, type World } from '../src/sim/index';
import { statsCollector } from '../src/sim/metrics';
import { newGame } from '../src/ui/play';

const DAYS = 1000;
const FINAL_GOODS = GOODS.filter((g) => g.tier === 'final').map((g) => g.id);

function runWithStats(w: World) {
  const stats = statsCollector(w);
  for (let d = 0; d < DAYS && !w.collapsed; d++) {
    step(w);
    stats.observe();
  }
  return stats.result();
}

describe('Endlosspiel: 1.000 Tage', () => {
  const cases: [number, Difficulty][] = [
    [1, 'med'],
    [2, 'med'],
    [3, 'easy'],
    [4, 'hard'],
    [5, 'prof'],
  ];
  it.each(cases)('Seed %i (%s), 20 KI-Firmen: stabil, ganze Kette gebaut, Terra bekommt jedes Endprodukt', (seed, difficulty) => {
    const w = createWorld({ seed, difficulty });
    const r = runWithStats(w);
    expect(w.day).toBe(DAYS);
    expect(r.collapsed).toBe(false);
    expect(r.bankrupt).toBeLessThanOrEqual(3);
    expect(r.typesPresent).toBe(FACILITIES.length);
    // the whole chain works: no good is stuck behind a blocked supply line
    for (const g of FINAL_GOODS) expect(r.terraDeliveries[g] ?? 0, g).toBeGreaterThan(0);
  });

  it('Standardspiel (Spieler + 10 KI-Firmen) bleibt stabil, auch wenn der Spieler nichts tut', () => {
    const w = newGame('Testfirma', 'med', 6);
    run(w, DAYS);
    expect(w.collapsed).toBe(false);
    expect(w.companies.filter((c) => c.bankrupt && !c.isPlayer).length).toBeLessThanOrEqual(2);
  });
});
