// Story events: a building-block generator that invents a different set of stories for every game.
// The pure part (lexicon, pick, texts, strength) lives here; the daily tick follows below it.

import storiesJson from '../data/stories.json';
import { CONFIG, GOODS, PLANETS, TERRA, distance, facilityDef, good, planet } from './data';
import { terraDemandAmount, terraOrderScale } from './engine';
import type { Demand, Lore, PlaceRule, StoryCause, StoryContext, StoryEvent, World } from './types';
import { company, log, newId, random, randInt } from './world';

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
  return buildStory(rand, chosen.c, pick(rand, chosen.ok!.places), chosen.ok!.effects, ctx, id);
}

/** Rolls numbers and fills the texts of one cause at one place. */
function buildStory(rand: Rand, c: StoryCause, place: string, effects: StoryCause['effects'], ctx: StoryContext, id: string): StoryEvent {
  const sc = CONFIG.stories;
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

// ---------- the daily tick ----------

const randOf = (w: World) => () => random(w);

/** Switches story events on or off for a world; the lexicon is invented right away. */
export function initStories(w: World, on: boolean): void {
  const sc = CONFIG.stories;
  w.stories = { on, lore: makeLore(randOf(w)), events: [], nextDay: sc.firstDay + randInt(w, 0, sc.firstDayJitter), lastRecessionDay: null };
}

const active = (w: World) => (w.stories?.events ?? []).filter((e) => e.phase !== 'done');

function context(w: World): StoryContext {
  const st = w.stories!;
  const produced = new Set<string>();
  for (const f of w.facilities) {
    if (f.status === 'construction' || company(w, f.owner).bankrupt) continue;
    for (const g of Object.keys(facilityDef(f.type).outputs)) produced.add(g);
  }
  const storm = st.lastStorm && w.day - st.lastStorm.day <= CONFIG.stories.recentStormDays ? st.lastStorm.planet : null;
  return { day: w.day, producedGoods: produced, recentStormPlanet: storm, active: active(w), lastRecessionDay: st.lastRecessionDay, lore: st.lore };
}

function begin(w: World, e: StoryEvent) {
  const st = w.stories!;
  st.events.push(e);
  if (e.category === 'flaute') st.lastRecessionDay = w.day;
  log(w, null, `${e.title}: ${e.texts.start}`, 3);
}

/** Forces an event of a cause at a place, starting today (tests, observation page). */
export function startStory(w: World, causeId: string, place: string): StoryEvent {
  if (!w.stories) initStories(w, true);
  const c = STORY_CAUSES.find((x) => x.id === causeId);
  if (!c) throw new Error(`Unbekannte Story ${causeId}`);
  const e = buildStory(randOf(w), c, place, c.effects, context(w), newId(w, 'st'));
  begin(w, e);
  return e;
}

/**
 * How a story changes demand for a good at Terra (`'terra'`) or on a planet today: the factor (product over
 * all running events, clamped), the special price and the event that drives it most.
 */
export function storyFactor(w: World, goodId: string, at: string): { factor: number; bonus: number; event: StoryEvent | null } {
  let factor = 1;
  let bonus = 0;
  let event: StoryEvent | null = null;
  let strongest = 0;
  if (!w.stories?.on) return { factor, bonus, event };
  for (const e of active(w)) {
    const s = storyStrength(e, w.day);
    if (s <= 0) continue;
    for (const x of e.effects) {
      if (x.good !== goodId) continue;
      if (x.at === 'terra' ? at !== TERRA : e.place !== at) continue;
      factor *= 1 + (x.factor - 1) * s;
      bonus = Math.max(bonus, e.priceBonus * s);
      const pull = Math.abs(x.factor - 1) * s;
      if (pull > strongest) [strongest, event] = [pull, e];
    }
  }
  const [lo, hi] = CONFIG.stories.factorLimits as [number, number];
  return { factor: Math.min(hi, Math.max(lo, factor)), bonus, event };
}

/** Planets in an emergency or a boom order goods themselves and pay like Terra. */
function planetDemands(w: World) {
  const tc = CONFIG.terra;
  const done = new Set<string>();
  for (const e of active(w)) {
    if (e.place === TERRA) continue;
    for (const x of e.effects) {
      const key = `${e.place}|${x.good}`;
      if (x.at !== 'place' || done.has(key)) continue;
      done.add(key);
      const sf = storyFactor(w, x.good, e.place);
      if (sf.factor <= 1 || random(w) >= CONFIG.stories.planetBaseChance * sf.factor) continue;
      const requester = `world:${e.place}`;
      const open = w.demands.filter((d) => d.requester === requester && d.good === x.good && d.status === 'open').length;
      if (open >= tc.maxOpenPerGood) continue;
      const big = random(w) < tc.bigOrderChance ? randInt(w, tc.bigOrderFactor[0]!, tc.bigOrderFactor[1]!) : 1;
      const g = good(x.good);
      // like Terra: only orders for final goods grow with the biggest plant
      const scale = g.tier === 'final' ? terraOrderScale(w, x.good) : 1;
      const amount = terraDemandAmount(x.good, randInt(w, tc.demandDaysOfOutput[0]!, tc.demandDaysOfOutput[1]!), big * scale);
      const base = g.tier === 'final' ? tc.priceBonus : tc.baseDemandPriceFactor;
      const d: Demand = {
        id: newId(w, 'd'),
        requester,
        good: x.good,
        amount,
        toPlanet: e.place,
        toFacility: null,
        pricePerFe: Math.round((w.prices[x.good] ?? g.basePrice) * base * (1 + sf.bonus) * 100) / 100,
        own: false,
        status: 'open',
        supplier: null,
        supplierFacility: null,
        transport: null,
        createdDay: w.day,
        deadlineDay: w.day + tc.demandDeadlineDays,
        late: false,
        story: (sf.event ?? e).id,
      };
      if (big > 1) d.big = true;
      w.demands.push(d);
    }
  }
}

/** One day of stories: phases and news, a new event now and then, planet orders. */
export function storiesTick(w: World): void {
  const st = w.stories;
  if (!st?.on) return;
  const sc = CONFIG.stories;
  for (const e of st.events) {
    if (e.phase === 'done') continue;
    if (w.day >= e.endDay) {
      e.phase = 'done';
      log(w, null, e.texts.end, 3);
    } else if (w.day > e.fadeDay) e.phase = 'fade';
    else if (w.day >= e.peakDay) {
      if (e.phase === 'rise') log(w, null, e.texts.peak, 3);
      e.phase = 'peak';
    }
  }
  st.events = st.events.filter((e) => e.phase !== 'done' || w.day - e.endDay <= sc.keepDoneDays);
  if (w.day >= st.nextDay && active(w).length < sc.maxActive) {
    const e = pickStory(randOf(w), context(w), newId(w, 'st'));
    if (e) begin(w, e);
    st.nextDay = w.day + randInt(w, sc.pauseDays[0]!, sc.pauseDays[1]!);
  }
  planetDemands(w);
}
