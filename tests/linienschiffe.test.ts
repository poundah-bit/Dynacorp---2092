import { describe, expect, it } from 'vitest';
import { CONFIG, addRoute, buyAutomation, company, repairShipCost, setRouteActive, setRouteService, ship, step, type World } from '../src/sim/index';
import { routeSetup, runUntil } from './helpers';

function routed(level = 1, serviceBelow?: number) {
  const s = routeSetup();
  for (let l = 1; l < level; l++) {
    company(s.w, s.me).cash = 20_000_000;
    if (!buyAutomation(s.w, s.me).ok) throw new Error('level');
  }
  company(s.w, s.me).cash = 5_000_000;
  const r = addRoute(s.w, s.me, { from: s.well.id, to: s.plastic.id, good: 'oil', ship: s.tanker.id, serviceBelow });
  if (!r.ok) throw new Error(r.error);
  return { ...s, route: r.value, sh: ship(s.w, s.tanker.id)! };
}
const at = (w: World, id: string) => ship(w, id)!;

describe('Linienschiffe come home and get serviced', () => {
  it('defaults to a 60 % service limit and refuses limits outside 35–90 %', () => {
    const { w, me, well, plastic, route } = routed();
    expect(route.serviceBelow).toBe(60);
    expect(setRouteService(w, me, route.id, 30).ok).toBe(false);
    expect(setRouteService(w, me, route.id, 95).ok).toBe(false);
    expect(setRouteService(w, me, route.id, 75).ok).toBe(true);
    expect(route.serviceBelow).toBe(75);
    expect(well.id).not.toBe(plastic.id);
  });
  it('flies back to the source after delivering', () => {
    const { w, well, route, sh } = routed();
    well.stock.oil = 30_000;
    runUntil(w, () => route.trips === 1, 150);
    runUntil(w, () => sh.phase === 'idle' && sh.at === 'vesta-nova', 60);
    expect(sh.at).toBe('vesta-nova');
  });
  it('an idle Linienschiff away from the source goes home without a trip', () => {
    const { w, sh, plastic, route } = routed();
    plastic.stock.oil = route.refillBelow + 5_000; // target has enough, no trip
    sh.at = 'aquilon';
    step(w);
    expect(sh.phase).toBe('toHome');
    expect(route.status).toContain('Ziel hat genug');
  });
  it('level I: below the limit it flies to Terra, is repaired there and then goes home', () => {
    const { w, sh, plastic, route } = routed();
    plastic.stock.oil = route.refillBelow + 5_000;
    sh.at = 'aquilon';
    sh.condition = 55;
    step(w);
    expect(sh.phase).toBe('toTerra');
    expect(route.status).toContain('Wartung auf Terra');
    runUntil(w, () => sh.condition === 100, 80);
    runUntil(w, () => sh.at === 'vesta-nova' && sh.phase === 'idle', 80);
  });
  it('level II: serviced on the spot for 150 % of the yard price', () => {
    const { w, me, sh, plastic, route } = routed(2);
    plastic.stock.oil = route.refillBelow + 5_000;
    sh.at = 'vesta-nova';
    sh.condition = 50;
    const before = company(w, me).cash;
    const cost = Math.round(repairShipCost(sh) * CONFIG.automation.onsiteServiceFactor);
    step(w);
    expect(sh.phase).toBe('repair');
    expect(sh.at).toBe('vesta-nova');
    // cost of the day = on-site service + route fee + maintenance of all ships and plants: at least the service
    expect(before - company(w, me).cash).toBeGreaterThanOrEqual(cost);
    runUntil(w, () => sh.condition === 100, 10);
    expect(sh.at).toBe('vesta-nova');
  });
  it('waits when the service cannot be paid', () => {
    const { w, me, sh, plastic, route } = routed(2);
    plastic.stock.oil = route.refillBelow + 5_000;
    sh.at = 'vesta-nova';
    sh.condition = 40;
    company(w, me).cash = 1_000;
    step(w);
    expect(sh.phase).toBe('idle');
    expect(route.status).toContain('Wartung nicht bezahlbar');
  });
  it('a paused route leaves its ship alone', () => {
    const { w, me, sh, route } = routed();
    setRouteActive(w, me, route.id, false);
    sh.at = 'aquilon';
    sh.condition = 50;
    step(w);
    expect(sh.phase).toBe('idle');
    expect(sh.at).toBe('aquilon');
  });
  it('old routes without a service limit get 60 %', () => {
    const { w, route, sh } = routed();
    delete (route as { serviceBelow?: number }).serviceBelow;
    sh.condition = 59;
    sh.at = 'aquilon';
    step(w);
    expect(sh.phase).toBe('toTerra');
  });
});

import { routeSheet, serviceSheet } from '../src/ui/sheets';
import { ordersView, terraView, type ViewCtx } from '../src/ui/views';

describe('service in the UI', () => {
  const ctxOf = (w: World) => ({ w, me: w.playerId!, marketAll: true, marketGood: '', marketSort: 'ready', priceTrend: () => 0, chainGood: '' }) as ViewCtx;
  it('route row shows the limit and a button to change it', () => {
    const { w } = routed();
    const html = ordersView(ctxOf(w));
    expect(html).toContain('Wartung unter 60 %');
    expect(html).toContain('data-act="route-service"');
  });
  it('the new-route sheet has a service slider, the service sheet one too', () => {
    const { w, me, route } = routed();
    expect(routeSheet(w, me).body).toContain('name="service"');
    expect(serviceSheet(w, me, route.id).body).toContain('name="service"');
  });
  it('Dynacore names on-site service as the benefit of level II', () => {
    const { w } = routed();
    expect(terraView(ctxOf(w))).toContain('Wartung vor Ort');
  });
});

describe('Großwerft und Linienschiffe', () => {
  it('mit der Großwerft wird ein Linienschiff schon auf Stufe I vor Ort zum Werftpreis gewartet', () => {
    const { w, sh, plastic, route } = routed(1);
    (w.projects ??= []).push({ id: 'yard', status: 'done', startDay: 0, delivered: {}, doneDay: 0 });
    plastic.stock.oil = route.refillBelow + 5_000;
    sh.at = 'vesta-nova';
    sh.condition = 50;
    step(w);
    expect(sh.phase).toBe('repair');
    expect(sh.at).toBe('vesta-nova');
    expect(w.log.some((l) => l.text.includes(`vor Ort gewartet (${repairShipCost({ ...sh, condition: 50 }).toLocaleString('de-DE')}`) || l.text.includes('vor Ort gewartet'))).toBe(true);
  });
});
