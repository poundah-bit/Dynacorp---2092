// Phase 3: the parts of the touch UI that are pure logic – exchange notifications, the chain graph and
// the star map's planet panel. Canvas drawing, gestures and IndexedDB are checked in the browser.
import { describe, expect, it } from 'vitest';
import { FACILITIES, GOODS, PLANETS, assignShip, buyFacility, buyShip, facilitiesOf, startFacility, takeLoan, type Demand, type World } from '../src/sim/index';
import { CHAIN_EDGES, chainDetail, chainLayout, chainSvg, goodRoles } from '../src/ui/chain';
import { planetInfo } from '../src/ui/mapinfo';
import { companyName, deliverableDemands, ensureStories, fittingOffers, newGame, newOffers, startedStories } from '../src/ui/play';
import { projectsCard, quarkCard, storyCard } from '../src/ui/views';
import { deliverSheet } from '../src/ui/sheets';
import { storyPlanets } from '../src/ui/mapfx';
import { company, initStories, newQuark, projectsTick, run, startProject, startStory } from '../src/sim/index';
import { oilWellWithTanker, player, runUntil, soloWorld, terraOilDemand } from './helpers';

describe('Benachrichtigung bei passenden Aufträgen', () => {
  it('meldet eine Nachfrage nur, wenn Ware auf Lager und ein freies Schiff der Frachtart da ist', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const d = terraOilDemand(w, 2000);
    // nothing on stock yet
    well.stock.oil = 0;
    expect(fittingOffers(w, me).some((o) => o.id === d.id)).toBe(false);
    well.stock.oil = 5000;
    expect(fittingOffers(w, me).find((o) => o.id === d.id)?.text).toContain('Erdöl');
    // the tanker is away: no notification
    for (const s of w.ships.filter((x) => x.owner === me)) s.phase = 'toPickup';
    expect(fittingOffers(w, me).some((o) => o.id === d.id)).toBe(false);
  });

  it('meldet jedes Angebot nur einmal', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    well.stock.oil = 8000;
    w.demands = w.demands.filter((d) => d.good !== 'oil');
    const seen = new Set<string>();
    const a = terraOilDemand(w, 2000);
    expect(newOffers(w, me, seen).map((o) => o.id)).toEqual([a.id]);
    seen.add(a.id);
    expect(newOffers(w, me, seen)).toEqual([]);
    const b = terraOilDemand(w, 3000);
    expect(newOffers(w, me, seen).map((o) => o.id)).toEqual([b.id]);
  });
});

describe('Warenketten', () => {
  it('ordnet jede Ware genau einmal an: Rohstoffe links, Endprodukte rechts, keine Überlappung', () => {
    const nodes = chainLayout();
    expect(nodes.map((n) => n.id).sort()).toEqual(GOODS.map((g) => g.id).sort());
    const last = Math.max(...nodes.map((n) => n.col));
    for (const n of nodes) {
      const tier = GOODS.find((g) => g.id === n.id)!.tier;
      if (tier === 'raw') expect(n.col).toBe(0);
      if (tier === 'final') expect(n.col).toBe(last);
      if (tier === 'intermediate') expect(n.col).toBeGreaterThan(0);
    }
    const spots = new Set(nodes.map((n) => `${n.col}|${n.row}`));
    expect(spots.size).toBe(nodes.length);
  });

  it('jede Kante läuft von links nach rechts', () => {
    const col = new Map(chainLayout().map((n) => [n.id, n.col]));
    for (const e of CHAIN_EDGES) expect(col.get(e.to)!).toBeGreaterThan(col.get(e.from)!);
    expect(CHAIN_EDGES.length).toBe(FACILITIES.reduce((s, f) => s + Object.keys(f.inputs).length * Object.keys(f.outputs).length, 0));
  });

  it('zeigt eigene Produkte, Bedarf und fehlende Rohstoffe', () => {
    const w = soloWorld();
    const me = player(w);
    oilWellWithTanker(w);
    const roles = goodRoles(w, me);
    expect(roles.oil!.produce).toBe(true);
    expect(roles.fuel!.produce).toBe(false);
    const svg = chainSvg(w, me, 'oil', () => 0);
    expect(svg.match(/data-act="chain-good"/g)).toHaveLength(GOODS.length);
    expect(svg).toContain('class="node raw mine sel"');
    const detail = chainDetail(w, me, 'oil');
    expect(detail).toContain('Ölförderanlage');
    expect(detail).toContain('Raffinerie');
    expect(detail).toContain('davon 1 deine');
  });
});

describe('Sternkarte: Planeten-Infos', () => {
  it('Terra führt zu Bank und Werft, ein Planet bietet seine Anlage zum Kauf an', () => {
    const w = soloWorld();
    const me = player(w);
    expect(planetInfo(w, me, 'terra')).toContain('data-a="terra"');
    const oil = PLANETS.find((p) => p.facility === 'oilwell')!;
    const html = planetInfo(w, me, oil.id);
    expect(html).toContain(`data-act="buy-facility" data-a="oilwell|${oil.id}"`);
    expect(html).toContain('Du hast hier noch nichts.');
  });

  it('warnt in der Gravo-Sturm-Zone', () => {
    const w = soloWorld();
    expect(planetInfo(w, player(w), 'automa')).toContain('Gravo-Sturm-Zone');
    expect(planetInfo(w, player(w), 'vesta-nova')).not.toContain('Gravo-Sturm-Zone');
  });
});

