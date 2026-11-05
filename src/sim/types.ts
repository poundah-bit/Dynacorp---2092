// Core types for the Dynacorp 2092 economy simulation.
// The simulation is pure data + functions: no DOM, no timers, deterministic per seed.

export type Cargo = 'tank' | 'bulk' | 'piece' | 'cooled' | 'live';
export type Tier = 'raw' | 'intermediate' | 'final';
export type Difficulty = 'easy' | 'med' | 'hard' | 'prof';

// ---------- static game data (src/data/*.json) ----------

export interface GoodDef {
  id: string;
  name: string;
  tier: Tier;
  cargo: Cargo;
  basePrice: number; // Credits per FE
}

export interface FacilityDef {
  id: string;
  name: string;
  price: number;
  maintenance: number; // Credits/day once built
  operation: number; // Credits/day while running
  size: number; // FE when transported
  inputs: Record<string, number>; // FE/day per unit at full efficiency
  outputs: Record<string, number>; // FE/day per unit at full efficiency
}

export interface ShipDef {
  id: string;
  name: string;
  cargo: Cargo;
  price: number;
  capacity: number; // FE
  speed: number; // Parsec/day at 100 % condition
  maintenance: number;
  operation: number; // Credits/day while on a job
}

export interface PlanetDef {
  id: string;
  name: string;
  x: number;
  y: number;
  facility: string | null; // the one facility type this planet allows; null = Terra
}

export interface StorageDef {
  id: string;
  name: string;
  cargo: Cargo;
  capacity: number;
  price: number;
  maintenance: number;
  operation: number;
  size: number;
}

export interface CompanyDef {
  name: string;
  prefers: string[]; // facility type ids
}

// ---------- mutable world state ----------

export interface Loan {
  id: string;
  remaining: number; // Credits still owed (principal + interest)
  dailyRate: number;
  daysLeft: number;
  overdueDays: number;
}

export interface Company {
  id: string;
  name: string;
  isPlayer: boolean;
  prefers: string[];
  cash: number;
  loans: Loan[];
  reputation: number; // 0..100
  bankrupt: boolean;
  revenue: number; // lifetime
  expenses: number; // lifetime
}

export type FacilityStatus = 'construction' | 'stopped' | 'running';

export interface Facility {
  id: string;
  owner: string;
  type: string;
  planet: string;
  units: number;
  status: FacilityStatus;
  buildDaysLeft: number;
  condition: number; // 0..100
  stock: Record<string, number>;
  reserved: Record<string, number>; // promised to accepted demands
  storages: string[]; // ids of extra storage modules (StorageDef)
  idleDays: number; // consecutive running days without production
}

/** Something bought at Terra that still has to be flown to its destination. */
export interface Asset {
  id: string;
  owner: string;
  kind: 'facility' | 'storage';
  defId: string;
  planet: string; // destination
  size: number; // FE as piece goods
  delivered: boolean;
}

export type DemandStatus = 'open' | 'accepted' | 'shipping' | 'done' | 'cancelled';

export interface Demand {
  id: string;
  requester: string; // company id or 'terra'
  good: string;
  amount: number;
  toPlanet: string;
  toFacility: string | null; // null for Terra
  pricePerFe: number;
  own: boolean;
  status: DemandStatus;
  supplier: string | null;
  supplierFacility: string | null;
  transport: string | null;
  createdDay: number;
  deadlineDay: number;
  late: boolean;
  /** FE already covered by transports (a demand can be split over several ships) */
  shipped?: number;
  /** FE already delivered */
  delivered?: number;
}

export type TransportStatus = 'open' | 'accepted' | 'assigned' | 'loaded' | 'done' | 'cancelled';

export interface Transport {
  id: string;
  issuer: string;
  kind: 'goods' | 'asset';
  good: string | null;
  asset: string | null;
  amount: number;
  cargo: Cargo;
  fromPlanet: string;
  fromFacility: string | null;
  toPlanet: string;
  fee: number; // paid by issuer to carrier on delivery (0 for own transports)
  own: boolean;
  demand: string | null;
  carrier: string | null;
  ship: string | null;
  status: TransportStatus;
  createdDay: number;
  deadlineDay: number;
  late: boolean;
  assignedDay?: number; // a ship was sent (for balancing statistics)
  doneDay?: number; // delivered
}

export interface ShipRoute {
  from: string;
  to: string;
  distance: number;
  traveled: number;
}

export type ShipPhase = 'idle' | 'toPickup' | 'loading' | 'toDelivery' | 'unloading' | 'toTerra' | 'repair';

export interface Ship {
  id: string;
  owner: string;
  model: string;
  condition: number;
  at: string | null; // planet id when not travelling
  route: ShipRoute | null;
  phase: ShipPhase;
  transport: string | null;
  waitDays: number; // days left for loading/unloading/repair
  repairAtTerra?: boolean; // repair automatically at the next stop on Terra
}

export interface LogEntry {
  day: number;
  company: string | null;
  text: string;
  priority: 1 | 2 | 3; // 3 = important
}

export interface World {
  day: number;
  rng: number; // RNG state
  difficulty: Difficulty;
  playerId: string | null;
  companies: Company[];
  facilities: Facility[];
  ships: Ship[];
  assets: Asset[];
  demands: Demand[];
  transports: Transport[];
  prices: Record<string, number>;
  log: LogEntry[];
  nextId: number;
  collapsed: boolean;
}
