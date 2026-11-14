// Player-side helpers for the game UI: queries ("what can I deliver?"), combined moves
// ("accept and send a ship") and the step-by-step guide for the manual's example.
// Pure functions on the world – no DOM – so tests can drive them like the UI does.

import {
  COMPANIES,
  CONFIG,
  SHIPS,
  TERRA,
  acceptDemand,
  acceptTransport,
  assignShip,
  available,
  buyShip,
  canJoin,
  cargoName,
  company,
  createWorld,
  diff,
  distance,
  facilitiesOf,
  facility,
  facilityDef,
  good,
  minTransportFee,
  planet,
  planetsFor,
  postTransportForDemand,
  releaseTransport,
  shipDef,
  shipRoom,
  shipSpeed,
  productionEfficiency,
  lineRoute,
  shipsOf,
  storageCapacity,
  transport,
  transportDeadline,
  unshippedAmount,
  type Asset,
  type Cargo,
  type Demand,
  type Difficulty,
  type Facility,
  type Result,
  type Ship,
  type ShipDef,
  type Transport,
  type World,
  buyerName,
  initStories,
  isOutsideBuyer,
  type StoryEvent,
} from '../sim/index';

/** AI competitors: chosen on the start screen, 10 by default, at most as many as companies.json lists. */
export const AI_DEFAULT = 10;
export const AI_MIN = 1;
export const AI_MAX = COMPANIES.length;

export const clampAi = (n: number) => Math.max(AI_MIN, Math.min(AI_MAX, Math.round(Number.isFinite(n) ? n : AI_DEFAULT)));

export function newGame(name: string, difficulty: Difficulty, seed: number, aiCompanies = AI_DEFAULT, stories = true): World {
  return createWorld({ seed, difficulty, playerName: name.trim() || 'Meine Firma', aiCompanies: clampAi(aiCompanies), stories });
}

export const companyName = (w: World, id: string | null) =>
  !id ? '–' : isOutsideBuyer(id) ? buyerName(w, id) : (w.companies.find((c) => c.id === id)?.name ?? '?');

/** Saves from before the story events get them switched on (missing = on). */
export function ensureStories(w: World): void {
  if (!w.stories) initStories(w, true);
}

/** Story events that began on this day (for the „Neue Lage“ toast). */
export const startedStories = (w: World, day: number): StoryEvent[] => (w.stories?.events ?? []).filter((e) => e.startDay === day);

// ---------- ships ----------

/** Days until the ship finishes its current leg (flight) or wait (loading, repair). */
export function shipLegDays(s: Ship): number {
  if (s.route) return Math.max(1, Math.ceil((s.route.distance - s.route.traveled) / shipSpeed(s)));
  return s.waitDays;
}

/**
 * Rough days for an idle ship (or a new one at Terra) to pick up at `from` and deliver at `to`.
 * `readyIn`: days until the goods are produced – the ship waits at the plant until then.
 */
export function tripDays(speed: number, at: string, from: string, to: string, readyIn = 0): number {
  return Math.max(Math.ceil(distance(at, from) / speed), readyIn) + Math.ceil(distance(from, to) / speed) + 2 * CONFIG.loadDays;
}

/** Own ships the player may plan with: everything except Linienschiffe of active Lieferrouten. */
export const plannableShips = (w: World, me: string) => shipsOf(w, me).filter((s) => !lineRoute(w, s.id));

export function idleFittingShips(w: World, me: string, cargo: Cargo, amount: number): Ship[] {
  return plannableShips(w, me).filter((s) => {
    const def = shipDef(s.model);
    return s.phase === 'idle' && def.cargo === cargo && def.capacity >= amount && s.condition >= CONFIG.ships.criticalBelow;
  });
}

export function cheapestShipFor(cargo: Cargo, amount: number): ShipDef | undefined {
  return SHIPS.filter((m) => m.cargo === cargo && m.capacity >= amount).sort((a, b) => a.price - b.price)[0];
}

/**
 * Own ships already booked for the same pickup and destination that still have room – a load can ride along
 * on the same trip (e.g. several small orders from one plant to Terra on one big tanker).
 */