describe('Story-Ereignisse in der Oberfläche', () => {
  it('die Lage zeigt laufende Ereignisse mit Ort und Waren', () => {
    const w = soloWorld();
    expect(storyCard(w)).toBe('');
    initStories(w, true);
    w.stories!.nextDay = 1e9;
    startStory(w, 'seuche', 'liora');
    run(w, 5);
    const html = storyCard(w);
    expect(html).toContain('Lage in der Galaxie');
    expect(html).toContain('Liora');
    expect(html).toContain('Medikamente');
    expect(html).toContain('Sonderpreis');
  });

  it('Planeten-Aufträge heißen „Bevölkerung von …“', () => {
    expect(companyName(soloWorld(), 'world:liora')).toBe('Bevölkerung von Liora');
  });

  it('der Schalter „Ereignisse“ aus bleibt aus – auch nach dem Laden', () => {
    const w = newGame('Testfirma', 'med', 7, 3, false);
    ensureStories(w);
    expect(w.stories?.on).toBe(false);
    run(w, 200);
    expect(w.stories!.events).toEqual([]);
  });

  it('alte Spielstände bekommen Ereignisse', () => {
    const w = soloWorld();
    expect(w.stories).toBeUndefined();
    ensureStories(w);
    expect(w.stories?.on).toBe(true);
    expect(w.stories?.lore.liora?.city).toBeTruthy();
    run(w, 100);
    ensureStories(w); // a second call changes nothing
    expect(w.day).toBe(100);
  });

  it('neue Lage meldet nur Ereignisse, die heute beginnen', () => {
    const w = soloWorld();
    initStories(w, true);
    w.stories!.nextDay = 1e9;
    const e = startStory(w, 'seuche', 'liora');
    expect(startedStories(w, w.day).map((x) => x.id)).toEqual([e.id]);
    run(w, 1);
    expect(startedStories(w, w.day)).toEqual([]);
    expect(storyPlanets(w).has('liora')).toBe(true);
  });
});

describe('Großprojekte und Quark-Trend in der Oberfläche', () => {
  const richWorld = () => {
    const w = soloWorld();
    const me = player(w);
    company(w, me).cash = 2e8;
    return { w, me };
  };

  it('eigene Projekt-Aufträge erscheinen an der Börse zum Liefern', () => {
    const { w, me } = richWorld();
    w.facilities.push({ id: 'f-pp', owner: me, type: 'plasticplant', planet: 'sulcis', units: 1, status: 'running', buildDaysLeft: 0, condition: 100, stock: { plastic: 40_000 }, reserved: {}, storages: [], idleDays: 0 });
    expect(startProject(w, me, 'dock').ok).toBe(true);
    projectsTick(w);
    const mine = deliverableDemands(w, me).filter((o) => o.d.project === 'dock');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((o) => o.d.good === 'plastic')).toBe(true);
  });

  it('der Liefern-Dialog verspricht für die eigene Baustelle keinen Erlös', () => {
    const { w, me } = richWorld();
    w.facilities.push({ id: 'f-pp', owner: me, type: 'plasticplant', planet: 'sulcis', units: 1, status: 'running', buildDaysLeft: 0, condition: 100, stock: { plastic: 40_000 }, reserved: {}, storages: [], idleDays: 0 });
    expect(startProject(w, me, 'dock').ok).toBe(true);
    projectsTick(w);
    const d = w.demands.find((x) => x.project === 'dock' && x.good === 'plastic')!;
    const body = deliverSheet(w, me, d.id).body;
    expect(body).toContain('eigene Baustelle');
    expect(body).not.toContain('Erlös bei Ankunft');
    expect(body).not.toContain('Strafe');
  });

  it('die Projektkarte zeigt Angebote und den Fortschritt', () => {
    const { w, me } = richWorld();
    expect(projectsCard(w, me)).toContain('Orbitaldock Terra');
    expect(projectsCard(w, me)).toContain('Starten');
    expect(startProject(w, me, 'yard').ok).toBe(true);
    w.projects![0]!.delivered.steel = 16_000;
    const html = projectsCard(w, me);
    expect(html).toContain('Stahl');
    expect(html).toContain('Abbrechen');
    expect(html).toContain('role="meter"');
  });

  it('die Quark-Karte zeigt sechs Felder', () => {
    const { w } = richWorld();
    w.quark = newQuark('trend');
    w.quark.energy.charm = 3_500_000;
    const html = quarkCard(w);
    for (const n of ['Up', 'Down', 'Charm', 'Strange', 'Top', 'Bottom']) expect(html).toContain(n);
    expect(html).toContain('50 %');
  });

  it('der Quark-Modus wird beim neuen Spiel gesetzt', () => {
    expect(newGame('T', 'med', 1, 1, true, 'project').quark?.mode).toBe('project');
    expect(newGame('T', 'med', 1, 1).quark?.mode).toBe('trend');
  });
});
