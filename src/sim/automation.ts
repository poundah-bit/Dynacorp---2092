// Logistikzentrale: an expensive endgame upgrade in three levels that unlocks Lieferrouten – automatic
// deliveries from an own plant to another own plant with a fixed Linienschiff. A route only calls the
// same actions a player would (postDemand with an own supplier, own transport, assignShip).

import { CONFIG } from './data';
import { debt, type Result } from './actions';
import type { World } from './types';
import { company, facilitiesOf, log, pay } from './world';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const LEVEL_NAMES = ['I', 'II', 'III'];
export const automationName = (level: number) => `Logistikzentrale ${LEVEL_NAMES[level - 1] ?? level}`;

export const automationLevel = (w: World, c: string) => company(w, c).automation ?? 0;
export const routeLimit = (w: World, c: string) => {
  const l = automationLevel(w, c);
  return l ? CONFIG.automation.levels[l - 1]!.routes : 0;
};

/** The next level to buy, or null when fully built. */
export function nextAutomation(w: World, c: string): { price: number; routes: number; level: number } | null {
  const l = automationLevel(w, c);
  const next = CONFIG.automation.levels[l];
  return next ? { ...next, level: l + 1 } : null;
}

export function buyAutomation(w: World, c: string): Result<number> {
  const co = company(w, c);
  if (co.bankrupt) return fail(`${co.name} ist bankrott.`);
  const next = nextAutomation(w, c);
  if (!next) return fail('Die Logistikzentrale ist voll ausgebaut.');
  if (facilitiesOf(w, c).length < CONFIG.automation.minFacilities) return fail(`Erst ab ${CONFIG.automation.minFacilities} eigenen Anlagen.`);
  if (debt(w, c) > 0) return fail('Nur schuldenfrei – zahle zuerst alle Kredite zurück.');
  if (co.cash < next.price) return fail(`Nicht genug Barkapital (${next.price} Cr benötigt).`);
  pay(w, c, null, next.price);
  co.automation = next.level;
  log(w, c, `${automationName(next.level)} eröffnet – ${next.routes} ${next.routes === 1 ? 'Lieferroute' : 'Lieferrouten'} möglich.`, 3);
  return ok(next.level);
}
