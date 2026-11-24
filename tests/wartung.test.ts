// Facility repair: a manual repair stops the plant for 1–3 days (raw, intermediate, final goods); the
// Großprojekt „Automatische Fabriken“ repairs every plant below 90 % for free while it keeps producing.
// After a repair a plant stays at 100 % for some days before it wears again.
import { describe, expect, it } from 'vitest';
import { CONFIG, PROJECTS, type Facility, cellOf, company, facilityRepairDays, productionEfficiency, repairFacility, run, validateData, type ProjectState, type World } from '../src/sim/index';
import { player, soloWorld } from './helpers';

function setup() {
  const w = soloWorld();
  const me = player(w);
  company(w, me).cash = 1e8;
  const well: Facility = { id: 'f-well', owner: me, type: 'oilwell', planet: 'vesta-nova', units: 1, status: 'running' as const, buildDaysLeft: 0, condition: 80, stock: {} as Record<string, number>, reserved: {} as Record<string, number>, storages: [], idleDays: 0 };
  w.facilities.push(well);
  w.demands = [];
  return { w, me, well };
}

const autofactory = (w: World) => (w.projects ??= []).push({ id: 'autofactory', status: 'done', startDay: 0, delivered: {}, doneDay: 0 } as ProjectState);

describe('Großprojekte neu verteilt', () => {
  it('Automatische Fabriken: Top, Maschinen und Roboter; Rechenzentrum: Bottom, Maschinen und Medikamente', () => {
    const af = PROJECTS.find((p) => p.id === 'autofactory')!;
    expect(af).toMatchObject({ name: 'Automatische Fabriken', quark: 'top', materials: { machines: 30_000, robots: 15_000 } });
    const dc = PROJECTS.find((p) => p.id === 'datacenter')!;
    expect(dc).toMatchObject({ quark: 'bottom', materials: { machines: 15_000, medicine: 6250 } });
    expect(PROJECTS.find((p) => p.id === 'clinic')).toBeUndefined();
    expect(cellOf('robots')).toBe('top');
    expect(validateData()).toEqual([]);
  });
});

describe('Reparatur von Anlagen', () => {
  it('Dauer nach Stufe: Rohstoffe 1 Tag, Verarbeitung 2, Endprodukte 3', () => {
    expect(facilityRepairDays('oilwell')).toBe(1);
    expect(facilityRepairDays('refinery')).toBe(2);
    expect(facilityRepairDays('robotworks')).toBe(3);
  });

  it('manuell: kostet, die Anlage steht still, danach 100 % und 10 Tage ohne Verschleiß', () => {
    const { w, me, well } = setup();
    const cash = company(w, me).cash;
    expect(repairFacility(w, me, well.id).ok).toBe(true);
    expect(company(w, me).cash).toBeLessThan(cash);
    expect(well.repair).toMatchObject({ daysLeft: 1, auto: false });
    expect(repairFacility(w, me, well.id).ok).toBe(false); // already in repair
    run(w, 1);
    expect(well.stock.oil ?? 0).toBe(0); // stood still
    expect(well.condition).toBe(100);
    expect(well.repair).toBeUndefined();
    expect(CONFIG.facilities.freshDays).toBe(10);
    run(w, 10);
    expect(well.condition).toBe(100);
    expect(well.stock.oil).toBeGreaterThan(0);
    run(w, 1);
    expect(well.condition).toBeLessThan(100);
  });

  it('Automatische Fabriken: unter 90 % kostenlos, ohne Stillstand und ohne Leistungsverlust', () => {
    const { w, me, well } = setup();
    autofactory(w);
    well.condition = 70; // e.g. after a gravo storm
    const cash = company(w, me).cash;
    run(w, 1);
    expect(well.repair?.auto).toBe(true);
    expect(well.stock.oil).toBe(350); // full output while in repair
    expect(productionEfficiency(well)).toBe(1);
    run(w, 1);
    expect(well.condition).toBe(100);
    // only the plant's running costs were paid, no repair bill
    const running = 2 * (30 + 100);
    expect(cash - company(w, me).cash).toBe(running);
    expect(repairFacility(w, me, well.id).ok).toBe(false);
  });

  it('Automatische Fabriken: nach den 10 Ruhetagen sinkt der Zustand bis 90 % und wird dann wieder repariert', () => {
    const { w, well } = setup();
    autofactory(w);
    well.condition = 90.1;
    run(w, 1);
    expect(well.repair).toBeUndefined();
    run(w, 1);
    expect(well.condition).toBeLessThan(90);
    expect(well.repair?.auto).toBe(true);
  });
});

import { ensureProjects, hasProject, type ModuleRecord } from '../src/sim/index';
import { facilitiesView } from '../src/ui/views';

describe('Alte Spielstände und Anzeige', () => {
  it('ein fertiger Klinikring wird zu den Automatischen Fabriken', () => {
    const { w, me } = setup();
    (w.projects ??= []).push({ id: 'clinic', status: 'done', startDay: 0, delivered: {}, doneDay: 0 } as ProjectState);
    w.campaign = { world: 2, usedNames: [], modules: [{ n: 1, quark: 'top', project: 'datacenter' } as ModuleRecord] };
    ensureProjects(w);
    expect(hasProject(w, me, 'autofactory')).toBe(true);
    expect(w.campaign.modules[0]!.quark).toBe('bottom');
  });

  it('Anlagenkarte: Reparatur mit Stillstand, mit Automatischen Fabriken kein Knopf', () => {
    const { w, me, well } = setup();
    const view = () => facilitiesView({ w, me, order: undefined } as never);
    expect(view()).toContain('data-act="repair-facility"');
    expect(view()).toContain('steht dafür 1 Tag still');
    repairFacility(w, me, well.id);
    expect(view()).toContain('In Reparatur – steht still');
    expect(view()).not.toContain('data-act="repair-facility"');
    run(w, 1);
    autofactory(w);
    well.condition = 80;
    run(w, 1);
    expect(view()).toContain('Wartet sich selbst');
    expect(view()).not.toContain('data-act="repair-facility"');
  });
});
