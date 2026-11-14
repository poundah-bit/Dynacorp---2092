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

  it('alle offenen Bestellungen zusammen bleiben im Barkapital – kein Abrutschen in Schulden', () => {
    const { w, me } = rich();
    company(w, me).cash = 27_500_000;
    expect(startProject(w, me, 'city').ok).toBe(true);
    for (let i = 0; i < 3; i++) projectsTick(w);
    const committed = orders(w, 'city').reduce((s, d) => s + d.amount * d.pricePerFe, 0);
    expect(committed).toBeLessThanOrEqual(company(w, me).cash);
    expect(w.projects![0]!.waiting).toBe('wartet auf Geld');
  });

  it('wer seine eigene Baustelle zu spät beliefert, verliert keinen Ruf', () => {
    const { w, me } = rich();
    const own = plant(w, me, 'plasticplant', 'sulcis', { plastic: 50_000 });
    expect(startProject(w, me, 'dock').ok).toBe(true);
    projectsTick(w);
    const p = orders(w, 'dock').find((d) => d.good === 'plastic')!;
    arrive(w, p, me, own.id);
    p.deadlineDay = w.day - 1;
    const rep = company(w, me).reputation;
    const revenue = company(w, me).revenue;
    run(w, 1);
    expect(company(w, me).reputation).toBe(rep);
    expect(company(w, me).revenue).toBe(revenue);
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

// ---------- the six advantages ----------

import { createWorld, facilityLimit, repairShipOnSite, routeLimit, run, buyShip, buyAutomation, type ProjectState } from '../src/sim/index';

/** Marks a project as finished for the player. */
function finished(w: World, id: string) {
  (w.projects ??= []).push({ id, status: 'done', startDay: 0, delivered: {}, doneDay: w.day } as ProjectState);
}

describe('Vorteile der Großprojekte', () => {
  it('Orbitaldock: Schiffe werden auf Terra von selbst repariert', () => {
    const { w, me } = rich();
    const s = buyShip(w, me, 'tank-a');
    if (!s.ok) throw new Error(s.error);
    s.value.condition = 60;
    run(w, 1);
    expect(s.value.phase).toBe('idle');
    expect(s.value.condition).toBe(60);
    finished(w, 'dock');
    run(w, 1);
    expect(s.value.phase).toBe('repair');
  });

  it('Forschungskuppel: das nächste Ereignis wird 7 Tage vorher angekündigt', () => {
    const w = createWorld({ seed: 2, stories: true, playerName: 'T', aiCompanies: 5 });
    finished(w, 'dome');
    w.stories!.nextDay = 100;
    run(w, 93);
    expect(w.stories!.upcoming?.startDay).toBe(100);
    expect(w.log.some((l) => l.text.startsWith('In 7 Tagen:'))).toBe(true);
    const title = w.stories!.upcoming!.title;
    run(w, 7);
    expect(w.stories!.events.some((e) => e.title === title && e.startDay === 100)).toBe(true);
    expect(w.stories!.upcoming).toBeUndefined();
  });

  it('ohne Kuppel laufen die Ereignisse genau wie bisher', () => {
    const w = createWorld({ seed: 2, stories: true, playerName: 'T', aiCompanies: 5 });
    run(w, 400);
    expect(w.stories!.events.map((e) => [e.cause, e.place, e.startDay])).toEqual([
      ['raffineriestreik', 'terra', 200], ['agrarreform', 'ceres-minor', 256], ['erzausfall', 'terra', 300], ['duerre', 'ceres-minor', 333], ['flottenausbau', 'terra', 374],
    ]);
  });

  it('Großwerft: Reparatur vor Ort an einem Planeten mit eigener Anlage', () => {
    const { w, me } = rich();
    plant(w, me, 'oilwell', 'vesta-nova');
    const s = buyShip(w, me, 'tank-a');
    if (!s.ok) throw new Error(s.error);
    Object.assign(s.value, { at: 'vesta-nova', condition: 50 });
    expect(repairShipOnSite(w, me, s.value.id).ok).toBe(false);
    finished(w, 'yard');
    const cash = company(w, me).cash;
    expect(repairShipOnSite(w, me, s.value.id).ok).toBe(true);
    expect(s.value.phase).toBe('repair');
    expect(company(w, me).cash).toBeLessThan(cash);
    Object.assign(s.value, { phase: 'idle', at: 'pyros' });
    expect(repairShipOnSite(w, me, s.value.id)).toEqual({ ok: false, error: expect.stringContaining('eigener Anlage') });
  });

  it('Siedlerstadt: ein Standort mehr', () => {
    const { w, me } = rich();
    expect(facilityLimit(w, me)).toBe(CONFIG.maxFacilitiesPerCompany);
    finished(w, 'city');
    expect(facilityLimit(w, me)).toBe(CONFIG.maxFacilitiesPerCompany + 1);
  });

  it('Rechenzentrum: zwei Lieferrouten mehr, sobald die Logistikzentrale steht', () => {
    const { w, me } = rich();
    finished(w, 'datacenter');
    expect(routeLimit(w, me)).toBe(0);
    for (let i = 0; i < 5; i++) plant(w, me, 'oilwell', `p${i}`);
    expect(buyAutomation(w, me).ok).toBe(true);
    expect(routeLimit(w, me)).toBe(CONFIG.automation.levels[0]!.routes + 2);
  });

  it('Klinikring: Gravo-Sturm-Schäden halbiert', () => {
    const make = (clinic: boolean) => {
      const w = createWorld({ seed: 11, playerName: 'T', aiCompanies: 0 });
      const me = player(w);
      for (const p of ['automa', 'asklepios', 'ostara', 'seidra', 'arkadia', 'kolossos']) plant(w, me, 'pharma', p);
      w.facilities.forEach((f, i) => (f.id = `f${i}`));
      company(w, me).cash = 1e9;
      if (clinic) finished(w, 'clinic');
      run(w, 300);
      return w.facilities.reduce((s, f) => s + (100 - f.condition), 0);
    };
    const without = make(false);
    const withClinic = make(true);
    expect(without).toBeGreaterThan(0);
    expect(withClinic).toBeLessThan(without);
  });
});

// ---------- Quark-Trend ----------

import { FLAVOURS, cellOf, ensureQuark, quarkStatus, quarkTarget, quarkTick } from '../src/sim/index';

describe('Quark-Trend', () => {
  it('jede Ware liegt in genau einem Quark-Feld', () => {
    expect(cellOf('oil')).toBe('up');
    expect(cellOf('water')).toBe('down');
    expect(cellOf('steel')).toBe('charm');
    expect(cellOf('food')).toBe('strange');
    expect(cellOf('robots')).toBe('top');
    expect(cellOf('medicine')).toBe('bottom');
    for (const g of GOODS) expect(FLAVOURS).toContain(cellOf(g.id));
  });

  it('Lieferungen an Terra zählen, Lieferungen an eigene Anlagen nicht, KI-Lieferungen ins eigene Projekt schon', () => {
    const { w, me } = rich();
    ensureQuark(w);
    const well = plant(w, me, 'oilwell', 'vesta-nova', { oil: 50_000 });
    const terra: Demand = { id: 'dt', requester: 'terra', good: 'oil', amount: 1000, toPlanet: 'terra', toFacility: null, pricePerFe: 20, own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: 0, deadlineDay: 99, late: false };
    w.demands.push(terra);
    arrive(w, terra, me, well.id);
    deliverNow(w, terra);
    expect(w.quark!.energy.up).toBe(20_000);
    const ownOrder: Demand = { ...terra, id: 'do', requester: me, toPlanet: 'pyros', toFacility: plant(w, me, 'refinery', 'pyros').id, status: 'open', supplier: null, supplierFacility: null };
    w.demands.push(ownOrder);
    arrive(w, ownOrder, me, well.id);
    deliverNow(w, ownOrder);
    expect(w.quark!.energy.up).toBe(20_000);
    const ai = 'c-ai';
    w.companies.push({ ...company(w, me), id: ai, name: 'KI', isPlayer: false, cash: 0 });
    const aiPlant = plant(w, ai, 'pharma', 'asklepios', { medicine: 10_000 });
    expect(startProject(w, me, 'clinic').ok).toBe(true);
    projectsTick(w);
    const med = orders(w, 'clinic')[0]!;
    arrive(w, med, ai, aiPlant.id);
    deliverNow(w, med);
    expect(w.quark!.energy.bottom).toBe(Math.round(med.amount * med.pricePerFe));
  });

  it('die Energie klingt ab: Halbwertszeit 120 Tage', () => {
    const { w } = rich();
    ensureQuark(w);
    w.quark!.energy.charm = 1000;
    for (let i = 0; i < CONFIG.quark.halfLifeDays; i++) quarkTick(w);
    expect(w.quark!.energy.charm).toBeCloseTo(500, 0);
  });

  it('Trend: führendes Feld und Füllstand; Meldungen bei 90 und 100 % je einmal', () => {
    const { w } = rich();
    ensureQuark(w);
    w.quark!.energy.charm = quarkTarget('charm') * 0.95;
    w.quark!.energy.up = quarkTarget('up') * 0.5;
    expect(quarkStatus(w).flavour).toBe('charm');
    quarkTick(w);
    quarkTick(w);
    expect(w.log.filter((l) => l.text.includes('verdichtet sich zu einem Charm-Quark')).length).toBe(1);
    w.quark!.energy.charm = quarkTarget('charm') * 2;
    quarkTick(w);
    quarkTick(w);
    expect(w.log.filter((l) => l.text.includes('hat sich zu einem Charm-Quark verdichtet')).length).toBe(1);
    expect(quarkStatus(w).fill).toBe(1);
  });

  it('Projekt-Modus: der Balken folgt dem laufenden Projekt und bleibt danach voll', () => {
    const w = createWorld({ seed: 3, playerName: 'T', aiCompanies: 0, quarkMode: 'project' });
    const me = player(w);
    company(w, me).cash = 2e8;
    expect(quarkStatus(w).flavour).toBeNull();
    expect(startProject(w, me, 'yard').ok).toBe(true);
    w.projects![0]!.delivered = { steel: 16_000, plasticware: 12_000 };
    expect(quarkStatus(w)).toMatchObject({ flavour: 'charm', fill: 0.5 });
    w.projects![0]!.delivered = { steel: 32_000, plasticware: 24_000 };
    projectsTick(w);
    expect(quarkStatus(w)).toMatchObject({ flavour: 'charm', fill: 1 });
  });

  it('alte Spielstände bekommen den Trend-Modus', () => {
    const w = createWorld({ seed: 4, playerName: 'T', aiCompanies: 3 });
    expect(w.quark).toBeUndefined();
    ensureQuark(w);
    expect(w.quark!.mode).toBe('trend');
    run(w, 50);
    expect(w.day).toBe(50);
  });
});
