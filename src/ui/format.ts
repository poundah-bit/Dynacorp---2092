// Formatting for the game UI: German number format, labels, HTML escaping.

import { CARGO_UNIT, CONFIG, cargoName, facility, facilityDef, good, planet, shipDef, shipLoads, storageDef, unitOf, type Cargo, type Facility, type Ship, type Transport, type World } from '../sim/index';
import { companyName, shipLegDays } from './play';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (x: number) => nf.format(Math.round(x));
export const cr = (x: number) => `${num(x)} Cr`;
/** FE (Frachteinheiten): facilities and storage modules travelling as piece goods */
export const fe = (x: number) => `${num(x)} FE`;
/** an amount of a cargo type: "16.000 l", "14.000 t", "15.000 FE" */
export const qty = (x: number, cargo: Cargo) => `${num(x)} ${CARGO_UNIT[cargo]}`;
/** an amount of a good in its unit */
export const amt = (x: number, goodId: string) => qty(x, good(goodId).cargo);
/** a price per unit of a good: "20,00 Cr/l" */
export const perUnit = (x: number, goodId: string) => `${nf2.format(x)} Cr/${unitOf(goodId)}`;
export const dec = (x: number) => nf2.format(x);
export const days = (d: number) => (d === 1 ? '1 Tag' : `${num(d)} Tage`);
/** Remaining time until a deadline day: "Frist: noch 12 Tage" (red once it has passed). */
export function deadlineIn(w: World, day: number): string {
  const left = day - w.day;
  if (left < 0) return '<span class="bad">Frist abgelaufen</span>';
  if (left === 0) return '<span class="warn">Frist endet heute</span>';
  return `Frist: noch ${days(left)}`;
}

/** "in ~3 Tagen" – an estimate, dative after "in". */
export const inDays = (d: number) => (d === 1 ? 'in ~1 Tag' : `in ~${num(d)} Tagen`);

/** What a transport carries: "8.000 l Erdöl", "Ölförderanlage", "Tanklager S". */
export function loadName(w: World, t: Transport): string {
  if (t.kind === 'goods') return `${amt(t.amount, t.good!)} ${gName(t.good!)}`;
  const a = t.asset ? w.assets.find((x) => x.id === t.asset) : undefined;
  if (!a) return 'Anlage';
  return a.kind === 'facility' ? facilityDef(a.defId).name : storageDef(a.defId).name;
}
/** Several loads on one trip: "3 Aufträge, 15.000 l Erdöl". */
export function loadsName(w: World, loads: Transport[]): string {
  if (loads.length <= 1) return loads[0] ? loadName(w, loads[0]) : '';
  const goods = new Set(loads.map((t) => t.good));
  const g = loads[0]!.good;
  if (goods.size === 1 && g) return `${loads.length} Aufträge, ${amt(loads.reduce((sum, t) => sum + t.amount, 0), g)} ${gName(g)}`;
  return `${loads.length} Aufträge`;
}

/** Symbol and name per cargo type, so ships can be told apart at a glance. */
export const CARGO_ICON: Record<Cargo, string> = { tank: '🛢', bulk: '⛰', piece: '📦', cooled: '❄', live: '🐄' };
export const SHIP_KIND: Record<Cargo, string> = { tank: 'Tanker', bulk: 'Schüttgutfrachter', piece: 'Stückgutfrachter', cooled: 'Kühlfrachter', live: 'Viehfrachter' };
/** Small coloured badge with the cargo symbol. */
export const cargoIcon = (cargo: Cargo) => `<span class="cargo-ic cargo-${cargo}" title="${cargoName(cargo)}" aria-label="${cargoName(cargo)}">${CARGO_ICON[cargo]}</span>`;
export const isCriticalShip = (s: Ship) => s.condition < CONFIG.ships.criticalBelow;

export const pc = (x: number) => `${num(x)} Pc`;

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ESC[ch]!);

/** Ticker lines come from the simulation with raw numbers; show them with German thousands separators. */
export const logText = (s: string) => esc(s).replace(/\b\d{4,}\b/g, (n) => num(Number(n)));

export const pName = (id: string) => planet(id).name;
export const gName = (id: string) => good(id).name;
export const who = (w: World, id: string | null) => esc(companyName(w, id));
export { cargoName };

export function facilityStatus(f: Facility): { text: string; cls: string } {
  if (f.status === 'construction') return { text: `Im Bau – noch ${days(f.buildDaysLeft)}`, cls: 'warn' };
  if (f.status === 'stopped') return { text: 'Stillgelegt', cls: 'bad' };
  return { text: 'In Betrieb', cls: 'good' };
}

export function shipStatus(w: World, s: Ship): { text: string; cls: string } {
  const left = shipLegDays(s);
  const loads = shipLoads(w, s);
  const t = loads[0];
  const load = loadsName(w, loads);
  switch (s.phase) {
    case 'idle':
      return { text: `Frei auf ${pName(s.at ?? 'terra')}`, cls: 'good' };
    case 'toPickup':
      return { text: `Fliegt zum Laden nach ${pName(s.route!.to)} – noch ${days(left)}`, cls: 'warn' };
    case 'loading': {
      const from = t?.kind === 'goods' && t.fromFacility ? facility(w, t.fromFacility) : undefined;
      const onStock = from && t?.good ? (from.stock[t.good] ?? 0) : Infinity;
      // several loads from the same plant are loaded together
      const needed = loads.filter((x) => x.fromFacility === t?.fromFacility && x.good === t?.good).reduce((sum, x) => sum + x.amount, 0);
      if (t && onStock < needed) {
        return { text: `Wartet auf ${pName(s.at!)} auf Ware – ${amt(onStock, t.good!)} von ${amt(needed, t.good!)} ${gName(t.good!)} produziert`, cls: 'bad' };
      }
      return { text: `Lädt ${load} auf ${pName(s.at!)}`, cls: 'warn' };
    }
    case 'toDelivery':
      return { text: `Bringt ${load} nach ${pName(s.route!.to)} – noch ${days(left)}`, cls: 'warn' };
    case 'unloading':
      return { text: `Entlädt auf ${pName(s.at!)}`, cls: 'warn' };
    case 'toTerra':
      return { text: `Fliegt nach Terra – noch ${days(left)}`, cls: 'warn' };
    case 'repair':
      return { text: `In Reparatur – noch ${days(left)}`, cls: 'warn' };
  }
}

export const shipLabel = (s: Ship) => `${shipDef(s.model).name} <span class="muted">#${s.id.slice(1)}</span>`;
export const facilityLabel = (f: Facility) => `${facilityDef(f.type).name} auf ${pName(f.planet)}`;

/** "350 l Erdöl" lists for facility inputs/outputs. */
export function flows(rec: Record<string, number>, units = 1): string {
  const parts = Object.entries(rec).map(([g, n]) => `${amt(n * units, g)} ${gName(g)}`);
  return parts.length ? parts.join(' + ') : '–';
}
