import { COMPANIES, CONFIG, GOODS, facilityDef, good, shipDef, storageDef } from './data';
import type { Cargo, Company, Difficulty, Facility, LogEntry, Ship, World } from './types';

// ---------- deterministic RNG (mulberry32, state kept in the world) ----------

export function random(w: World): number {
  w.rng = (w.rng + 0x6d2b79f5) >>> 0;
  let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (w: World, min: number, max: number) => min + Math.floor(random(w) * (max - min + 1));

export function pick<T>(w: World, list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(random(w) * list.length)] : undefined;
}

export const newId = (w: World, prefix: string) => `${prefix}${w.nextId++}`;

// ---------- creation ----------

export interface NewWorldOptions {
  seed?: number;
  difficulty?: Difficulty;
  /** Name of the human player's company; omit for an all-AI world (headless balancing runs). */
  playerName?: string;
  aiCompanies?: number;
}

export function createWorld(opts: NewWorldOptions = {}): World {
  const w: World = {
    day: 0,
    rng: (opts.seed ?? 1) >>> 0,
    difficulty: opts.difficulty ?? 'med',
    playerId: null,
    companies: [],
    facilities: [],
    ships: [],
    assets: [],
    demands: [],
    transports: [],
    prices: Object.fromEntries(GOODS.map((g) => [g.id, g.basePrice])),
    log: [],
    nextId: 1,
    collapsed: false,
  };
  const mk = (name: string, isPlayer: boolean, prefers: string[]): Company => ({
    id: newId(w, 'c'),
    name,
    isPlayer,
    prefers,
    cash: CONFIG.startCapital,
    loans: [],
    reputation: 50,
    bankrupt: false,
    revenue: 0,
    expenses: 0,
  });
  if (opts.playerName) {
    const p = mk(opts.playerName, true, []);
    w.companies.push(p);
    w.playerId = p.id;
  }
  // The AI line-up is drawn at random from the list, like the original.
  const pool = [...COMPANIES];
  const n = Math.min(opts.aiCompanies ?? 20, pool.length);
  for (let i = 0; i < n; i++) {
    const def = pool.splice(Math.floor(random(w) * pool.length), 1)[0]!;
    w.companies.push(mk(def.name, false, def.prefers));
  }
  return w;
}

// ---------- lookups ----------

export function company(w: World, id: string): Company {
  const c = w.companies.find((x) => x.id === id);
  if (!c) throw new Error(`Unbekannte Firma ${id}`);
  return c;
}

export const facility = (w: World, id: string) => w.facilities.find((f) => f.id === id);
export const ship = (w: World, id: string) => w.ships.find((s) => s.id === id);
export const demand = (w: World, id: string) => w.demands.find((d) => d.id === id);
export const transport = (w: World, id: string) => w.transports.find((t) => t.id === id);
export const asset = (w: World, id: string) => w.assets.find((a) => a.id === id);

export const facilitiesOf = (w: World, owner: string) => w.facilities.filter((f) => f.owner === owner);
export const shipsOf = (w: World, owner: string) => w.ships.filter((s) => s.owner === owner);

/** Facility count as the original counts it: one per (type, planet), pending deliveries included. */
export function facilityCount(w: World, owner: string): number {
  const keys = new Set(facilitiesOf(w, owner).map((f) => `${f.type}@${f.planet}`));
  for (const a of w.assets) {
    if (a.owner === owner && a.kind === 'facility' && !a.delivered) keys.add(`${a.defId}@${a.planet}`);
  }
  return keys.size;
}

export function storageCapacity(f: Facility, goodId: string): number {
  const cargo: Cargo = good(goodId).cargo;
  const extra = f.storages.map(storageDef).filter((s) => s.cargo === cargo).reduce((sum, s) => sum + s.capacity, 0);
  return CONFIG.baseStorage * f.units + extra;
}

export const available = (f: Facility, goodId: string) => (f.stock[goodId] ?? 0) - (f.reserved[goodId] ?? 0);

export function freeCapacity(f: Facility, goodId: string): number {
  return Math.max(0, storageCapacity(f, goodId) - (f.stock[goodId] ?? 0));
}

/** Speed in Parsec/day, reduced linearly by wear (100 % → 1.0, scrap limit → minSpeedFactor). */
export function shipSpeed(s: Ship): number {
  const def = shipDef(s.model);
  const { scrapBelow, minSpeedFactor } = CONFIG.ships;
  const k = Math.max(0, Math.min(1, (s.condition - scrapBelow) / (100 - scrapBelow)));
  return def.speed * (minSpeedFactor + (1 - minSpeedFactor) * k);
}

export function shipValue(s: Ship): number {
  return shipDef(s.model).price * (s.condition / 100);
}

export function facilityValue(f: Facility): number {
  return (
    facilityDef(f.type).price * f.units * (f.condition / 100) +
    f.storages.reduce((sum, id) => sum + storageDef(id).price, 0)
  );
}

export function log(w: World, companyId: string | null, text: string, priority: LogEntry['priority'] = 1) {
  w.log.push({ day: w.day, company: companyId, text, priority });
  if (w.log.length > 2000) w.log.splice(0, w.log.length - 2000);
}

/** Money transfer with bookkeeping. `from`/`to` may be null for the outside world (Terra, Dynacore, bank). */
export function pay(w: World, from: string | null, to: string | null, amount: number) {
  if (amount <= 0) return;
  if (from) {
    const c = company(w, from);
    c.cash -= amount;
    c.expenses += amount;
  }
  if (to) {
    const c = company(w, to);
    c.cash += amount;
    c.revenue += amount;
  }
}