export function joinableShips(w: World, me: string, cargo: Cargo, from: string, to: string, amount = 1): Ship[] {
  return plannableShips(w, me).filter((s) => canJoin(w, s, { cargo, amount, fromPlanet: from, toPlanet: to }));
}

/** Can the player carry this transport: with an idle ship now, a busy one later, or not at all? */
export function carryState(w: World, me: string, t: Transport): 'idle' | 'busy' | 'none' {
  const fit = plannableShips(w, me).filter((s) => shipDef(s.model).cargo === t.cargo && shipDef(s.model).capacity >= t.amount);
  if (fit.some((s) => s.phase === 'idle' && s.condition >= CONFIG.ships.criticalBelow)) return 'idle';
  if (joinableShips(w, me, t.cargo, t.fromPlanet, t.toPlanet, t.amount).length) return 'idle';
  return fit.length ? 'busy' : 'none';
}

// ---------- orders ----------

/** How far a facility is from having `amount` FE of a good free for a new order. */
export function readiness(f: Facility, goodId: string, amount: number) {
  const free = available(f, goodId);
  const missing = Math.max(0, amount - free);
  const perDay = f.status === 'running' ? (facilityDef(f.type).outputs[goodId] ?? 0) * f.units : 0;
  const daysToReady = missing <= 0 ? 0 : perDay > 0 ? Math.ceil(missing / perDay) : Infinity;
  return { free, missing, daysToReady, fits: amount <= storageCapacity(f, goodId) };
}

/** Deadline a demand would get if the player accepted it now from facility f (as acceptDemand sets it). */
export const acceptDeadline = (w: World, d: Demand, f: Facility) =>
  transportDeadline(w, good(d.good).cargo, d.amount, f.planet, d.toPlanet) + CONFIG.orders.demandExtraDays;

/** Penalty for missing a demand's deadline, at today's price. */
export const latePenalty = (w: World, d: Demand) => Math.round(d.amount * (w.prices[d.good] ?? 0) * diff(w).penaltyRate);

export interface DeliverOption {
  d: Demand;
  facilities: Facility[]; // own facilities producing the good whose storage can hold the amount, best first
  ready: boolean; // enough unreserved stock right now
  daysToReady: number; // Infinity if nothing running produces it
  /** the amount is larger than any own facility's storage – it can never be loaded */
  tooBig: boolean;
}

/** Open demands for goods one of the player's facilities produces. Accepting them early is allowed (at a risk). */
export function deliverableDemands(w: World, me: string): DeliverOption[] {
  const mine = facilitiesOf(w, me);
  const out: DeliverOption[] = [];
  for (const d of w.demands) {
    if (d.status !== 'open' || d.requester === me || d.own) continue;
    const producers = mine.filter((f) => d.good in facilityDef(f.type).outputs);
    if (!producers.length) continue;
    const facs = producers.filter((f) => readiness(f, d.good, d.amount).fits);
    facs.sort((a, b) => readiness(a, d.good, d.amount).daysToReady - readiness(b, d.good, d.amount).daysToReady);
    const best = facs[0];
    const daysToReady = best ? readiness(best, d.good, d.amount).daysToReady : Infinity;
    out.push({ d, facilities: facs, ready: !!best && daysToReady === 0, daysToReady, tooBig: !best });
  }
  return out.sort((a, b) => a.daysToReady - b.daysToReady || b.d.amount * b.d.pricePerFe - a.d.amount * a.d.pricePerFe);
}

/** Public transports of other companies that are still up for grabs. */
export const openTransports = (w: World, me: string) => w.transports.filter((t) => t.status === 'open' && t.issuer !== me);

/** Transports the player has taken on (own or public) that still need a ship. */
export const waitingTransports = (w: World, me: string) =>
  w.transports.filter((t) => t.carrier === me && t.status === 'accepted' && !t.ship);

/** Demands the player agreed to deliver but has not arranged a transport for. */
export const unshippedDemands = (w: World, me: string) =>
  w.demands.filter((d) => d.supplier === me && d.status === 'accepted');

