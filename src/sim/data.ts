import goodsJson from '../data/goods.json';
import facilitiesJson from '../data/facilities.json';
import shipsJson from '../data/ships.json';
import planetsJson from '../data/planets.json';
import storagesJson from '../data/storages.json';
import companiesJson from '../data/companies.json';
import configJson from '../data/config.json';
import type {
  Cargo,
  CompanyDef,
  FacilityDef,
  GoodDef,
  PlanetDef,
  ShipDef,
  StorageDef,
} from './types';

export const GOODS = goodsJson as unknown as GoodDef[];
export const FACILITIES = facilitiesJson as unknown as FacilityDef[];
export const SHIPS = shipsJson as unknown as ShipDef[];
export const PLANETS = planetsJson as unknown as PlanetDef[];
export const STORAGES = storagesJson as unknown as StorageDef[];
export const COMPANIES = companiesJson as CompanyDef[];
export const CONFIG = configJson;
export type Config = typeof configJson;

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

const goodMap = byId(GOODS);
const facilityMap = byId(FACILITIES);
const shipMap = byId(SHIPS);
const planetMap = byId(PLANETS);
const storageMap = byId(STORAGES);

function must<T>(map: Map<string, T>, id: string, what: string): T {
  const v = map.get(id);
  if (!v) throw new Error(`Unbekannte ${what}: ${id}`);
  return v;
}

export const good = (id: string) => must(goodMap, id, 'Ware');

/** Unit of measure per cargo: liquids in litres, bulk goods in tonnes, everything else in FE (Frachteinheiten). */
export const CARGO_UNIT: Record<Cargo, string> = { tank: 'l', bulk: 't', piece: 'FE', cooled: 'FE', live: 'FE' };
export const unitOf = (goodId: string) => CARGO_UNIT[good(goodId).cargo];
export const facilityDef = (id: string) => must(facilityMap, id, 'Anlage');
export const shipDef = (id: string) => must(shipMap, id, 'Schiff');
export const planet = (id: string) => must(planetMap, id, 'Planet');
export const storageDef = (id: string) => must(storageMap, id, 'Lager');

export const TERRA = 'terra';

/** Straight-line distance in Parsec between two planets. */
export function distance(a: string, b: string): number {
  const p = planet(a);
  const q = planet(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Planets that allow the given facility type. */
export const planetsFor = (facilityType: string) => PLANETS.filter((p) => p.facility === facilityType);

/** Consistency checks for the data files; returns a list of problems (empty = ok). */
export function validateData(): string[] {
  const problems: string[] = [];
  for (const f of FACILITIES) {
    for (const g of [...Object.keys(f.inputs), ...Object.keys(f.outputs)]) {
      if (!goodMap.has(g)) problems.push(`${f.id}: unbekannte Ware ${g}`);
    }
    if (planetsFor(f.id).length === 0) problems.push(`${f.id}: kein Planet erlaubt diese Anlage`);
  }
  for (const p of PLANETS) {
    if (p.facility && !facilityMap.has(p.facility)) problems.push(`${p.id}: unbekannte Anlage ${p.facility}`);
  }
  for (const c of COMPANIES) {
    for (const t of c.prefers) if (!facilityMap.has(t)) problems.push(`${c.name}: unbekannte Anlage ${t}`);
  }
  for (const g of GOODS) {
    const produced = FACILITIES.some((f) => g.id in f.outputs);
    if (!produced) problems.push(`${g.id}: wird nirgends produziert`);
    const used = FACILITIES.some((f) => g.id in f.inputs);
    if (!used && g.tier !== 'final') problems.push(`${g.id}: wird nirgends verbraucht`);
  }
  const maxPiece = Math.max(...SHIPS.filter((s) => s.cargo === 'piece').map((s) => s.capacity));
  for (const f of FACILITIES) if (f.size > maxPiece) problems.push(`${f.id}: zu groß für jeden Stückgutfrachter`);
  return problems;
}
