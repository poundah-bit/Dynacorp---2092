# Großprojekte und Quark-Trend – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six expensive Großprojekte that need money and large amounts of goods, give prestige and a comfort advantage, and steer the world's Quark-Trend – shown in two switchable test variants.

**Architecture:** Data in `src/data/projects.json` and `goods.json` (`quark` class), numbers in `config.json` (`projects`, `quark`). `src/sim/projects.ts` (start/abort, order posting, delivery accounting, completion, effects helpers) and `src/sim/quark.ts` (cells, energy, status, thresholds). Hooks in `engine.ts` (`step`, `deliverGoods`, ship repair, storms, `companyIndex`), `actions.ts` (site limit, on-site repair), `automation.ts` (route limit), `stories.ts` (early warning). UI in `views.ts`, `sheets.ts`, `game.ts`, `starmap.ts`, `index.html`.

**Tech Stack:** TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-grossprojekte-design.md`

## Global Constraints

- Code/identifiers/comments English, player text German; no Dynatech content; physics correct.
- No project gives more income; the AI never starts projects.
- Every number in `src/data/*.json`.
- Old saves load: no `projects` = none, no `quark` = mode `trend` with empty energy, no `prestige` = 0.
- Determinism: no new RNG use unless the Forschungskuppel is built.
- Phase-0/1/2 gates unchanged and green; `npm test`, `npm run typecheck` before every commit; German commit messages with the session attribution lines.

## Values pinned here

`goods.json` `quark` (side i = industry, s = supply; weight 1/2/3): oil i1, ore i1, fuel i1, chemicals i1, plastic i1, water s1, fertilizer s1, agro s1, fiber s1, steel i2, plasticware i2, livestock s2, beverages s2, food s2, textiles s2, machines i3, robots i3, medicine s3. Cells: `up` i1, `down` s1, `charm` i2, `strange` s2, `top` i3, `bottom` s3.

`projects.json` (id, quark, price, prestige, materials = 150/200/250 plant-days of the best producer by weight):

| id | name | quark | price | prestige | materials |
|---|---|---|---|---|---|
| dock | Orbitaldock Terra | up | 10,000,000 | 5,000 | plastic 27,000 · fuel 22,500 |
| dome | Forschungskuppel | down | 10,000,000 | 5,000 | water 60,000 · agro 30,000 · fiber 22,500 |
| yard | Großwerft | charm | 25,000,000 | 10,000 | steel 32,000 · plasticware 24,000 |
| city | Siedlerstadt | strange | 25,000,000 | 10,000 | food 28,000 · textiles 20,000 · beverages 36,000 |
| datacenter | Rechenzentrum | top | 60,000,000 | 20,000 | robots 7,500 · machines 15,000 |
| clinic | Klinikring | bottom | 60,000,000 | 20,000 | medicine 6,250 |

`config.json`: `"projects": { "openOrdersPerGood": 2, "stormDamageFactor": 0.5, "extraSites": 1, "extraRoutes": 2, "warningDays": 7 }`, `"quark": { "halfLifeDays": 120, "targets": [T1, T2, T3], "warnAt": 0.9 }` – targets calibrated in Task 3.

## Review Focus

- A project order delivered by an AI firm while the player's cash is low must not push the player into debt → cash check before posting (Task 1 test).
- The player must be able to deliver his own project orders from the Börse (today own orders are filtered out of `deliverableDemands`) → Task 4 test.
- Without the Forschungskuppel, stories and RNG behave exactly as before → Task 2 test (same events for the same seed).
- Old saves without `quark`/`projects`/`prestige` load and run → Task 3 test.
- Trend mode: own-plant deliveries (Eigen-Nachfragen, Lieferrouten) never feed the energy → Task 3 test.

---

### Task 1: Projects in the economy

**Files:** create `src/data/projects.json`, `src/sim/projects.ts`, `tests/projects.test.ts`; modify `goods.json`, `config.json`, `types.ts`, `data.ts` (load `PROJECTS`, validate), `engine.ts` (`step`, `deliverGoods`, `companyIndex`), `index.ts`.

**Interfaces (produces):**
- Types: `Flavour = 'up' | 'down' | 'charm' | 'strange' | 'top' | 'bottom'`; `GoodDef.quark?: { side: 'industry' | 'supply'; weight: 1 | 2 | 3 }`; `ProjectDef = { id; name; quark: Flavour; price; prestige; materials: Record<string, number>; effect: string }` (`effect` = German one-liner); `ProjectState = { id; status: 'building' | 'done'; startDay; delivered: Record<string, number>; doneDay?: number; waiting?: string }`; `World.projects?: ProjectState[]`; `Company.prestige?: number`; `Demand.project?: string`.
- `PROJECTS: ProjectDef[]`, `projectDef(id)`.
- `startProject(w, c, id): Result<ProjectState>` – player only, not done, none building, no debt, cash ≥ price → pays price, logs priority 3.
- `abortProject(w, c): Result<undefined>` – cancels open project orders, state removed (money and goods lost).
- `projectsTick(w)` – for the building project: per material keep up to `openOrdersPerGood` open/accepted/shipping orders while `remaining > 0`; a new order = `min(remaining − in flight, maxOrderAmount(w, c, good))`, requester = player, `toPlanet` terra, `toFacility` null, `own` false, `pricePerFe` market, deadline like `postDemand`, `project` set; posted only if `cash ≥ amount × price`, else `waiting = 'wartet auf Geld'`. When every material is delivered → `status 'done'`, `prestige += def.prestige`, log priority 3.
- `hasProject(w, c, id): boolean`; `projectState(w, id)`.
- `deliverGoods`: `d.project` → add the part to `delivered[good]` (payment unchanged: supplier ≠ requester pays, own delivery free, goods are not stored).
- `companyIndex`: `raw += (c.prestige ?? 0) * 1000`.
- `step`: `projectsTick(w)` after `routesTick(w)`.

- [ ] **Step 1: failing tests** (`tests/projects.test.ts`): starting needs no debt and cash (error texts German), pays the price, only one at a time; orders appear for every material, at most 2 per good, sized ≤ `maxOrderAmount`; low cash → no order and `waiting`; delivery from an own plant costs nothing and counts; delivery by an AI company is paid by the player and counts; all delivered → done, prestige added, `companyIndex` rises by prestige; abort removes open orders; `goods.json` every good has a `quark` class; data validation clean.
- [ ] **Step 2:** `npx vitest run tests/projects.test.ts` → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS; `npm test`; `npm run typecheck`.
- [ ] **Step 5:** commit „Großprojekte: Daten, Baustelle, Lieferungen, Prestige“.

### Task 2: The six advantages

**Files:** `src/sim/projects.ts`, `engine.ts` (repair in `shipsTick`, `gravoStorms`), `actions.ts` (site limit, new `repairShipOnSite`), `automation.ts` (`routeLimit`), `stories.ts` (early warning), `types.ts` (`StoryState.upcoming?`), tests in `tests/projects.test.ts`.

**Interfaces (produces):** `facilityLimit(w, c): number`; `repairShipOnSite(w, c, shipId): Result<undefined>` (ship own, idle, not on Terra, at a planet with an own facility, condition < 100, cost `repairShipCost`, cash, then phase `repair` like `repairShip`); `StoryState.upcoming?: StoryEvent`.

- dock: an idle own ship on Terra with condition < 100 is repaired as if `repairAtTerra` were set.
- dome: in `storiesTick`, when the player has the dome and `day ≥ nextDay − warningDays` and no `upcoming`: pick the event now with `startDay = nextDay` (all phase days shifted), store as `upcoming`, log „In 7 Tagen: <Titel>“ (priority 3, player); at `nextDay` begin `upcoming` instead of picking. Without dome: code path unchanged.
- yard: `repairShipOnSite`.
- city: `facilityLimit` = `maxFacilitiesPerCompany + extraSites`; used in `actions.ts` and `ai.ts`.
- datacenter: `routeLimit` + `extraRoutes` when the level > 0.
- clinic: storm damage to the owner's facilities and ships × `stormDamageFactor` (rounded up; the `randInt` call stays so RNG is unchanged).

- [ ] **Step 1: failing tests:** one test per advantage (set `status: 'done'` directly in `w.projects`); plus „ohne Kuppel gleiche Ereignisse“: two worlds, same seed, stories on, one with a done dome for a *different* company id is impossible – instead compare `storiesTick` event list of seed 2 over 300 days before and after the change against a stored list of `[cause, place, startDay]` captured in Step 1 from the current code.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, `npm test`, typecheck. **Step 5:** commit „Großprojekte: die sechs Vorteile“.

### Task 3: Quark-Trend (both variants)

**Files:** create `src/sim/quark.ts`, tests in `tests/projects.test.ts`; modify `types.ts`, `world.ts` (`NewWorldOptions.quarkMode`), `engine.ts` (`step`, `deliverGoods`), `config.json` (`quark`), `index.ts`.

**Interfaces (produces):** `QuarkState = { mode: 'project' | 'trend'; energy: Record<Flavour, number>; warned: Flavour[]; reached: Flavour[] }`; `World.quark?`; `FLAVOURS: Flavour[]` (order up, down, charm, strange, top, bottom); `cellOf(goodId): Flavour`; `quarkTarget(f): number`; `ensureQuark(w)`; `quarkStatus(w, me): { flavour: Flavour | null; fill: number; cells: Record<Flavour, number> }` (cells = energy/target clamped 0..1 in trend mode; in project mode the building project's delivered share, or the last done project at 1, or `flavour null` before any project); `quarkTick(w)` (decay `0.5^(1/halfLifeDays)` per day; thresholds `warnAt` and 1 → log priority 3 to the player once per flavour, texts from the spec).

- Feeding (trend): in `deliverGoods`, value `part × d.pricePerFe` goes to `cellOf(good)` when (supplier = player and requester ≠ player) or `d.project` set.
- `step`: `quarkTick(w)` after `projectsTick`. `createWorld`: `quark` set only when `quarkMode` given; `ensureQuark` used by the UI for old saves.
- Calibration: run seed 1 med 1000 days, take the best AI firm's deliveries by cell as proxy (log its daily delivered value); choose `targets` so a firm focused on one cell at that level fills light in ≈ 200, middle ≈ 300, heavy ≈ 400 days at steady state (`energy_ss = daily × halfLife / ln 2`). Write the three numbers into `config.json`, note them in the commit message.

- [ ] **Step 1: failing tests:** `cellOf` for all 18 goods; deliveries to Terra feed the cell, own-plant deliveries don't, AI delivery into the player's project does; decay halves energy in 120 days; project mode follows the building project, keeps the last done one full; 90 % and 100 % messages once per flavour; old world without `quark` → `ensureQuark` → trend, runs 50 days.
- [ ] **Step 2:** FAIL. **Step 3:** implement + calibrate. **Step 4:** PASS, `npm test`, typecheck. **Step 5:** commit „Quark-Trend: zwei Testvarianten“.

### Task 4: UI and docs

**Files:** `src/ui/views.ts` (Terra card „Großprojekte“, Statistik card „Quark-Trend“, fleet button), `sheets.ts` (`projectSheet` confirm), `game.ts` (start-screen radio „Quark-Modus (Test)“, header chip, acts `project-start`, `project-abort`, `repair-onsite`, cue `automation` on completion, `ensureQuark` in `begin`), `play.ts` (`newGame(..., quarkMode = 'trend')`, `deliverableDemands` includes the player's own project orders), `index.html` (header `<span id="quark">`), `starmap.ts` (finished projects as small dots in an orbit around Terra), `icons.ts` (icon `quark`), `game.css`, `docs/konzept.md`, `CLAUDE.md`.

- Header chip: `◐ charm ▓▓▓░ 68 %` style via `bar()`; colour per flavour from six CSS tokens `--q-up … --q-bottom` (not green/yellow/red); long press explains.
- Terra card: six project rows (name, quark, price, prestige, materials, effect; buttons „Starten…“ / progress bars per material + status + „Abbrechen“ / „fertig ✓“).
- Statistik card: 2 × 3 grid (Industrie | Versorgung × leicht/mittel/schwer) with fill, the mode, two sentences of physics.
- Story card: shows `upcoming` as „In n Tagen: …“.

- [ ] **Step 1: failing tests** (`tests/phase3.test.ts`): `deliverableDemands` lists an own project order; `projectsCard` shows a running project with material bars; `quarkCard` shows six cells; `newGame(..., 'project')` sets the mode.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, `npm test`, typecheck; screenshot Terra + Statistik (tablet, phone) with a scratch script and look at them.
- [ ] **Step 5:** docs (konzept section „Entscheidungen zu den Großprojekten“, CLAUDE.md architecture + rules), commit „Großprojekte und Quark-Trend in der Oberfläche“, push.
