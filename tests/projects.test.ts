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
    for (let i = 0; i <= CONFIG.projects.buildDays; i++) projectsTick(w);
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

  it('Orbitaldock: die Reparatur auf Terra ist kostenlos – auch ohne Geld', () => {
    const { w, me } = rich();
    const s = buyShip(w, me, 'tank-a');
    if (!s.ok) throw new Error(s.error);
    finished(w, 'dock');
    s.value.condition = 40;
    company(w, me).cash = 0;
    run(w, 1);
    expect(s.value.phase).toBe('repair');
    expect(w.log.some((l) => l.text.includes('kostenlos'))).toBe(true);
    expect(w.log.some((l) => l.text.includes('nicht möglich'))).toBe(false);
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

  // recorded from the code without the dome path; re-record when the economy changes on purpose (e.g. loading days)
  it('ohne Kuppel laufen die Ereignisse genau wie bisher', () => {
    const w = createWorld({ seed: 2, stories: true, playerName: 'T', aiCompanies: 5 });
    run(w, 400);
    expect(w.stories!.events.map((e) => [e.cause, e.place, e.startDay])).toEqual([
      ['habitatschaden', 'mirabel', 183], ['erzausfall', 'terra', 226], ['bauboom', 'polymer-ix', 280], ['modewelle', 'terra', 327], ['bauboom', 'vesta-nova', 381],
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

// ---------- Quark ----------

import { FLAVOURS, cellOf, ensureQuark, quarkStatus, quarkTick } from '../src/sim/index';

describe('Quark', () => {
  it('jede Ware liegt in genau einem Quark-Feld', () => {
    expect(cellOf('oil')).toBe('up');
    expect(cellOf('water')).toBe('down');
    expect(cellOf('steel')).toBe('charm');
    expect(cellOf('food')).toBe('strange');
    expect(cellOf('robots')).toBe('top');
    expect(cellOf('medicine')).toBe('bottom');
    for (const g of GOODS) expect(FLAVOURS).toContain(cellOf(g.id));
  });

  it('der Balken folgt dem laufenden Projekt, jedes fertige Projekt schaltet sein Quark frei', () => {
    const w = createWorld({ seed: 3, playerName: 'T', aiCompanies: 0 });
    const me = player(w);
    company(w, me).cash = 2e8;
    expect(quarkStatus(w)).toMatchObject({ flavour: null, unlocked: [] });
    expect(startProject(w, me, 'yard').ok).toBe(true);
    w.projects![0]!.delivered = { steel: 16_000, plasticware: 12_000 };
    expect(quarkStatus(w)).toMatchObject({ flavour: 'charm', fill: 0.25 });
    w.projects![0]!.delivered = { steel: 32_000, plasticware: 24_000 };
    for (let i = 0; i <= CONFIG.projects.buildDays; i++) {
      projectsTick(w);
      quarkTick(w);
    }
    expect(w.log.filter((l) => l.text.includes('verdichtet sich zu einem Charm-Quark')).length).toBe(1);
    quarkTick(w);
    expect(quarkStatus(w)).toMatchObject({ flavour: null, unlocked: ['charm'] });
    expect(quarkStatus(w).cells.charm).toBe(1);
    expect(w.log.filter((l) => l.text.includes('Charm-Quark freigeschaltet')).length).toBe(1);
    // a second project: its bar runs, charm stays unlocked
    expect(startProject(w, me, 'dock').ok).toBe(true);
    expect(quarkStatus(w)).toMatchObject({ flavour: 'up', fill: 0, unlocked: ['charm'] });
  });

  it('alte Spielstände bekommen das Quark, Felder aus dem Test mit zwei Modi verschwinden', () => {
    const w = createWorld({ seed: 4, playerName: 'T', aiCompanies: 3 });
    delete w.quark;
    ensureQuark(w);
    expect(w.quark).toEqual({ warned: [], reached: [] });
    (w.quark as unknown as Record<string, unknown>).mode = 'trend';
    (w.quark as unknown as Record<string, unknown>).energy = {};
    ensureQuark(w);
    expect(w.quark).toEqual({ warned: [], reached: [] });
    run(w, 50);
    expect(w.day).toBe(50);
  });
});

// ---------- Bauphase ----------

import { hasProject, projectProgress } from '../src/sim/index';

describe('Bauphase', () => {
  /** Yard started, all material delivered. */
  function full() {
    const { w, me } = rich();
    expect(startProject(w, me, 'yard').ok).toBe(true);
    w.projects![0]!.delivered = { steel: 32_000, plasticware: 24_000 };
    return { w, me, p: w.projects![0]! };
  }

  it('nach dem letzten Material beginnen 200 Tage Bau, erst dann fertig', () => {
    const { w, me, p } = full();
    const prestige = company(w, me).prestige ?? 0;
    projectsTick(w);
    expect(p.status).toBe('building');
    expect(p.buildDaysLeft).toBe(200);
    expect(company(w, me).prestige ?? 0).toBe(prestige);
    for (let i = 0; i < 199; i++) projectsTick(w);
    expect(p.status).toBe('building');
    projectsTick(w);
    expect(p.status).toBe('done');
    expect(company(w, me).prestige).toBe(prestige + 10_000);
    expect(hasProject(w, me, 'yard')).toBe(true);
  });

  it('Balken: Material zählt bis 50 %, Bau bis 100 %', () => {
    const { w, me } = rich();
    expect(startProject(w, me, 'yard').ok).toBe(true);
    w.projects![0]!.delivered = { steel: 16_000, plasticware: 12_000 };
    expect(quarkStatus(w).fill).toBe(0.25);
    w.projects![0]!.delivered = { steel: 32_000, plasticware: 24_000 };
    for (let i = 0; i < 101; i++) projectsTick(w); // day 1 starts the build, 100 build days follow
    expect(projectProgress(w, 'yard')).toEqual({ material: 1, build: 0.5 });
    expect(quarkStatus(w).fill).toBe(0.75);
  });

  it('Abbrechen in der Bauphase: alles verloren', () => {
    const { w, me } = full();
    projectsTick(w);
    expect(abortProject(w, me).ok).toBe(true);
    expect(w.projects).toEqual([]);
  });

  it('Meldung verdichtet sich erst in der Bauphase bei 90 %', () => {
    const { w } = full();
    const said = () => w.log.filter((l) => l.text.includes('verdichtet sich')).length;
    for (let i = 0; i < 160; i++) {
      projectsTick(w);
      quarkTick(w);
    }
    expect(said()).toBe(0); // 159 build days = 89.75 %
    for (let i = 0; i < 2; i++) {
      projectsTick(w);
      quarkTick(w);
    }
    expect(said()).toBe(1);
  });
});

// ---------- Orbitaldock in der Flotte ----------

import { fleetView } from '../src/ui/views';

describe('Orbitaldock in der Flotte', () => {
  it('mit Orbitaldock keine kostenpflichtige Reparatur-Vormerkung mehr', () => {
    const { w, me } = rich();
    const s = buyShip(w, me, 'tank-a');
    if (!s.ok) throw new Error(s.error);
    Object.assign(s.value, { at: 'vesta-nova', condition: 60 });
    const html = () => fleetView({ w, me } as never);
    expect(html()).toContain('Beim nächsten Terra-Stopp reparieren');
    expect(startProject(w, me, 'dock').ok).toBe(true);
    w.projects![0]!.buildDaysLeft = 1;
    projectsTick(w);
    expect(html()).not.toContain('Beim nächsten Terra-Stopp reparieren');
    expect(html()).toContain('Zur Reparatur nach Terra');
    expect(html()).toContain('kostenlos');
  });
});

// ---------- Prestige und Firmenindex ----------

import { indexParts } from '../src/sim/index';
import { projectsCard, statsView } from '../src/ui/views';

describe('Prestige im Firmenindex', () => {
  it('die Teile ergeben den Index; Prestige zählt 1:1', () => {
    const { w, me } = rich();
    company(w, me).prestige = 5000;
    const p = indexParts(w, me);
    expect(p.prestige).toBe(5000);
    expect(Math.abs(p.value + p.profit + p.reputation + p.prestige - companyIndex(w, me))).toBeLessThanOrEqual(2);
  });

  it('Projektkarte nennt den Indexgewinn, die Rangliste erklärt den eigenen Index', () => {
    const { w, me } = rich();
    expect(projectsCard(w, me)).toContain('+5.000 Prestige (= +5.000 Firmenindex)');
    company(w, me).prestige = 5000;
    const html = statsView({ w, me, priceTrend: () => 0, chainGood: '' } as never);
    expect(html).toMatch(/data-tip="Firmenindex = Firmenwert [\d.]+ · Gewinn -?[\d.]+ · Ruf [\d.]+ · Prestige 5\.000"/);
  });
});