export interface PendingAsset {
  asset: Asset;
  transport: Transport | undefined;
}

/** Facilities and storage bought at Dynacore that have not arrived yet. */
export function pendingAssets(w: World, me: string): PendingAsset[] {
  return w.assets
    .filter((a) => a.owner === me && !a.delivered)
    .map((a) => ({ asset: a, transport: w.transports.find((t) => t.asset === a.id && t.status !== 'cancelled') }));
}

// ---------- combined moves (what one tap in the UI does) ----------

/**
 * How a single load gets moved (a facility from Terra, another company's transport):
 * `ship:<id>` an own idle ship, `buy:<model>` buy a new ship and send it (only for facilities and
 * storage bought at Dynacore – everything else is bought in the shipyard), `public` post it on the exchange.
 */
export type Choice = `ship:${string}` | `buy:${string}` | 'public';

/** How a demand is shipped: one or several own idle ships; whatever they cannot carry goes public or is arranged later. */
export interface ShipPlan {
  ships: string[];
  rest: 'public' | 'later';
  /** fee for the public rest */
  fee?: number;
}

const fail = (error: string): Result<never> => ({ ok: false, error });

/** Hold a ship offers for a new load: all of it when idle, the rest when it is already booked for the trip. */
export const tripRoom = (w: World, s: Ship) => (s.phase === 'idle' ? shipDef(s.model).capacity : shipRoom(w, s));

/** Idle own ships of a cargo type, any size (several of them can share a demand). */
export function idleShipsOfCargo(w: World, me: string, cargo: Cargo): Ship[] {
  return plannableShips(w, me).filter((s) => s.phase === 'idle' && shipDef(s.model).cargo === cargo && s.condition >= CONFIG.ships.criticalBelow);
}

function shipFor(w: World, me: string, choice: Choice): Result<string> {
  if (choice.startsWith('buy:')) {
    const r = buyShip(w, me, choice.slice(4));
    return r.ok ? { ok: true, value: r.value.id } : r;
  }
  return { ok: true, value: choice.slice(5) };
}

function checkChoice(w: World, me: string, choice: Choice, cargo: Cargo, amount: number): Result<undefined> {
  if (choice === 'public') return { ok: true, value: undefined };
  const def = choice.startsWith('buy:') ? shipDef(choice.slice(4)) : undefined;
  if (def) {
    if (def.cargo !== cargo || def.capacity < amount) return fail(`${def.name} passt nicht für diese Ladung.`);
    if (company(w, me).cash < def.price) return fail(`Nicht genug Barkapital für einen ${def.name}.`);
  }
  return { ok: true, value: undefined };
}

/** Checks a plan before anything is changed; returns the FE left for the public/later part. */
function checkPlan(w: World, me: string, d: Demand, from: string, plan: ShipPlan, open: number): Result<number> {
  const cargo = good(d.good).cargo;
  let rest = open;
  for (const id of new Set(plan.ships)) {
    const s = w.ships.find((x) => x.id === id);
    if (!s || s.owner !== me) return fail('Schiff nicht gefunden.');
    if (shipDef(s.model).cargo !== cargo) return fail(`${shipDef(s.model).name} transportiert kein ${cargoName(cargo)}.`);
    if (s.phase !== 'idle' && !canJoin(w, s, { cargo, amount: 1, fromPlanet: from, toPlanet: d.toPlanet })) return fail(`${shipDef(s.model).name} ist nicht mehr frei.`);
    rest -= tripRoom(w, s);
  }
  rest = Math.max(0, rest);
  if (rest > 0 && plan.rest === 'public' && plan.fee !== undefined) {
    const min = minTransportFee(w, d.good, rest, from, d.toPlanet);
    if (plan.fee < min) return fail(`Das Honorar für die restlichen ${rest} FE muss mindestens ${min} Cr betragen.`);
  }
  return { ok: true, value: rest };
}

