// The daily tick. One call to step() advances the world by one game day.

import { CONFIG, FACILITIES, GOODS, PLANETS, SHIPS, TERRA, distance, facilityDef, good, planet, shipDef, storageDef, unitOf } from './data';
import { companyValue, debt, diff, repairShip, shipLoads, startRoute, transportDeadline } from './actions';
import { runAi } from './ai';
import { routesTick } from './automation';
import type { Cargo, Demand, Facility, Ship, Transport, World } from './types';
import {
  asset,
  company,
  demand,
  facility,
  freeCapacity,
  isCritical,
  log,
  newId,
  pay,
  random,
  randInt,
  shipSpeed,
  transport,
} from './world';

export function step(w: World): void {
  if (w.collapsed) return;
  w.day += 1;
  bank(w);
  facilitiesTick(w);
  shipsTick(w);
  ordersTick(w);
  terraDemands(w);
  updatePrices(w);
  gravoStorms(w);
  routesTick(w);
  runAi(w);
  checkBankruptcies(w);
  checkCollapse(w);
}

export function run(w: World, days: number): void {
  for (let i = 0; i < days && !w.collapsed; i++) step(w);
}

// ---------- bank ----------

function bank(w: World) {
  for (const c of w.companies) {
    if (c.bankrupt) continue;
    for (const loan of [...c.loans]) {
      const due = Math.min(loan.dailyRate, loan.remaining);
      if (c.cash >= due) {
        c.cash -= due;
        loan.remaining -= due;
        loan.overdueDays = 0;
      } else {
        loan.overdueDays += 1;
        if (loan.overdueDays === 1) {
          loan.remaining = Math.round(loan.remaining * (1 + CONFIG.credit.lateInterest));
          log(w, c.id, `${c.name} ist mit der Kreditrate im Verzug.`, 2);
        }
        if (loan.overdueDays >= CONFIG.credit.seizureAfterDays) seize(w, c.id, loan.remaining);
      }
      loan.daysLeft -= 1;
      if (loan.remaining <= 0) c.loans = c.loans.filter((l) => l !== loan);
      else if (loan.daysLeft <= 0) loan.dailyRate = loan.remaining; // everything due now
    }
  }
}

/** The bank seizes the cheapest idle ship and sells it at 60 % of its value against the debt. */
function seize(w: World, companyId: string, owed: number) {
  const c = company(w, companyId);
  const idle = w.ships.filter((s) => s.owner === companyId && s.phase === 'idle');
  if (!idle.length) return;
  idle.sort((a, b) => shipDef(a.model).price - shipDef(b.model).price);
  const s = idle[0]!;
  w.ships = w.ships.filter((x) => x !== s);
  const proceeds = Math.round(shipDef(s.model).price * (s.condition / 100) * 0.6);
  const loan = c.loans[0];
  if (loan) loan.remaining = Math.max(0, loan.remaining - Math.min(owed, proceeds));
  log(w, companyId, `Die Bank pfändet einen ${shipDef(s.model).name} von ${c.name}.`, 3);
}

// ---------- facilities: construction, costs, production, wear ----------

function facilitiesTick(w: World) {
  for (const f of w.facilities) {
    const def = facilityDef(f.type);
    if (f.status === 'construction') {
      f.buildDaysLeft -= 1;
      if (f.buildDaysLeft <= 0) {
        f.status = 'stopped';
        log(w, f.owner, `${def.name} auf ${planet(f.planet).name} ist fertig gebaut.`, 2);
      }
      continue;
    }
    let cost = def.maintenance * f.units;
    for (const sid of f.storages) cost += storageDef(sid).maintenance + storageDef(sid).operation;
    if (f.status === 'running') {
      cost += def.operation * f.units;
      produce(f);
      f.condition = Math.max(0, f.condition - CONFIG.facilities.wearPerDay);
    }
    pay(w, f.owner, null, cost);
  }
}

