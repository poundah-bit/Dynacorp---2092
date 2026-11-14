// Story-Ereignisse: the generator (no economy runs) and, further down, events in the economy.
import { describe, expect, it } from 'vitest';
import { CONFIG, GOODS, PLANETS, TERRA, distance, facilityDef, validateData } from '../src/sim/index';
import { STORY_CAUSES, makeLore, pickStory, storyStrength, validateStories } from '../src/sim/stories';
import type { PlaceRule, StoryContext, StoryEvent } from '../src/sim/types';

const ALL = new Set(GOODS.map((g) => g.id));

/** mulberry32 – a small seeded generator for the tests */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeFits(rule: PlaceRule, place: string): boolean {
  if (rule.kind === 'terra') return place === TERRA;
  if (place === TERRA) return false;
  const p = PLANETS.find((x) => x.id === place)!;
  if (rule.industry && !rule.industry.includes(p.facility!)) return false;
  if (rule.notIndustry && rule.notIndustry.includes(p.facility!)) return false;
  if (rule.inner && distance(TERRA, place) > CONFIG.stories.innerParsec) return false;
  return true;
}

const ctx = (rand: () => number, over: Partial<StoryContext> = {}): StoryContext => ({
  day: 500,
  producedGoods: ALL,
  recentStormPlanet: null,
  active: [],
  lastRecessionDay: null,
  lore: makeLore(rand),
  ...over,
});

