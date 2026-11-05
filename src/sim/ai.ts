// AI companies. They use the same actions as the player (actions.ts) and follow simple,
// readable rules: get a loan, build a raw-material facility, sell what they produce,
// order what their plants need, haul freight with idle ships, then expand along their preferences.

import {
  acceptDemand,
  acceptTransport,
  assignShip,
  buyFacility,
  buyShip,
  cancelTransport,
  creditLimit,
  diff,
  incoming,
  maxOrderAmount,
  minTransportFee,
  postDemand,
  postTransportForDemand,
  releaseTransport,
  repairFacility,
  repairFacilityCost,
  repairShip,
  repayLoan,
  sendShipToTerra,
  startFacility,
  takeLoan,
} from './actions';
import { CONFIG, FACILITIES, SHIPS, TERRA, distance, facilityDef, good, planetsFor, shipDef } from './data';
import type { Cargo, Company, Facility, World } from './types';
import { available, facilitiesOf, facilityCount, freeCapacity, random, shipsOf } from './world';

const RESERVE = 120000;
const RAW_TYPES = ['oilwell', 'waterstation', 'mine'];

export function runAi(w: World) {
  const reaction = diff(w).aiReaction;
  for (const c of w.companies) {
    if (c.isPlayer || c.bankrupt) continue;
    if (random(w) >= reaction) continue;
    turn(w, c);
  }
}

function turn(w: World, c: Company) {
  startBuiltFacilities(w, c);
  finance(w, c);
  deliverOwnAssets(w, c);
  sellOutputs(w, c);
  orderInputs(w, c);
  takeBackOwnFreight(w, c);
  haulFreight(w, c);
  buyShipsForOutputs(w, c);
  expand(w, c);
  maintain(w, c);
  repay(w, c);
}

const idleShips = (w: World, c: Company, cargo?: Cargo) =>
  shipsOf(w, c.id).filter((s) => s.phase === 'idle' && (!cargo || shipDef(s.model).cargo === cargo) && s.condition >= 45);

function startBuiltFacilities(w: World, c: Company) {
  for (const f of facilitiesOf(w, c.id)) if (f.status === 'stopped') startFacility(w, c.id, f.id);
}

/** Borrow only what a planned purchase needs (plus a cushion), never the whole credit line. */
function borrowFor(w: World, c: Company, cost: number): boolean {
  const missing = cost + RESERVE - c.cash;
  if (missing <= 0) return true;
  // all credit lines used: pay off the smallest loan first if the cash allows it
  if (c.loans.length >= CONFIG.credit.maxLoans) {
    const smallest = [...c.loans].sort((a, b) => a.remaining - b.remaining)[0]!;
    if (c.cash < smallest.remaining || !repayLoan(w, c.id, smallest.id).ok) return false;
  }
  const amount = Math.ceil((cost + RESERVE - c.cash) / 10000) * 10000;
  if (amount > creditLimit(w, c.id)) return false;
  return takeLoan(w, c.id, amount, 2).ok; // longest term: lowest daily rate
}

function finance(_w: World, _c: Company) {
  // loans are taken on demand in expand()
}

/** Cheapest piece-goods ship that can carry `size` FE (facilities bigger than 15.000 FE need B–E). */
const pieceShipFor = (size: number) =>
  SHIPS.filter((m) => m.cargo === 'piece' && m.capacity >= size).sort((a, b) => a.price - b.price)[0];

const ownsPieceShipFor = (w: World, c: Company, size: number) =>
  shipsOf(w, c.id).some((x) => shipDef(x.model).cargo === 'piece' && shipDef(x.model).capacity >= size);

/** Purchased facilities/storage waiting at Terra: fly them with an own piece-goods ship, buy one big enough, or pay someone. */
function deliverOwnAssets(w: World, c: Company) {
  // a public offer nobody takes (e.g. no one has a ship that big) is withdrawn and retried with an own ship
  for (const t of w.transports) {
    if (t.issuer === c.id && t.kind === 'asset' && t.status === 'open' && w.day - t.createdDay > 15) cancelTransport(w, c.id, t.id);
  }
  const waiting = w.transports.filter((t) => t.issuer === c.id && t.kind === 'asset' && t.own && t.status === 'accepted' && !t.ship);
  for (const t of waiting) {
    let s = idleShips(w, c, 'piece').find((x) => shipDef(x.model).capacity >= t.amount);
    if (!s && !ownsPieceShipFor(w, c, t.amount)) {
      const model = pieceShipFor(t.amount);
      if (model && borrowFor(w, c, model.price) && c.cash >= model.price) {
        const r = buyShip(w, c.id, model.id);
        if (r.ok) s = r.value;
      }
    }
    if (s) assignShip(w, c.id, s.id, t.id);
    else if (w.day - t.createdDay > 3 && !ownsPieceShipFor(w, c, t.amount)) {
      releaseTransport(w, c.id, t.id, Math.round(minTransportFee(w, null, t.amount, TERRA, t.toPlanet) * 1.2));
    }
  }
}