/** Ships an accepted demand by plan: biggest selected ships first, each takes what fits. */
export function shipDemand(w: World, me: string, demandId: string, plan: ShipPlan): Result<Transport[]> {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d || d.supplier !== me || d.status !== 'accepted') return fail('Kein passender angenommener Auftrag.');
  const from = facility(w, d.supplierFacility!);
  if (!from) return fail('Lieferwerk existiert nicht mehr.');
  const pre = checkPlan(w, me, d, from.planet, plan, unshippedAmount(d));
  if (!pre.ok) return pre;
  const ships = [...new Set(plan.ships)]
    .map((id) => w.ships.find((x) => x.id === id)!)
    .map((s) => ({ s, room: tripRoom(w, s) }))
    .sort((a, b) => b.room - a.room);
  const out: Transport[] = [];
  for (const { s, room } of ships) {
    const open = unshippedAmount(d);
    if (open <= 0 || room <= 0) continue;
    const t = postTransportForDemand(w, me, demandId, 'own', undefined, Math.min(open, room));
    if (!t.ok) return t;
    const a = assignShip(w, me, s.id, t.value.id);
    if (!a.ok) return a;
    out.push(t.value);
  }
  if (unshippedAmount(d) > 0 && plan.rest === 'public') {
    const t = postTransportForDemand(w, me, demandId, 'public', plan.fee);
    if (!t.ok) return t;
    out.push(t.value);
  }
  return { ok: true, value: out };
}

/** Pickup planet of an accepted demand (the supplying plant's planet). */
const pickupOf = (w: World, d: Demand) => (d.supplierFacility ? facility(w, d.supplierFacility)?.planet : undefined);

/**
 * Other accepted deliveries of the player that still need a transport and share the route of `demandId`:
 * same pickup planet, same destination, same cargo. Earliest deadline first.
 */
export function bundleCandidates(w: World, me: string, demandId: string): Demand[] {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return [];
  const from = pickupOf(w, d);
  const cargo = good(d.good).cargo;
  return unshippedDemands(w, me)
    .filter((x) => x.id !== d.id && x.toPlanet === d.toPlanet && good(x.good).cargo === cargo && pickupOf(w, x) === from && unshippedAmount(x) > 0)
    .sort((a, b) => a.deadlineDay - b.deadlineDay);
}

/**
 * „Alle Lieferungen“: ships this delivery on the chosen ships (split as usual, rest stays for later), then
 * puts every other delivery of the same route onto them as a whole load while it fits.
 */
export function shipAll(w: World, me: string, demandId: string, shipIds: string[]): Result<{ count: number; amount: number }> {
  if (!shipIds.length) return fail('Bitte wähle mindestens ein Schiff.');
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return fail('Kein passender angenommener Auftrag.');
  const others = bundleCandidates(w, me, demandId);
  const before = unshippedAmount(d);
  const first = shipDemand(w, me, demandId, { ships: shipIds, rest: 'later' });
  if (!first.ok) return first;
  let count = 1;
  let amount = before - unshippedAmount(d);
  const ships = [...new Set(shipIds)].map((id) => w.ships.find((s) => s.id === id)!);
  const from = pickupOf(w, d)!;
  for (const x of others) {
    const load = { cargo: good(x.good).cargo, amount: unshippedAmount(x), fromPlanet: from, toPlanet: x.toPlanet };
    // a ship already on this route takes the load along; a chosen ship that stayed idle starts the trip
    const s =
      ships.find((s) => canJoin(w, s, load)) ??
      ships.find((s) => s.phase === 'idle' && shipDef(s.model).cargo === load.cargo && shipDef(s.model).capacity >= load.amount && s.condition >= CONFIG.ships.criticalBelow);
    if (!s) continue;
    const t = postTransportForDemand(w, me, x.id, 'own', undefined, load.amount);
    if (!t.ok) return t;
    const a = assignShip(w, me, s.id, t.value.id);
    if (!a.ok) return a;
    count += 1;
    amount += load.amount;
  }
  return { ok: true, value: { count, amount } };
}