/** Efficiency 0..1: limited by inputs on stock, free storage for outputs and condition. */
export function productionEfficiency(f: Facility): number {
  const def = facilityDef(f.type);
  // wear only hurts below 90 % condition, down to half output
  let eff = f.condition >= 90 ? 1 : Math.max(0.5, f.condition / 90);
  for (const [g, need] of Object.entries(def.inputs)) {
    eff = Math.min(eff, (f.stock[g] ?? 0) / (need * f.units));
  }
  for (const [g, out] of Object.entries(def.outputs)) {
    eff = Math.min(eff, freeCapacity(f, g) / (out * f.units));
  }
  return Math.max(0, Math.min(1, eff));
}

function produce(f: Facility) {
  const def = facilityDef(f.type);
  const eff = productionEfficiency(f);
  if (eff <= 0) {
    f.idleDays += 1;
    return;
  }
  f.idleDays = 0;
  for (const [g, need] of Object.entries(def.inputs)) f.stock[g] = (f.stock[g] ?? 0) - need * f.units * eff;
  for (const [g, out] of Object.entries(def.outputs)) f.stock[g] = (f.stock[g] ?? 0) + Math.floor(out * f.units * eff);
}

// ---------- ships ----------

function shipsTick(w: World) {
  for (const s of [...w.ships]) {
    const def = shipDef(s.model);
    let cost = def.maintenance;
    if (s.phase !== 'idle' && s.phase !== 'repair') cost += def.operation;
    pay(w, s.owner, null, cost);

    if (s.route) {
      s.route.traveled += shipSpeed(s);
      s.condition = Math.max(0, s.condition - CONFIG.ships.wearPerTravelDay);
      if (isCritical(s) && !s.critical) {
        s.critical = true;
        log(w, s.owner, `${def.name} ist in kritischem Zustand und fliegt nur noch mit ${Math.round(CONFIG.ships.criticalSpeedFactor * 100)} % Tempo weiter – danach zur Reparatur nach Terra.`, 2);
      }
      if (s.route.traveled >= s.route.distance) arrive(w, s);
    } else if (s.phase === 'loading' || s.phase === 'unloading' || s.phase === 'repair') {
      s.waitDays -= 1;
      if (s.waitDays <= 0) {
        if (s.phase === 'loading') load(w, s);
        else if (s.phase === 'unloading') unload(w, s);
        else {
          s.condition = 100;
          s.critical = false;
          s.phase = 'idle';
        }
      }
    }
    // repair marked in advance: done automatically as soon as the ship stands idle on Terra
    if (s.repairAtTerra && s.phase === 'idle' && s.at === TERRA) {
      const r = repairShip(w, s.owner, s.id);
      if (r.ok) log(w, s.owner, `${def.name} wird wie vorgemerkt auf Terra repariert.`);
      else {
        s.repairAtTerra = false;
        log(w, s.owner, `Vorgemerkte Reparatur des ${def.name} nicht möglich: ${r.error}`, 2);
      }
    }
  }
}

function arrive(w: World, s: Ship) {
  const to = s.route!.to;
  s.at = to;
  s.route = null;
  if (s.phase === 'toPickup') {
    s.phase = 'loading';
    s.waitDays = CONFIG.loadDays;
  } else if (s.phase === 'toDelivery') {
    s.phase = 'unloading';
    s.waitDays = CONFIG.loadDays;
  } else {
    s.phase = 'idle';
  }
}

/** Drops cancelled loads from a ship; the first live one becomes the main transport. False if nothing is left. */
function pruneLoads(w: World, s: Ship): Transport[] {
  const live = shipLoads(w, s);
  s.transport = live[0]?.id ?? null;
  s.joined = live.slice(1).map((t) => t.id);
  if (!live.length) releaseShip(s);
  return live;
}

