# Story-Ereignisse – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Events with generated stories change demand for certain goods for a while – at Terra or on a planet that orders and pays itself – and every new game tells different stories.

**Architecture:** A pure generator in `src/sim/stories.ts` (world lexicon, cause pick, text filling, strength curve) driven by building blocks in `src/data/stories.json` and limits in `config.json` `stories`. `storiesTick(w)` in `step()` starts and ends events; `terraDemands` and a new planet demand read the active events. The UI shows them (Terra card, market chip, map marker, toast) and a start-screen switch.

**Tech Stack:** TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-story-ereignisse-design.md`

## Global Constraints

- Code, identifiers, comments in English; all player-facing text (story texts, labels) in German; invented names only, nothing from Dynatech, no real persons.
- No damage to facilities or ships by stories; no combat, sabotage, piracy.
- Every number in `src/data/config.json` `stories` (values below), nothing in code.
- Deterministic per seed: all randomness through `random(w)` / `randInt(w, …)` from `world.ts`.
- Limits: at most 2 active events, at most 1 `flaute` active; first event from day 40; 20–50 days between starts; demand factor 0.5–3; special price 0–40 %; duration 20–120 days; recessions from day 250, one per 300 days, factor ≥ 0.6.
- Phase-0/1 gates run without events; Phase-2 gate (`tests/endless.test.ts`) and `npm run balance` with events. If a target fails only with events, tune `stories` numbers, never base prices.
- Tests cheap (Rocco): no new long runs; the generator test simulates no days.
- `npm test`, `npm run typecheck` green before every commit; commit messages German with the session's attribution lines.

## Review Focus

- A story about a good nobody produces (planet orders that can never be served) → generator context `producedGoods`, test in Task 1.
- An old save without `stories` must load and then run with events on, without crashing on missing lore → test in Task 3.
- A recession must not pile onto another flaute or come before day 250 → generator test in Task 1.
- Planet orders must be paid like Terra's and never touch a company account → payment test in Task 2.
- Two events on the same good multiply, but the factor is clamped to `factorLimits` → test in Task 2.

---

### Task 1: Building blocks and pure story generator

**Files:**
- Create: `src/data/stories.json`, `src/sim/stories.ts`, `tests/stories.test.ts`
- Modify: `src/data/config.json` (key `stories`), `src/sim/types.ts`, `src/sim/data.ts` (load + `validateData`), `src/sim/index.ts` (export)

**Interfaces:**
- Produces (types in `types.ts`):
  - `StoryCategory = 'boom' | 'notlage' | 'engpass' | 'flaute' | 'gemischt'`
  - `PlaceRule = { kind: 'terra' } | { kind: 'planet'; industry?: string[]; notIndustry?: string[]; inner?: boolean }` (`industry` = facility type ids of `planets.json` `facility`; `inner` = distance to Terra ≤ `stories.innerParsec`)
  - `StoryCause = { id: string; category: StoryCategory; weight: number; place: PlaceRule; effects: { good: string; factor: [number, number]; at: 'terra' | 'place' }[]; priceBonus?: [number, number]; days: [number, number]; minDay?: number; needs?: 'recentStorm'; title: string[]; start: string[]; peak: string[]; end: string[] }`
  - `Lore = Record<string, { city: string; leader: string; institute: string }>` (key: planet id incl. `terra`)
  - `StoryEvent = { id: string; cause: string; category: StoryCategory; place: string; title: string; effects: { good: string; factor: number; at: 'terra' | 'place' }[]; priceBonus: number; startDay: number; peakDay: number; fadeDay: number; endDay: number; texts: { start: string; peak: string; end: string }; phase: 'rise' | 'peak' | 'fade' | 'done'; delivered: number }`
  - `StoryContext = { day: number; producedGoods: Set<string>; recentStormPlanet: string | null; active: StoryEvent[]; lastRecessionDay: number | null; lore: Lore }`
- Produces (functions in `stories.ts`):
  - `makeLore(rand: () => number): Lore`
  - `pickStory(rand: () => number, ctx: StoryContext, id: string): StoryEvent | null` – eligible causes only (see rules), weighted pick, place, rolled factors/bonus/days, phase days (rise `risePart`, peak `peakPart` of the duration, rest fade), texts filled; `null` when nothing is eligible.
  - `fillText(template: string, slots: Record<string, string>): string`
  - `storyStrength(e: StoryEvent, day: number): number` – 0 before start, linear 0→1 to `peakDay`, 1 to `fadeDay`, linear 1→0 to `endDay`, 0 after.
  - `STORY_CAUSES: StoryCause[]`, `STORY_NAMES` (from `stories.json`).

`config.json` `stories`:
```json
"stories": { "firstDay": 40, "firstDayJitter": 20, "pauseDays": [20, 50], "maxActive": 2, "planetBaseChance": 0.06,
  "recessionMinDay": 250, "recessionEveryDays": 300, "recentStormDays": 20, "innerParsec": 350,
  "risePart": [0.2, 0.3], "peakPart": [0.3, 0.5], "factorLimits": [0.5, 3], "bonusMax": 0.4, "daysLimits": [20, 120] }