/** Accept a demand from one of the player's facilities and ship it by plan in one go. */
export function deliver(w: World, me: string, demandId: string, facilityId: string, plan: ShipPlan): Result<Demand> {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return fail('Diese Nachfrage gibt es nicht mehr.');
  const f = facility(w, facilityId);
  if (!f) return fail('Anlage nicht gefunden.');
  const pre = checkPlan(w, me, d, f.planet, plan, d.amount);
  if (!pre.ok) return pre;
  const acc = acceptDemand(w, me, demandId, facilityId);
  if (!acc.ok) return acc;
  const r = shipDemand(w, me, demandId, plan);
  return r.ok ? acc : r;
}

/** Suggested plan: ships already going the same way first, then the nearest idle ships, until the amount is covered. */
export function defaultPlan(w: World, me: string, cargo: Cargo, amount: number, at: string, to?: string): ShipPlan {
  const ships: string[] = [];
  let left = amount;
  const joining = to ? joinableShips(w, me, cargo, at, to) : [];
  const idle = idleShipsOfCargo(w, me, cargo).sort((a, b) => distance(a.at ?? TERRA, at) - distance(b.at ?? TERRA, at));
  for (const s of [...joining, ...idle]) {
    if (left <= 0) break;
    ships.push(s.id);
    left -= tripRoom(w, s);
  }
  return { ships, rest: 'public' };
}

/** Fly a transport the player carries (e.g. a facility from Terra), or post it publicly if it is an own one. */
export function moveTransport(w: World, me: string, transportId: string, choice: Choice, fee?: number): Result<Transport> {
  const t = transport(w, transportId);
  if (!t) return fail('Diesen Transport gibt es nicht mehr.');
  if (choice.startsWith('buy:') && t.kind !== 'asset') return fail('Schiffe gibt es in der Werft auf Terra.');
  const pre = checkChoice(w, me, choice, t.cargo, t.amount);
  if (!pre.ok) return pre;
  if (choice === 'public') return releaseTransport(w, me, transportId, fee);
  const s = shipFor(w, me, choice);
  if (!s.ok) return s;
  const a = assignShip(w, me, s.value, transportId);
  return a.ok ? { ok: true, value: t } : a;
}

/** Take on another company's public transport and send an own idle ship right away. */
export function carry(w: World, me: string, transportId: string, choice: Choice): Result<Transport> {
  const t = transport(w, transportId);
  if (!t || t.status !== 'open') return fail('Dieser Transport ist nicht mehr offen.');
  if (!choice.startsWith('ship:')) return fail('Bitte wähle eines deiner freien Schiffe.');
  const acc = acceptTransport(w, me, transportId);
  if (!acc.ok) return acc;
  const a = assignShip(w, me, choice.slice(5), transportId);
  return a.ok ? acc : a;
}

/**
 * Sensible default for a single load: an idle own ship, else (only where buying is offered, i.e. for
 * facilities from Dynacore) the cheapest fitting new one, else public.
 */
export function defaultChoice(w: World, me: string, cargo: Cargo, amount: number, at: string, allowBuy = false, to?: string): Choice {
  const joining = to ? joinableShips(w, me, cargo, at, to, amount)[0] : undefined;
  if (joining) return `ship:${joining.id}`;
  const idle = idleFittingShips(w, me, cargo, amount).sort((a, b) => distance(a.at ?? TERRA, at) - distance(b.at ?? TERRA, at))[0];
  if (idle) return `ship:${idle.id}`;
  const model = cheapestShipFor(cargo, amount);
  if (allowBuy && model && company(w, me).cash >= model.price) return `buy:${model.id}`;
  return 'public';
}

// ---------- guide: the manual's example without the manual ----------

export type GuideTab = 'terra' | 'facilities' | 'fleet' | 'market' | 'orders' | 'stats';

export interface GuideStep {
  id: string;
  title: string;
  text: string;
  tab: GuideTab;
  /** value of a data-guide attribute in the UI that should be highlighted */
  target?: string;
  /** the step only needs time to pass */
  wait?: boolean;
}

export const FIRST_FACILITY = 'oilwell';

/** The first order counts as done once the company has earned money from a delivery or a fee. */
export const firstOrderDone = (w: World, me: string) => company(w, me).revenue > 0;

