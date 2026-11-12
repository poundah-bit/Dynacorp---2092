# Optik Teil 1: Lesbarkeit – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Anlagen, Flotte, Börse and Aufträge their own colour, header with key figures, a line-icon set and fill bars, so the player knows where they are and what is wrong without reading.

**Architecture:** Pure helpers first (icons, bars, tones, `areaStats`) with vitest tests, then wire them into the HTML strings in `views.ts`/`game.ts` and style them in `game.css`. The simulation (`src/sim/`) is not touched.

**Tech Stack:** TypeScript, Vite, vitest, plain HTML strings + CSS, inline SVG.

**Spec:** `docs/superpowers/specs/2026-11-12-lesbarkeit-design.md`

## Global Constraints

- No change in `src/sim/` or `src/data/*.json`.
- No image, font or icon-font files; icons are SVG path data in `src/ui/icons.ts`.
- Code, identifiers, comments in English; all player-facing text in German.
- Area colours: `--area-facilities: #e8925a`, `--area-fleet: #5aa9ff`, `--area-market: #f07ab4`, `--area-orders: #a98bff`. Terra, Karte, Statistik stay neutral.
- `--good`, `--warn`, `--bad` are status only; area colours only colour frame elements (tab, header, card edge, h2 icon).
- Icons: 24×24 viewBox, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `stroke="currentColor"`, `aria-hidden="true"`. Never rendered below 16 px.
- Every status shows icon + colour + text.
- `prefers-reduced-motion: reduce` disables bar transitions.
- Touch targets stay ≥ `--tap` (48 px); bottom nav buttons stay 64 px high.
- `npm test` and `npm run typecheck` green after every task.
- Commits on branch `optik-teil-1`, messages in German, ending with the session attribution lines.

**Decision taken while planning (spec gap):** fleet cards already carry a left edge in their cargo colour (`.ship-card.cargo-*`). That edge stays, because it carries information; the fleet area colour shows in the tab, the header and the group headings' icons only.

## Review Focus

1. Capacity or max of 0 (facility good with no storage, ship model with capacity 0) → bar shows 0 %, never `NaN%`. Test in Task 2.
2. Demand/transport where `deadlineDay === createdDay` or already past → no division by zero; overdue is full red. Test in Task 2.
3. Stock above capacity (possible right after a storage module is scrapped) → bar clamps at 100 %. Test in Task 2.
4. Phone width 390 px with all chips present → header wraps without horizontal scroll, name hidden. Checked in Task 8 screenshots.
5. Guide highlight (`data-guide`) and long-press help (`data-tip`) on rewritten markup → every existing `data-guide` value in `views.ts` still present after the change. Test in Task 4 (grep-based test over the view output of a running game).

---

### Task 1: Icon set

**Files:**
- Create: `src/ui/icons.ts`
- Test: `tests/icons.test.ts`

**Interfaces:**
- Produces:
  - `type IconName` – union of all names below
  - `ICONS: Record<IconName, string[]>` – path `d` strings per icon (Task 2 of Teil 2 will feed them to `Path2D`)
  - `icon(name: IconName, cls = ''): string` → `<svg class="ic ${cls}" viewBox="0 0 24 24" …>` with one `<path d>` per string
  - `facilityIcon(type: string): IconName` – maps a facility id to its icon name
  - `cargoIconName(c: Cargo): IconName`

Names: tabs `terra, map, facilities, fleet, market, orders, stats`; cargo `tank, bulk, piece, cooled, live`; facilities `oilwell, waterstation, mine, refinery, plasticplant, chemplant, steelworks, agrofarm, plantation, ranch, brewery, foodplant, textilemill, factory, machineworks, robotworks, pharma`; states `construction, stopped, running, idle, travelling, loading, repairMarked, critical, deadline, bigOrder`.

