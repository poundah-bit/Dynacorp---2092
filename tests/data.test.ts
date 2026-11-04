import { describe, expect, it } from 'vitest';
import { FACILITIES, GOODS, PLANETS, SHIPS, STORAGES, distance, validateData } from '../src/sim/index';

describe('Spieldaten', () => {
  it('sind in sich stimmig', () => {
    expect(validateData()).toEqual([]);
  });

  it('haben den Umfang aus dem Konzept', () => {
    expect(GOODS).toHaveLength(18);
    expect(FACILITIES).toHaveLength(17);
    expect(SHIPS).toHaveLength(19);
    expect(PLANETS).toHaveLength(21);
    expect(STORAGES).toHaveLength(15);
  });

  it('jede Anlagenart hat mindestens einen Planeten, Rohstoffe je zwei', () => {
    for (const f of FACILITIES) {
      const n = PLANETS.filter((p) => p.facility === f.id).length;
      expect(n, f.id).toBeGreaterThanOrEqual(['oilwell', 'waterstation', 'mine'].includes(f.id) ? 2 : 1);
    }
  });

  it('Entfernungen entsprechen der Planetentabelle', () => {
    expect(Math.round(distance('terra', 'vesta-nova'))).toBe(216);
    expect(Math.round(distance('terra', 'automa'))).toBe(689);
    expect(distance('pyros', 'ferrox')).toBeCloseTo(distance('ferrox', 'pyros'));
  });
});