```

Eligibility rules in `pickStory`: `minDay ≤ day` (`flaute` additionally `recessionMinDay` and `day - lastRecessionDay ≥ recessionEveryDays`); no second `flaute` while one is active; never the same cause twice at once; never a place that already has an active event; `needs: 'recentStorm'` only with `recentStormPlanet` (place = an inner planet); every effect with factor > 1 needs its good in `producedGoods` (effects on unproduced goods with factor < 1 are dropped, a cause left without effects is not eligible); a place rule with no matching planet → not eligible.

`stories.json`: `{ "names": { "pathogenStart": [...], "pathogenEnd": [...], "tech": [...], "fashion": [...], "first": [...], "last": [...], "cityStart": [...], "cityEnd": [...], "institute": [...] }, "causes": [...] }` – the 20 causes of the spec's catalog table with the spec's places and goods, `factor` and `days` ranges inside the limits, `priceBonus` on the Notlage/Engpass rows that say „Sonderpreis“, `minDay` ≥ 40; each cause with ≥ 2 titles and **≥ 3 variants** for `start`, `peak`, `end`. Slots: `{ort}`, `{stadt}`, `{person}`, `{institut}`, `{erreger}`, `{technik}`, `{mode}`, `{waren}`, `{ware}`, `{faktor}` (German word: „anderthalbmal“, „doppelt“, „dreimal“ … or „ein Drittel weniger“ for < 1), `{bonus}` („30 %“), `{tage}`. Name pools ≥ 12 entries each. Tone: short news style, 1–2 sentences, ≤ 220 characters after filling; the spec's Kessler-Fieber example is the model.

- [ ] **Step 1: Write the failing tests** in `tests/stories.test.ts`

```ts
const ALL = new Set(GOODS.map((g) => g.id));
const rng = (seed: number) => { /* small LCG/mulberry32 closure */ };
it('erzeugt 1.000 stimmige Stories', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const rand = rng(seed);
    const lore = makeLore(rand);
    const day = 40 + (seed % 900);
    const e = pickStory(rand, { day, producedGoods: ALL, recentStormPlanet: seed % 3 ? null : 'kharon', active: [], lastRecessionDay: null, lore }, `s${seed}`)!;
    const cause = STORY_CAUSES.find((c) => c.id === e.cause)!;
    // goods belong to the cause, place fits its rule, numbers inside the limits
    for (const x of e.effects) expect(cause.effects.some((c) => c.good === x.good && c.at === x.at)).toBe(true);
    expect(placeFits(cause.place, e.place)).toBe(true);           // helper in the test using PLANETS + distance
    for (const x of e.effects) expect(x.factor).toBeGreaterThanOrEqual(0.5), expect(x.factor).toBeLessThanOrEqual(3);
    expect(e.priceBonus).toBeLessThanOrEqual(0.4);
    expect(e.endDay - e.startDay).toBeGreaterThanOrEqual(20); expect(e.endDay - e.startDay).toBeLessThanOrEqual(120);
    expect(e.startDay < e.peakDay && e.peakDay <= e.fadeDay && e.fadeDay < e.endDay).toBe(true);
    for (const t of [e.title, e.texts.start, e.texts.peak, e.texts.end]) { expect(t).not.toMatch(/[{}]/); expect(t.length).toBeGreaterThan(10); expect(t.length).toBeLessThanOrEqual(220); }
    if (e.category === 'flaute') expect(day).toBeGreaterThanOrEqual(250);
  }
});
it('jede Ursache hat genug Textvarianten', () => { for (const c of STORY_CAUSES) for (const k of ['start','peak','end'] as const) expect(c[k].length).toBeGreaterThanOrEqual(3); });
it('keine Nachfrage nach Waren, die niemand herstellt', () => { /* producedGoods = {'oil'}: every effect with factor > 1 is oil, or null */ });
it('keine zweite Flaute und keine Rezession vor Tag 250 oder zu kurz nach der letzten', () => { /* active = [a flaute event] → never flaute; day 200 → never flaute; lastRecessionDay = day-100 → never flaute (500 draws each) */ });
it('Stärke steigt, hält und klingt ab', () => { /* e: start 100, peak 110, fade 130, end 150 → strength(100)=0, (105)=0.5, (120)=1, (140)=0.5, (150)=0 */ });
it('Daten sind gültig', () => expect(validateData()).toEqual([]));
```

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/stories.test.ts` → import errors.
- [ ] **Step 3: Implement** types, config, `stories.json` (full catalog and texts), `stories.ts`, `validateData` checks (cause goods exist, place industries exist, ranges inside limits, ≥ 3 variants).
- [ ] **Step 4: Run, expect PASS** – same command; `npm test`; `npm run typecheck`.
- [ ] **Step 5: Commit** – `git commit -m "Story-Baukasten: Bausteine, Welt-Lexikon und Generator"`

