// Großprojekte: money, then large amounts of goods; prestige and an advantage when finished.
import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  GOODS,
  PROJECTS,
  abortProject,
  acceptDemand,
  company,
  companyIndex,
  maxOrderAmount,
  projectsTick,
  startProject,
  takeLoan,
  validateData,
  type Demand,
  type World,
} from '../src/sim/index';
import { player, soloWorld } from './helpers';

/** Solo world, rich player, no debt. */
function rich(): { w: World; me: string } {
  const w = soloWorld();
  const me = player(w);
  company(w, me).cash = 200_000_000;
  return { w, me };
}

const orders = (w: World, project: string) => w.demands.filter((d) => d.project === project && d.status !== 'cancelled');

/** A running facility of a type for a company (tests only). */
function plant(w: World, owner: string, type: string, planet: string, stock: Record<string, number> = {}) {
  const f = { id: `f-${type}-${owner}`, owner, type, planet, units: 1, status: 'running' as const, buildDaysLeft: 0, condition: 100, stock, reserved: {}, storages: [], idleDays: 0 };
  w.facilities.push(f);
  return f;
}

/** Delivers an order straight away (no ships): accept from a facility, then book the arrival. */
function arrive(w: World, d: Demand, supplier: string, facilityId: string) {
  const r = acceptDemand(w, supplier, d.id, facilityId);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('Großprojekte', () => {
  it('jede Ware hat eine Quark-Klasse und die Daten sind gültig', () => {
    for (const g of GOODS) expect(g.quark, g.id).toBeTruthy();
    expect(PROJECTS.map((p) => p.quark).sort()).toEqual(['bottom', 'charm', 'down', 'strange', 'top', 'up']);
    expect(validateData()).toEqual([]);
  });

  it('Start nur schuldenfrei und mit genug Barkapital, eins zur Zeit', () => {
    const w = soloWorld();
    const me = player(w);
    expect(startProject(w, me, 'dock')).toEqual({ ok: false, error: expect.stringContaining('Barkapital') });
    expect(takeLoan(w, me, 500_000, 0).ok).toBe(true);
    company(w, me).cash = 50_000_000;
    expect(startProject(w, me, 'dock')).toEqual({ ok: false, error: expect.stringContaining('schuldenfrei') });
    company(w, me).loans = [];
    const before = company(w, me).cash;
    expect(startProject(w, me, 'dock').ok).toBe(true);
    expect(company(w, me).cash).toBe(before - 10_000_000);
    expect(startProject(w, me, 'dome')).toEqual({ ok: false, error: expect.stringContaining('läuft schon') });
  });

  it('die Baustelle bestellt jede Ware, höchstens zwei Aufträge je Ware, nie größer als erlaubt', () => {
    const { w, me } = rich();
    expect(startProject(w, me, 'dome').ok).toBe(true);
    projectsTick(w);
    projectsTick(w);
    projectsTick(w);
    for (const g of ['water', 'agro', 'fiber']) {
      const os = orders(w, 'dome').filter((d) => d.good === g);
      expect(os.length, g).toBe(CONFIG.projects.openOrdersPerGood);
      for (const d of os) {
        expect(d.requester).toBe(me);
        expect(d.toPlanet).toBe('terra');
        expect(d.toFacility).toBeNull();
        expect(d.own).toBe(false);
        expect(d.amount).toBeLessThanOrEqual(maxOrderAmount(w, me, g));
      }
    }
  });

  it('ohne genug Geld wartet die Baustelle', () => {
    const { w, me } = rich();
    expect(startProject(w, me, 'datacenter').ok).toBe(true);
    company(w, me).cash = 1000;
    projectsTick(w);
    expect(orders(w, 'datacenter')).toEqual([]);
    expect(w.projects![0]!.waiting).toBe('wartet auf Geld');
  });

  it('Lieferung aus eigener Anlage kostet nichts, Lieferung einer KI-Firma zahlt der Spieler', () => {
    const { w, me } = rich();
    const ai = 'c-ai';
    w.companies.push({ ...company(w, me), id: ai, name: 'KI-Test', isPlayer: false, cash: 0 });
    const own = plant(w, me, 'plasticplant', 'sulcis', { plastic: 50_000 });
    const other = plant(w, ai, 'refinery', 'pyros', { fuel: 50_000 });
    expect(startProject(w, me, 'dock').ok).toBe(true);
    projectsTick(w);
    const p = orders(w, 'dock').find((d) => d.good === 'plastic')!;
    const f = orders(w, 'dock').find((d) => d.good === 'fuel')!;
    arrive(w, p, me, own.id);
    arrive(w, f, ai, other.id);
    const cash = company(w, me).cash;
    // book both arrivals the way the engine does (transport arrives)
    deliverNow(w, p);
    deliverNow(w, f);
    expect(w.projects![0]!.delivered.plastic).toBe(p.amount);
    expect(w.projects![0]!.delivered.fuel).toBe(f.amount);
    expect(company(w, me).cash).toBe(cash - Math.round(f.amount * f.pricePerFe));
    expect(company(w, ai).cash).toBe(Math.round(f.amount * f.pricePerFe));
  });

  it('fertig: Prestige, Firmenindex steigt, keine neuen Aufträge', () => {
    const { w, me } = rich();
    expect(startProject(w, me, 'clinic').ok).toBe(true);
    const index = companyIndex(w, me);
    w.projects![0]!.delivered.medicine = 6250;
    projectsTick(w);
    expect(w.projects![0]!.status).toBe('done');
    expect(company(w, me).prestige).toBe(20_000);
    expect(companyIndex(w, me)).toBe(index + 20_000);
    projectsTick(w);
    expect(orders(w, 'clinic').filter((d) => d.status === 'open')).toEqual([]);
    expect(startProject(w, me, 'clinic')).toEqual({ ok: false, error: expect.stringContaining('schon gebaut') });
  });

  it('Abbrechen nimmt offene Aufträge zurück', () => {
    const { w, me } = rich();
    expect(startProject(w, me, 'dock').ok).toBe(true);
    projectsTick(w);
    expect(abortProject(w, me).ok).toBe(true);
    expect(w.demands.filter((d) => d.project === 'dock' && d.status === 'open')).toEqual([]);
    expect(w.projects ?? []).toEqual([]);
  });
});

import { deliverDemandPart } from '../src/sim/engine';
/** Books the arrival of a whole demand at once (as if one ship delivered it). */
function deliverNow(w: World, d: Demand) {
  deliverDemandPart(w, d, d.amount);
}
