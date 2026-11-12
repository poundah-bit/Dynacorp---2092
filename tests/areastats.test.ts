import { describe, expect, it } from 'vitest';
import { CONFIG, buyShip, shipsOf, takeLoan } from '../src/sim/index';
import { areaStats } from '../src/ui/play';
import { oilWellWithTanker, player, soloWorld, terraOilDemand } from './helpers';

describe('areaStats', () => {
  it('a fresh world has nothing', () => {
    const w = soloWorld();
    const s = areaStats(w, player(w));
    expect(s.facilities).toEqual({ total: 0, running: 0, stopped: 0, building: 0, pending: 0 });
    expect(s.fleet).toEqual({ total: 0, idle: 0, moving: 0, critical: 0 });
    expect(s.orders).toEqual({ promised: 0, unshipped: 0, nextDeadline: null, overdue: false });
    expect(s.market.big).toBe(0);
  });
  it('counts ships and critical ones', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
    expect(buyShip(w, me, 'tank-a').ok).toBe(true);
    expect(areaStats(w, me).fleet).toMatchObject({ total: 1, idle: 1 });
    shipsOf(w, me)[0]!.condition = CONFIG.ships.criticalBelow - 1;
    expect(areaStats(w, me).fleet.critical).toBe(1);
  });
  it('counts a running plant and a big Terra order for its good', () => {
    const w = soloWorld();
    const me = player(w);
    oilWellWithTanker(w);
    expect(areaStats(w, me).facilities).toMatchObject({ total: 1, running: 1, stopped: 0 });
    const before = areaStats(w, me).market.big;
    terraOilDemand(w, 1000).big = true;
    expect(areaStats(w, me).market.big).toBe(before + 1);
    terraOilDemand(w, 1000);
    expect(areaStats(w, me).market.big).toBe(before + 1);
  });
});