- [ ] **Step 1: Write the failing test** `tests/icons.test.ts`
  - `every facility type has an icon`: for each `FACILITIES` entry, `ICONS[facilityIcon(f.id)]` is a non-empty array.
  - `every cargo has an icon`: for `['tank','bulk','piece','cooled','live']`, `ICONS[cargoIconName(c)].length > 0`.
  - `icon() renders accessible line svg`: `icon('fleet')` contains `viewBox="0 0 24 24"`, `aria-hidden="true"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, and as many `<path` as `ICONS.fleet.length`.
  - `all path data is drawable`: every string in every `ICONS` entry matches `/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/` and starts with `M`.
- [ ] **Step 2:** `npx vitest run tests/icons.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/ui/icons.ts`. Draw each icon by hand on the 24 grid as outline pictograms, own designs (nothing from Dynatech, no copied icon libraries). `facilityIcon` returns the id itself when it is an `IconName`, else `'facilities'`.
- [ ] **Step 4:** Test passes; `npm run typecheck` clean.
- [ ] **Step 5:** Commit `Icons: eigener Linien-Icon-Satz (Tabs, Frachtarten, Anlagen, Zustände)`.

### Task 2: Fill bar and tone rules

**Files:**
- Modify: `src/ui/format.ts`
- Test: `tests/bars.test.ts`

**Interfaces:**
- Produces (all in `format.ts`):
  - `type Tone = 'good' | 'warn' | 'bad' | 'neutral'`
  - `interface BarOpts { value: number; max: number; reserved?: number; incoming?: number; tone: Tone; label: string }`
  - `bar(o: BarOpts): string`
  - `stockTone(isInput: boolean, ratio: number): Tone`
  - `facilityConditionTone(c: number): Tone`, `shipConditionTone(c: number): Tone`
  - `deadlineTone(day: number, created: number, deadline: number): Tone`
  - `deadlineRatio(day: number, created: number, deadline: number): number` (0..1 time left)
  - constants `STOCK_IN_BAD = 0.10, STOCK_IN_WARN = 0.25, STOCK_OUT_WARN = 0.75, STOCK_OUT_BAD = 0.90, FACILITY_BAD_BELOW = 30, SHIP_WARN_BELOW = 50`

- [ ] **Step 1: Write the failing tests** `tests/bars.test.ts`
  - `stockTone`: input 0.05→bad, 0.2→warn, 0.5→neutral; output 0.95→bad, 0.8→warn, 0.5→neutral.
  - `facilityConditionTone`: 80→good, `CONFIG.facilities.repairBelow - 1`→warn, 29→bad.
  - `shipConditionTone`: 60→good, 49→warn, `CONFIG.ships.criticalBelow - 1`→bad.
  - `deadlineTone`: (day 0, created 0, deadline 10)→neutral; day 6→warn; day 11→bad; created === deadline, day = deadline → warn, not NaN; `deadlineRatio(5,5,5)` is 0.
  - `bar`: `bar({value:30,max:100,tone:'warn',label:'Erdöl'})` contains `role="meter"`, `aria-valuenow="30"`, `aria-valuemax="100"`, `aria-label="Erdöl"`, `class="bar warn"`, `width:30%`.
  - `bar` max 0 → contains `width:0%` and no `NaN`.
  - `bar` value 150 / max 100 → `width:100%`.
  - `bar` with `reserved: 20` renders `class="bar-res"` with `width:20%`; with `incoming: 10` renders `class="bar-in"` positioned after the fill (`left:30%;width:10%`), clamped so fill + incoming ≤ 100 %.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement in `format.ts`. Percentages rounded to one decimal; `aria-valuenow` rounded to integer. Markup: `<span class="bar TONE" role="meter" …><span class="bar-fill" style="width:X%"></span>[<span class="bar-res" style="width:R%"></span>][<span class="bar-in" style="left:X%;width:I%"></span>]</span>`. Reserved is drawn inside the fill from its right end (`right:` offset computed so it sits at the top of the fill).
- [ ] **Step 4:** Tests pass, typecheck clean.
- [ ] **Step 5:** Commit `Balken: bar() und Farbregeln für Lager, Zustand und Fristen`.

### Task 3: Key figures per area

**Files:**
- Modify: `src/ui/play.ts`
- Test: `tests/areastats.test.ts`

**Interfaces:**
- Consumes: existing `facilitiesOf`, `shipsOf`, `pendingAssets`, `deliverableDemands`, `openTransports`, `unshippedDemands`, `isCriticalShip` (from `format.ts` – move it to `play.ts` and re-export from `format.ts` to avoid a cycle if needed).
- Produces:
```ts
export interface AreaStats {
  facilities: { total: number; running: number; stopped: number; building: number; pending: number };
  fleet: { total: number; idle: number; moving: number; critical: number };
  market: { fitting: number; transports: number; big: number };
  orders: { promised: number; unshipped: number; nextDeadline: number | null; overdue: boolean };
}
export function areaStats(w: World, me: string): AreaStats
```
Definitions: `stopped` = status `stopped` OR running with 0 % efficiency (`productionEfficiency(f) === 0`); `building` = status `construction`; `pending` = `pendingAssets(w, me).length`; `moving` = ship phase ≠ `idle`; `critical` = `isCriticalShip`; `fitting` = `V.badges().market` formula (deliverable ready + idle-carry transports); `transports` = `openTransports(w, me).length`; `big` = open Terra demands with `big` for a good one of my facilities outputs; `promised` = demands with `supplier === me` and status `accepted | shipping`; `unshipped` = `unshippedDemands(w, me).length`; `nextDeadline` = smallest `deadlineDay - w.day` over promised demands and my waiting transports, `null` if none; `overdue` = that value < 0.

- [ ] **Step 1: Write the failing tests** (`soloWorld`, `player` from `tests/helpers.ts`):
  - fresh world: all counts 0, `nextDeadline` null, `overdue` false.
  - after `takeLoan` + `buyShip(w, me, 'tank-a')`: `fleet.total` 1, `fleet.idle` 1.
  - set that ship's `condition` to `CONFIG.ships.criticalBelow - 1`: `fleet.critical` 1.
  - oil well built and started (reuse the `oilWellWithTanker` steps from `phase3.test.ts`, move it to `helpers.ts`): `facilities.total` 1, `running` 1.
  - push a Terra oil demand with `big: true` (pattern `terraOilDemand` in `phase3.test.ts`): `market.big` 1.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `areaStats`; make `badges()` in `views.ts` read `fitting` from it for the market count so both stay equal.
- [ ] **Step 4:** All tests pass (including `phase3.test.ts` after moving the helper).
- [ ] **Step 5:** Commit `Kennzahlen je Bereich: areaStats()`.

### Task 4: Area colours, headers and tab bar

**Files:**
- Modify: `src/ui/game.css`, `src/ui/views.ts`, `src/ui/game.ts`
- Test: `tests/areahead.test.ts`

**Interfaces:**
- Consumes: `icon`, `IconName` (Task 1); `AreaStats`, `areaStats` (Task 3).
- Produces: `type Area = 'facilities' | 'fleet' | 'market' | 'orders'`; `areaHead(area: Area, s: AreaStats): string` in `views.ts`.

Header markup: `<header class="area-head" data-area="AREA">ICON<h2 class="area-name">NAME</h2><div class="chips">…</div></header>`; chip: `<span class="chip TONE" data-tip="…">[state icon] TEXT</span>`. Chip texts (German, counts formatted with `num`):
- Anlagen: `N Anlagen` · `N in Betrieb` (good, icon running) · `N Stillstand` (bad, icon stopped, only > 0) · `N im Bau` (icon construction, only > 0) · `N unterwegs von Terra` (only > 0)
- Flotte: `N Schiffe` · `N frei` (good, icon idle) · `N unterwegs` (icon travelling) · `N kritisch` (bad, icon critical, only > 0)
- Börse: `N passen zu dir` (good) · `N Transporte` · `N Großauftrag`/`Großaufträge` (warn, icon bigOrder, only > 0)
- Aufträge: `N zugesagt` · `N ohne Transport` (warn, only > 0) · `nächste Frist in N Tagen` / `heute` / `Frist überzogen` (icon deadline; bad when overdue; omitted when null)
Singular forms: `1 Anlage`, `1 Schiff`, `1 Transport`.

- [ ] **Step 1: Write the failing tests** `tests/areahead.test.ts`
  - `areaHead('fleet', stats with total 7, idle 3, moving 3, critical 1)` contains `data-area="fleet"`, `7 Schiffe`, `3 frei`, `1 kritisch`, `class="chip bad"`.
  - with `critical: 0` → no `kritisch`.
  - singular: total 1 → `1 Schiff`.
  - orders with `nextDeadline: -2, overdue: true` → `Frist überzogen` in a `chip bad`; `nextDeadline: null` → no `Frist`.
  - guide markers survive: in a world played with `guide()` steps up to the first delivery (reuse `phase1.test.ts` loop for 1 AI firm), concatenated `facilitiesView + fleetView + marketView + ordersView` output still contains every `data-guide="…"` value that `guide()` can return as `target` (collect them from `play.ts` with a regex over the source file).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:
  - `views.ts`: `areaHead`; `facilitiesView`, `fleetView`, `marketView`, `ordersView` start with `areaHead(...)` (they get `areaStats` once each via `ctx`; add `stats: AreaStats` to `ViewCtx`, filled in `game.ts` render).
  - `game.ts`: `TABS[].icon` becomes `IconName`; nav renders `icon(t.icon)`; nav buttons get `data-area` for the four areas; `#view` gets `data-area` of the current tab (or removes it).
  - `game.css`: area variables in `:root`; `[data-area="facilities"] { --area: var(--area-facilities) }` etc.; `.area-head` (flex, gap 12px, padding 10px 14px, left border 4px `var(--area)`, background `color-mix(in srgb, var(--area) 12%, var(--panel))`, radius 0 left / 14px right, margin-bottom 12px); `.area-head .ic` 24 px in `var(--area)`; `.chip` (panel-2 background, radius 6px, padding 2px 8px, 13px, icon 16px; `.chip.good/.warn/.bad` set text colour); `@media (max-width: 699px) { .area-name { display:none } }`; cards inside `#view[data-area]` get `border-left: 3px solid var(--area)` except `.ship-card`; nav: `.nav .ic` 24 px svg, colour `var(--area, var(--muted))` at opacity .6, `.on` gets `background: color-mix(in srgb, var(--area, var(--accent)) 18%, transparent)`, `box-shadow: inset 0 3px 0 var(--area, var(--accent))`, opacity 1; keep `.hot`, `.blink`, `.count` as they are.
