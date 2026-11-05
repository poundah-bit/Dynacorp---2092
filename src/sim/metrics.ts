// Phase-2 balancing metrics: checks the data and headless runs against the target values in
// docs/konzept.md ("Balancing-Zielwerte"). Pure functions; tools/balance.ts prints them.

import { CONFIG, FACILITIES, GOODS, PLANETS, STORAGES, TERRA, distance, good } from './data';
import { companyIndex, priceIndex } from './engine';
import type { Cargo, FacilityDef, World } from './types';

export type FacilityTier = 'raw' | 'intermediate' | 'final';

export function facilityTier(def: FacilityDef): FacilityTier {
  if (!Object.keys(def.inputs).length) return 'raw';
  return Object.keys(def.outputs).some((g) => good(g).tier === 'final') ? 'final' : 'intermediate';
}

/** Target ranges from the concept. */
export const TARGETS = {
  amortizationDays: { raw: [60, 100], final: [120, 180] } as Record<string, [number, number]>,
  transportDays: [3, 9] as [number, number], // reported only, no longer a target
  loanShareOfIncome: 0.6,
  storageShareOfCosts: 0.05,
};

/** Fee per FE for moving a good over `parsec`, as the minimum public transport fee prices it. */
const freightPerFe = (goodId: string, parsec: number, prices: Record<string, number>) =>
  parsec * CONFIG.market.minTransportFeePerFePerParsec + (prices[goodId] ?? 0) * 0.05;

/** Where a good is shipped to: Terra for final goods, otherwise the nearest planet that consumes it. */
function buyerPlanet(goodId: string, from: string): string {
  if (good(goodId).tier === 'final') return TERRA;
  const consumers = FACILITIES.filter((f) => goodId in f.inputs).map((f) => f.id);
  const planets = PLANETS.filter((p) => p.facility && consumers.includes(p.facility));
  // Terra also buys everything as base demand
  return [TERRA, ...planets.map((p) => p.id)].sort((a, b) => distance(from, a) - distance(from, b))[0]!;
}

/** Nearest planet producing a good (for input freight). */
function supplierPlanet(goodId: string, to: string): string {
  const producers = FACILITIES.filter((f) => goodId in f.outputs).map((f) => f.id);
  return PLANETS.filter((p) => p.facility && producers.includes(p.facility)).sort((a, b) => distance(to, a.id) - distance(to, b.id))[0]!.id;
}

export interface FacilityEconomics {
  type: string;
  name: string;
  planet: string;
  tier: FacilityTier;
  price: number;
  revenue: number; // Cr/day, outputs at the given prices
  inputCost: number; // Cr/day
  runningCost: number; // maintenance + operation
  freight: number; // Cr/day for shipping outputs to buyers and inputs in
  margin: number; // revenue - inputCost - runningCost - freight
  amortizationDays: number; // Infinity if the margin is not positive
}

/** Daily economics of one unit of every facility type on every allowed planet, at full output. */
export function facilityEconomics(prices: Record<string, number>): FacilityEconomics[] {
  const out: FacilityEconomics[] = [];
  for (const def of FACILITIES) {
    for (const p of PLANETS.filter((x) => x.facility === def.id)) {
      const revenue = Object.entries(def.outputs).reduce((s, [g, n]) => s + n * (prices[g] ?? 0), 0);
      const inputCost = Object.entries(def.inputs).reduce((s, [g, n]) => s + n * (prices[g] ?? 0), 0);
      const freightOut = Object.entries(def.outputs).reduce((s, [g, n]) => s + n * freightPerFe(g, distance(p.id, buyerPlanet(g, p.id)), prices), 0);
      const freightIn = Object.entries(def.inputs).reduce((s, [g, n]) => s + n * freightPerFe(g, distance(supplierPlanet(g, p.id), p.id), prices), 0);
      const runningCost = def.maintenance + def.operation;
      const margin = revenue - inputCost - runningCost - freightOut - freightIn;
      out.push({
        type: def.id,
        name: def.name,
        planet: p.id,
        tier: facilityTier(def),
        price: def.price,
        revenue,
        inputCost,
        runningCost,
        freight: freightOut + freightIn,
        margin,
        amortizationDays: margin > 0 ? def.price / margin : Infinity,
      });
    }
  }
  return out;
}

