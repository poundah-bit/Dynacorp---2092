// Every action a company can take. The human player (later via the UI) and the AI use exactly
// these functions, so both play by the same rules. Actions never throw for game-rule violations;
// they return { ok: false, error } with a German message the UI can show directly.

import { CONFIG, SHIPS, TERRA, distance, facilityDef, good, planet, shipDef, storageDef } from './data';
import type { Cargo, Demand, Difficulty, Facility, Ship, Transport, World } from './types';
import {
  available,
  company,
  demand,
  facility,
  facilityCount,
  facilityValue,
  facilitiesOf,
  freeCapacity,
  log,
  newId,
  pay,
  ship,
  shipValue,
  shipsOf,
  transport,
} from './world';

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export const diff = (w: World) => CONFIG.difficulties[w.difficulty as Difficulty];

// ---------- helpers shared with the engine ----------

/** Days a ship of the slowest fitting class needs from Terra to pickup and on to delivery, incl. loading. */
export function referenceTripDays(cargo: Cargo, amount: number, from: string, to: string): number {
  const fitting = SHIPS.filter((s) => s.cargo === cargo && s.capacity >= amount);
  const pool = fitting.length ? fitting : SHIPS.filter((s) => s.cargo === cargo);
  const slowest = Math.min(...pool.map((s) => s.speed));
  return Math.ceil((distance(TERRA, from) + distance(from, to)) / slowest) + 2 * CONFIG.loadDays;
}

export function transportDeadline(w: World, cargo: Cargo, amount: number, from: string, to: string): number {
  const days = referenceTripDays(cargo, amount, from, to);
  return w.day + Math.ceil(days * 2 * diff(w).deadlineFactor) + CONFIG.orders.deadlineExtraDays;
}

/** Minimum fee for a public transport: distance-based plus a share of the goods value. */
export function minTransportFee(w: World, goodId: string | null, amount: number, from: string, to: string): number {
  const perParsec = amount * distance(from, to) * CONFIG.market.minTransportFeePerFePerParsec;
  const value = goodId ? amount * (w.prices[goodId] ?? 0) * 0.05 : 0;
  return Math.round(perParsec + value);
}

export function debt(w: World, companyId: string): number {
  return company(w, companyId).loans.reduce((s, l) => s + l.remaining, 0);
}

export function companyValue(w: World, companyId: string): number {
  const c = company(w, companyId);
  const fac = facilitiesOf(w, companyId).reduce((s, f) => s + facilityValue(f), 0);
  const shp = shipsOf(w, companyId).reduce((s, x) => s + shipValue(x), 0);
  return c.cash + fac + shp - debt(w, companyId);
}

/** Credit line. The difficulty level tightens it for the human player only; the AI always gets the standard line. */
export function creditLimit(w: World, companyId: string): number {
  const base = company(w, companyId).isPlayer ? diff(w).creditLimit : CONFIG.credit.startLimit;
  const byValue = companyValue(w, companyId) * CONFIG.credit.limitShareOfCompanyValue;
  const limit = Math.min(CONFIG.credit.maxLimit, Math.max(base, byValue));
  return Math.max(0, Math.round(limit - debt(w, companyId)));
}

function active(w: World, companyId: string): Result<undefined> {
  const c = company(w, companyId);
  if (c.bankrupt) return fail(`${c.name} ist bankrott.`);
  return ok(undefined);
}

function payFromCash(w: World, companyId: string, amount: number, what: string): Result<undefined> {
  const c = company(w, companyId);
  if (c.cash < amount) return fail(`Nicht genug Barkapital für ${what} (${Math.round(amount)} Cr benötigt).`);
  pay(w, companyId, null, amount);
  return ok(undefined);
}

// ---------- bank ----------

export function takeLoan(w: World, companyId: string, amount: number, termIndex: number): Result<string> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const c = company(w, companyId);
  const term = CONFIG.credit.terms[termIndex];
  if (!term) return fail('Unbekannte Laufzeit.');
  if (c.loans.length >= CONFIG.credit.maxLoans) return fail('Es laufen schon zu viele Kredite.');
  amount = Math.round(amount);
  if (amount <= 0) return fail('Kreditbetrag muss positiv sein.');
  if (amount > creditLimit(w, companyId)) return fail('Der Betrag übersteigt den Kreditrahmen.');
  const interest = Math.max(0, term.interest + (c.isPlayer ? diff(w).interestDelta : 0));
  const total = Math.round(amount * (1 + interest));
  const id = newId(w, 'l');
  c.loans.push({ id, remaining: total, dailyRate: Math.ceil(total / term.days), daysLeft: term.days, overdueDays: 0 });
  c.cash += amount; // a loan is not revenue
  log(w, companyId, `${c.name} nimmt einen Kredit über ${amount} Cr für ${term.days} Tage auf.`);
  return ok(id);
}

