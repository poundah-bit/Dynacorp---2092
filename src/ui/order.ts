// The player's own order of facilities (Anlagen tab) and cargo groups (Flotte tab). Pure helpers;
// the order lives in the save game (SaveData.order), the views apply it, drag.ts changes it.

import type { Cargo } from '../sim/index';

export interface ListOrder {
  /** facility ids, top first */
  facilities: string[];
  /** cargo groups of the fleet, top first */
  cargo: Cargo[];
}

export const DEFAULT_CARGO: readonly Cargo[] = ['tank', 'bulk', 'piece', 'cooled', 'live'];
export const emptyOrder = (): ListOrder => ({ facilities: [], cargo: [...DEFAULT_CARGO] });

/** Items in the saved order; items the order doesn't know keep their own order at the end. */
export function applyOrder<T>(items: readonly T[], order: readonly string[], idOf: (x: T) => string): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((x, i) => ({ x, i, r: rank.get(idOf(x)) }))
    .sort((a, b) => (a.r ?? Infinity) - (b.r ?? Infinity) || a.i - b.i)
    .map((e) => e.x);
}

/** `ids` with `id` moved to position `to` (clamped); unknown ids leave the list unchanged. */
export function moveTo<T extends string>(ids: readonly T[], id: T, to: number): T[] {
  if (!ids.includes(id)) return [...ids];
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
}

/** A saved order from storage, cleaned up; anything broken gives the default. */
export function parseOrder(o: unknown): ListOrder {
  const d = (o ?? {}) as Partial<ListOrder>;
  const facilities = Array.isArray(d.facilities) ? d.facilities.filter((x): x is string => typeof x === 'string') : [];
  const known = Array.isArray(d.cargo) ? d.cargo.filter((c): c is Cargo => DEFAULT_CARGO.includes(c as Cargo)) : [];
  return { facilities, cargo: [...new Set([...known, ...DEFAULT_CARGO])] };
}

/** `full` with the slots of the visible ids filled by `visible` in its new order; hidden ids stay put. */
export function reorderVisible<T extends string>(full: readonly T[], visible: readonly T[]): T[] {
  const shown = new Set(visible);
  let i = 0;
  return full.map((id) => (shown.has(id) ? visible[i++]! : id));
}