export function guide(w: World, me: string): GuideStep {
  const c = company(w, me);
  const facs = facilitiesOf(w, me);
  const pendingFacs = pendingAssets(w, me).filter((p) => p.asset.kind === 'facility');

  if (firstOrderDone(w, me)) {
    return {
      id: 'done',
      title: 'Erster Auftrag erledigt!',
      text: 'Dein erstes Geld ist verdient. Ab jetzt bist du frei: Nimm weitere Nachfragen an, fahre mit freien Schiffen fremde Transporte oder baue eine zweite Anlage. Behalte die Kreditrate in der Bank im Blick.',
      tab: 'stats',
    };
  }

  // 1–2: money and the first facility
  if (!facs.length && !pendingFacs.length) {
    const site = planetsFor(FIRST_FACILITY).sort((a, b) => distance(TERRA, a.id) - distance(TERRA, b.id))[0]!;
    const def = facilityDef(FIRST_FACILITY);
    const need = def.price + (cheapestShipFor('piece', def.size)?.price ?? 0);
    if (c.cash < need && c.loans.length === 0) {
      return {
        id: 'loan',
        title: 'Kredit aufnehmen',
        text: `Dein Startkapital reicht nicht für eine Anlage und einen Frachter. Geh in der Bank auf Terra auf „Kredit aufnehmen“. Tipp aus dem Handbuch: höchster Betrag, längste Laufzeit – dann ist die Tagesrate am kleinsten.`,
        tab: 'terra',
        target: 'bank-loan',
      };
    }
    return {
      id: 'facility',
      title: `${def.name} kaufen`,
      text: `Kaufe bei Dynacore eine ${def.name} für ${site.name}. Das ist die nächste Ölwelt bei Terra (${Math.round(distance(TERRA, site.id))} Parsec), Erdöl wird immer gebraucht.`,
      tab: 'terra',
      target: `buy-${FIRST_FACILITY}-${site.id}`,
    };
  }

  // 3–5: fly the facility out
  if (!facs.length) {
    const p = pendingFacs[0]!;
    const t = p.transport;
    const where = planet(p.asset.planet).name;
    const name = facilityDef(p.asset.defId).name;
    if (t && t.status === 'open') {
      return {
        id: 'asset-public',
        title: 'Warten auf einen Frachter',
        text: `Die ${name} ist an der Börse ausgeschrieben. Sobald eine Firma den Transport übernimmt, fliegt sie nach ${where}. Schneller geht es mit einem eigenen Stückgutfrachter.`,
        tab: 'facilities',
        wait: true,
      };
    }
    if (t && t.status === 'accepted' && !t.ship && t.carrier === me) {
      return {
        id: 'asset-transport',
        title: 'Anlage nach ' + where + ' fliegen',
        text: `Die ${name} steht als Stückgut (${t.amount.toLocaleString('de-DE')} FE) auf Terra. Unter „Anlagen“ → „Transport organisieren“ kaufst du einen Stückgutfrachter und schickst ihn los – in einem Schritt.`,
        tab: 'facilities',
        target: 'asset-transport',
      };
    }
    const s = t?.ship ? w.ships.find((x) => x.id === t.ship) : undefined;
    return {
      id: 'wait-flight',
      title: 'Die Anlage ist unterwegs',
      text: s
        ? `Dein Frachter ${shipDef(s.model).name} bringt die ${name} nach ${where}. Lass die Zeit laufen (▶ oben rechts).`
        : `Die ${name} ist auf dem Weg nach ${where}. Lass die Zeit laufen (▶ oben rechts).`,
      tab: 'facilities',
      target: 'time',
      wait: true,
    };
  }

  // 6–7: build and start
  if (facs.every((f) => f.status === 'construction')) {
    const f = facs[0]!;
    return {
      id: 'wait-build',
      title: 'Die Anlage wird gebaut',
      text: `Die ${facilityDef(f.type).name} auf ${planet(f.planet).name} ist in ${f.buildDaysLeft} ${f.buildDaysLeft === 1 ? 'Tag' : 'Tagen'} fertig. Danach musst du sie selbst in Betrieb nehmen.`,
      tab: 'facilities',
      target: 'time',
      wait: true,
    };
  }
  if (!facs.some((f) => f.status === 'running')) {
    return {
      id: 'start',
      title: 'Betrieb aufnehmen',
      text: 'Die Anlage ist fertig, steht aber still – Wartung kostet schon jetzt. Unter „Anlagen“ auf „Betrieb aufnehmen“ tippen, dann fördert sie jeden Tag.',
      tab: 'facilities',
      target: 'start-facility',
    };
  }

  // 8–10: the first order
  const unshipped = unshippedDemands(w, me)[0];
  if (unshipped) {
    return {
      id: 'arrange',
      title: 'Transport organisieren',
      text: `Du hast zugesagt, ${good(unshipped.good).name} zu liefern. Unter „Aufträge“ legst du fest, welches Schiff fährt – oder du schreibst den Transport öffentlich aus.`,
      tab: 'orders',
      target: 'arrange',
    };
  }
  const shipping = w.demands.find((d) => d.supplier === me && d.status === 'shipping' && d.requester !== me);
  if (shipping) {
    const t = shipping.transport ? transport(w, shipping.transport) : undefined;
    if (t && t.carrier === me && t.status === 'accepted' && !t.ship) {
      return {
        id: 'assign',
        title: 'Schiff zuweisen',
        text: 'Für deine Lieferung fehlt noch ein Schiff. Unter „Aufträge“ ein passendes Schiff zuweisen oder eins in der Werft kaufen.',
        tab: 'orders',
        target: 'waiting',
      };
    }
    return {
      id: 'wait-delivery',
      title: 'Lieferung unterwegs',
      text: `${shipping.amount.toLocaleString('de-DE')} FE ${good(shipping.good).name} sind auf dem Weg zu ${companyName(w, shipping.requester)}. Bezahlt wird bei Ankunft. Lass die Zeit laufen.`,
      tab: 'orders',
      target: 'time',
      wait: true,
    };
  }
  const options = deliverableDemands(w, me);
  const ready = options.find((o) => o.ready);
  if (ready) {
    // ships are bought in the shipyard, not in the delivery dialog
    const cargo = good(ready.d.good).cargo;
    if (!shipsOf(w, me).some((s) => shipDef(s.model).cargo === cargo)) {
      const model = cheapestShipFor(cargo, 0)!;
      return {
        id: 'ship',
        title: `Frachter für ${cargoName(cargo)} kaufen`,
        text: `An der Börse wartet eine Nachfrage nach ${good(ready.d.good).name}, die du aus deinem Lager erfüllen kannst. Dafür brauchst du ein Schiff für ${cargoName(cargo)} – dein Stückgutfrachter passt nicht. Kaufe in der Werft auf Terra einen ${model.name}. (Ohne eigenes Schiff kannst du den Transport auch öffentlich ausschreiben.)`,
        tab: 'terra',
        target: `buy-ship-${model.id}`,
      };
    }
    return {
      id: 'deliver',
      title: 'Ersten Auftrag annehmen',
      text: 'An der Börse wartet eine Nachfrage, die du aus deinem Lager erfüllen kannst. Tippe auf „Liefern“ und wähle dein Schiff – bei großen Mengen auch mehrere.',
      tab: 'market',
      target: 'deliver',
    };
  }
  const next = options.find((o) => o.daysToReady < Infinity);
  return {
    id: 'wait-stock',
    title: 'Lager füllt sich',
    text: next
      ? `Die nächste passende Nachfrage will ${next.d.amount.toLocaleString('de-DE')} FE ${good(next.d.good).name} – in etwa ${next.daysToReady} ${next.daysToReady === 1 ? 'Tag' : 'Tagen'} hast du genug auf Lager. Lass die Zeit laufen. Du kannst auch jetzt schon annehmen, um sie der Konkurrenz wegzuschnappen – wird die Ware nicht rechtzeitig fertig, zahlst du Strafe.`
      : 'Gerade fragt niemand nach deiner Ware. Terra und die anderen Firmen stellen laufend neue Nachfragen ein – lass die Zeit laufen, die Börse meldet sich mit einer Zahl am Tab.',
    tab: 'market',
    target: 'time',
    wait: true,
  };
}

