// Formatting for the game UI: German number format, labels, HTML escaping.

import { cargoName, facility, facilityDef, good, planet, shipDef, storageDef, type Facility, type Ship, type Transport, type World } from '../sim/index';
import { companyName, shipLegDays } from './play';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (x: number) => nf.format(Math.round(x));
export const cr = (x: number) => `${num(x)} Cr`;
export const fe = (x: number) => `${num(x)} FE`;
export const perFe = (x: number) => `${nf2.format(x)} Cr/FE`;
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

/** What a transport carries: "8.000 FE Erdöl", "Ölförderanlage", "Tanklager S". */
export function loadName(w: World, t: Transport): string {
  if (t.kind === 'goods') return `${fe(t.amount)} ${gName(t.good!)}`;
  const a = t.asset ? w.assets.find((x) => x.id === t.asset) : undefined;
  if (!a) return 'Anlage';
  return a.kind === 'facility' ? facilityDef(a.defId).name : storageDef(a.defId).name;
}
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
  const t = s.transport ? w.transports.find((x) => x.id === s.transport) : undefined;
  const load = t ? loadName(w, t) : '';
  switch (s.phase) {
    case 'idle':
      return { text: `Frei auf ${pName(s.at ?? 'terra')}`, cls: 'good' };
    case 'toPickup':
      return { text: `Fliegt zum Laden nach ${pName(s.route!.to)} – noch ${days(left)}`, cls: 'warn' };
    case 'loading': {
      const from = t?.kind === 'goods' && t.fromFacility ? facility(w, t.fromFacility) : undefined;
      const onStock = from && t?.good ? (from.stock[t.good] ?? 0) : Infinity;
      if (t && onStock < t.amount) {
        return { text: `Wartet auf ${pName(s.at!)} auf Ware – ${fe(onStock)} von ${fe(t.amount)} ${gName(t.good!)} produziert`, cls: 'bad' };
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

/** "350 FE Erdöl" lists for facility inputs/outputs. */
export function flows(rec: Record<string, number>, units = 1): string {
  const parts = Object.entries(rec).map(([g, n]) => `${num(n * units)} ${gName(g)}`);
  return parts.length ? parts.join(' + ') : '–';
}
