// Quark-Trend: which quark flavour the player's world is turning into. Goods belong to a cell
// (industry = up-type, supply = down-type; light, middle, heavy); two test modes decide how the bar fills.

import { CONFIG, good, projectDef } from './data';
import { buildingProject } from './projects';
import type { Demand, Flavour, QuarkState, World } from './types';
import { log } from './world';

export const FLAVOURS: Flavour[] = ['up', 'down', 'charm', 'strange', 'top', 'bottom'];
export const QUARK_NAME: Record<Flavour, string> = { up: 'Up', down: 'Down', charm: 'Charm', strange: 'Strange', top: 'Top', bottom: 'Bottom' };

const CELLS: Record<'industry' | 'supply', Flavour[]> = { industry: ['up', 'charm', 'top'], supply: ['down', 'strange', 'bottom'] };
const WEIGHT: Record<Flavour, 1 | 2 | 3> = { up: 1, down: 1, charm: 2, strange: 2, top: 3, bottom: 3 };

/** The quark cell of a good (side and weight from `goods.json`). */
export function cellOf(goodId: string): Flavour {
  const q = good(goodId).quark!;
  return CELLS[q.side][q.weight - 1]!;
}

/** Delivered goods value a cell needs for a full bar – heavy quarks need more „energy“. */
export const quarkTarget = (f: Flavour) => CONFIG.quark.targets[WEIGHT[f] - 1]!;

const empty = (): Record<Flavour, number> => ({ up: 0, down: 0, charm: 0, strange: 0, top: 0, bottom: 0 });
export const newQuark = (mode: QuarkState['mode']): QuarkState => ({ mode, energy: empty(), warned: [], reached: [] });

/** Saves from before the Quark-Trend get it in trend mode. */
export function ensureQuark(w: World): void {
  w.quark ??= newQuark('trend');
}

/**
 * Trend mode: a delivered part feeds its cell when the player delivers to someone else (Terra, a planet,
 * another company) or when anyone delivers into the player's Großprojekt. Own plant to own plant does not count.
 */
export function quarkFeed(w: World, d: Demand, part: number): void {
  const me = w.playerId;
  if (!w.quark || !me) return;
  if (!(d.project || (d.supplier === me && d.requester !== me))) return;
  w.quark.energy[cellOf(d.good)] += Math.round(part * d.pricePerFe);
}

export interface QuarkStatus {
  mode: QuarkState['mode'];
  flavour: Flavour | null;
  /** 0..1 */
  fill: number;
  cells: Record<Flavour, number>;
}

/** Where the world is heading and how full the bar is. */
export function quarkStatus(w: World): QuarkStatus {
  const q = w.quark;
  const cells = empty();
  if (!q) return { mode: 'trend', flavour: null, fill: 0, cells };
  if (q.mode === 'project') {
    const running = buildingProject(w);
    const last = (w.projects ?? []).filter((p) => p.status === 'done').sort((a, b) => (b.doneDay ?? 0) - (a.doneDay ?? 0))[0];
    const p = running ?? last;
    if (!p) return { mode: q.mode, flavour: null, fill: 0, cells };
    const def = projectDef(p.id);
    const need = Object.values(def.materials).reduce((s, x) => s + x, 0);
    const got = Object.entries(def.materials).reduce((s, [g, x]) => s + Math.min(x, p.delivered[g] ?? 0), 0);
    const fill = p.status === 'done' ? 1 : Math.min(1, got / need);
    cells[def.quark] = fill;
    return { mode: q.mode, flavour: def.quark, fill, cells };
  }
  for (const f of FLAVOURS) cells[f] = Math.min(1, q.energy[f] / quarkTarget(f));
  const lead = FLAVOURS.reduce((a, b) => (cells[b] > cells[a] ? b : a));
  return { mode: q.mode, flavour: cells[lead] > 0 ? lead : null, fill: cells[lead], cells };
}

/** One day: the energy decays; crossing 90 % and 100 % is announced once per flavour. */
export function quarkTick(w: World): void {
  const q = w.quark;
  const me = w.playerId;
  if (!q || !me) return;
  const k = Math.pow(0.5, 1 / CONFIG.quark.halfLifeDays);
  for (const f of FLAVOURS) q.energy[f] *= k;
  const s = quarkStatus(w);
  if (!s.flavour) return;
  const name = `${QUARK_NAME[s.flavour]}-Quark`;
  if (s.fill >= CONFIG.quark.warnAt && !q.warned.includes(s.flavour)) {
    q.warned.push(s.flavour);
    log(w, me, `Deine Welt verdichtet sich zu einem ${name}.`, 3);
  }
  if (s.fill >= 1 && !q.reached.includes(s.flavour)) {
    q.reached.push(s.flavour);
    log(w, me, `Deine Welt hat sich zu einem ${name} verdichtet. In der fertigen Version würde sie jetzt als Modul abgeschlossen.`, 3);
  }
}
