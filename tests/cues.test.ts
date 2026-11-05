// Sound cues: which game days make a sound. Only the pure detection is tested; the audio itself needs a browser.
import { describe, expect, it } from 'vitest';
import { assignShip, buyFacility, buyShip, facilitiesOf, run, sendShipToTerra, startFacility, takeLoan, type World } from '../src/sim/index';
import { cueTracker, type Cue } from '../src/ui/cues';
import { player, runUntil, soloWorld } from './helpers';

/** Runs day by day and collects every cue. */
function collect(w: World, days: number, until?: () => boolean): Cue[] {
  const t = cueTracker(w, player(w));
  const all: Cue[] = [];
  for (let i = 0; i < days && !(until?.() ?? false); i++) {
    run(w, 1);
    all.push(...t.next(w));
  }
  return all;
}

describe('Töne', () => {
  it('ein Schiff, das fertig ist, und eine fertig gebaute Anlage klingen', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
    const f = buyFacility(w, me, 'oilwell', 'vesta-nova');
    const s = buyShip(w, me, 'piece-a');
    if (!f.ok || !s.ok) throw new Error('Kauf fehlgeschlagen');
    expect(assignShip(w, me, s.value.id, f.value.id).ok).toBe(true);
    const cues = collect(w, 60, () => facilitiesOf(w, me).some((x) => x.status === 'stopped') && s.value.phase === 'idle');
    expect(cues).toContain('idle');
    expect(cues).toContain('built');
  });

  it('eine Anlage, die nichts mehr produziert, klingt einmal, nicht jeden Tag', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
    const f = buyFacility(w, me, 'oilwell', 'vesta-nova');
    const s = buyShip(w, me, 'piece-a');
    if (!f.ok || !s.ok) throw new Error('Kauf fehlgeschlagen');
    expect(assignShip(w, me, s.value.id, f.value.id).ok).toBe(true);
    runUntil(w, () => facilitiesOf(w, me).some((x) => x.status === 'stopped'));
    const well = facilitiesOf(w, me)[0]!;
    expect(startFacility(w, me, well.id).ok).toBe(true);
    // nobody collects the oil: the storage fills up and the plant stops producing
    w.demands = [];
    const cues = collect(w, 200, () => well.idleDays > 5);
    expect(cues.filter((c) => c === 'stall')).toHaveLength(1);
  });

  it('nur große Terra-Aufträge für eigene Waren klingen, normale Börsenangebote nicht', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
    const f = buyFacility(w, me, 'oilwell', 'vesta-nova');
    const s = buyShip(w, me, 'piece-a');
    if (!f.ok || !s.ok) throw new Error('Kauf fehlgeschlagen');
    expect(assignShip(w, me, s.value.id, f.value.id).ok).toBe(true);
    runUntil(w, () => facilitiesOf(w, me).length > 0);
    const t = cueTracker(w, me);
    const base = { requester: 'terra', toPlanet: 'terra', toFacility: null, pricePerFe: 20, own: false, status: 'open' as const, supplier: null, supplierFacility: null, transport: null, createdDay: w.day, deadlineDay: w.day + 60, late: false };
    w.demands = [{ ...base, id: 'd-small', good: 'oil', amount: 5000 }];
    expect(t.next(w)).not.toContain('big');
    w.demands.push({ ...base, id: 'd-steel', good: 'steel', amount: 30000, big: true });
    expect(t.next(w)).not.toContain('big'); // not a good the player makes
    w.demands.push({ ...base, id: 'd-big', good: 'oil', amount: 40000, big: true });
    expect(t.next(w)).toEqual(['big']);
    expect(t.next(w)).not.toContain('big'); // only once
  });

  it('Terra stellt ab und zu Großaufträge, aber selten', () => {
    const w = soloWorld();
    run(w, 300);
    const terra = w.demands.filter((d) => d.requester === 'terra');
    const big = terra.filter((d) => d.big);
    expect(big.length).toBeGreaterThan(0);
    expect(big.length / terra.length).toBeLessThan(0.25);
  });

  it('ein Schiff im kritischen Zustand klingt einmal', () => {
    const w = soloWorld();
    const me = player(w);
    const r = buyShip(w, me, 'tank-a');
    if (!r.ok) throw new Error(r.error);
    r.value.at = 'vesta-nova';
    expect(sendShipToTerra(w, me, r.value.id).ok).toBe(true);
    r.value.condition = 20;
    const cues = collect(w, 60, () => r.value.phase === 'idle');
    expect(cues.filter((c) => c === 'critical')).toHaveLength(1);
  });
});
