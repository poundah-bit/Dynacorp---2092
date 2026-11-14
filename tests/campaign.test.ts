// Modulwelten: planets per world, the generator, closing a world and the campaign.
import { describe, expect, it } from 'vitest';
import { PLANETS, createWorld, distance, planetsFor, worldPlanets } from '../src/sim/index';

describe('Planeten pro Welt', () => {
  it('Welt 1 nutzt planets.json, eine eigene Planetenliste ersetzt sie', () => {
    const w = createWorld({ seed: 1 });
    expect(worldPlanets(w)).toBe(PLANETS);
    w.planets = [{ ...PLANETS[0]! }, { id: 'x', name: 'X', x: 3, y: 4, facility: 'mine' }];
    expect(distance(w, 'terra', 'x')).toBe(5);
    expect(planetsFor(w, 'mine').map((p) => p.id)).toEqual(['x']);
  });
});

// ---------- Welt abschließen ----------

import {
  CONFIG,
  campaignComplete,
  campaignOf,
  campaignValue,
  closableQuarks,
  closeWorld,
  company,
  companyIndex,
  hasProject,
  initStories,
  projectsTick,
  projectState,
  run,
  startProject,
  type World,
} from '../src/sim/index';

/** A world 1 with the player rich and the given projects finished (material and build skipped). */
function finished(ids: string[], seed = 3): { w: World; me: string } {
  const w = createWorld({ seed, playerName: 'Rocco AG', aiCompanies: 4, difficulty: 'hard' });
  const me = w.playerId!;
  company(w, me).cash = 1e9;
  for (const id of ids) {
    expect(startProject(w, me, id).ok).toBe(true);
    w.projects!.at(-1)!.buildDaysLeft = 1;
    projectsTick(w);
  }
  return { w, me };
}

