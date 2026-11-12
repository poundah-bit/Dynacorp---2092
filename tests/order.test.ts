import { describe, expect, it } from 'vitest';
import { applyOrder, moveTo } from '../src/ui/order';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('order', () => {
  it('sorts by the saved order, unknown items keep their place at the end', () => {
    expect(ids(applyOrder(items, ['c', 'a'], (x) => x.id))).toEqual(['c', 'a', 'b']);
    expect(ids(applyOrder(items, [], (x) => x.id))).toEqual(['a', 'b', 'c']);
    expect(ids(applyOrder(items, ['gone', 'b'], (x) => x.id))).toEqual(['b', 'a', 'c']);
  });
  it('moves an id to a position and drops ids that no longer exist', () => {
    expect(moveTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveTo(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveTo(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
    expect(moveTo(['a', 'b', 'c'], 'b', -5)).toEqual(['b', 'a', 'c']);
    expect(moveTo(['a', 'b'], 'x', 0)).toEqual(['a', 'b']);
  });
});

import { parseOrder } from '../src/ui/order';
describe('saved order', () => {
  it('old saves and broken data give the default; all five cargo groups always present', () => {
    expect(parseOrder(undefined)).toEqual({ facilities: [], cargo: ['tank', 'bulk', 'piece', 'cooled', 'live'] });
    expect(parseOrder({ facilities: ['f1', 3], cargo: ['live', 'x', 'tank'] })).toEqual({ facilities: ['f1'], cargo: ['live', 'tank', 'bulk', 'piece', 'cooled'] });
  });
});

import { facilitiesOf } from '../src/sim/index';
import { facilitiesView, fleetView, type ViewCtx } from '../src/ui/views';
import { oilWellWithTanker, player, soloWorld } from './helpers';

const ctxOf = (w: ReturnType<typeof soloWorld>, order?: ViewCtx['order']): ViewCtx => ({ w, me: player(w), marketAll: true, marketGood: '', marketSort: 'ready', priceTrend: () => 0, chainGood: '', order });
const pos = (html: string, needle: string) => html.indexOf(needle);

describe('views follow the order', () => {
  it('fleet groups in the saved order, each with a drag handle', () => {
    const w = soloWorld();
    oilWellWithTanker(w); // a piece freighter and a tanker
    const def = fleetView(ctxOf(w));
    expect(pos(def, 'data-drag-item="tank"')).toBeLessThan(pos(def, 'data-drag-item="piece"'));
    const mine = fleetView(ctxOf(w, { facilities: [], cargo: ['piece', 'tank', 'bulk', 'cooled', 'live'] }));
    expect(pos(mine, 'data-drag-item="piece"')).toBeLessThan(pos(mine, 'data-drag-item="tank"'));
    expect(mine).toContain('data-drag="cargo"');
  });
  it('facility cards in the saved order, each with a drag handle', () => {
    const w = soloWorld();
    const me = player(w);
    oilWellWithTanker(w);
    const [well] = facilitiesOf(w, me);
    const fake = { ...well!, id: 'f-second', planet: 'aquilon', type: 'waterstation' };
    w.facilities.push(fake);
    const def = facilitiesView(ctxOf(w));
    expect(pos(def, `data-drag-item="${well!.id}"`)).toBeLessThan(pos(def, 'data-drag-item="f-second"'));
    const mine = facilitiesView(ctxOf(w, { facilities: ['f-second'], cargo: [] }));
    expect(pos(mine, 'data-drag-item="f-second"')).toBeLessThan(pos(mine, `data-drag-item="${well!.id}"`));
    expect(mine).toContain('data-drag="facility"');
  });
});

import { reorderVisible } from '../src/ui/order';
describe('hidden groups keep their place', () => {
  it('only the visible slots get the new order', () => {
    expect(reorderVisible(['tank', 'bulk', 'piece', 'cooled', 'live'], ['piece', 'tank'])).toEqual(['piece', 'bulk', 'tank', 'cooled', 'live']);
    expect(reorderVisible(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });
});