function load(w: World, s: Ship) {
  for (const t of shipLoads(w, s)) {
    if (t.kind === 'goods' && !facility(w, t.fromFacility!)) cancelTransport(w, t, 'Das Lieferwerk existiert nicht mehr.');
  }
  const loads = pruneLoads(w, s);
  if (!loads.length) return;
  // all loads of the trip must be on stock; several may come from the same plant
  const need = new Map<string, { f: Facility; good: string; amount: number }>();
  for (const t of loads) {
    if (t.kind !== 'goods') continue;
    const key = `${t.fromFacility}|${t.good}`;
    const n = need.get(key) ?? { f: facility(w, t.fromFacility!)!, good: t.good!, amount: 0 };
    n.amount += t.amount;
    need.set(key, n);
  }
  for (const n of need.values()) {
    if ((n.f.stock[n.good] ?? 0) < n.amount) {
      s.waitDays = 1; // wait for production
      return;
    }
  }
  for (const n of need.values()) {
    n.f.stock[n.good] = (n.f.stock[n.good] ?? 0) - n.amount;
    n.f.reserved[n.good] = Math.max(0, (n.f.reserved[n.good] ?? 0) - n.amount);
  }
  for (const t of loads) t.status = 'loaded';
  startRoute(s, loads[0]!.toPlanet, 'toDelivery');
}

function unload(w: World, s: Ship) {
  for (const t of shipLoads(w, s)) {
    if (t.kind === 'asset') deliverAsset(w, t);
    else deliverGoods(w, t);
    if (!t.own && t.carrier) {
      pay(w, t.issuer, t.carrier, t.fee);
      reputation(w, t.carrier, t.late ? -2 : 1);
      log(w, t.carrier, `${company(w, t.carrier).name} erhält ${t.fee} Cr Transporthonorar (${planet(t.toPlanet).name}).`);
    }
    t.status = 'done';
    t.doneDay = w.day;
  }
  releaseShip(s);
}

function releaseShip(s: Ship) {
  s.transport = null;
  s.joined = [];
  s.phase = 'idle';
  s.waitDays = 0;
}

function cancelTransport(w: World, t: Transport, why: string) {
  t.status = 'cancelled';
  if (t.demand) {
    const d = demand(w, t.demand);
    if (d) d.status = 'cancelled';
  }
  log(w, t.issuer, `Transport ${t.id} abgebrochen: ${why}`, 2);
}

function deliverGoods(w: World, t: Transport) {
  const d = t.demand ? demand(w, t.demand) : undefined;
  if (!d) return;
  // a demand may be split over several ships: each part is stored and paid on its own
  const part = t.amount;
  const value = Math.round(part * d.pricePerFe);
  if (d.requester === 'terra') {
    pay(w, null, d.supplier, value);
  } else {
    const target = d.toFacility ? facility(w, d.toFacility) : undefined;
    if (target) {
      const room = freeCapacity(target, d.good);
      const stored = Math.min(room, part);
      target.stock[d.good] = (target.stock[d.good] ?? 0) + stored;
      if (stored < part) log(w, d.requester, `${part - stored} ${unitOf(d.good)} ${good(d.good).name} gingen mangels Lagerplatz verloren.`, 2);
    }
    if (d.supplier !== d.requester) pay(w, d.requester, d.supplier, value);
  }
  d.delivered = (d.delivered ?? 0) + part;
  const complete = d.delivered >= d.amount;
  if (complete) d.status = 'done';
  if (d.supplier && d.supplier !== d.requester) {
    if (complete) reputation(w, d.supplier, d.late ? -2 : 1);
    const buyer = d.requester === 'terra' ? 'Terra' : company(w, d.requester).name;
    const of = part < d.amount ? ` (Teillieferung, ${d.delivered} von ${d.amount} ${unitOf(d.good)})` : '';
    log(w, d.supplier, `${company(w, d.supplier).name} liefert ${part} ${unitOf(d.good)} ${good(d.good).name} an ${buyer} und erhält ${value} Cr${of}.`);
  }
}

