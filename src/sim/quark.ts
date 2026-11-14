// Quark: which quark flavours the player's world can close as. Goods belong to a cell (industry = up-type,
// supply = down-type; light, middle, heavy); every finished Großprojekt unlocks the flavour of its cell.

import { CONFIG, good, projectDef } from './data';
import { buildingProject } from './projects';
import type { Flavour, QuarkState, World } from './types';
import { log } from './world';

export const FLAVOURS: Flavour[] = ['up', 'down', 'charm', 'strange', 'top', 'bottom'];
export const QUARK_NAME: Record<Flavour, string> = { up: 'Up', down: 'Down', charm: 'Charm', strange: 'Strange', top: 'Top', bottom: 'Bottom' };

const CELLS: Record<'industry' | 'supply', Flavour[]> = { industry: ['up', 'charm', 'top'], supply: ['down', 'strange', 'bottom'] };

/** The quark cell of a good (side and weight from `goods.json`). */
export function cellOf(goodId: string): Flavour {
  const q = good(goodId).quark!;
  return CELLS[q.side][q.weight - 1]!;
}

const empty = (): Record<Flavour, number> => ({ up: 0, down: 0, charm: 0, strange: 0, top: 0, bottom: 0 });
export const newQuark = (): QuarkState => ({ warned: [], reached: [] });

/** Saves from before the Quark get it; saves from the test with two modes lose the old fields. */
export function ensureQuark(w: World): void {
  w.quark ??= newQuark();
  const old = w.quark as QuarkState & { mode?: unknown; energy?: unknown };
  delete old.mode;
  delete old.energy;
}

export interface QuarkStatus {
  /** flavour of the running Großprojekt */
  flavour: Flavour | null;
  /** 0..1 progress of the running Großprojekt */
  fill: number;
  /** per flavour: 1 = unlocked by a finished project, else the progress of the running one */
  cells: Record<Flavour, number>;
  /** flavours the world could close as (finished projects) */
  unlocked: Flavour[];
}

/** Progress of a project's materials, 0..1. */
function progress(w: World, id: string): number {
  const def = projectDef(id);
  const p = (w.projects ?? []).find((x) => x.id === id);
  if (!p) return 0;
  if (p.status === 'done') return 1;
  const need = Object.values(def.materials).reduce((s, x) => s + x, 0);
  const got = Object.entries(def.materials).reduce((s, [g, x]) => s + Math.min(x, p.delivered[g] ?? 0), 0);
  return Math.min(1, got / need);
}

/** Unlocked flavours and the running project's progress. */
export function quarkStatus(w: World): QuarkStatus {
  const cells = empty();
  const unlocked: Flavour[] = [];
  for (const p of w.projects ?? []) {
    if (p.status !== 'done') continue;
    const f = projectDef(p.id).quark;
    cells[f] = 1;
    if (!unlocked.includes(f)) unlocked.push(f);
  }
  const running = buildingProject(w);
  if (!running) return { flavour: null, fill: 0, cells, unlocked };
  const f = projectDef(running.id).quark;
  const fill = progress(w, running.id);
  cells[f] = Math.max(cells[f], fill);
  return { flavour: f, fill, cells, unlocked };
}

/** One day: crossing 90 % and 100 % is announced once per flavour. */
export function quarkTick(w: World): void {
  const q = w.quark;
  const me = w.playerId;
  if (!q || !me) return;
  const running = buildingProject(w);
  if (running && progress(w, running.id) >= CONFIG.quark.warnAt) {
    const f = projectDef(running.id).quark;
    if (!q.warned.includes(f)) {
      q.warned.push(f);
      log(w, me, `Deine Welt verdichtet sich zu einem ${QUARK_NAME[f]}-Quark.`, 3);
    }
  }
  for (const f of quarkStatus(w).unlocked) {
    if (q.reached.includes(f)) continue;
    q.reached.push(f);
    log(w, me, `${QUARK_NAME[f]}-Quark freigeschaltet. In der fertigen Version kannst du deine Welt damit als Modul abschließen.`, 3);
  }
}
