import { describe, expect, it } from 'vitest';
import { stopFacility, type Transport } from '../src/sim/index';
import { createFx, mapEvents } from '../src/ui/mapfx';
import { oilWellWithTanker, player, soloWorld } from './helpers';

const done = (w: ReturnType<typeof soloWorld>, me: string, day: number) =>
  ({ id: `t-${day}`, issuer: 'x', kind: 'goods', good: 'oil', asset: null, amount: 1, cargo: 'tank', fromPlanet: 'vesta-nova', fromFacility: null, toPlanet: 'terra', fee: 0, own: false, demand: null, carrier: me, ship: null, status: 'done', createdDay: 0, deadlineDay: 99, late: false, doneDay: day }) as Transport;

describe('day events', () => {
  it('a quiet fresh world has none', () => {
    const w = soloWorld();
    expect(mapEvents(w, player(w))).toEqual({ pulses: [], arrivals: [], storm: null });
  });
  it('producing plants pulse, stopped ones do not', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    expect(mapEvents(w, me).pulses).toEqual(['vesta-nova']);
    expect(stopFacility(w, me, well.id).ok).toBe(true);
    expect(mapEvents(w, me).pulses).toEqual([]);
  });
  it('arrivals of today only', () => {
    const w = soloWorld();
    const me = player(w);
    w.transports.push(done(w, me, w.day));
    expect(mapEvents(w, me).arrivals).toContain('terra');
    w.transports = [done(w, me, w.day - 1)];
    expect(mapEvents(w, me).arrivals).toEqual([]);
  });
  it('finds the storm of today by the planet name', () => {
    const w = soloWorld();
    const me = player(w);
    w.log.push({ day: w.day - 1, company: null, text: 'Gravo-Sturm bei Liora! Schiffe und Anlagen beschädigt.', priority: 3 });
    expect(mapEvents(w, me).storm).toBeNull();
    w.log.push({ day: w.day, company: null, text: 'Gravo-Sturm bei Ceres Minor! Schiffe und Anlagen beschädigt.', priority: 3 });
    w.log.push({ day: w.day, company: null, text: 'Etwas anderes', priority: 1 });
    expect(mapEvents(w, me).storm).toBe('ceres-minor');
  });
});

describe('effect list', () => {
  const ev = (pulses: string[] = [], arrivals: string[] = [], storm: string | null = null) => ({ pulses, arrivals, storm });
  it('effects expire', () => {
    const fx = createFx();
    fx.add(ev(['a']), 0);
    expect(fx.active(100)).toHaveLength(1);
    expect(fx.active(1300)).toHaveLength(0);
    expect(fx.busy(1300)).toBe(false);
  });
  it('pulses per planet are throttled', () => {
    const fx = createFx();
    fx.add(ev(['a']), 0);
    fx.add(ev(['a']), 500);
    expect(fx.active(600)).toHaveLength(1);
    fx.add(ev(['a']), 1600);
    expect(fx.active(1600).filter((f) => f.kind === 'pulse')).toHaveLength(1);
    expect(fx.active(1600)[0]!.start).toBe(1600);
  });
  it('stays small at 4x', () => {
    const fx = createFx();
    for (let i = 0; i < 100; i++) {
      fx.add(ev(['a'], ['b']), i * 250);
      expect(fx.active(i * 250).length).toBeLessThanOrEqual(6);
    }
  });
  it('sparks and storms, clear', () => {
    const fx = createFx();
    fx.add(ev([], ['terra'], 'liora'), 0);
    expect(fx.active(0).map((f) => f.kind).sort()).toEqual(['spark', 'storm']);
    expect(fx.busy(2000)).toBe(true);
    fx.clear();
    expect(fx.active(0)).toEqual([]);
  });
});
