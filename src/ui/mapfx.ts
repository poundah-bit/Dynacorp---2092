// Motion on the star map: what happened on the new game day (pure, from the world state) and a small
// list of running effects (production pulse, arrival spark, storm flicker) timed in real milliseconds.

import { PLANETS, facilitiesOf, type World } from '../sim/index';

export interface DayEvents {
  /** planets of own plants that produced today */
  pulses: string[];
  /** destination planets of transports the player's ships delivered today */
  arrivals: string[];
  /** planet hit by a gravo storm today */
  storm: string | null;
}

const STORM = /^Gravo-Sturm bei (.+?)!/;

/** Planets (or Terra) where a story event is running – the map shows a halo there. */
export function storyPlanets(w: World): Set<string> {
  return new Set((w.stories?.events ?? []).filter((e) => e.phase !== 'done' && w.day < e.endDay).map((e) => e.place));
}

export function mapEvents(w: World, me: string): DayEvents {
  // idleDays is reset only on a day with production (efficiency now would describe tomorrow)
  const pulses = [...new Set(facilitiesOf(w, me).filter((f) => f.status === 'running' && f.idleDays === 0).map((f) => f.planet))];
  const arrivals = [...new Set(w.transports.filter((t) => t.carrier === me && t.status === 'done' && t.doneDay === w.day).map((t) => t.toPlanet))];
  let storm: string | null = null;
  for (let i = w.log.length - 1; i >= 0; i--) {
    const e = w.log[i]!;
    if (e.day !== w.day) {
      if (e.day < w.day) break;
      continue;
    }
    const m = e.company === null ? STORM.exec(e.text) : null;
    if (m) {
      storm = PLANETS.find((p) => p.name === m[1])?.id ?? null;
      break;
    }
  }
  return { pulses, arrivals, storm };
}

export type FxKind = 'pulse' | 'spark' | 'storm';
export interface Fx {
  kind: FxKind;
  planet: string;
  /** performance.now() in ms */
  start: number;
}

export const FX_DURATION: Record<FxKind, number> = { pulse: 1200, spark: 800, storm: 3000 };
/** at most one pulse per planet in this time, so 4× speed does not get hectic */
export const PULSE_GAP = 1400;

export interface FxList {
  add(e: DayEvents, now: number): void;
  active(now: number): Fx[];
  busy(now: number): boolean;
  clear(): void;
}

export function createFx(): FxList {
  let list: Fx[] = [];
  const lastPulse = new Map<string, number>();
  const prune = (now: number) => (list = list.filter((f) => now - f.start < FX_DURATION[f.kind]));
  return {
    add(e, now) {
      prune(now);
      for (const p of e.pulses) {
        const prev = lastPulse.get(p);
        if (prev !== undefined && now - prev < PULSE_GAP) continue;
        lastPulse.set(p, now);
        list.push({ kind: 'pulse', planet: p, start: now });
      }
      for (const p of e.arrivals) list.push({ kind: 'spark', planet: p, start: now });
      if (e.storm) list.push({ kind: 'storm', planet: e.storm, start: now });
    },
    active: (now) => prune(now),
    busy: (now) => prune(now).length > 0,
    clear() {
      list = [];
      lastPulse.clear();
    },
  };
}

/** Storm glow strength over its life (k = 0..1): full, then fading out in the last fifth. */
export const stormFade = (k: number) => (k >= 1 ? 0 : k <= 0.8 ? 1 : (1 - k) / 0.2);

/** Length in px of a ship's light trail: the way it has flown on screen, at most 40 px. */
export const trailLength = (traveledPx: number) => Math.max(0, Math.min(40, traveledPx));