describe('Story-Baukasten', () => {
  it('erzeugt 1.000 stimmige Stories', () => {
    const [fLo, fHi] = CONFIG.stories.factorLimits as [number, number];
    const [dLo, dHi] = CONFIG.stories.daysLimits as [number, number];
    const causes = new Set<string>();
    for (let seed = 1; seed <= 1000; seed++) {
      const rand = rng(seed);
      const day = 40 + (seed % 900);
      const e = pickStory(rand, ctx(rand, { day, recentStormPlanet: seed % 3 ? null : 'kharon' }), `s${seed}`);
      expect(e, `seed ${seed}`).not.toBeNull();
      const cause = STORY_CAUSES.find((c) => c.id === e!.cause)!;
      causes.add(cause.id);
      expect(e!.effects.length).toBeGreaterThan(0);
      for (const x of e!.effects) {
        expect(cause.effects.some((c) => c.good === x.good && c.at === x.at)).toBe(true);
        expect(x.factor).toBeGreaterThanOrEqual(fLo);
        expect(x.factor).toBeLessThanOrEqual(fHi);
      }
      expect(placeFits(cause.place, e!.place), `${cause.id} @ ${e!.place}`).toBe(true);
      // a planet never orders what its own industry makes
      const made = PLANETS.find((p) => p.id === e!.place)?.facility;
      for (const x of e!.effects) if (x.at === 'place' && made) expect(Object.keys(facilityDef(made).outputs), `${cause.id} @ ${e!.place}`).not.toContain(x.good);
      expect(e!.priceBonus).toBeGreaterThanOrEqual(0);
      expect(e!.priceBonus).toBeLessThanOrEqual(CONFIG.stories.bonusMax);
      expect(e!.endDay - e!.startDay).toBeGreaterThanOrEqual(dLo);
      expect(e!.endDay - e!.startDay).toBeLessThanOrEqual(dHi);
      expect(e!.startDay < e!.peakDay && e!.peakDay <= e!.fadeDay && e!.fadeDay < e!.endDay).toBe(true);
      for (const t of [e!.title, e!.texts.start, e!.texts.peak, e!.texts.end]) {
        expect(t, `${cause.id}: ${t}`).not.toMatch(/[{}]/);
        expect(t.length).toBeGreaterThan(10);
        expect(t.length, `${cause.id}: ${t}`).toBeLessThanOrEqual(220);
      }
      if (e!.category === 'flaute') expect(day).toBeGreaterThanOrEqual(CONFIG.stories.recessionMinDay);
    }
    // the variety is real: most causes show up
    expect(causes.size).toBeGreaterThanOrEqual(STORY_CAUSES.length - 2);
  });

  it('jede Ursache hat genug Textvarianten', () => {
    expect(STORY_CAUSES.length).toBeGreaterThanOrEqual(20);
    for (const c of STORY_CAUSES) {
      expect(c.title.length, c.id).toBeGreaterThanOrEqual(2);
      for (const k of ['start', 'peak', 'end'] as const) expect(c[k].length, `${c.id}.${k}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('keine Nachfrage nach Waren, die niemand herstellt', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = rng(seed);
      const e = pickStory(rand, ctx(rand, { producedGoods: new Set(['oil']) }), 'x');
      if (!e) continue;
      for (const x of e.effects) if (x.factor > 1) expect(x.good).toBe('oil');
    }
  });

  it('keine zweite Flaute und keine Rezession vor Tag 250 oder zu kurz nach der letzten', () => {
    const flaute = { category: 'flaute', cause: 'rezession', place: 'terra' } as StoryEvent;
    for (let seed = 1; seed <= 500; seed++) {
      const r1 = rng(seed);
      expect(pickStory(r1, ctx(r1, { active: [flaute] }), 'a')?.category).not.toBe('flaute');
      const r2 = rng(seed);
      expect(pickStory(r2, ctx(r2, { day: 200 }), 'b')?.category).not.toBe('flaute');
      const r3 = rng(seed);
      expect(pickStory(r3, ctx(r3, { lastRecessionDay: 400 }), 'c')?.category).not.toBe('flaute');
    }
  });

  it('Stärke steigt, hält und klingt ab', () => {
    const e = { startDay: 100, peakDay: 110, fadeDay: 130, endDay: 150 } as StoryEvent;
    expect(storyStrength(e, 90)).toBe(0);
    expect(storyStrength(e, 100)).toBe(0);
    expect(storyStrength(e, 105)).toBeCloseTo(0.5);
    expect(storyStrength(e, 120)).toBe(1);
    expect(storyStrength(e, 140)).toBeCloseTo(0.5);
    expect(storyStrength(e, 150)).toBe(0);
    expect(storyStrength(e, 160)).toBe(0);
  });

  it('Daten sind gültig', () => expect([...validateData(), ...validateStories()]).toEqual([]));
});

// ---------- events in the economy ----------

import { company, createWorld, run, storyFactor, startStory, initStories, terraDemandAmount, type Demand, type World } from '../src/sim/index';
import { deliver } from '../src/ui/play';
import { oilWellWithTanker, player, runUntil, soloWorld } from './helpers';

/** Solo world with a running pharma plant for the player and events on (none drawn by chance). */
function pharmaWorld(): World {
  const w = soloWorld();
  const me = player(w);
  w.facilities.push({ id: 'f-ph', owner: me, type: 'pharma', planet: 'asklepios', units: 1, status: 'running', buildDaysLeft: 0, condition: 100, stock: {}, reserved: {}, storages: [], idleDays: 0 });
  company(w, me).cash = 1e9;
  initStories(w, true);
  w.stories!.nextDay = 1e9;
  return w;
}

describe('Story-Ereignisse in der Wirtschaft', () => {
  it('eine Seuche lässt den Planeten Medikamente bestellen – und danach nicht mehr', () => {
    const w = pharmaWorld();
    const e = startStory(w, 'seuche', 'liora');
    const seen = new Map<string, Demand>();
    while (w.day < e.endDay + 30) {
      run(w, 1);
      for (const d of w.demands) seen.set(d.id, d);
    }
    const ordered = [...seen.values()].filter((d) => d.requester === 'world:liora' && d.good === 'medicine');
    expect(ordered.length).toBeGreaterThan(0);
    for (const d of ordered) {
      expect(d.toPlanet).toBe('liora');
      expect(d.story).toBe(e.id);
      expect(d.createdDay).toBeLessThan(e.endDay);
    }
    expect(e.phase).toBe('done');
    const news = w.log.filter((l) => l.priority === 3 && l.company === null).map((l) => l.text);
    expect(news.some((t) => t.includes(e.texts.start))).toBe(true);
    expect(news).toContain(e.texts.peak);
    expect(news).toContain(e.texts.end);
  });

  it('Planeten-Aufträge werden wie Terra bezahlt', () => {
    const w = soloWorld();
    const me = player(w);
    const well = oilWellWithTanker(w);
    well.stock.oil = 5000;
    const tanker = w.ships.find((s) => s.owner === me && s.model === 'tank-a')!;
    const d: Demand = {
      id: 'd-world', requester: 'world:pyros', good: 'oil', amount: 2000, toPlanet: 'pyros', toFacility: null, pricePerFe: 25,
      own: false, status: 'open', supplier: null, supplierFacility: null, transport: null, createdDay: w.day, deadlineDay: w.day + 60, late: false,
    };
    w.demands.push(d);
    expect(deliver(w, me, d.id, well.id, { ships: [tanker.id], rest: 'public' }).ok).toBe(true);
    const before = company(w, me).revenue;
    runUntil(w, () => d.status === 'done', 60);
    expect(company(w, me).revenue - before).toBe(2000 * 25);
  });

  it('Planeten-Aufträge für Rohstoffe wachsen nicht mit großen Anlagen', () => {
    const w = pharmaWorld();
    const me = player(w);
    w.facilities.push({ id: 'f-ws', owner: me, type: 'waterstation', planet: 'aquilon', units: 3, status: 'running', buildDaysLeft: 0, condition: 100, stock: {}, reserved: {}, storages: [], idleDays: 0 });
    const e = startStory(w, 'duerre', 'seidra');
    const seen = new Map<string, Demand>();
    while (w.day < e.endDay) {
      run(w, 1);
      for (const d of w.demands) if (d.requester === 'world:seidra') seen.set(d.id, d);
    }
    const water = [...seen.values()].filter((d) => d.good === 'water' && !d.big);
    expect(water.length).toBeGreaterThan(0);
    for (const d of water) expect(d.amount).toBeLessThanOrEqual(terraDemandAmount('water', 30));
  });

  it('zwei Ereignisse auf dieselbe Ware werden begrenzt', () => {
    const w = pharmaWorld();
    for (const e of [startStory(w, 'technologiesprung', 'terra'), startStory(w, 'technologiesprung', 'terra')]) {
      Object.assign(e, { startDay: w.day - 10, peakDay: w.day - 5, fadeDay: w.day + 50, endDay: w.day + 60 });
      e.effects[0]!.factor = 3;
    }
    expect(storyFactor(w, 'robots', 'terra').factor).toBe(3);
    expect(storyFactor(w, 'medicine', 'terra').factor).toBe(1);
  });

  it('ohne Schalter gibt es keine Ereignisse', () => {
    const w = createWorld({ seed: 1 });
    run(w, 300);
    expect(w.stories).toBeUndefined();
    expect(w.demands.some((d) => d.story)).toBe(false);
  });

  it('mit Schalter beginnen Ereignisse von selbst', () => {
    const w = createWorld({ seed: 2, stories: true });
    run(w, 250);
    expect(w.stories!.events.length).toBeGreaterThan(0);
    expect(w.stories!.events[0]!.startDay).toBeGreaterThanOrEqual(CONFIG.stories.firstDay);
  });
});