---

### Task 2: Events in the economy

**Files:**
- Modify: `src/sim/types.ts` (`World.stories?`, `Demand.story?`), `src/sim/world.ts` (`createWorld` option, `isOutsideBuyer`, `buyerName`), `src/sim/stories.ts` (`initStories`, `storiesTick`, `storyFactor`, `startStory`), `src/sim/engine.ts` (`step`, `terraDemands`, `deliverGoods`, `ordersTick`), `src/sim/actions.ts:400`, `src/sim/ai.ts:124`, `tests/endless.test.ts`, `tools/balance.ts`
- Test: `tests/stories.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `pickStory`, `makeLore`, `storyStrength`.
- Produces:
  - `World.stories?: { on: boolean; lore: Lore; events: StoryEvent[]; nextDay: number; lastRecessionDay: number | null }`; `Demand.story?: string` (event id).
  - `NewWorldOptions.stories?: boolean` (default `false`); `initStories(w: World, on: boolean): void` (lore from `random(w)`, `nextDay = firstDay + randInt(0, firstDayJitter)`).
  - `isOutsideBuyer(id: string): boolean` (`'terra'` or `world:<planet>`); `buyerName(w, id): string` (`'Terra'`, `Bevölkerung von <Planet>`, company name).
  - `storiesTick(w: World): void` – runs only when `w.stories?.on`; updates phases (logs `texts.peak` at `peakDay`, `texts.end` at `endDay`, priority 3, company `null`), drops events 200 days after their end, starts a new event when `day ≥ nextDay` and fewer than `maxActive` are running (logs `title + ' – ' + texts.start`, priority 3), then posts planet demands.
  - `storyFactor(w: World, goodId: string, at: 'terra' | string): { factor: number; bonus: number; event: StoryEvent | null }` – product of `1 + (factor − 1) × strength` over active effects for that good and place (`'terra'` or a planet id), clamped to `factorLimits`; `bonus` = largest `priceBonus × strength`; `event` = the strongest one.
  - `startStory(w: World, causeId: string, place: string): StoryEvent` – forces an event starting today (tests, observation page).

Behaviour:
- `step()`: `storiesTick(w)` right after `ordersTick(w)`, before `terraDemands(w)`.
- `terraDemands`: chance × `storyFactor(...,'terra').factor`; open cap `maxOpenPerGood × ceil(cheapness) × ceil(factor)`; price × `(1 + bonus)`; `d.story = event.id` when an event raised it.
- Planet demands (in `storiesTick`): for each active effect `at: 'place'` with current factor > 1: chance `planetBaseChance × factor`, cap `maxOpenPerGood` open per place and good; amount `terraDemandAmount(good, randInt(demandDaysOfOutput), big × terraOrderScale(w, good))` with Terra's big-order roll; requester `world:<planet>`, `toPlanet` planet, `toFacility null`, price = market × (final ? `terra.priceBonus` : `terra.baseDemandPriceFactor`) × (1 + bonus), deadline `terra.demandDeadlineDays`, `story` set.
- `deliverGoods`: `isOutsideBuyer` → `pay(w, null, supplier, value)`; buyer text via `buyerName`; if `d.story` add the part to that event's `delivered`.
- `ordersTick` (`to = …`), `actions.ts:400`, `ai.ts:124`: use `isOutsideBuyer` instead of `=== 'terra'` (AI treats planet orders like Terra's).
- `tests/endless.test.ts` and `tools/balance.ts`: `createWorld({ seed, difficulty, stories: true })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('eine Seuche lässt den Planeten Medikamente bestellen – und danach nicht mehr', () => {
  // soloWorld(); give the player a running pharma plant (push a facility, units 1) so medicine is produced; initStories(w, true); w.stories!.nextDay = 1e9
  const e = startStory(w, 'seuche', 'liora');
  const seen = new Map<string, Demand>();  // collect demands day by day (finished ones are pruned)
  // run until e.endDay + 30
  const during = [...seen.values()].filter((d) => d.requester === 'world:liora' && d.good === 'medicine');
  expect(during.length).toBeGreaterThan(0);
  for (const d of during) { expect(d.toPlanet).toBe('liora'); expect(d.story).toBe(e.id); expect(d.createdDay).toBeLessThan(e.endDay); }
  expect(e.phase).toBe('done');
  expect(w.log.filter((l) => l.priority === 3 && l.company === null).length).toBeGreaterThanOrEqual(3);
});
it('Planeten-Aufträge werden wie Terra bezahlt', () => {
  // helpers: oilWellWithTanker; push an accepted-ready demand { requester: 'world:pyros', good: 'oil', toPlanet: 'pyros', toFacility: null, … }
  // deliver(w, me, id, well.id, { ships: [tanker], rest: 'public' }); runUntil(done) → player revenue += amount × price; no company cash changes except the player's
});
it('zwei Ereignisse auf dieselbe Ware werden begrenzt', () => {
  // two forced terra events on robots with factor 3 at peak → storyFactor(w, 'robots', 'terra').factor === 3
});
it('ohne Schalter gibt es keine Ereignisse', () => { /* createWorld({ seed: 1 }), run 300 days → w.stories undefined, no demand with story */ });
```

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/stories.test.ts`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run, expect PASS** – `npm test` (incl. Phase-2 gate with events), `npm run typecheck`; then `npm run balance` – all three seeds stable, ≤ 3 bankruptcies, all base-price targets met; if not, tune `stories` numbers and rerun once. Note the result in the commit message.
- [ ] **Step 5: Commit** – `git commit -m "Story-Ereignisse in der Wirtschaft: Terra und Planeten bestellen nach Lage"`