export const basePrices = () => Object.fromEntries(GOODS.map((g) => [g.id, g.basePrice]));

/** Daily loan rate for the full start credit line at the longest term, as a share of a raw plant's daily revenue. */
export function loanShare(prices: Record<string, number>): { type: string; name: string; share: number }[] {
  const term = CONFIG.credit.terms[CONFIG.credit.terms.length - 1]!;
  const rate = (CONFIG.credit.startLimit * (1 + term.interest)) / term.days;
  return FACILITIES.filter((f) => facilityTier(f) === 'raw').map((f) => {
    const revenue = Object.entries(f.outputs).reduce((s, [g, n]) => s + n * (prices[g] ?? 0), 0);
    return { type: f.id, name: f.name, share: rate / revenue };
  });
}

/** Worst case per storage module: its daily cost relative to the cheapest facility that stores that cargo. */
export function storageShare(): { id: string; name: string; share: number; facility: string }[] {
  const usesCargo = (f: FacilityDef, cargo: Cargo) => [...Object.keys(f.inputs), ...Object.keys(f.outputs)].some((g) => good(g).cargo === cargo);
  return STORAGES.map((s) => {
    const fac = FACILITIES.filter((f) => usesCargo(f, s.cargo)).sort((a, b) => a.maintenance + a.operation - (b.maintenance + b.operation))[0];
    const cost = fac ? fac.maintenance + fac.operation : Infinity;
    return { id: s.id, name: s.name, share: (s.maintenance + s.operation) / cost, facility: fac?.name ?? '–' };
  });
}

// ---------- headless runs ----------

export interface RunStats {
  days: number;
  collapsed: boolean;
  bankrupt: number;
  companies: number;
  priceIndexMin: number; // after the start-up phase (day 100)
  priceIndexMax: number;
  unitsByTier: Record<FacilityTier, number>;
  typesPresent: number; // of 17 facility types
  transportDays: number[]; // assignment → delivery of finished goods transports
  terraDeliveries: Record<string, number>; // final goods delivered to Terra (FE)
  topIndex: number;
}

/** Collects statistics while a world runs; call observe() once per day. */
export function statsCollector(w: World) {
  const seenTransports = new Set<string>();
  const seenDemands = new Set<string>();
  const transportDays: number[] = [];
  const terraDeliveries: Record<string, number> = {};
  let piMin = Infinity;
  let piMax = 0;
  return {
    observe() {
      for (const t of w.transports) {
        if (t.status === 'done' && t.kind === 'goods' && !seenTransports.has(t.id) && t.assignedDay !== undefined && t.doneDay !== undefined) {
          seenTransports.add(t.id);
          transportDays.push(t.doneDay - t.assignedDay);
        }
      }
      for (const d of w.demands) {
        if (d.status === 'done' && d.requester === 'terra' && good(d.good).tier === 'final' && !seenDemands.has(d.id)) {
          seenDemands.add(d.id);
          terraDeliveries[d.good] = (terraDeliveries[d.good] ?? 0) + d.amount;
        }
      }
      if (w.day >= 100) {
        const pi = priceIndex(w);
        piMin = Math.min(piMin, pi);
        piMax = Math.max(piMax, pi);
      }
    },
    result(): RunStats {
      const unitsByTier: Record<FacilityTier, number> = { raw: 0, intermediate: 0, final: 0 };
      for (const f of w.facilities) unitsByTier[facilityTier(FACILITIES.find((d) => d.id === f.type)!)] += f.units;
      return {
        days: w.day,
        collapsed: w.collapsed,
        bankrupt: w.companies.filter((c) => c.bankrupt).length,
        companies: w.companies.length,
        priceIndexMin: piMin === Infinity ? priceIndex(w) : piMin,
        priceIndexMax: piMax || priceIndex(w),
        unitsByTier,
        typesPresent: new Set(w.facilities.map((f) => f.type)).size,
        transportDays,
        terraDeliveries,
        topIndex: Math.max(...w.companies.map((c) => companyIndex(w, c.id))),
      };
    },
  };
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export const shareWithin = (xs: number[], [lo, hi]: [number, number]) => (xs.length ? xs.filter((x) => x >= lo && x <= hi).length / xs.length : NaN);