export function repayLoan(w: World, companyId: string, loanId: string, amount?: number): Result<undefined> {
  const c = company(w, companyId);
  const loan = c.loans.find((l) => l.id === loanId);
  if (!loan) return fail('Kredit nicht gefunden.');
  const sum = Math.min(loan.remaining, Math.round(amount ?? loan.remaining));
  if (c.cash < sum) return fail('Nicht genug Barkapital für die Tilgung.');
  c.cash -= sum;
  loan.remaining -= sum;
  if (loan.remaining <= 0) c.loans = c.loans.filter((l) => l !== loan);
  else loan.dailyRate = Math.min(loan.dailyRate, loan.remaining);
  return ok(undefined);
}

// ---------- DYNATECH: facilities and storage ----------

function createAssetTransport(w: World, companyId: string, assetId: string, size: number, to: string): Transport {
  const t: Transport = {
    id: newId(w, 't'),
    issuer: companyId,
    kind: 'asset',
    good: null,
    asset: assetId,
    amount: size,
    cargo: 'piece',
    fromPlanet: TERRA,
    fromFacility: null,
    toPlanet: to,
    fee: 0,
    own: true,
    demand: null,
    carrier: companyId,
    ship: null,
    status: 'accepted',
    createdDay: w.day,
    deadlineDay: transportDeadline(w, 'piece', size, TERRA, to),
    late: false,
  };
  w.transports.push(t);
  return t;
}

/** Buys a facility at Terra. Returns the own transport order that still has to be flown (or released). */
export function buyFacility(w: World, companyId: string, type: string, planetId: string): Result<Transport> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const def = facilityDef(type);
  if (planet(planetId).facility !== type) return fail(`Auf ${planet(planetId).name} ist keine ${def.name} erlaubt.`);
  const existing = facilitiesOf(w, companyId).some((f) => f.type === type && f.planet === planetId);
  const pending = w.assets.some(
    (x) => x.owner === companyId && x.kind === 'facility' && x.defId === type && x.planet === planetId && !x.delivered,
  );
  if (!existing && !pending && facilityCount(w, companyId) >= CONFIG.maxFacilitiesPerCompany) {
    return fail(`Höchstens ${CONFIG.maxFacilitiesPerCompany} Niederlassungen pro Firma.`);
  }
  const paid = payFromCash(w, companyId, def.price, def.name);
  if (!paid.ok) return paid;
  const id = newId(w, 'a');
  w.assets.push({ id, owner: companyId, kind: 'facility', defId: type, planet: planetId, size: def.size, delivered: false });
  log(w, companyId, `${company(w, companyId).name} kauft eine ${def.name} für ${planet(planetId).name}.`);
  return ok(createAssetTransport(w, companyId, id, def.size, planetId));
}

export function buyStorage(w: World, companyId: string, storageId: string, facilityId: string): Result<Transport> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const f = facility(w, facilityId);
  if (!f || f.owner !== companyId) return fail('Niederlassung nicht gefunden.');
  const def = storageDef(storageId);
  const paid = payFromCash(w, companyId, def.price, def.name);
  if (!paid.ok) return paid;
  const id = newId(w, 'a');
  w.assets.push({ id, owner: companyId, kind: 'storage', defId: storageId, planet: f.planet, size: def.size, delivered: false });
  return ok(createAssetTransport(w, companyId, id, def.size, f.planet));
}

// ---------- shipyard ----------

export function buyShip(w: World, companyId: string, model: string): Result<Ship> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const def = shipDef(model);
  const paid = payFromCash(w, companyId, def.price, def.name);
  if (!paid.ok) return paid;
  const s: Ship = {
    id: newId(w, 's'),
    owner: companyId,
    model,
    condition: 100,
    at: TERRA,
    route: null,
    phase: 'idle',
    transport: null,
    waitDays: 0,
  };
  w.ships.push(s);
  log(w, companyId, `${company(w, companyId).name} kauft einen ${def.name}.`);
  return ok(s);
}

