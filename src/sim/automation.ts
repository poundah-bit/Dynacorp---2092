// Logistikzentrale: an expensive endgame upgrade in three levels that unlocks Lieferrouten – automatic
// deliveries from an own plant to another own plant with a fixed Linienschiff. A route only calls the
// same actions a player would (postDemand with an own supplier, own transport, assignShip).

import { CONFIG, TERRA, facilityDef, good, planet, shipDef, unitOf } from './data';
import { assignShip, debt, incoming, postDemand, postTransportForDemand, setRepairAtTerra, type Result } from './actions';
import type { Route, World } from './types';
import { available, company, facilitiesOf, facility, freeCapacity, isCritical, lineRoute, log, newId, pay, ship, storageCapacity } from './world';

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

// ---------- daily tick ----------

const fmt = (x: number) => new Intl.NumberFormat('de-DE').format(Math.round(x));

/** Takes back an own trip that could not be set up completely (reservation, demand, transport). */
function undoTrip(w: World, demandId: string) {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return;
  const src = d.supplierFacility ? facility(w, d.supplierFacility) : undefined;
  if (src) src.reserved[d.good] = Math.max(0, (src.reserved[d.good] ?? 0) - d.amount);
  d.status = 'cancelled';
  for (const t of w.transports) if (t.demand === d.id && t.status !== 'done') t.status = 'cancelled';
}

/** One game day for every Lieferroute: book finished trips, pay, check the conditions, start a trip. */
export function routesTick(w: World): void {
  const routes = w.routes;
  if (!routes?.length) return;
  for (const r of [...routes]) {
    const owner = company(w, r.owner);
    const from = facility(w, r.from);
    const to = facility(w, r.to);
    const s = ship(w, r.ship);
    const gone = owner.bankrupt ? 'Firma bankrott' : !from ? 'Quelle gibt es nicht mehr' : !to ? 'Ziel gibt es nicht mehr' : !s ? 'Linienschiff gibt es nicht mehr' : '';
    if (gone) {
      w.routes = w.routes!.filter((x) => x !== r);
      log(w, r.owner, `Lieferroute ${routeName(w, r)} beendet: ${gone}.`, 2);
      continue;
    }
    const unit = unitOf(r.good);
    if (r.demand) {
      const d = w.demands.find((x) => x.id === r.demand);
      if (d?.status === 'done') {
        r.trips += 1;
        r.delivered += d.amount;
        r.demand = null;
      } else if (!d || d.status === 'cancelled') {
        r.demand = null;
      } else {
        r.status = `Unterwegs: ${fmt(d.amount)} ${unit} ${good(r.good).name}`;
        continue;
      }
    }
    if (!r.active) {
      r.status = 'Pausiert';
      continue;
    }
    pay(w, r.owner, null, CONFIG.automation.dailyCostPerRoute);
    if (isCritical(s!)) {
      if (!s!.repairAtTerra) setRepairAtTerra(w, r.owner, s!.id, true);
      r.status = 'Linienschiff kritisch – zur Reparatur auf Terra vorgemerkt';
      continue;
    }
    if (s!.phase !== 'idle') {
      r.status = 'Linienschiff ist noch unterwegs';
      continue;
    }
    const coming = incoming(w, to!.id, r.good);
    const have = (to!.stock[r.good] ?? 0) + coming;
    if (have >= r.refillBelow) {
      r.status = `Ziel hat genug: ${fmt(have)} ${unit}, Nachschub unter ${fmt(r.refillBelow)} ${unit}`;
      continue;
    }
    if (freeCapacity(to!, r.good) - coming < r.amount) {
      r.status = 'Lager am Ziel voll';
      continue;
    }
    const free = available(from!, r.good);
    if (free < r.amount) {
      r.status = `Wartet auf Ware: ${fmt(Math.max(0, free))} / ${fmt(r.amount)} ${unit}`;
      continue;
    }
    const d = postDemand(w, r.owner, to!.id, r.good, r.amount, from!.id);
    if (!d.ok) {
      r.status = d.error;
      continue;
    }
    const t = postTransportForDemand(w, r.owner, d.value.id, 'own');
    const a = t.ok ? assignShip(w, r.owner, s!.id, t.value.id, r.id) : t;
    if (!a.ok) {
      undoTrip(w, d.value.id);
      r.status = a.error;
      continue;
    }
    r.demand = d.value.id;
    r.status = 'Fahrt gestartet';
    log(w, r.owner, `Lieferroute ${routeName(w, r)}: ${fmt(r.amount)} ${unit} ${good(r.good).name} unterwegs.`, 1);
  }
}