---

### Task 3: Events in the game UI, docs

**Files:**
- Modify: `src/ui/play.ts` (`newGame` param, `companyName`), `src/ui/game.ts` (start form switch, `begin` default for old saves, toast on event start), `src/ui/views.ts` (Terra card, market chip), `src/ui/mapfx.ts` + `src/ui/starmap.ts` (marker), `src/ui/icons.ts` (icon `story`), `src/ui/game.css`, `src/ui/debug.ts` (stories on), `docs/konzept.md`, `CLAUDE.md`
- Test: `tests/phase3.test.ts`

**Interfaces:**
- Consumes: `initStories`, `storyStrength`, `buyerName`, `World.stories`, `Demand.story`.
- Produces: `newGame(name, difficulty, seed, aiCompanies, stories = true)`; `storyCard(w: World): string` in `views.ts` (empty string without active events); `storyPlanets(w: World): Set<string>` in `mapfx.ts`; `startedStories(w: World, day: number): StoryEvent[]` in `play.ts` (for the toast).

- Start form: checkbox „Ereignisse mit Geschichten“ (checked), small text „Booms, Krisen und Notlagen verändern zeitweise die Nachfrage. Jedes Spiel erzählt andere Geschichten.“
- `begin()`: `if (!world.stories) initStories(world, true)` (old saves, spec: missing = on).
- `companyName`: `buyerName` for `world:` ids → „Bevölkerung von Liora“.
- Terra tab: card „Lage in der Galaxie“ (`storyCard`) above the shipyard: per active event title, place, goods with ↑/↓, `bar()` of the strength labelled „Anlauf / Höhepunkt / klingt ab“, „Sonderpreis +30 %“ when > 0, start text in small print.
- Börse rows (`views.ts:495`, `:522`): `d.story` → `<span class="chip story" data-tip="<start text>">{icon story} Ereignis</span>`.
- Map: `storyPlanets` → a slow amber halo ring around the planet (steady ring with reduced motion).
- Toast after a day when `startedStories(w, w.day)` is non-empty: „Neue Lage: <Titel>“.
- `debug.ts`: observation page creates worlds with `stories: true`.
- Docs: `docs/konzept.md` section „Entscheidungen zu den Story-Ereignissen“ (table from the spec's decisions), roadmap unchanged; `CLAUDE.md` architecture line for `stories.ts`/`stories.json` and key-rule lines (planet requester `world:<id>`, `storyFactor`, switch).

- [ ] **Step 1: Write the failing tests** in `tests/phase3.test.ts`

```ts
it('die Lage zeigt laufende Ereignisse mit Ort und Waren', () => {
  // soloWorld, initStories(w, true), startStory(w, 'seuche', 'liora'), run 5 days
  const html = storyCard(w);
  expect(html).toContain('Lage in der Galaxie'); expect(html).toContain('Liora'); expect(html).toContain('Medikamente');
});
it('Planeten-Aufträge heißen „Bevölkerung von …“', () => expect(companyName(w, 'world:liora')).toBe('Bevölkerung von Liora'));
it('alte Spielstände bekommen Ereignisse', () => { /* world without stories → begin-equivalent pure helper `ensureStories(w)` in play.ts sets on + lore; run 100 days without error */ });
```

(`ensureStories(w: World): void` in `play.ts` = the `begin()` default, so it is testable.)

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/phase3.test.ts`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run, expect PASS** – `npm test`, `npm run typecheck`; `npx tsx tools/screens.ts` once and look at the Terra tablet shot with a forced event (or the dev server) – card readable, chip and halo visible.
- [ ] **Step 5: Commit** – `git commit -m "Story-Ereignisse in der Oberfläche"`, push.
