import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/index';
import { bar, deadlineShare, deadlineTone, facilityStatus, facilityConditionTone, shipConditionTone, stockTone } from '../src/ui/format';

describe('tone rules', () => {
  it('stockTone: inputs run empty, outputs run full', () => {
    expect(stockTone(true, 0.05)).toBe('bad');
    expect(stockTone(true, 0.2)).toBe('warn');
    expect(stockTone(true, 0.5)).toBe('neutral');
    expect(stockTone(false, 0.95)).toBe('bad');
    expect(stockTone(false, 0.8)).toBe('warn');
    expect(stockTone(false, 0.5)).toBe('neutral');
  });
  it('facilityConditionTone', () => {
    expect(facilityConditionTone(80)).toBe('good');
    expect(facilityConditionTone(CONFIG.facilities.repairBelow - 1)).toBe('warn');
    expect(facilityConditionTone(29)).toBe('bad');
  });
  it('shipConditionTone', () => {
    expect(shipConditionTone(60)).toBe('good');
    expect(shipConditionTone(49)).toBe('warn');
    expect(shipConditionTone(CONFIG.ships.criticalBelow - 1)).toBe('bad');
  });
  it('deadlineTone counts absolute days left, deadlineShare fills against a 30-day scale', () => {
    expect(deadlineTone(0, 10)).toBe('neutral');
    expect(deadlineTone(7, 10)).toBe('warn');
    expect(deadlineTone(11, 10)).toBe('bad');
    expect(deadlineShare(0, 30)).toBe(1);
    expect(deadlineShare(0, 15)).toBe(0.5);
    expect(deadlineShare(5, 5)).toBe(0);
    expect(deadlineShare(9, 5)).toBe(0);
  });
});

describe('bar', () => {
  it('renders an accessible meter', () => {
    const b = bar({ value: 30, max: 100, tone: 'warn', label: 'Erdöl' });
    for (const part of ['role="meter"', 'aria-valuenow="30"', 'aria-valuemax="100"', 'aria-label="Erdöl"', 'class="bar warn"', 'width:30%']) expect(b).toContain(part);
  });
  it('max 0 gives an empty bar, never NaN', () => {
    const b = bar({ value: 5, max: 0, tone: 'neutral', label: 'x' });
    expect(b).toContain('width:0%');
    expect(b).not.toContain('NaN');
  });
  it('clamps at 100 %', () => {
    expect(bar({ value: 150, max: 100, tone: 'bad', label: 'x' })).toContain('width:100%');
  });
  it('shows reserved inside and incoming after the fill', () => {
    const r = bar({ value: 30, max: 100, reserved: 20, tone: 'neutral', label: 'x' });
    expect(r).toMatch(/class="bar-res" style="[^"]*width:20%/);
    const i = bar({ value: 30, max: 100, incoming: 10, tone: 'neutral', label: 'x' });
    expect(i).toContain('class="bar-in" style="left:30%;width:10%"');
    const full = bar({ value: 95, max: 100, incoming: 40, tone: 'neutral', label: 'x' });
    expect(full).toContain('left:95%;width:5%');
  });
});

import { ICONS } from '../src/ui/icons';
import { planetInfo } from '../src/ui/mapinfo';
import { facilitiesView, fleetView, marketView, ordersView, type ViewCtx } from '../src/ui/views';
import { oilWellWithTanker, player, soloWorld } from './helpers';
import type { World } from '../src/sim/index';

export const ctx = (w: World): ViewCtx => ({ w, me: player(w), marketAll: true, marketGood: '', marketSort: 'ready', priceTrend: () => 0, chainGood: '' });
const meters = (html: string, label: string) => html.split(`aria-label="${label}"`).length - 1;

describe('facility view', () => {
  it('shows a condition bar, a stock bar per good and the facility icon', () => {
    const w = soloWorld();
    oilWellWithTanker(w);
    const html = facilitiesView(ctx(w));
    expect(meters(html, 'Zustand')).toBe(1);
    expect(meters(html, 'Erdöl')).toBe(1);
    expect(html).toContain(ICONS.oilwell[0]);
    expect(planetInfo(w, player(w), 'vesta-nova')).toContain(ICONS.oilwell[0]);
  });
});

import { assignShip, buyFacility, buyShip, shipsOf, takeLoan } from '../src/sim/index';
import { cargoIcon } from '../src/ui/format';
import { runUntil } from './helpers';