function ownIdleShipAtTerra(w: World, companyId: string, shipId: string): Result<Ship> {
  const s = ship(w, shipId);
  if (!s || s.owner !== companyId) return fail('Schiff nicht gefunden.');
  if (s.phase !== 'idle') return fail('Das Schiff ist beschäftigt.');
  if (s.at !== TERRA) return fail('Das Schiff muss dafür auf Terra sein.');
  return ok(s);
}

export function sellShip(w: World, companyId: string, shipId: string): Result<number> {
  const r = ownIdleShipAtTerra(w, companyId, shipId);
  if (!r.ok) return r;
  const price = Math.round(shipValue(r.value) * 0.6);
  w.ships = w.ships.filter((s) => s !== r.value);
  pay(w, null, companyId, price);
  return ok(price);
}

export function repairShipCost(s: Ship): number {
  return Math.round(shipDef(s.model).price * CONFIG.ships.repairCostPerPercent * (100 - s.condition));
}

export function repairShip(w: World, companyId: string, shipId: string): Result<undefined> {
  const r = ownIdleShipAtTerra(w, companyId, shipId);
  if (!r.ok) return r;
  const cost = repairShipCost(r.value);
  const paid = payFromCash(w, companyId, cost, 'die Reparatur');
  if (!paid.ok) return paid;
  r.value.phase = 'repair';
  r.value.waitDays = Math.max(1, Math.ceil((100 - r.value.condition) / 20));
  return ok(undefined);
}

export function sendShipToTerra(w: World, companyId: string, shipId: string): Result<undefined> {
  const s = ship(w, shipId);
  if (!s || s.owner !== companyId) return fail('Schiff nicht gefunden.');
  if (s.phase !== 'idle') return fail('Das Schiff ist beschäftigt.');
  if (s.at === TERRA) return ok(undefined);
  startRoute(s, TERRA, 'toTerra');
  return ok(undefined);
}

export function startRoute(s: Ship, to: string, phase: Ship['phase']) {
  const from = s.at ?? s.route?.to ?? TERRA;
  s.route = { from, to, distance: distance(from, to), traveled: 0 };
  s.at = null;
  s.phase = phase;
}

// ---------- facilities ----------

function ownFacility(w: World, companyId: string, facilityId: string): Result<Facility> {
  const f = facility(w, facilityId);
  if (!f || f.owner !== companyId) return fail('Niederlassung nicht gefunden.');
  return ok(f);
}

export function startFacility(w: World, companyId: string, facilityId: string): Result<undefined> {
  const r = ownFacility(w, companyId, facilityId);
  if (!r.ok) return r;
  if (r.value.status === 'construction') return fail('Die Anlage ist noch im Bau.');
  r.value.status = 'running';
  r.value.idleDays = 0;
  return ok(undefined);
}

export function stopFacility(w: World, companyId: string, facilityId: string): Result<undefined> {
  const r = ownFacility(w, companyId, facilityId);
  if (!r.ok) return r;
  if (r.value.status === 'construction') return fail('Die Anlage ist noch im Bau.');
  r.value.status = 'stopped';
  return ok(undefined);
}

export function scrapFacility(w: World, companyId: string, facilityId: string): Result<undefined> {
  const r = ownFacility(w, companyId, facilityId);
  if (!r.ok) return r;
  const busy = w.demands.some(
    (d) => (d.toFacility === facilityId || d.supplierFacility === facilityId) && ['accepted', 'shipping'].includes(d.status),
  );
  if (busy) return fail('Die Anlage hat noch laufende Aufträge.');
  w.demands.forEach((d) => {
    if (d.toFacility === facilityId && d.status === 'open') d.status = 'cancelled';
  });
  w.facilities = w.facilities.filter((f) => f !== r.value);
  return ok(undefined);
}

export function repairFacilityCost(f: Facility): number {
  return Math.round(facilityDef(f.type).price * f.units * CONFIG.facilities.repairCostPerPercent * (100 - f.condition));
}

/** Orders a DYNATECH maintenance ship; repaired immediately in this version (travel time comes with the UI). */
export function repairFacility(w: World, companyId: string, facilityId: string): Result<undefined> {
  const r = ownFacility(w, companyId, facilityId);
  if (!r.ok) return r;
  const paid = payFromCash(w, companyId, repairFacilityCost(r.value), 'die Reparatur');
  if (!paid.ok) return paid;
  r.value.condition = 100;
  return ok(undefined);
}

