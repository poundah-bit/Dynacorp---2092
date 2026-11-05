// Which sound cues one game day produced for the player. Pure logic, no DOM and no audio: the tracker compares
// the world after a day with what it saw the day before. Sounds are played in sound.ts.

import { facilitiesOf, facilityDef, type ShipPhase, type World } from '../sim/index';

/** Every cue the game can play. `repair` comes from the player's own taps, the others from the day loop. */
export type Cue = 'big' | 'stall' | 'critical' | 'built' | 'idle' | 'repair';

/** Order of importance: if a day has many cues, the first ones win. */
export const CUE_ORDER: Cue[] = ['big', 'stall', 'critical', 'built', 'idle', 'repair'];

export interface CueTracker {
  /** cues for the day that just passed, most important first, each at most once */
  next(w: World): Cue[];
}

/** Starts tracking from the current state: what is already there is not news. */
export function cueTracker(w: World, me: string): CueTracker {
  let phases = shipPhases(w, me);
  let critical = criticalShips(w, me);
  let building = buildingFacilities(w, me);
  const seenBig = new Set(bigDemands(w, me));

  return {
    next(w) {
      const out = new Set<Cue>();

      // a big order from Terra for a good the player makes – rare and worth a look
      for (const id of bigDemands(w, me)) {
        if (seenBig.has(id)) continue;
        seenBig.add(id);
        out.add('big');
      }
      // a running plant produced nothing today for the first time (inputs missing or storage full)
      if (facilitiesOf(w, me).some((f) => f.status === 'running' && f.idleDays === 1)) out.add('stall');

      const nowCritical = criticalShips(w, me);
      if ([...nowCritical].some((id) => !critical.has(id))) out.add('critical');
      critical = nowCritical;

      const nowBuilding = buildingFacilities(w, me);
      if ([...building].some((id) => !nowBuilding.has(id) && facilitiesOf(w, me).some((f) => f.id === id))) out.add('built');
      building = nowBuilding;

      // a ship finished its job and stands idle again
      const nowPhases = shipPhases(w, me);
      for (const [id, phase] of nowPhases) {
        const before = phases.get(id);
        if (phase === 'idle' && before && before !== 'idle') out.add('idle');
      }
      phases = nowPhases;

      return CUE_ORDER.filter((c) => out.has(c));
    },
  };
}

const shipPhases = (w: World, me: string) =>
  new Map<string, ShipPhase>(w.ships.filter((s) => s.owner === me).map((s) => [s.id, s.phase]));

const criticalShips = (w: World, me: string) => new Set(w.ships.filter((s) => s.owner === me && s.critical).map((s) => s.id));

const buildingFacilities = (w: World, me: string) =>
  new Set(facilitiesOf(w, me).filter((f) => f.status === 'construction').map((f) => f.id));

/** Open big Terra orders for goods one of the player's plant types makes. */
function bigDemands(w: World, me: string): string[] {
  const made = new Set(facilitiesOf(w, me).flatMap((f) => Object.keys(facilityDef(f.type).outputs)));
  return w.demands.filter((d) => d.big && d.status === 'open' && made.has(d.good)).map((d) => d.id);
}
