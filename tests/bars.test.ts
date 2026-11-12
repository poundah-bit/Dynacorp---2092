import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/sim/index';
import { bar, deadlineRatio, deadlineTone, facilityConditionTone, shipConditionTone, stockTone } from '../src/ui/format';

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
  it('deadlineTone and deadlineRatio', () => {
    expect(deadlineTone(0, 0, 10)).toBe('neutral');
    expect(deadlineTone(6, 0, 10)).toBe('warn');
    expect(deadlineTone(11, 0, 10)).toBe('bad');
    expect(deadlineTone(5, 5, 5)).toBe('warn');
    expect(deadlineRatio(5, 5, 5)).toBe(0);
    expect(deadlineRatio(0, 0, 10)).toBe(1);
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