/** Accept the best open demands for what the company's plants have on stock, then ship them. */
function sellOutputs(w: World, c: Company) {
  for (const f of facilitiesOf(w, c.id)) {
    for (const g of Object.keys(facilityDef(f.type).outputs)) {
      const options = w.demands
        .filter((d) => d.status === 'open' && d.good === g && !d.own && d.requester !== c.id && d.amount <= available(f, g))
        .map((d) => ({ d, score: d.pricePerFe * d.amount - minTransportFee(w, g, d.amount, f.planet, d.toPlanet) }))
        .sort((a, b) => b.score - a.score);
      const best = options[0];
      if (!best || best.score <= 0) continue;
      const acc = acceptDemand(w, c.id, best.d.id, f.id);
      if (acc.ok) ship(w, c, best.d.id, f);
    }
  }
}

/** Ship an accepted demand: own ship if one fits, otherwise a public transport with a small premium. */
function ship(w: World, c: Company, demandId: string, from: Facility) {
  const d = w.demands.find((x) => x.id === demandId)!;
  const cargo = good(d.good).cargo;
  const s = idleShips(w, c, cargo)
    .filter((x) => shipDef(x.model).capacity >= d.amount)
    .sort((a, b) => distance(a.at ?? TERRA, from.planet) - distance(b.at ?? TERRA, from.planet))[0];
  if (s) {
    const t = postTransportForDemand(w, c.id, demandId, 'own');
    if (t.ok) assignShip(w, c.id, s.id, t.value.id);
  } else {
    const fee = Math.round(minTransportFee(w, d.good, d.amount, from.planet, d.toPlanet) * 1.2);
    postTransportForDemand(w, c.id, demandId, 'public', fee);
  }
}

/** Keep inputs for ~15 days on stock; use own supply chains first (Eigen-Warennachfrage). */
function orderInputs(w: World, c: Company) {
  const { minAmount } = CONFIG.orders;
  for (const f of facilitiesOf(w, c.id)) {
    if (f.status !== 'running') continue;
    for (const [g, need] of Object.entries(facilityDef(f.type).inputs)) {
      const daily = need * f.units;
      const have = (f.stock[g] ?? 0) + incoming(w, f.id, g);
      if (have >= daily * 15) continue;
      const room = freeCapacity(f, g) - incoming(w, f.id, g);
      // small plants (e.g. pharma: 60 FE chemicals/day) still order at least the minimum amount
      let amount = Math.min(maxOrderAmount(w, c.id, g), room, Math.max(minAmount, daily * 20));
      amount = Math.floor(amount / 500) * 500;
      if (amount < minAmount) continue;
      const ownSupplier = facilitiesOf(w, c.id).find((x) => g in facilityDef(x.type).outputs && available(x, g) >= amount);
      if (ownSupplier) {
        const d = postDemand(w, c.id, f.id, g, amount, ownSupplier.id);
        if (d.ok) ship(w, c, d.value.id, ownSupplier);
      } else {
        postDemand(w, c.id, f.id, g, amount);
      }
    }
  }
}

/** Own freight still waiting on the exchange goes with an own ship as soon as one is free. */
function takeBackOwnFreight(w: World, c: Company) {
  for (const t of w.transports) {
    if (t.issuer !== c.id || t.status !== 'open' || t.kind !== 'goods') continue;
    const s = idleShips(w, c, t.cargo)
      .filter((x) => shipDef(x.model).capacity >= t.amount)
      .sort((a, b) => distance(a.at ?? TERRA, t.fromPlanet) - distance(b.at ?? TERRA, t.fromPlanet))[0];
    if (s && cancelTransport(w, c.id, t.id).ok) assignShip(w, c.id, s.id, t.id);
  }
}

/** Idle ships take the best-paying open freight that fits, preferring short empty runs. */
function haulFreight(w: World, c: Company) {
  for (const s of idleShips(w, c)) {
    const def = shipDef(s.model);
    const options = w.transports
      .filter((t) => t.status === 'open' && t.issuer !== c.id && t.cargo === def.cargo && t.amount <= def.capacity)
      .map((t) => {
        const days = (distance(s.at ?? TERRA, t.fromPlanet) + distance(t.fromPlanet, t.toPlanet)) / def.speed + 2;
        return { t, perDay: (t.fee - days * (def.operation + def.maintenance)) / days, days };
      })
      .filter((o) => o.perDay > 0 && w.day + o.days < o.t.deadlineDay)
      .sort((a, b) => b.perDay - a.perDay);
    const best = options[0];
    if (!best) continue;
    const acc = acceptTransport(w, c.id, best.t.id);
    if (acc.ok) assignShip(w, c.id, s.id, best.t.id);
  }
}

const cheapestShip = (cargo: Cargo) =>
  SHIPS.filter((m) => m.cargo === cargo && m.capacity >= CONFIG.orders.maxAmount).sort((a, b) => a.price - b.price)[0];

/**
 * One ship per output cargo type, once the company can afford it. More while every ship is busy –
 * up to 3, or one more per own shipment that is stuck on the exchange (at most 8).
 */
