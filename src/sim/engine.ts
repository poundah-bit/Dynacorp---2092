// The daily tick. One call to step() advances the world by one game day.

import { CONFIG, FACILITIES, GOODS, PLANETS, TERRA, distance, facilityDef, good, planet, shipDef, storageDef } from './data';
import { companyValue, debt, diff, startRoute, transportDeadline } from './actions';
import { runAi } from './ai';
import type { Demand, Facility, Ship, Transport, World } from './types';
import {
  asset,
  company,
  demand,
  facility,
  freeCapacity,
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
      if (s.route.traveled >= s.route.distance) arrive(w, s);
    } else if (s.phase === 'loading' || s.phase === 'unloading' || s.phase === 'repair') {
      s.waitDays -= 1;
      if (s.waitDays <= 0) {
        if (s.phase === 'loading') load(w, s);
        else if (s.phase === 'unloading') unload(w, s);
        else {
          s.condition = 100;
          s.phase = 'idle';
        }
      }
    }
    if (s.condition < CONFIG.ships.scrapBelow && s.phase === 'idle') {
      w.ships = w.ships.filter((x) => x !== s);
      log(w, s.owner, `${def.name} von ${company(w, s.owner).name} landet in der Schrottpresse.`, 2);
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

function load(w: World, s: Ship) {
  const t = transport(w, s.transport!);
  if (!t) return releaseShip(s);
  if (t.kind === 'goods') {
    const f = facility(w, t.fromFacility!);
    if (!f) return failTransport(w, t, s, 'Das Lieferwerk existiert nicht mehr.');
    const onStock = f.stock[t.good!] ?? 0;
    if (onStock < t.amount) {
      s.waitDays = 1; // wait for production
      return;
    }
    f.stock[t.good!] = onStock - t.amount;
    f.reserved[t.good!] = Math.max(0, (f.reserved[t.good!] ?? 0) - t.amount);
  }
  t.status = 'loaded';
  startRoute(s, t.toPlanet, 'toDelivery');
}

function unload(w: World, s: Ship) {
  const t = transport(w, s.transport!);
  if (!t) return releaseShip(s);
  if (t.kind === 'asset') deliverAsset(w, t);
  else deliverGoods(w, t);
  if (!t.own && t.carrier) {
    pay(w, t.issuer, t.carrier, t.fee);
    reputation(w, t.carrier, t.late ? -2 : 1);
    log(w, t.carrier, `${company(w, t.carrier).name} erhält ${t.fee} Cr Transporthonorar (${planet(t.toPlanet).name}).`);
  }
  t.status = 'done';
  t.doneDay = w.day;
  releaseShip(s);
}

function releaseShip(s: Ship) {
  s.transport = null;
  s.phase = 'idle';
  s.waitDays = 0;
}

function failTransport(w: World, t: Transport, s: Ship, why: string) {
  t.status = 'cancelled';
  if (t.demand) {
    const d = demand(w, t.demand);
    if (d) d.status = 'cancelled';
  }
  log(w, t.issuer, `Transport ${t.id} abgebrochen: ${why}`, 2);
  releaseShip(s);
}

function deliverGoods(w: World, t: Transport) {
  const d = t.demand ? demand(w, t.demand) : undefined;
  if (!d) return;
  const value = Math.round(d.amount * d.pricePerFe);
  if (d.requester === 'terra') {
    pay(w, null, d.supplier, value);
  } else {
    const target = d.toFacility ? facility(w, d.toFacility) : undefined;
    if (target) {
      const room = freeCapacity(target, d.good);
      const stored = Math.min(room, d.amount);
      target.stock[d.good] = (target.stock[d.good] ?? 0) + stored;
      if (stored < d.amount) log(w, d.requester, `${d.amount - stored} FE ${good(d.good).name} gingen mangels Lagerplatz verloren.`, 2);
    }
    if (d.supplier !== d.requester) pay(w, d.requester, d.supplier, value);
  }
  d.status = 'done';
  if (d.supplier && d.supplier !== d.requester) {
    reputation(w, d.supplier, d.late ? -2 : 1);
    const buyer = d.requester === 'terra' ? 'Terra' : company(w, d.requester).name;
    log(w, d.supplier, `${company(w, d.supplier).name} liefert ${d.amount} FE ${good(d.good).name} an ${buyer} und erhält ${value} Cr.`);
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
  w.demands = w.demands.filter(keep);
  w.transports = w.transports.filter(keep);
}

// ---------- Terra: buyer of final goods and base demand for everything else ----------

function terraDemands(w: World) {
  const tc = CONFIG.terra;
  for (const g of GOODS) {
    const final = g.tier === 'final';
    // Stabiliser: the cheaper a good gets relative to its base price, the more Terra buys of it.
    const cheapness = Math.min(4, Math.pow(g.basePrice / (w.prices[g.id] ?? g.basePrice), 2));
    const base = final ? tc.demandChancePerGoodPerDay : tc.baseDemandChancePerGoodPerDay;
    const chance = Math.min(0.9, base * cheapness);
    if (random(w) >= chance) continue;
    const open = w.demands.filter((d) => d.requester === 'terra' && d.good === g.id && d.status === 'open').length;
    if (open >= tc.maxOpenPerGood * Math.ceil(cheapness)) continue;
    const amount = Math.round(randInt(w, CONFIG.orders.minAmount, CONFIG.orders.maxAmount) / 500) * 500;
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
    for (const s of w.ships) {
      const t = s.transport ? transport(w, s.transport) : undefined;
      if (t && t.status === 'cancelled') releaseShip(s);
    }
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

