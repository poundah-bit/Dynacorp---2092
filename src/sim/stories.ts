// Story events: a building-block generator that invents a different set of stories for every game.
// The pure part (lexicon, pick, texts, strength) lives here; the daily tick follows below it.

import storiesJson from '../data/stories.json';
import { CONFIG, GOODS, PLANETS, TERRA, distance, good, planet } from './data';
import type { Lore, PlaceRule, StoryCause, StoryContext, StoryEvent } from './types';

export const STORY_CAUSES = storiesJson.causes as StoryCause[];
export const STORY_NAMES = storiesJson.names;

type Rand = () => number;
const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const between = (rand: Rand, [lo, hi]: readonly number[]) => lo! + rand() * (hi! - lo!);
const intBetween = (rand: Rand, [lo, hi]: readonly number[]) => Math.floor(lo! + rand() * (hi! - lo! + 1));
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Replaces `{slot}` placeholders; unknown slots stay visible (the tests catch them). */
export function fillText(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => slots[key] ?? all);
}

/** A city, a person and an institute for every planet – invented once per game. */
export function makeLore(rand: Rand): Lore {
  const n = STORY_NAMES;
  const lore: Lore = {};
  for (const p of PLANETS) {
    const city = `${pick(rand, n.cityStart)}${pick(rand, n.cityEnd)}`;
    const last = pick(rand, n.last);
    const leader = `${pick(rand, n.first)} ${last}`;
    const institute = fillText(pick(rand, n.institute), { ort: p.name, stadt: city, last: pick(rand, n.last) });
    lore[p.id] = { city, leader, institute };
  }
  return lore;
}

/** Planets (or Terra) a place rule allows. */
export function placesFor(rule: PlaceRule): string[] {
  if (rule.kind === 'terra') return [TERRA];
  return PLANETS.filter((p) => p.id !== TERRA)
    .filter((p) => !rule.industry || rule.industry.includes(p.facility ?? ''))
    .filter((p) => !rule.notIndustry || !rule.notIndustry.includes(p.facility ?? ''))
    .filter((p) => !rule.inner || distance(TERRA, p.id) <= CONFIG.stories.innerParsec)
    .map((p) => p.id);
}

/** German phrase for how strong demand is compared to usual. */
export function factorPhrase(f: number): string {
  if (f < 1) return `rund ${Math.round(((1 - f) * 100) / 5) * 5} % unter dem Üblichen`;
  if (f >= 2.75) return 'dreimal so hoch wie sonst';
  if (f >= 2.25) return 'zweieinhalbmal so hoch wie sonst';
  if (f >= 1.75) return 'doppelt so hoch wie sonst';
  if (f >= 1.35) return 'anderthalbmal so hoch wie sonst';
  return 'deutlich höher als sonst';
}

