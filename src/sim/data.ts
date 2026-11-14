import goodsJson from '../data/goods.json';
import facilitiesJson from '../data/facilities.json';
import shipsJson from '../data/ships.json';
import planetsJson from '../data/planets.json';
import storagesJson from '../data/storages.json';
import companiesJson from '../data/companies.json';
import configJson from '../data/config.json';
import projectsJson from '../data/projects.json';
import planetNamesJson from '../data/planetnames.json';
import type {
  Cargo,
  CompanyDef,
  FacilityDef,
  GoodDef,
  PlanetDef,
  ProjectDef,
  ShipDef,
  StorageDef,
} from './types';

export const GOODS = goodsJson as unknown as GoodDef[];
export const FACILITIES = facilitiesJson as unknown as FacilityDef[];
export const SHIPS = shipsJson as unknown as ShipDef[];
export const PLANETS = planetsJson as unknown as PlanetDef[];
/** Name pool for generated module worlds (none of them is used in world 1). */
export const PLANET_NAMES = planetNamesJson as string[];
export const STORAGES = storagesJson as unknown as StorageDef[];
export const COMPANIES = companiesJson as CompanyDef[];
export const CONFIG = configJson;
export const PROJECTS = projectsJson as unknown as ProjectDef[];
const projectMap = new Map(PROJECTS.map((p) => [p.id, p]));
export const projectDef = (id: string) => must(projectMap, id, 'Großprojekt');
export type Config = typeof configJson;

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

const goodMap = byId(GOODS);
const facilityMap = byId(FACILITIES);
const shipMap = byId(SHIPS);
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
/** Anything that may carry its own planets (a world); without them the planets of world 1 apply. */
export type PlanetSource = { planets?: PlanetDef[] };

/** The planets of a world: its own list (generated module worlds) or `planets.json` (world 1). */
export const worldPlanets = (w: PlanetSource): PlanetDef[] => w.planets ?? PLANETS;

const planetMaps = new WeakMap<PlanetDef[], Map<string, PlanetDef>>();
function planetsById(w: PlanetSource): Map<string, PlanetDef> {
  const list = worldPlanets(w);
  let m = planetMaps.get(list);
  if (!m) planetMaps.set(list, (m = byId(list)));
  return m;
}

export const planet = (w: PlanetSource, id: string) => must(planetsById(w), id, 'Planet');
export const storageDef = (id: string) => must(storageMap, id, 'Lager');

export const TERRA = 'terra';

/** Days a ship of this model needs to load: big holds take a day longer (time to add further loads). */
export const loadingDays = (model: string) =>
  shipDef(model).capacity >= CONFIG.largeHold ? CONFIG.loadingDaysLargeHold : CONFIG.loadingDays;

/** Loading plus unloading of one trip at most – the margin every deadline includes. */
export const handlingDays = () => CONFIG.loadingDaysLargeHold + CONFIG.unloadDays;

/** Straight-line distance in Parsec between two planets. */
export function distance(w: PlanetSource, a: string, b: string): number {
  const p = planet(w, a);
  const q = planet(w, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Planets that allow the given facility type. */
export const planetsFor = (w: PlanetSource, facilityType: string) => worldPlanets(w).filter((p) => p.facility === facilityType);

/** Consistency checks for the data files; returns a list of problems (empty = ok). */
export function validateData(): string[] {
  const problems: string[] = [];
  for (const f of FACILITIES) {
    for (const g of [...Object.keys(f.inputs), ...Object.keys(f.outputs)]) {
      if (!goodMap.has(g)) problems.push(`${f.id}: unbekannte Ware ${g}`);
    }
    if (planetsFor({}, f.id).length === 0) problems.push(`${f.id}: kein Planet erlaubt diese Anlage`);
  }
  {
    const own = new Set(PLANETS.map((p) => p.name));
    if (new Set(PLANET_NAMES).size !== PLANET_NAMES.length) problems.push('planetnames.json: doppelte Namen');
    // worlds 2 to 6 of a campaign (one per further Großprojekt/quark) each need fresh names
    const need = (PROJECTS.length - 1) * PLANETS.filter((p) => p.facility).length;
    if (PLANET_NAMES.length < need) problems.push(`planetnames.json: weniger als ${need} Namen`);
    for (const n of PLANET_NAMES) if (own.has(n)) problems.push(`planetnames.json: ${n} gibt es schon in Welt 1`);
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
  for (const g of GOODS) if (!g.quark) problems.push(`${g.id}: keine Quark-Klasse`);
  for (const p of PROJECTS) for (const g of Object.keys(p.materials)) if (!goodMap.has(g)) problems.push(`Großprojekt ${p.id}: unbekannte Ware ${g}`);
  return problems;
}