// ---------- demands (Warennachfragen) ----------

/** Amount of a good already on its way to (or promised for) a facility. */
export function incoming(w: World, facilityId: string, goodId: string): number {
  return w.demands
    .filter((d) => d.toFacility === facilityId && d.good === goodId && ['open', 'accepted', 'shipping'].includes(d.status))
    .reduce((s, d) => s + d.amount, 0);
}

/**
 * Posts a demand for an input of one of the company's facilities.
 * With `ownSupplier` it is an Eigen-Warennachfrage, taken over immediately by that own facility.
 */
export function postDemand(
  w: World,
  companyId: string,
  facilityId: string,
  goodId: string,
  amount: number,
  ownSupplier?: string,
): Result<Demand> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const r = ownFacility(w, companyId, facilityId);
  if (!r.ok) return r;
  const f = r.value;
  if (!(goodId in facilityDef(f.type).inputs)) return fail(`${good(goodId).name} wird in dieser Anlage nicht gebraucht.`);
  amount = Math.round(amount);
  if (amount <= 0) return fail('Menge muss positiv sein.');
  if (freeCapacity(f, goodId) - incoming(w, f.id, goodId) < amount) return fail('Nicht genug freier Lagerplatz.');
  const d: Demand = {
    id: newId(w, 'd'),
    requester: companyId,
    good: goodId,
    amount,
    toPlanet: f.planet,
    toFacility: f.id,
    pricePerFe: Math.round((w.prices[goodId] ?? 0) * 100) / 100,
    own: !!ownSupplier,
    status: 'open',
    supplier: null,
    supplierFacility: null,
    transport: null,
    createdDay: w.day,
    deadlineDay: 0,
    late: false,
  };
  d.deadlineDay = transportDeadline(w, good(goodId).cargo, amount, f.planet, f.planet) + CONFIG.orders.demandExtraDays;
  w.demands.push(d);
  if (ownSupplier) {
    const acc = acceptDemand(w, companyId, d.id, ownSupplier);
    if (!acc.ok) {
      w.demands = w.demands.filter((x) => x !== d);
      return acc;
    }
  }
  return ok(d);
}

export function acceptDemand(w: World, companyId: string, demandId: string, supplierFacilityId: string): Result<Demand> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const d = demand(w, demandId);
  if (!d || d.status !== 'open') return fail('Diese Nachfrage ist nicht mehr offen.');
  if (d.own && d.requester !== companyId) return fail('Das ist eine Eigen-Nachfrage einer anderen Firma.');
  const r = ownFacility(w, companyId, supplierFacilityId);
  if (!r.ok) return r;
  const f = r.value;
  if (!(d.good in facilityDef(f.type).outputs)) return fail('Diese Anlage liefert die Ware nicht.');
  if (available(f, d.good) < d.amount) return fail('Nicht genug Ware auf Lager.');
  f.reserved[d.good] = (f.reserved[d.good] ?? 0) + d.amount;
  d.status = 'accepted';
  d.supplier = companyId;
  d.supplierFacility = f.id;
  // the deadline starts when someone commits to deliver
  d.deadlineDay =
    transportDeadline(w, good(d.good).cargo, d.amount, f.planet, d.toPlanet) + CONFIG.orders.demandExtraDays;
  if (d.requester !== 'terra' && d.requester !== companyId) {
    log(w, d.requester, `${company(w, companyId).name} liefert ${d.amount} FE ${good(d.good).name} nach ${planet(d.toPlanet).name}.`);
  }
  return ok(d);
}

/**
 * After accepting a demand the supplier must arrange the transport:
 * own (Eigen-Transport, fee 0) or public (Transport with a fee for whoever carries it).
 */