- [ ] **Step 4:** Tests and typecheck pass.
- [ ] **Step 5:** Commit `Bereiche: eigene Farbe, Kopfzeile mit Kennzahlen, Icons in der Tab-Leiste`.

### Task 5: Anlagen tab and planet panel

**Files:**
- Modify: `src/ui/views.ts` (`facilitiesView`), `src/ui/mapinfo.ts`, `src/ui/format.ts` (`facilityStatus` gains `icon: IconName`), `src/ui/game.css`
- Test: extend `tests/bars.test.ts` → `describe('facility view')`

**Interfaces:**
- Consumes: `bar`, `stockTone`, `facilityConditionTone` (Task 2), `icon`, `facilityIcon` (Task 1).

- [ ] **Step 1: Failing test:** with the started oil well from `helpers.ts`, `facilitiesView` output contains `role="meter"` with `aria-label="Zustand"` and one `role="meter"` per good row; `planetInfo(w, me, 'vesta-nova')` contains the `oilwell` icon's first path string.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** In each facility card: facility icon before the name in `h2` (colour `var(--area)`), status badge with `icon(st.icon)`; under `h2` a condition bar (`label: 'Zustand'`, tone `facilityConditionTone`); in the stock table the „Lager“ cell holds the number and below it `bar({ value: stock, max: capacity, reserved: isOutput ? reserved : undefined, incoming: isInput ? incoming : undefined, tone: stockTone(isIn, stock / capacity), label: gName(g) })`. `facilityStatus` returns icon `construction | stopped | running`. `mapinfo.ts` shows `icon(facilityIcon(type))` before the facility name. CSS: `.bar` 6 px high (8 px inside `td`), radius 3px, track `var(--line)`; `.bar-fill` colour by tone (`neutral` → `var(--muted)`); `.bar-res` diagonal stripes via `repeating-linear-gradient` over the fill; `.bar-in` 1px dashed outline in the tone colour; `transition: width .3s` inside `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4:** Tests and typecheck pass.
- [ ] **Step 5:** Commit `Anlagen: Icons, Zustandsbalken, Lagerbalken`.