// ---------- notifications ----------

export interface Offer {
  id: string;
  kind: 'demand' | 'transport';
  text: string;
}

/**
 * Offers at the exchange the player could serve right now with an idle own ship: demands for goods
 * on stock and public transports. The UI remembers which ids it has shown and flags the new ones.
 */
export function fittingOffers(w: World, me: string): Offer[] {
  const out: Offer[] = [];
  for (const o of deliverableDemands(w, me)) {
    const cargo = good(o.d.good).cargo;
    const from = o.facilities[0]?.planet;
    if (!o.ready || !from || !(idleShipsOfCargo(w, me, cargo).length || joinableShips(w, me, cargo, from, o.d.toPlanet).length)) continue;
    out.push({ id: o.d.id, kind: 'demand', text: `${good(o.d.good).name} für ${companyName(w, o.d.requester)}` });
  }
  for (const t of openTransports(w, me)) {
    if (carryState(w, me, t) !== 'idle') continue;
    out.push({ id: t.id, kind: 'transport', text: `Transport für ${companyName(w, t.issuer)}` });
  }
  return out;
}

/** Offers that were not in `seen` – the caller adds them to `seen` once the player was told. */
export const newOffers = (w: World, me: string, seen: ReadonlySet<string>) => fittingOffers(w, me).filter((o) => !seen.has(o.id));

