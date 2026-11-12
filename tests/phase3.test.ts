// Phase 3: the parts of the touch UI that are pure logic – exchange notifications, the chain graph and
// the star map's planet panel. Canvas drawing, gestures and IndexedDB are checked in the browser.
import { describe, expect, it } from 'vitest';
import { FACILITIES, GOODS, PLANETS, assignShip, buyFacility, buyShip, facilitiesOf, startFacility, takeLoan, type Demand, type World } from '../src/sim/index';
import { CHAIN_EDGES, chainDetail, chainLayout, chainSvg, goodRoles } from '../src/ui/chain';
import { planetInfo } from '../src/ui/mapinfo';
import { fittingOffers, newOffers } from '../src/ui/play';
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