describe('fleet view', () => {
  it('cargo icons are svg, not emoji', () => {
    const c = cargoIcon('tank');
    expect(c).toContain('<svg');
    expect(c).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it('shows condition always, load and flight bars only while travelling', () => {
    const w = soloWorld();
    const me = player(w);
    expect(takeLoan(w, me, 1_000_000, 2).ok).toBe(true);
    const t = buyFacility(w, me, 'oilwell', 'vesta-nova');
    if (!t.ok) throw new Error(t.error);
    const s = buyShip(w, me, 'piece-a');
    if (!s.ok) throw new Error(s.error);
    let html = fleetView(ctx(w));
    expect(meters(html, 'Zustand')).toBe(1);
    expect(meters(html, 'Flug')).toBe(0);
    expect(meters(html, 'Laderaum')).toBe(0);
    expect(assignShip(w, me, s.value.id, t.value.id).ok).toBe(true);
    runUntil(w, () => shipsOf(w, me)[0]!.phase === 'toDelivery');
    html = fleetView(ctx(w));
    expect(meters(html, 'Flug')).toBe(1);
    expect(meters(html, 'Laderaum')).toBe(1);
    expect(html).toContain('noch ');
  });
});

import { acceptDemand, facilitiesOf } from '../src/sim/index';
import { terraOilDemand } from './helpers';

describe('market and orders view', () => {
  it('market rows carry the cargo icon and mark big Terra orders', () => {
    const w = soloWorld();
    oilWellWithTanker(w);
    const d = terraOilDemand(w, 500);
    d.big = true;
    const html = marketView(ctx(w));
    expect(html).toContain(ICONS.tank[0]);
    expect(html).toContain(ICONS.bigOrder[0]);
    expect(html).toContain('Großauftrag');
  });
  it('a promised delivery shows a deadline bar that turns red when overdue', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    const d = terraOilDemand(w, 500);
    expect(acceptDemand(w, me, d.id, well.id).ok).toBe(true);
    let html = ordersView(ctx(w));
    expect(meters(html, 'Frist')).toBeGreaterThanOrEqual(1);
    w.day = d.deadlineDay + 2;
    html = ordersView(ctx(w));
    expect(html).toMatch(/class="bar bad"[^>]*aria-label="Frist"><span class="bar-fill" style="width:100%"/);
    expect(facilitiesOf(w, me).length).toBe(1);
  });
});

import { storageCapacity, type Transport } from '../src/sim/index';
import { areaStats } from '../src/ui/play';

describe('review fixes', () => {
  it('a demand accepted long after it was posted starts with a calm deadline bar', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    const d = terraOilDemand(w, 500);
    d.createdDay = w.day - 200;
    expect(acceptDemand(w, me, d.id, well.id).ok).toBe(true);
    expect(d.deadlineDay - w.day).toBeGreaterThan(3);
    expect(ordersView(ctx(w))).toMatch(/class="bar neutral"[^>]*aria-label="Frist"/);
  });
  it('an own order nobody took yet has no deadline bar', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    const d = terraOilDemand(w, 500);
    Object.assign(d, { requester: me, own: true, toPlanet: well.planet, toFacility: well.id, deadlineDay: w.day - 5 });
    const html = ordersView(ctx(w));
    expect(html).toContain('Erdöl');
    expect(meters(html, 'Frist')).toBe(0);
  });
  it('a running plant that produces nothing is shown as standing still', () => {
    const w = soloWorld();
    const well = oilWellWithTanker(w);
    well.stock.oil = storageCapacity(well, 'oil');
    expect(areaStats(w, player(w)).facilities.stopped).toBe(1);
    expect(facilityStatus(well)).toMatchObject({ text: 'Steht still', cls: 'bad', icon: 'stopped' });
  });
  it('the exchange header counts the transports the list shows', () => {
    const w = soloWorld();
    const t = { id: 't-x', issuer: 'someone', kind: 'goods', good: 'livestock', asset: null, amount: 100, cargo: 'live', fromPlanet: 'terra', fromFacility: null, toPlanet: 'vesta-nova', fee: 1000, own: false, demand: null, carrier: null, ship: null, status: 'open', createdDay: w.day, deadlineDay: w.day + 30, late: false } as Transport;
    w.transports.push(t);
    expect(areaStats(w, player(w)).market.transports).toBe(0);
  });
  it('critical ships are not counted as free and condition text follows the bar colour', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    const tanker = shipsOf(w, me).find((s) => s.model === 'tank-a')!;
    tanker.condition = CONFIG.ships.criticalBelow - 1;
    const s = areaStats(w, me).fleet;
    expect(s.idle).toBe(shipsOf(w, me).filter((x) => x.phase === 'idle').length - 1);
    tanker.condition = 40;
    expect(fleetView(ctx(w))).toContain('Zustand <span class="warn">40,00 %');
    well.condition = 50;
    expect(facilitiesView(ctx(w))).toContain('Zustand <b class="warn">50,00 %');
  });
  it('a loading ship says so in its badge', () => {
    const w = soloWorld();
    const me = player(w);
    oilWellWithTanker(w);
    const tanker = shipsOf(w, me).find((s) => s.model === 'tank-a')!;
    tanker.phase = 'loading';
    expect(fleetView(ctx(w))).toMatch(/class="badge[^"]*">[^<]*<svg[\s\S]*?<\/svg> lädt</);
  });
});
