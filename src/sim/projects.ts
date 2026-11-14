// Großprojekte: expensive goals for the late game. Money to start, then large amounts of goods that the
// building site orders at the exchange; finished projects give prestige and a comfort advantage.

import { debt, maxOrderAmount, transportDeadline, type Result } from './actions';
import { CONFIG, TERRA, good, projectDef } from './data';
import type { Demand, ProjectState, World } from './types';
import { company, log, newId, pay } from './world';

const fail = (error: string): Result<never> => ({ ok: false, error });

export const projectState = (w: World, id: string) => (w.projects ?? []).find((p) => p.id === id);
export const buildingProject = (w: World) => (w.projects ?? []).find((p) => p.status === 'building');

/** Has this company finished the project? (only the player builds projects) */
export const hasProject = (w: World, c: string, id: string) => c === w.playerId && projectState(w, id)?.status === 'done';

/** Starts a Großprojekt: player only, no debt, the price from cash, one at a time. */
export function startProject(w: World, c: string, id: string): Result<ProjectState> {
  if (c !== w.playerId) return fail('Großprojekte baut nur deine Firma.');
  const co = company(w, c);
  if (co.bankrupt) return fail(`${co.name} ist bankrott.`);
  const def = projectDef(id);
  const state = projectState(w, id);
  if (state?.status === 'done') return fail(`${def.name} ist schon gebaut.`);
  const running = buildingProject(w);
  if (running) return fail(`${projectDef(running.id).name} läuft schon – es gibt nur eine Baustelle zur Zeit.`);
  if (debt(w, c) > 0) return fail('Nur schuldenfrei – zahle zuerst alle Kredite zurück.');
  if (co.cash < def.price) return fail(`Nicht genug Barkapital (${def.price} Cr benötigt).`);
  pay(w, c, null, def.price);
  const p: ProjectState = { id, status: 'building', startDay: w.day, delivered: {} };
  (w.projects ??= []).push(p);
  log(w, c, `Großprojekt ${def.name} gestartet – die Baustelle im Orbit von Terra bestellt jetzt ihre Waren.`, 3);
  return { ok: true, value: p };
}

/** Gives up the running project: money and delivered goods are lost, open orders are withdrawn. */
export function abortProject(w: World, c: string): Result<undefined> {
  const p = buildingProject(w);
  if (c !== w.playerId || !p) return fail('Es läuft kein Großprojekt.');
  for (const d of w.demands) if (d.project === p.id && d.status === 'open') d.status = 'cancelled';
  w.projects = (w.projects ?? []).filter((x) => x !== p);
  log(w, c, `Großprojekt ${projectDef(p.id).name} abgebrochen.`, 2);
  return { ok: true, value: undefined };
}

/** Orders of the project for one good that are still on their way (open, accepted or shipping). */
const inFlight = (w: World, p: ProjectState, g: string) =>
  w.demands.filter((d) => d.project === p.id && d.good === g && ['open', 'accepted', 'shipping'].includes(d.status));

/** One day of the building site: keep orders going out, finish when everything has arrived. */
export function projectsTick(w: World): void {
  const p = buildingProject(w);
  const me = w.playerId;
  if (!p || !me) return;
  const def = projectDef(p.id);
  const co = company(w, me);
  p.waiting = undefined;
  // everything other firms may still deliver is owed by the player: keep it all covered by cash
  let committed = w.demands
    .filter((d) => d.project === p.id && ['open', 'accepted', 'shipping'].includes(d.status) && d.supplier !== me)
    .reduce((s, d) => s + (d.amount - (d.delivered ?? 0)) * d.pricePerFe, 0);
  let done = true;
  for (const [g, need] of Object.entries(def.materials)) {
    const delivered = p.delivered[g] ?? 0;
    if (delivered < need) done = false;
    const flying = inFlight(w, p, g);
    let rest = need - delivered - flying.reduce((s, d) => s + (d.amount - (d.delivered ?? 0)), 0);
    for (let n = flying.length; n < CONFIG.projects.openOrdersPerGood && rest > 0; n++) {
      const amount = Math.min(rest, maxOrderAmount(w, me, g));
      const price = Math.round((w.prices[g] ?? good(g).basePrice) * 100) / 100;
      // an AI firm may deliver and the player pays: only order what the cash covers
      if (co.cash - committed < amount * price) {
        p.waiting = 'wartet auf Geld';
        break;
      }
      const d: Demand = {
        id: newId(w, 'd'),
        requester: me,
        good: g,
        amount,
        toPlanet: TERRA,
        toFacility: null,
        pricePerFe: price,
        own: false,
        status: 'open',
        supplier: null,
        supplierFacility: null,
        transport: null,
        createdDay: w.day,
        deadlineDay: transportDeadline(w, good(g).cargo, amount, TERRA, TERRA) + CONFIG.orders.demandExtraDays,
        late: false,
        project: p.id,
      };
      w.demands.push(d);
      committed += amount * price;
      rest -= amount;
    }
  }
  if (done) {
    p.status = 'done';
    p.doneDay = w.day;
    co.prestige = (co.prestige ?? 0) + def.prestige;
    log(w, me, `Großprojekt ${def.name} fertig! +${def.prestige} Prestige. ${def.effect}`, 3);
  }
}

/** A delivery for a project arrived (called by the engine for every delivered part). */
export function projectDelivered(w: World, d: Demand, part: number): void {
  const p = d.project ? projectState(w, d.project) : undefined;
  if (p) p.delivered[d.good] = (p.delivered[d.good] ?? 0) + part;
}