describe('Welt abschließen', () => {
  it('abschließen nur mit freigeschaltetem, noch nicht erzeugtem Quark', () => {
    const { w } = finished([]);
    expect(closableQuarks(w)).toEqual([]);
    expect(closeWorld(w, 'up').ok).toBe(false);
  });

  it('Abschluss: neue Welt mit neuer Firma, Startkapital, gleichen Einstellungen', () => {
    const { w } = finished(['dock']);
    initStories(w, false);
    expect(closableQuarks(w)).toEqual(['up']);
    const r = closeWorld(w, 'up');
    if (!r.ok) throw new Error(r.error);
    const w2 = r.value;
    const me2 = w2.playerId!;
    expect(w2.day).toBe(0);
    expect(company(w2, me2)).toMatchObject({ name: 'Rocco AG', cash: CONFIG.startCapital });
    expect(company(w2, me2).prestige ?? 0).toBe(0);
    expect(w2.difficulty).toBe('hard');
    expect(w2.companies.filter((c) => !c.isPlayer)).toHaveLength(4);
    expect(w2.stories?.on).toBe(false);
    expect(w2.planets?.length).toBe(21);
    expect(campaignOf(w2).world).toBe(2);
    expect(campaignOf(w2).modules).toEqual([expect.objectContaining({ n: 1, quark: 'up', project: 'dock', firm: 'Rocco AG' })]);
  });

  it('das Abschlussprojekt wirkt global, Prestige zählt einmal, kein neues Freischalten', () => {
    const { w } = finished(['dock']);
    const w2 = (closeWorld(w, 'up') as { ok: true; value: World }).value;
    const me2 = w2.playerId!;
    expect(hasProject(w2, me2, 'dock')).toBe(true);
    expect(projectState(w2, 'dock')?.fromModule).toBe(1);
    expect(campaignValue(w2)).toBe(campaignOf(w2).modules[0]!.index + companyIndex(w2, me2));
    run(w2, 3);
    expect(w2.log.some((l) => l.text.includes('Up-Quark freigeschaltet'))).toBe(false);
    expect(closableQuarks(w2)).toEqual([]);
  });

  it('erzeugtes Quark: Projekt nicht neu startbar, nicht wieder abschließbar', () => {
    const { w } = finished(['dock']);
    const w2 = (closeWorld(w, 'up') as { ok: true; value: World }).value;
    const me2 = w2.playerId!;
    company(w2, me2).cash = 1e9;
    expect(startProject(w2, me2, 'dock').ok).toBe(false);
    expect(startProject(w2, me2, 'yard').ok).toBe(true);
    w2.projects!.at(-1)!.buildDaysLeft = 1;
    projectsTick(w2);
    expect(closableQuarks(w2)).toEqual(['charm']);
  });

  it('laufendes Projekt geht beim Abschluss verloren', () => {
    const { w, me } = finished(['dock']);
    expect(startProject(w, me, 'yard').ok).toBe(true);
    const w2 = (closeWorld(w, 'up') as { ok: true; value: World }).value;
    expect(projectState(w2, 'yard')).toBeUndefined();
  });

  it('sechstes Quark: keine neue Welt, Kampagne vollständig', () => {
    const { w } = finished(['clinic']);
    const mod = (n: number, quark: 'up' | 'down' | 'charm' | 'strange' | 'top', project: string) => ({ n, quark, project, worldName: `Welt ${n}`, firm: 'F', days: 900, index: 1000, facilities: 7, ships: 9, closedDay: 900 });
    w.campaign = { world: 6, modules: [mod(1, 'up', 'dock'), mod(2, 'down', 'dome'), mod(3, 'charm', 'yard'), mod(4, 'strange', 'city'), mod(5, 'top', 'datacenter')], usedNames: [] };
    const r = closeWorld(w, 'bottom');
    expect(r.ok && r.value).toBe(w);
    expect(campaignComplete(w)).toBe(true);
    expect(closableQuarks(w)).toEqual([]);
    expect(campaignOf(w).modules).toHaveLength(6);
  });

  it('Rundreise durch JSON nach dem Abschluss', () => {
    const { w } = finished(['dock']);
    const w2 = (closeWorld(w, 'up') as { ok: true; value: World }).value;
    const back = JSON.parse(JSON.stringify(w2)) as World;
    run(back, 30);
    expect(back.day).toBe(30);
    expect(back.planets).toEqual(w2.planets);
    expect(campaignOf(back).world).toBe(2);
  });

  it('Welt 1 unverändert: gleiche Planeten, gleicher Zufall', () => {
    const w = createWorld({ seed: 1, playerName: 'T', aiCompanies: 10, stories: true });
    expect(w.planets).toBeUndefined();
    expect(w.campaign).toBeUndefined();
    expect(w.rng).toBe(1816413214);
    run(w, 30);
    expect(w.rng).toBe(2646734069);
  });
});

describe('Ganze Kampagne', () => {
  it('fünf echte Abschlüsse hintereinander: jede Welt bekommt neue Namen, die sechste schließt die Kampagne', () => {
    const order: [string, 'up' | 'down' | 'charm' | 'strange' | 'top' | 'bottom'][] = [
      ['dock', 'up'], ['dome', 'down'], ['yard', 'charm'], ['city', 'strange'], ['datacenter', 'top'], ['clinic', 'bottom'],
    ];
    let w = createWorld({ seed: 9, playerName: 'T', aiCompanies: 1 });
    const names = new Set<string>();
    for (const [id, f] of order) {
      const me = w.playerId!;
      company(w, me).cash = 1e9;
      expect(startProject(w, me, id).ok).toBe(true);
      w.projects!.at(-1)!.buildDaysLeft = 1;
      projectsTick(w);
      const r = closeWorld(w, f);
      if (!r.ok) throw new Error(r.error);
      w = r.value;
      for (const p of w.planets ?? []) if (p.id !== 'terra' && campaignOf(w).world > 1 && !campaignComplete(w)) {
        expect(names.has(p.name)).toBe(false);
        names.add(p.name);
      }
    }
    expect(campaignComplete(w)).toBe(true);
    expect(campaignOf(w).modules.map((m) => m.quark)).toEqual(['up', 'down', 'charm', 'strange', 'top', 'bottom']);
  });
});