export function postTransportForDemand(
  w: World,
  companyId: string,
  demandId: string,
  mode: 'own' | 'public',
  fee?: number,
): Result<Transport> {
  const d = demand(w, demandId);
  if (!d || d.supplier !== companyId || d.status !== 'accepted') return fail('Kein passender angenommener Auftrag.');
  const f = facility(w, d.supplierFacility!);
  if (!f) return fail('Lieferwerk existiert nicht mehr.');
  const g = good(d.good);
  const min = minTransportFee(w, d.good, d.amount, f.planet, d.toPlanet);
  if (mode === 'public' && fee !== undefined && fee < min) return fail(`Das Honorar muss mindestens ${min} Cr betragen.`);
  const t: Transport = {
    id: newId(w, 't'),
    issuer: companyId,
    kind: 'goods',
    good: d.good,
    asset: null,
    amount: d.amount,
    cargo: g.cargo,
    fromPlanet: f.planet,
    fromFacility: f.id,
    toPlanet: d.toPlanet,
    fee: mode === 'own' ? 0 : Math.round(fee ?? min),
    own: mode === 'own',
    demand: d.id,
    carrier: mode === 'own' ? companyId : null,
    ship: null,
    status: mode === 'own' ? 'accepted' : 'open',
    createdDay: w.day,
    deadlineDay: transportDeadline(w, g.cargo, d.amount, f.planet, d.toPlanet),
    late: false,
  };
  w.transports.push(t);
  d.transport = t.id;
  d.status = 'shipping';
  return ok(t);
}

/** Turns an own transport (e.g. a facility delivery) into a public one with a fee. */
export function releaseTransport(w: World, companyId: string, transportId: string, fee?: number): Result<Transport> {
  const t = transport(w, transportId);
  if (!t || t.issuer !== companyId) return fail('Transportauftrag nicht gefunden.');
  if (!t.own || t.status !== 'accepted' || t.ship) return fail('Nur noch nicht vergebene Eigen-Transporte können freigegeben werden.');
  const min = minTransportFee(w, t.good, t.amount, t.fromPlanet, t.toPlanet);
  const value = fee === undefined ? min : Math.round(fee);
  if (value < min) return fail(`Das Honorar muss mindestens ${min} Cr betragen.`);
  t.own = false;
  t.fee = value;
  t.carrier = null;
  t.status = 'open';
  return ok(t);
}

export function acceptTransport(w: World, companyId: string, transportId: string): Result<Transport> {
  const a = active(w, companyId);
  if (!a.ok) return a;
  const t = transport(w, transportId);
  if (!t || t.status !== 'open') return fail('Dieser Transport ist nicht mehr offen.');
  t.status = 'accepted';
  t.carrier = companyId;
  log(w, t.issuer, `${company(w, companyId).name} übernimmt den Transport ${t.id} nach ${planet(t.toPlanet).name}.`);
  return ok(t);
}

/** Sends one of the carrier's ships to execute an accepted transport. */
export function assignShip(w: World, companyId: string, shipId: string, transportId: string): Result<undefined> {
  const s = ship(w, shipId);
  if (!s || s.owner !== companyId) return fail('Schiff nicht gefunden.');
  if (s.phase !== 'idle') return fail('Das Schiff ist beschäftigt.');
  const t = transport(w, transportId);
  if (!t || t.carrier !== companyId || t.status !== 'accepted' || t.ship) return fail('Kein passender übernommener Auftrag.');
  const def = shipDef(s.model);
  if (def.cargo !== t.cargo) return fail(`Das Schiff transportiert kein ${cargoName(t.cargo)}.`);
  if (def.capacity < t.amount) return fail('Der Laderaum ist zu klein.');
  t.ship = s.id;
  t.status = 'assigned';
  s.transport = t.id;
  if (s.at === t.fromPlanet) {
    s.phase = 'loading';
    s.waitDays = CONFIG.loadDays;
  } else {
    startRoute(s, t.fromPlanet, 'toPickup');
  }
  return ok(undefined);
}

export function cancelDemand(w: World, companyId: string, demandId: string): Result<undefined> {
  const d = demand(w, demandId);
  if (!d || d.requester !== companyId) return fail('Nachfrage nicht gefunden.');
  if (d.status !== 'open') return fail('Nur offene Nachfragen können storniert werden.');
  d.status = 'cancelled';
  return ok(undefined);
}

export function cancelTransport(w: World, companyId: string, transportId: string): Result<undefined> {
  const t = transport(w, transportId);
  if (!t || t.issuer !== companyId) return fail('Transport nicht gefunden.');
  if (t.status !== 'open' || t.kind !== 'asset') return fail('Nur offene Anlagentransporte können zurückgezogen werden.');
  t.status = 'accepted';
  t.own = true;
  t.fee = 0;
  t.carrier = companyId;
  return ok(undefined);
}

export const cargoName = (c: Cargo) =>
  ({ tank: 'Tankgut', bulk: 'Schüttgut', piece: 'Stückgut', cooled: 'Kühlfracht', live: 'Lebendfracht' })[c];
