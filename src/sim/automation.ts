// Logistikzentrale: an expensive endgame upgrade in three levels that unlocks Lieferrouten – automatic
// deliveries from an own plant to another own plant with a fixed Linienschiff. A route only calls the
// same actions a player would (postDemand with an own supplier, own transport, assignShip).

import { CONFIG, TERRA, facilityDef, good, planet, shipDef, unitOf } from './data';
import { debt, type Result } from './actions';
import type { Route, World } from './types';
import { company, facilitiesOf, facility, lineRoute, log, newId, pay, ship, storageCapacity } from './world';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const LEVEL_NAMES = ['I', 'II', 'III'];
export const automationName = (level: number) => `Logistikzentrale ${LEVEL_NAMES[level - 1] ?? level}`;

export const automationLevel = (w: World, c: string) => company(w, c).automation ?? 0;
export const routeLimit = (w: World, c: string) => {
  const l = automationLevel(w, c);
  return l ? CONFIG.automation.levels[l - 1]!.routes : 0;
};

/** The next level to buy, or null when fully built. */
export function nextAutomation(w: World, c: string): { price: number; routes: number; level: number } | null {
  const l = automationLevel(w, c);
  const next = CONFIG.automation.levels[l];
  return next ? { ...next, level: l + 1 } : null;
}

export function buyAutomation(w: World, c: string): Result<number> {
  const co = company(w, c);
  if (co.bankrupt) return fail(`${co.name} ist bankrott.`);
  const next = nextAutomation(w, c);
  if (!next) return fail('Die Logistikzentrale ist voll ausgebaut.');
  if (facilitiesOf(w, c).length < CONFIG.automation.minFacilities) return fail(`Erst ab ${CONFIG.automation.minFacilities} eigenen Anlagen.`);
  if (debt(w, c) > 0) return fail('Nur schuldenfrei – zahle zuerst alle Kredite zurück.');
  if (co.cash < next.price) return fail(`Nicht genug Barkapital (${next.price} Cr benötigt).`);
  pay(w, c, null, next.price);
  co.automation = next.level;
  log(w, c, `${automationName(next.level)} eröffnet – ${next.routes} ${next.routes === 1 ? 'Lieferroute' : 'Lieferrouten'} möglich.`, 3);
  return ok(next.level);
}

// ---------- routes ----------

export interface RouteInput {
  from: string;
  to: string;
  good: string;
  ship: string;
  amount?: number;
  refillBelow?: number;
}

/** Goods the source makes that the target needs. */
export function routeGoods(w: World, from: string, to: string): string[] {
  const a = facility(w, from);
  const b = facility(w, to);
  if (!a || !b) return [];
  const needs = facilityDef(b.type).inputs;
  return Object.keys(facilityDef(a.type).outputs).filter((g) => g in needs);
}

const routesOf = (w: World, c: string) => (w.routes ?? []).filter((r) => r.owner === c);
export const routeName = (w: World, r: { from: string; to: string }) => {
  const name = (id: string) => planet(facility(w, id)?.planet ?? TERRA).name;
  return `${name(r.from)} → ${name(r.to)}`;
};

export function addRoute(w: World, c: string, input: RouteInput): Result<Route> {
  const limit = routeLimit(w, c);
  if (!limit) return fail('Erst die Logistikzentrale kaufen.');
  if (routesOf(w, c).length >= limit) return fail(`Höchstens ${limit} ${limit === 1 ? 'Lieferroute' : 'Lieferrouten'} – baue die Logistikzentrale aus.`);
  const from = facility(w, input.from);
  const to = facility(w, input.to);
  if (!from || !to || from.owner !== c || to.owner !== c) return fail('Quelle und Ziel müssen eigene Anlagen sein.');
  if (from.id === to.id) return fail('Quelle und Ziel müssen verschieden sein.');
  if (from.status === 'construction' || to.status === 'construction') return fail('Die Anlage ist noch im Bau.');
  if (!routeGoods(w, from.id, to.id).includes(input.good)) return fail(`${planet(to.planet).name} braucht keine Ware von ${planet(from.planet).name}.`);
  const s = ship(w, input.ship);
  if (!s || s.owner !== c) return fail('Schiff nicht gefunden.');
  const def = shipDef(s.model);
  const g = good(input.good);
  if (def.cargo !== g.cargo) return fail(`${def.name} transportiert kein ${g.name}.`);
  if (lineRoute(w, s.id)) return fail('Das Schiff ist schon Linienschiff einer anderen Lieferroute.');
  const cap = storageCapacity(to, input.good);
  const amount = Math.round(input.amount ?? Math.min(def.capacity, cap));
  if (amount <= 0) return fail('Menge muss positiv sein.');
  if (amount > def.capacity) return fail(`Höchstens ${def.capacity} ${unitOf(input.good)} – so viel fasst ${def.name}.`);
  if (amount > cap) return fail(`Höchstens ${cap} ${unitOf(input.good)} – so viel fasst das Lager am Ziel.`);
  const refillBelow = Math.round(input.refillBelow ?? cap / 2);
  if (refillBelow <= 0 || refillBelow > cap) return fail('Die Nachschubgrenze muss zwischen 1 und der Lagergröße am Ziel liegen.');
  const r: Route = { id: newId(w, 'r'), owner: c, from: from.id, to: to.id, good: input.good, amount, refillBelow, ship: s.id, active: true, status: 'Wartet auf den nächsten Tag', demand: null, trips: 0, delivered: 0 };
  (w.routes ??= []).push(r);
  log(w, c, `Neue Lieferroute ${routeName(w, r)}: ${g.name}, ${def.name} fährt ab jetzt als Linienschiff.`, 2);
  return ok(r);
}

const ownRoute = (w: World, c: string, id: string) => (w.routes ?? []).find((r) => r.id === id && r.owner === c);

export function setRouteActive(w: World, c: string, routeId: string, on: boolean): Result<undefined> {
  const r = ownRoute(w, c, routeId);
  if (!r) return fail('Lieferroute nicht gefunden.');
  if (on && !r.active) {
    const other = lineRoute(w, r.ship);
    if (other) return fail('Das Linienschiff fährt schon eine andere Lieferroute.');
  }
  r.active = on;
  r.status = on ? 'Wartet auf den nächsten Tag' : 'Pausiert';
  return ok(undefined);
}

export function removeRoute(w: World, c: string, routeId: string): Result<undefined> {
  const r = ownRoute(w, c, routeId);
  if (!r) return fail('Lieferroute nicht gefunden.');
  w.routes = (w.routes ?? []).filter((x) => x !== r);
  log(w, c, `Lieferroute ${routeName(w, r)} aufgelöst.`);
  return ok(undefined);
}