function deliverAsset(w: World, t: Transport) {
  const a = asset(w, t.asset!);
  if (!a) return;
  a.delivered = true;
  if (a.kind === 'facility') {
    const existing = w.facilities.find((f) => f.owner === a.owner && f.type === a.defId && f.planet === a.planet);
    if (existing) {
      existing.units += 1;
      log(w, a.owner, `${facilityDef(a.defId).name} auf ${planet(a.planet).name} wurde erweitert.`, 1);
    } else {
      w.facilities.push({
        id: newId(w, 'f'),
        owner: a.owner,
        type: a.defId,
        planet: a.planet,
        units: 1,
        status: 'construction',
        buildDaysLeft: CONFIG.constructionDays,
        condition: 100,
        stock: {},
        reserved: {},
        storages: [],
        idleDays: 0,
      });
    }
  } else {
    const f = w.facilities.find((x) => x.owner === a.owner && x.planet === a.planet);
    if (f) f.storages.push(a.defId);
  }
}

export function reputation(w: World, companyId: string, delta: number) {
  const c = w.companies.find((x) => x.id === companyId);
  if (c) c.reputation = Math.max(0, Math.min(100, c.reputation + delta));
}

// ---------- orders: deadlines, penalties, expiry ----------

function goodsValue(w: World, goodId: string | null, amount: number) {
  return goodId ? amount * (w.prices[goodId] ?? 0) : amount * 10;
}

function ordersTick(w: World) {
  const rate = diff(w).penaltyRate;
  // A public transport nobody took before its deadline is re-posted with a fresh deadline and a higher fee
  // (paid by the issuer). Otherwise nobody would ever take it – a carrier would owe the penalty at once –
  // and the goods would stay reserved at the plant forever.
  for (const t of w.transports) {
    if (t.status === 'open' && !t.own && w.day > t.deadlineDay) {
      t.deadlineDay = transportDeadline(w, t.cargo, t.amount, t.fromPlanet, t.toPlanet);
      t.fee = Math.round(t.fee * (1 + CONFIG.orders.reofferFeeIncrease));
      log(w, t.issuer, `Niemand hat Transport ${t.id} nach ${planet(t.toPlanet).name} übernommen – neu ausgeschrieben für ${t.fee} Cr.`, 2);
    }
  }
  for (const t of w.transports) {
    if (['accepted', 'assigned', 'loaded'].includes(t.status) && !t.own && t.carrier && !t.late && w.day > t.deadlineDay) {
      t.late = true;
      pay(w, t.carrier, t.issuer, Math.round(goodsValue(w, t.good, t.amount) * rate));
      reputation(w, t.carrier, -5);
      log(w, t.carrier, `${company(w, t.carrier).name} überzieht die Frist für Transport ${t.id}.`, 2);
    }
  }
  for (const d of w.demands) {
    if (['accepted', 'shipping'].includes(d.status) && d.supplier && !d.own && !d.late && w.day > d.deadlineDay) {
      d.late = true;
      const to = d.requester === 'terra' ? null : d.requester;
      pay(w, d.supplier, to, Math.round(goodsValue(w, d.good, d.amount) * rate));
      reputation(w, d.supplier, -3);
    }
    if (d.status === 'open' && w.day - d.createdDay > CONFIG.terra.openOrderExpiryDays) d.status = 'cancelled';
  }
  // keep the lists short: drop finished orders after 30 days
  const keep = (o: { status: string; createdDay: number }) =>
    !(['done', 'cancelled'].includes(o.status) && w.day - o.createdDay > 60);
  // a Lieferroute still has to count its trip: keep the demand it waits for
  const routed = new Set((w.routes ?? []).map((r) => r.demand));
  w.demands = w.demands.filter((d) => keep(d) || routed.has(d.id));
  w.transports = w.transports.filter(keep);
}

// ---------- Terra: buyer of final goods and base demand for everything else ----------

/** Daily output of one unit of the best facility producing a good. */
export function outputPerDay(goodId: string): number {
  return Math.max(0, ...FACILITIES.map((f) => f.outputs[goodId] ?? 0));
}