### Task 6: Flotte tab

**Files:**
- Modify: `src/ui/views.ts` (`fleetView`), `src/ui/format.ts` (`cargoIcon`, `shipStatus` gains `icon`), `src/ui/game.css`
- Test: `tests/bars.test.ts` → `describe('fleet view')`

**Interfaces:**
- Consumes: `bar`, `shipConditionTone`, `icon`, `cargoIconName`; sim `shipLoads`, `shipRoom`, `shipDef`; `shipLegDays` from `play.ts` for days left.

- [ ] **Step 1: Failing tests:** `cargoIcon('tank')` contains `<svg` and no emoji; idle ship → `fleetView` has `aria-label="Zustand"` meter and no `aria-label="Flug"`; after assigning the ship to a transport and running one day (ship phase `toPickup`) → contains `aria-label="Flug"` and `noch ` + days text.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `cargoIcon` renders `icon(cargoIconName(c))` inside the existing `.cargo-ic` box (keep title/aria-label); delete `CARGO_ICON`. Ship card: status badge with state icon (`idle | travelling | loading | repairMarked | critical`); condition bar under `h2`; when `shipLoads(w, s).length` → load bar (`label: 'Laderaum'`, value = capacity − `shipRoom`, max = capacity, neutral); when `s.route` → flight bar (`label: 'Flug'`, value `traveled`, max `distance`, neutral) followed by `noch ${days(shipLegDays(s))}`.
- [ ] **Step 4:** Tests and typecheck pass.
- [ ] **Step 5:** Commit `Flotte: Frachtart-Icons, Zustand-, Laderaum- und Flugbalken`.