function buyShipsForOutputs(w: World, c: Company) {
  const cargos = new Set<Cargo>();
  for (const f of facilitiesOf(w, c.id)) for (const g of Object.keys(facilityDef(f.type).outputs)) cargos.add(good(g).cargo);
  for (const cargo of cargos) {
    const fleet = shipsOf(w, c.id).filter((s) => shipDef(s.model).cargo === cargo);
    const busy = fleet.every((s) => s.phase !== 'idle');
    const backlog = w.transports.filter((t) => t.issuer === c.id && t.status === 'open' && t.kind === 'goods' && t.cargo === cargo).length;
    const cap = Math.min(8, 3 + backlog);
    if (fleet.length > 0 && !(busy && fleet.length < cap)) continue;
    const model = cheapestShip(cargo);
    if (!model) continue;
    // the first ship for an output is essential: borrow for it if needed
    if (fleet.length === 0) borrowFor(w, c, model.price);
    if (c.cash > model.price + (fleet.length === 0 ? 0 : RESERVE)) buyShip(w, c.id, model.id);
  }
}

/** A facility type is worth building if every input is produced somewhere in the galaxy. */
function inputsAvailable(w: World, type: string): boolean {
  return Object.keys(facilityDef(type).inputs).every((g) =>
    w.facilities.some((f) => f.status !== 'construction' && g in facilityDef(f.type).outputs),
  );
}

/**
 * How attractive building another `type` is right now: market price of its outputs relative to base,
 * divided by how many units of that type already exist. Steers the AI away from flooding one good.
 */
function attractiveness(w: World, type: string): number {
  const def = facilityDef(type);
  const outs = Object.keys(def.outputs);
  const priceSignal = outs.reduce((s, g) => s + (w.prices[g] ?? 0) / good(g).basePrice, 0) / outs.length;
  const units = w.facilities.filter((f) => f.type === type).reduce((s, f) => s + f.units, 0) +
    w.assets.filter((a) => a.kind === 'facility' && a.defId === type && !a.delivered).length;
  return priceSignal / (1 + units);
}

function expand(w: World, c: Company) {
  const pendingAsset = w.assets.some((a) => a.owner === c.id && !a.delivered);
  if (pendingAsset) return;
  const count = facilityCount(w, c.id);
  if (count >= CONFIG.maxFacilitiesPerCompany) return;
  if (count > 0 && random(w) > 0.1) return; // don't expand every day
  const facs = facilitiesOf(w, c.id);
  // only grow while solvent
  if (c.cash < 0 || c.loans.some((l) => l.overdueDays > 0)) return;

  // Companies whose favourite is a processing plant wait until its inputs exist somewhere,
  // so the galaxy fills up with a mix of raw producers and processors.
  let candidates: string[];
  if (count === 0) {
    candidates = c.prefers.filter((t) => RAW_TYPES.includes(t) || inputsAvailable(w, t));
    if (candidates.length === 0 && w.day > 10) candidates = [...RAW_TYPES];
  } else {
    // later on anything whose inputs exist is fair game; preferred sectors get a bonus
    candidates = FACILITIES.map((f) => f.id).filter((t) => RAW_TYPES.includes(t) || inputsAvailable(w, t));
  }
  const score = (t: string) => attractiveness(w, t) * (c.prefers.includes(t) ? 1.5 : 1);
  candidates.sort((a, b) => score(b) - score(a));

  for (const type of candidates) {
    const def = facilityDef(type);
    const existing = facs.find((f) => f.type === type);
    if (existing && existing.idleDays > 0) continue;
    const sites = planetsFor(type).sort((a, b) => distance(TERRA, a.id) - distance(TERRA, b.id));
    const site = existing ? existing.planet : sites[0]?.id;
    if (!site) continue;
    // a plant also needs a piece-goods ship big enough to get there, and ships for what it produces
    const fleetCargos = new Set(shipsOf(w, c.id).map((s) => shipDef(s.model).cargo));
    let extra = ownsPieceShipFor(w, c, def.size) ? 0 : (pieceShipFor(def.size)?.price ?? 0);
    for (const cargo of new Set(Object.keys(def.outputs).map((g) => good(g).cargo))) {
      if (cargo !== 'piece' && !fleetCargos.has(cargo)) extra += cheapestShip(cargo)?.price ?? 0;
    }
    if (!borrowFor(w, c, def.price + extra)) continue;
    if (c.cash < def.price + extra) continue;
    const r = buyFacility(w, c.id, type, site);
    if (r.ok) return;
  }
}

function maintain(w: World, c: Company) {
  for (const s of shipsOf(w, c.id)) {
    if (s.phase !== 'idle' || s.condition >= 50) continue;
    if (s.at === TERRA) repairShip(w, c.id, s.id);
    else sendShipToTerra(w, c.id, s.id);
  }
  for (const f of facilitiesOf(w, c.id)) {
    if (f.condition < CONFIG.facilities.repairBelow && c.cash > repairFacilityCost(f) + RESERVE) repairFacility(w, c.id, f.id);
  }
}

function repay(w: World, c: Company) {
  for (const l of c.loans) {
    if (c.cash > l.remaining + RESERVE * 2) repayLoan(w, c.id, l.id);
  }
}