/** Dative plural of a goods name („nach Robotern“, „nach Getränken“). */
const dative = (name: string) => (name === 'Roboter' || name.endsWith('e') ? `${name}n` : name);
const listDe = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`);

function eligible(c: StoryCause, ctx: StoryContext): { places: string[]; effects: StoryCause['effects'] } | null {
  const sc = CONFIG.stories;
  if ((c.minDay ?? 0) > ctx.day) return null;
  if (ctx.active.some((e) => e.cause === c.id)) return null;
  if (c.category === 'flaute') {
    if (ctx.day < sc.recessionMinDay) return null;
    if (ctx.lastRecessionDay !== null && ctx.day - ctx.lastRecessionDay < sc.recessionEveryDays) return null;
    if (ctx.active.some((e) => e.category === 'flaute')) return null;
  }
  if (c.needs === 'recentStorm' && !ctx.recentStormPlanet) return null;
  // more demand only for goods somebody makes; less demand for unmade goods is meaningless
  const effects = c.effects.filter((x) => ctx.producedGoods.has(x.good));
  if (effects[0] !== c.effects[0]) return null; // the texts talk about the main effect
  const busy = new Set(ctx.active.map((e) => e.place));
  const places = placesFor(c.place).filter((p) => !busy.has(p) && p !== ctx.recentStormPlanet);
  return places.length ? { places, effects } : null;
}

/** Picks and fills one story for today, or null when nothing fits the situation. */
export function pickStory(rand: Rand, ctx: StoryContext, id: string): StoryEvent | null {
  const sc = CONFIG.stories;
  const options = STORY_CAUSES.map((c) => ({ c, ok: eligible(c, ctx) })).filter((o) => o.ok);
  if (!options.length) return null;
  let r = rand() * options.reduce((s, o) => s + o.c.weight, 0);
  const chosen = options.find((o) => (r -= o.c.weight) < 0) ?? options[options.length - 1]!;
  const { c } = chosen;
  const { places, effects } = chosen.ok!;
  const place = pick(rand, places);
  const [fLo, fHi] = sc.factorLimits as [number, number];
  const rolled = effects.map((x) => ({ good: x.good, at: x.at, factor: round2(Math.min(fHi, Math.max(fLo, between(rand, x.factor)))) }));
  const priceBonus = c.priceBonus ? round2(Math.min(sc.bonusMax, between(rand, c.priceBonus))) : 0;
  const [dLo, dHi] = sc.daysLimits as [number, number];
  const days = Math.min(dHi, Math.max(dLo, intBetween(rand, c.days)));
  const rise = Math.max(1, Math.round(days * between(rand, sc.risePart)));
  const peak = Math.round(days * between(rand, sc.peakPart));
  const startDay = ctx.day;
  const lore = ctx.lore[place] ?? ctx.lore[TERRA]!;
  const n = STORY_NAMES;
  const up = rolled.filter((x) => x.factor > 1);
  const slots: Record<string, string> = {
    ort: planet(place).name,
    stadt: lore.city,
    person: lore.leader,
    institut: lore.institute,
    erreger: `${pick(rand, n.pathogenStart)}${pick(rand, n.pathogenEnd)}`,
    technik: pick(rand, n.tech),
    mode: pick(rand, n.fashion),
    waren: listDe((up.length ? up : rolled).map((x) => good(x.good).name)),
    warenDativ: listDe((up.length ? up : rolled).map((x) => dative(good(x.good).name))),
    ware: good(rolled[0]!.good).name,
    faktor: factorPhrase(rolled[0]!.factor),
    bonus: `${Math.round(priceBonus * 100)} %`,
    tage: String(days),
    sturm: ctx.recentStormPlanet ? planet(ctx.recentStormPlanet).name : '',
  };
  return {
    id,
    cause: c.id,
    category: c.category,
    place,
    title: fillText(pick(rand, c.title), slots),
    effects: rolled,
    priceBonus,
    startDay,
    peakDay: startDay + rise,
    fadeDay: Math.min(startDay + days - 1, startDay + rise + peak),
    endDay: startDay + days,
    texts: { start: fillText(pick(rand, c.start), slots), peak: fillText(pick(rand, c.peak), slots), end: fillText(pick(rand, c.end), slots) },
    phase: 'rise',
    delivered: 0,
  };
}

/** 0 before the start, rising to 1 at the peak, 1 until the fade begins, back to 0 at the end. */
export function storyStrength(e: StoryEvent, day: number): number {
  if (day <= e.startDay || day >= e.endDay) return 0;
  if (day < e.peakDay) return (day - e.startDay) / (e.peakDay - e.startDay);
  if (day <= e.fadeDay) return 1;
  return (e.endDay - day) / (e.endDay - e.fadeDay);
}

/** Problems in the story catalog (part of `validateData`). */
export function validateStories(): string[] {
  const problems: string[] = [];
  const goods = new Set(GOODS.map((g) => g.id));
  const types = new Set(PLANETS.map((p) => p.facility).filter(Boolean));
  const sc = CONFIG.stories;
  for (const c of STORY_CAUSES) {
    for (const x of c.effects) {
      if (!goods.has(x.good)) problems.push(`Story ${c.id}: unbekannte Ware ${x.good}`);
      if (x.factor[0] < sc.factorLimits[0]! || x.factor[1] > sc.factorLimits[1]!) problems.push(`Story ${c.id}: Faktor außerhalb der Grenzen`);
    }
    if (c.place.kind === 'planet') for (const t of [...(c.place.industry ?? []), ...(c.place.notIndustry ?? [])]) if (!types.has(t)) problems.push(`Story ${c.id}: unbekannte Industrie ${t}`);
    if (c.priceBonus && c.priceBonus[1] > sc.bonusMax) problems.push(`Story ${c.id}: Sonderpreis zu hoch`);
    if (c.days[0] < sc.daysLimits[0]! || c.days[1] > sc.daysLimits[1]!) problems.push(`Story ${c.id}: Dauer außerhalb der Grenzen`);
    if (!placesFor(c.place).length) problems.push(`Story ${c.id}: kein passender Ort`);
    for (const k of ['start', 'peak', 'end'] as const) if (c[k].length < 3) problems.push(`Story ${c.id}: zu wenige Texte für ${k}`);
  }
  return problems;
}