// ---------- key figures for the area headers ----------

export interface AreaStats {
  facilities: { total: number; running: number; stopped: number; building: number; pending: number };
  fleet: { total: number; idle: number; moving: number; critical: number };
  market: { fitting: number; transports: number; big: number };
  orders: { promised: number; unshipped: number; nextDeadline: number | null; overdue: boolean; routes: number };
}

/** What the header of Anlagen, Flotte, Börse and Aufträge shows. */
export function areaStats(w: World, me: string): AreaStats {
  const facs = facilitiesOf(w, me);
  const producing = (f: Facility) => f.status === 'running' && productionEfficiency(f) > 0;
  const ships = shipsOf(w, me);
  const myGoods = new Set(facs.flatMap((f) => Object.keys(facilityDef(f.type).outputs)));
  const promised = w.demands.filter((d) => d.supplier === me && (d.status === 'accepted' || d.status === 'shipping'));
  const deadlines = [...promised, ...waitingTransports(w, me)].map((x) => x.deadlineDay - w.day);
  const nextDeadline = deadlines.length ? Math.min(...deadlines) : null;
  return {
    facilities: {
      total: facs.length,
      running: facs.filter(producing).length,
      stopped: facs.filter((f) => f.status === 'stopped' || (f.status === 'running' && !producing(f))).length,
      building: facs.filter((f) => f.status === 'construction').length,
      pending: pendingAssets(w, me).length,
    },
    fleet: {
      total: ships.length,
      idle: ships.filter((s) => s.phase === 'idle' && s.condition >= CONFIG.ships.criticalBelow && !lineRoute(w, s.id)).length,
      moving: ships.filter((s) => s.phase !== 'idle').length,
      critical: ships.filter((s) => s.condition < CONFIG.ships.criticalBelow).length,
    },
    market: {
      fitting: deliverableDemands(w, me).filter((o) => o.ready).length + openTransports(w, me).filter((t) => carryState(w, me, t) === 'idle').length,
      transports: openTransports(w, me).filter((t) => carryState(w, me, t) !== 'none').length,
      big: w.demands.filter((d) => d.status === 'open' && d.requester === 'terra' && d.big && myGoods.has(d.good)).length,
    },
    orders: { promised: promised.length, unshipped: unshippedDemands(w, me).length, nextDeadline, overdue: nextDeadline !== null && nextDeadline < 0, routes: (w.routes ?? []).filter((r) => r.owner === me && r.active).length },
  };
}