### Task 7: Börse and Aufträge

**Files:**
- Modify: `src/ui/views.ts` (`marketView`, `ordersView`)
- Test: `tests/bars.test.ts` → `describe('orders view')`

**Interfaces:**
- Consumes: `cargoIcon`, `bar`, `deadlineTone`, `deadlineRatio`, `icon`.

- [ ] **Step 1: Failing tests:** `marketView` row for a Terra oil demand contains the `tank` icon path and, when `big`, the `bigOrder` icon; `ordersView` for a promised demand contains `aria-label="Frist"`, and with `w.day` beyond `deadlineDay` the bar has class `bar bad` and width 100 %.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Market: `cargoIcon(good(g).cargo)` before every good/transport name in rows and in the „Weitere Nachfragen“ table; big Terra demands get `icon('bigOrder')` in a `warn` chip. Orders: every row with a deadline gets `bar({ value: overdue ? 1 : deadlineRatio(...), max: 1, tone: deadlineTone(...), label: 'Frist' })` under the text; the existing `deadlineIn` text stays.
- [ ] **Step 4:** Tests and typecheck pass.
- [ ] **Step 5:** Commit `Börse und Aufträge: Frachtart-Icons, Großauftrag, Fristbalken`.

### Task 8: Visual check and docs

**Files:**
- Create: `tools/screens.ts` (Playwright script, dev dependency `playwright`, not shipped)
- Modify: `CLAUDE.md` (Architecture: `icons.ts`, `bar()`, `areaStats`, area colours), `docs/konzept.md` (one line under UI decisions)

- [ ] **Step 1:** `tools/screens.ts` starts `vite` preview, loads a game via `newGame` + scripted moves into localStorage autosave (critical ship, stopped plant, overdue order), and saves screenshots of the four tabs at 1280×800 and 390×844 into `screens/` (git-ignored).
  If the Playwright browser cannot be downloaded in the workspace, skip the script and take the same screenshots with the Claude desktop app's built-in browser from the Pages preview of the branch.
- [ ] **Step 2:** Run `npx tsx tools/screens.ts`; inspect all 8 images: area recognisable without text, header wraps without horizontal scroll at 390 px, no icon below 16 px, bars visible, reduced contrast nowhere below 4.5:1 for chip text.
- [ ] **Step 3:** Fix what the screenshots show; rerun.
- [ ] **Step 4:** Update `CLAUDE.md` and `docs/konzept.md`; `npm test`, `npm run typecheck`, `npm run build` green.
- [ ] **Step 5:** Commit `Optik Teil 1: Sichtprüfung, Doku` and push `optik-teil-1`.