/**
 * Terra orders as much as one plant produces in `days` days, so a pharma plant (25 FE/day) gets
 * orders of a few hundred FE and an oil well (350 FE/day) of several thousand. Rounded to 100 FE.
 */
export function terraDemandAmount(goodId: string, days: number, factor = 1): number {
  const raw = outputPerDay(goodId) * days * factor;
  return Math.min(largestShipCapacity(good(goodId).cargo), Math.max(CONFIG.terra.minDemandAmount, Math.round(raw / 100) * 100));
}

/** Capacity of the biggest ship type for a cargo – the upper limit for any single order. */
export const largestShipCapacity = (cargo: Cargo) => Math.max(...SHIPS.filter((s) => s.cargo === cargo).map((s) => s.capacity));

/**
 * How many plants of a good the biggest producer runs (units of built facilities, at least 1). Terra's
 * orders for final goods grow with it, so one company can still deliver an order within the deadline.
 */
export function terraOrderScale(w: World, goodId: string): number {
  const units = new Map<string, number>();
  for (const f of w.facilities) {
    if (f.status === 'construction' || !(goodId in facilityDef(f.type).outputs)) continue;
    if (company(w, f.owner).bankrupt) continue;
    units.set(f.owner, (units.get(f.owner) ?? 0) + f.units);
  }
  return Math.max(1, ...units.values());
}

function terraDemands(w: World) {
  const tc = CONFIG.terra;
  for (const g of GOODS) {
    const final = g.tier === 'final';
    // Stabiliser: the cheaper a good gets relative to its base price, the more Terra buys of it.
    const cheapness = Math.min(4, Math.pow(g.basePrice / (w.prices[g.id] ?? g.basePrice), 2));
    const base = final ? tc.demandChancePerGoodPerDay : tc.baseDemandChancePerGoodPerDay;
    // final goods: bigger orders for big producers, just as many FE in total (fewer orders)
    const scale = final ? terraOrderScale(w, g.id) : 1;
    const chance = Math.min(0.9, base * cheapness) / scale;
    if (random(w) >= chance) continue;
    const open = w.demands.filter((d) => d.requester === 'terra' && d.good === g.id && d.status === 'open').length;
    if (open >= tc.maxOpenPerGood * Math.ceil(cheapness)) continue;
    // now and then Terra places a big order (several plants' output) that fills a large ship
    const big = random(w) < tc.bigOrderChance ? randInt(w, tc.bigOrderFactor[0]!, tc.bigOrderFactor[1]!) : 1;
    const amount = terraDemandAmount(g.id, randInt(w, tc.demandDaysOfOutput[0]!, tc.demandDaysOfOutput[1]!), big * scale);
    const factor = final ? tc.priceBonus : tc.baseDemandPriceFactor;
    const d: Demand = {
      id: newId(w, 'd'),
      requester: 'terra',
      good: g.id,
      amount,
      toPlanet: TERRA,
      toFacility: null,
      pricePerFe: Math.round((w.prices[g.id] ?? g.basePrice) * factor * 100) / 100,
      own: false,
      status: 'open',
      supplier: null,
      supplierFacility: null,
      transport: null,
      createdDay: w.day,
      deadlineDay: w.day + tc.demandDeadlineDays,
      late: false,
    };
    if (big > 1) d.big = true;
    w.demands.push(d);
  }
}

// ---------- market prices: supply and demand ----------

export function marketBalance(w: World, goodId: string) {
  let supply = 0;
  let demandAmount = 0;
  for (const f of w.facilities) {
    const def = facilityDef(f.type);
    supply += Math.max(0, (f.stock[goodId] ?? 0) - (f.reserved[goodId] ?? 0));
    if (f.status === 'running') {
      supply += (def.outputs[goodId] ?? 0) * f.units * 10;
      demandAmount += (def.inputs[goodId] ?? 0) * f.units * 10;
    }
  }
  for (const d of w.demands) {
    if (d.good === goodId && d.status === 'open') demandAmount += d.amount;
  }
  return { supply, demand: demandAmount };
}

