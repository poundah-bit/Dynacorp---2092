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
  company,
  createWorld,
  diff,
  distance,
  facilitiesOf,
  facilityDef,
  good,
  planet,
  planetsFor,
  postTransportForDemand,
  releaseTransport,
  shipDef,
  shipSpeed,
  shipsOf,
  storageCapacity,
  transport,
  transportDeadline,
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
} from '../sim/index';

/** AI competitors: chosen on the start screen, 10 by default, at most as many as companies.json lists. */
export const AI_DEFAULT = 10;
export const AI_MIN = 1;
export const AI_MAX = COMPANIES.length;

export const clampAi = (n: number) => Math.max(AI_MIN, Math.min(AI_MAX, Math.round(Number.isFinite(n) ? n : AI_DEFAULT)));

export function newGame(name: string, difficulty: Difficulty, seed: number, aiCompanies = AI_DEFAULT): World {
  return createWorld({ seed, difficulty, playerName: name.trim() || 'Meine Firma', aiCompanies: clampAi(aiCompanies) });
}

export const companyName = (w: World, id: string | null) =>
  !id ? '–' : id === 'terra' ? 'Terra' : (w.companies.find((c) => c.id === id)?.name ?? '?');

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

export function idleFittingShips(w: World, me: string, cargo: Cargo, amount: number): Ship[] {
  return shipsOf(w, me).filter((s) => {
    const def = shipDef(s.model);
    return s.phase === 'idle' && def.cargo === cargo && def.capacity >= amount && s.condition >= CONFIG.ships.scrapBelow;
  });
}

export function cheapestShipFor(cargo: Cargo, amount: number): ShipDef | undefined {
  return SHIPS.filter((m) => m.cargo === cargo && m.capacity >= amount).sort((a, b) => a.price - b.price)[0];
}

/** Can the player carry this transport: with an idle ship now, a busy one later, or not at all? */
export function carryState(w: World, me: string, t: Transport): 'idle' | 'busy' | 'none' {
  const fit = shipsOf(w, me).filter((s) => shipDef(s.model).cargo === t.cargo && shipDef(s.model).capacity >= t.amount);
  if (fit.some((s) => s.phase === 'idle')) return 'idle';
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

/** Facilities and storage bought at DYNATECH that have not arrived yet. */
export function pendingAssets(w: World, me: string): PendingAsset[] {
  return w.assets
    .filter((a) => a.owner === me && !a.delivered)
    .map((a) => ({ asset: a, transport: w.transports.find((t) => t.asset === a.id && t.status !== 'cancelled') }));
}

// ---------- combined moves (what one tap in the UI does) ----------

/**
 * How a load gets moved: `ship:<id>` an own idle ship, `buy:<model>` buy a new ship at the
 * shipyard and send it, `public` post it on the exchange for a fee.
 */
export type Choice = `ship:${string}` | `buy:${string}` | 'public';

const fail = (error: string): Result<never> => ({ ok: false, error });

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

/** Accept a demand from one of the player's facilities and arrange the transport in one go. */
export function deliver(w: World, me: string, demandId: string, facilityId: string, choice: Choice, fee?: number): Result<Demand> {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return fail('Diese Nachfrage gibt es nicht mehr.');
  const pre = checkChoice(w, me, choice, good(d.good).cargo, d.amount);
  if (!pre.ok) return pre;
  const acc = acceptDemand(w, me, demandId, facilityId);
  if (!acc.ok) return acc;
  const r = shipDemand(w, me, demandId, choice, fee);
  return r.ok ? acc : r;
}

/** Arrange the transport for a demand the player has accepted as supplier. */
export function shipDemand(w: World, me: string, demandId: string, choice: Choice, fee?: number): Result<Transport> {
  const d = w.demands.find((x) => x.id === demandId);
  if (!d) return fail('Diese Nachfrage gibt es nicht mehr.');
  const pre = checkChoice(w, me, choice, good(d.good).cargo, d.amount);
  if (!pre.ok) return pre;
  if (choice === 'public') return postTransportForDemand(w, me, demandId, 'public', fee);
  const s = shipFor(w, me, choice);
  if (!s.ok) return s;
  const t = postTransportForDemand(w, me, demandId, 'own');
  if (!t.ok) return t;
  const a = assignShip(w, me, s.value, t.value.id);
  return a.ok ? t : a;
}

/** Fly a transport the player carries (e.g. a facility from Terra), or post it publicly if it is an own one. */
export function moveTransport(w: World, me: string, transportId: string, choice: Choice, fee?: number): Result<Transport> {
  const t = transport(w, transportId);
  if (!t) return fail('Diesen Transport gibt es nicht mehr.');
  const pre = checkChoice(w, me, choice, t.cargo, t.amount);
  if (!pre.ok) return pre;
  if (choice === 'public') return releaseTransport(w, me, transportId, fee);
  const s = shipFor(w, me, choice);
  if (!s.ok) return s;
  const a = assignShip(w, me, s.value, transportId);
  return a.ok ? { ok: true, value: t } : a;
}

/** Take on another company's public transport and send a ship right away. */
export function carry(w: World, me: string, transportId: string, choice: Choice): Result<Transport> {
  const t = transport(w, transportId);
  if (!t || t.status !== 'open') return fail('Dieser Transport ist nicht mehr offen.');
  if (choice === 'public') return fail('Einen fremden Transport kannst du nicht weiterreichen.');
  const pre = checkChoice(w, me, choice, t.cargo, t.amount);
  if (!pre.ok) return pre;
  const acc = acceptTransport(w, me, transportId);
  if (!acc.ok) return acc;
  const s = shipFor(w, me, choice);
  if (!s.ok) return s;
  const a = assignShip(w, me, s.value, transportId);
  return a.ok ? acc : a;
}

/** Sensible default choice for a load: an idle own ship, else buying the cheapest fitting one, else public. */
export function defaultChoice(w: World, me: string, cargo: Cargo, amount: number, at: string): Choice {
  const idle = idleFittingShips(w, me, cargo, amount).sort((a, b) => distance(a.at ?? TERRA, at) - distance(b.at ?? TERRA, at))[0];
  if (idle) return `ship:${idle.id}`;
  const model = cheapestShipFor(cargo, amount);
  if (model && company(w, me).cash >= model.price) return `buy:${model.id}`;
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
      text: `Kaufe bei DYNATECH eine ${def.name} für ${site.name}. Das ist die nächste Ölwelt bei Terra (${Math.round(distance(TERRA, site.id))} Parsec), Erdöl wird immer gebraucht.`,
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
  if (options.some((o) => o.ready)) {
    return {
      id: 'deliver',
      title: 'Ersten Auftrag annehmen',
      text: 'An der Börse wartet eine Nachfrage, die du aus deinem Lager erfüllen kannst. Tippe auf „Liefern“: Dort wählst du das Schiff – ohne eigenen Tanker kaufst du gleich einen dazu.',
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