function updatePrices(w: World) {
  const m = CONFIG.market;
  for (const g of GOODS) {
    const { supply, demand: dem } = marketBalance(w, g.id);
    const k = 5000;
    const factor = Math.min(m.maxFactor, Math.max(m.minFactor, Math.pow((dem + k) / (supply + k), m.elasticity)));
    const target = g.basePrice * factor;
    const p = w.prices[g.id] ?? g.basePrice;
    w.prices[g.id] = Math.round((p + (target - p) * m.smoothing) * 100) / 100;
  }
}

export function priceIndex(w: World): number {
  return GOODS.reduce((s, g) => s + (w.prices[g.id] ?? g.basePrice) / g.basePrice, 0) / GOODS.length;
}

// ---------- gravo storms in the outer ring ----------

function gravoStorms(w: World) {
  const e = CONFIG.events;
  if (random(w) >= e.gravoStormChancePerDay) return;
  const outer = PLANETS.filter((p) => distance(TERRA, p.id) > e.outerRingParsec);
  const p = outer[Math.floor(random(w) * outer.length)];
  if (!p) return;
  const [lo, hi] = e.gravoStormDamage as [number, number];
  for (const f of w.facilities.filter((x) => x.planet === p.id)) f.condition = Math.max(0, f.condition - randInt(w, lo, hi));
  for (const s of w.ships) {
    const near = s.at === p.id || s.route?.to === p.id || s.route?.from === p.id;
    if (near) s.condition = Math.max(0, s.condition - randInt(w, lo, hi));
  }
  log(w, null, `Gravo-Sturm bei ${p.name}! Schiffe und Anlagen beschädigt.`, 3);
}

// ---------- bankruptcy and economic collapse ----------

function checkBankruptcies(w: World) {
  for (const c of w.companies) {
    if (c.bankrupt || c.cash >= CONFIG.credit.bankruptcyCash) continue;
    c.bankrupt = true;
    w.ships = w.ships.filter((s) => s.owner !== c.id);
    w.facilities = w.facilities.filter((f) => f.owner !== c.id);
    for (const d of w.demands) {
      if ((d.requester === c.id || d.supplier === c.id) && !['done', 'cancelled'].includes(d.status)) d.status = 'cancelled';
    }
    for (const t of w.transports) {
      if ((t.issuer === c.id || t.carrier === c.id) && !['done', 'cancelled'].includes(t.status)) t.status = 'cancelled';
    }
    // ships carrying cancelled loads drop them; a ship with nothing left is free again
    for (const s of w.ships) if (s.transport) pruneLoads(w, s);
    log(w, c.id, `${c.name} ist bankrott und scheidet aus.`, 3);
  }
}

function checkCollapse(w: World) {
  const alive = w.companies.filter((c) => !c.bankrupt);
  const insolvent = w.companies.filter((c) => c.bankrupt || c.cash < 0).length / w.companies.length;
  if (alive.length === 0 || (priceIndex(w) < CONFIG.collapse.priceIndexBelow && insolvent > CONFIG.collapse.insolventShare)) {
    w.collapsed = true;
    log(w, null, 'Die Wirtschaft ist zusammengebrochen.', 3);
  }
}

// ---------- company index (ranking) ----------

/** Firmenindex: company value, profitability and reputation, as in the original's ranking. */
export function companyIndex(w: World, companyId: string): number {
  const c = company(w, companyId);
  if (c.bankrupt) return 0;
  const value = companyValue(w, companyId);
  const profit = c.revenue - c.expenses;
  const raw = value + 0.5 * profit + c.reputation * 5000;
  return Math.max(0, Math.round(raw / 1000));
}

export function ranking(w: World) {
  return w.companies
    .map((c) => ({ id: c.id, name: c.name, index: companyIndex(w, c.id), cash: Math.round(c.cash), debt: debt(w, c.id), bankrupt: c.bankrupt }))
    .sort((a, b) => b.index - a.index);
}

