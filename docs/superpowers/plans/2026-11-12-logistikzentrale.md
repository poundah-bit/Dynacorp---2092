# Logistikzentrale (automatische Lieferrouten) – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An expensive endgame upgrade (Logistikzentrale I/II/III) lets the player set up Lieferrouten that order, load and fly own goods from an own plant to another own plant automatically, with a fixed Linienschiff, when stock, space and the refill limit allow.

**Architecture:** Routes are simulation state (`World.routes`, `Company.automation`) changed only through new actions in `actions.ts`; a daily `routesTick(w)` in `step()` (right before the AI) calls the existing `postDemand(…, ownSupplier)` → `postTransportForDemand(…, 'own')` → `assignShip(…)`. The UI gets a Dynacore card, a „Lieferrouten“ section in the Aufträge tab and a „Neue Lieferroute“ sheet; Linienschiffe are excluded from every player ship choice. Reward: purchase sound + toast, golden route lines and trails on the map, statistics per route.

**Tech Stack:** TypeScript, vitest, existing sheet/views patterns.

**Spec:** `docs/superpowers/specs/2026-11-12-automatisierung-konzept.md`

## Global Constraints

- Levels in `config.json` under `automation`: `levels: [{ price: 2500000, routes: 1 }, { price: 4000000, routes: 3 }, { price: 6000000, routes: 6 }]`, `minFacilities: 5`, `dailyCostPerRoute: 1500`. No numbers in code.
- Buying needs: player company, ≥ `minFacilities` own facilities, `debt(w, c) === 0`, `cash ≥ price`. Paid from cash.
- Only own plant → own plant. Never Terra, never other companies. AI companies never buy or run routes.
- Linienschiff = ship referenced by an **active** route (`lineRoute(w, shipId)`); no `Ship` field. Pausing or deleting a route frees the ship.
- Trip trigger (all true): ship idle and condition ≥ `ships.criticalBelow`; `available(src, good) ≥ amount`; `freeCapacity(dst, good) − incoming(w, dst, good) ≥ amount`; `dst.stock[good] + incoming < refillBelow`; no unfinished trip of this route.
- Default `amount` = ship capacity (≤ `maxOrderAmount`); default `refillBelow` = half of `storageCapacity(dst, good)`.
- Daily cost per **active** route, paid in `routesTick`.
- Old saves: `routes` and `automation` missing → treated as `[]` / `0`.
- Player-facing text German; names: „Logistikzentrale I/II/III“, „Lieferroute(n)“, „Linienschiff“. Code English.
- No change to the AI, balance gates (`tests/balance.test.ts`, `phase1`, `endless`) stay green.
- Branch `automatisierung`, German commits with the session attribution lines.

## Review Focus

1. Source or target scrapped, ship sold, company bankrupt while a route exists → route ends with a log line, no crash, no stuck reservation. Test in Task 3.
2. A route's trip half done when the route is paused or deleted → the running trip finishes normally (own demand/transport stay valid), ship becomes free afterwards. Test in Task 3.
3. Two routes from the same source → second waits until enough stock is free (reservations of the first count). Test in Task 3.
4. Old save without `routes`/`automation` loads and steps. Test in Task 1.
5. Linienschiff never offered in deliver/carry/arrange dialogs or counted as „frei“, but appears in the fleet with a badge. Test in Task 4.

---

### Task 1: Data, config, buying the Logistikzentrale

**Files:**
- Modify: `src/data/config.json`, `src/sim/types.ts`, `src/sim/world.ts` (createWorld: `routes: []`), `src/sim/actions.ts`, `src/sim/index.ts` (exports)
- Test: `tests/automation.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export interface Route { id: string; owner: string; from: string; to: string; good: string; amount: number; refillBelow: number; ship: string; active: boolean; status: string; demand: string | null; trips: number; delivered: number }
// Company: automation?: number   World: routes?: Route[]
// actions.ts
export const automationLevel = (w: World, c: string) => number          // 0..3
export const routeLimit = (w: World, c: string) => number               // 0, 1, 3, 6
export function nextAutomation(w: World, c: string): { price: number; routes: number; level: number } | null
export function buyAutomation(w: World, c: string): Result<number>      // new level
```
Error texts (German): „Die Logistikzentrale ist voll ausgebaut.“, „Erst ab 5 eigenen Anlagen.“, „Nur schuldenfrei – zahle zuerst alle Kredite zurück.“, „Nicht genug Barkapital (X Cr benötigt).“ Log on success: „Logistikzentrale I eröffnet – 1 Lieferroute möglich.“ (priority 3).

- [ ] **Step 1: Failing tests:** fresh world → level 0, limit 0, `nextAutomation` price 2,500,000; buy with < 5 facilities fails „ab 5“; with 5 facilities (push 5 fake running facilities of the player) and a loan fails „schuldenfrei“; without loan but cash 1 M fails „Barkapital“; with cash 3 M succeeds → level 1, limit 1, cash −2.5 M; then level 2 price 4 M; after level 3 → `nextAutomation` null and buy fails „voll ausgebaut“. Old save: delete `w.routes` and `company.automation`, `run(w, 3)` works and level is 0.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests + full suite + typecheck green.
- [ ] **Step 5:** Commit `Logistikzentrale: Daten, Konfiguration, Kauf in drei Stufen`.

### Task 2: Creating and managing routes

**Files:**
- Modify: `src/sim/actions.ts`
- Test: `tests/automation.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
```ts
export interface RouteInput { from: string; to: string; good: string; ship: string; amount?: number; refillBelow?: number }
export function routeGoods(w: World, from: string, to: string): string[]   // outputs of from that are inputs of to
export const lineRoute = (w: World, shipId: string) => Route | undefined   // active route using this ship
export function addRoute(w: World, c: string, input: RouteInput): Result<Route>
export function setRouteActive(w: World, c: string, routeId: string, active: boolean): Result<undefined>
export function removeRoute(w: World, c: string, routeId: string): Result<undefined>
```
`addRoute` checks: limit not reached (counts all routes, active or paused); both facilities own, not under construction, different; `good` in `routeGoods`; ship own, cargo = good cargo, capacity ≥ amount, not `lineRoute`; amount ≤ `maxOrderAmount` and ≤ `storageCapacity(to, good)`; refillBelow in 1..capacity. New route `active: true, status: 'Wartet auf den ersten Tag'`. `setRouteActive(true)` re-checks the ship is not on another active route. `assignShip` gains an optional last parameter `viaRoute?: string`: when the ship is a Linienschiff and `viaRoute !== lineRoute.id` → fail „Linienschiff der Lieferroute X → Y – erst die Route pausieren.“. `sellShip` refuses Linienschiffe with the same hint.

- [ ] **Step 1: Failing tests:** add a valid route (oil well → plastic plant fake facility, tank-e ship) → defaults amount = 100,000? (use the ship's capacity), refillBelow = half the target capacity; second route at level 1 fails „Höchstens 1 Lieferroute“; wrong cargo ship fails; same ship on two routes fails; `assignShip` of the line ship to a manual transport fails with the hint, works after `setRouteActive(false)`; `sellShip` fails while active; `removeRoute` removes it.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** green. **Step 5:** Commit `Lieferrouten anlegen, pausieren, löschen; Linienschiffe geschützt`.

### Task 3: Daily route tick

**Files:**
- Modify: `src/sim/engine.ts` (new `routesTick(w)` between `gravoStorms` and `runAi`), maybe `src/sim/automation.ts` (new file if `engine.ts` would grow past ~600 lines)
- Test: `tests/automation.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2, `postDemand`, `postTransportForDemand`, `assignShip`, `cancelDemand`, `available`, `freeCapacity`, `incoming`, `setRepairAtTerra`.
- Produces: `routesTick(w: World): void`; route fields `status` (German, shown in UI), `demand`, `trips`, `delivered`.

Per route, in order:
1. Route owner bankrupt, or `from`/`to`/`ship` gone → remove route, log „Lieferroute X → Y beendet: <Grund>.“
2. `demand` set: if that demand is `done` → `trips += 1`, `delivered += amount`, `demand = null`; if `cancelled` → `demand = null`; else `status = 'Unterwegs …'` and continue.
3. Not active → `status = 'Pausiert'`, continue (no daily cost).
4. Pay `dailyCostPerRoute`.
5. Ship critical → `setRepairAtTerra(on)`, status „Linienschiff zur Reparatur vorgemerkt“, continue. Ship not idle → status „Linienschiff ist noch unterwegs“.
6. Target stock + incoming ≥ refillBelow → status „Ziel hat genug: A, Nachschub unter B“.
7. Target room < amount → status „Lager am Ziel voll“.
8. Source available < amount → status „Wartet auf Ware: A / B“.
9. Else post demand (own supplier = from) → own transport → `assignShip(…, route.id)`; on any failure cancel the demand and set status to the error text; on success `demand = d.id`, status „Fahrt gestartet“, log once per trip (priority 1).

- [ ] **Step 1: Failing tests** (solo world, cash raised, level 1, one route oil → fake plastic plant with an input storage): no trip while source stock < amount (status „Wartet auf Ware“); set source stock to amount → after one `step` a demand with `own`, a transport with the line ship exist, status „Fahrt gestartet“; run until delivered → `trips 1`, `delivered = amount`, target stock increased; target above refill limit → status „Ziel hat genug“; daily cost 1,500 paid only while active; paused route mid-trip → trip still completes, ship free afterwards; two routes from one source with stock for one trip → only one starts; scrapping the target → route removed with log; old save (no `routes`) steps fine.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** green incl. `npm test` (balance gates). **Step 5:** Commit `Lieferrouten fahren automatisch`.

### Task 4: Player-side exclusion of Linienschiffe

**Files:**
- Modify: `src/ui/play.ts` (`idleFittingShips`, `carryState`, `idleShipsOfCargo`, `joinableShips`, `tripRoom` users, `areaStats.fleet.idle`), `src/ui/views.ts` (fleet badge „Linienschiff“ with route, no manual buttons except „Route pausieren“ link to Aufträge)
- Test: `tests/automation.test.ts` → `describe('player side')`

- [ ] **Step 1: Failing tests:** with an active route, `idleFittingShips` / `idleShipsOfCargo` / `joinableShips` don't return the line ship; `areaStats(w, me).fleet.idle` excludes it; `fleetView` shows „Linienschiff“; after pausing, all of them include it again.
- [ ] **Step 2–4:** implement, green. **Step 5:** Commit `Linienschiffe aus der Schiffswahl ausgenommen`.

### Task 5: UI – Dynacore card, Lieferrouten section, new-route sheet

**Files:**
- Modify: `src/ui/views.ts` (`terraView`: card „Logistikzentrale“ under Dynacore; `ordersView`: section „Lieferrouten“ at the top when level > 0), `src/ui/sheets.ts` (`routeSheet(w, me)`), `src/ui/game.ts` (acts `buy-automation`, `route-new`, `route-pause`, `route-resume`, `route-delete` with confirm), `src/ui/play.ts` (`areaStats.orders.routes` active count), `src/ui/game.css`
- Test: `tests/automation.test.ts` → `describe('views')`

Card text: current level, next level price and routes, the three conditions as a checklist (✓/✗ with icons), button „Logistikzentrale I kaufen (2.500.000 Cr)“ disabled-looking but enabled (tap shows the missing condition as toast). Route row: icon of the good's cargo, „Erdöl: Vesta Nova → Polymer IX“, Linienschiff name, status line, „100.000 l pro Fahrt · Nachschub unter 15.000 l“, „automatisch geliefert: 1.400.000 l in 14 Fahrten“, buttons Pausieren/Fortsetzen, Löschen. Sheet: selects Quelle → Ziel (only fitting) → Ware (if more than one) → Linienschiff (only fitting, idle or not, not on another route) → Menge (number, default capacity) → Nachschub unter (number, default half). Empty-state texts when no fitting target or ship exists.

- [ ] **Step 1: Failing tests:** `terraView` shows the card with „2.500.000 Cr“ and the three conditions; after level 1 shows level II offer; `ordersView` with a route shows its status text and `data-act="route-pause"`; `routeSheet` body lists only fitting targets and ships.
- [ ] **Step 2–4:** implement, green; browser check with `tools/screens.ts` (add a scene with an active route). **Step 5:** Commit `Logistikzentrale und Lieferrouten in der Oberfläche`.

### Task 6: Reward and docs

**Files:**
- Modify: `src/ui/sound.ts` + `src/ui/cues.ts` (cue `automation`: short rising three-note fanfare, played on purchase), `src/ui/game.ts` (toast „Logistikzentrale I eröffnet!“ + open `routeSheet` right after buying level I), `src/ui/starmap.ts` (active routes: golden dashed line `#e8c45a` 50 % between source and target; Linienschiffe trail golden), `src/ui/views.ts` (Aufträge header chip „N Lieferrouten aktiv“ with icon), `src/ui/views.ts` statsView (total delivered by routes), `CLAUDE.md`, `docs/konzept.md`
- Test: `tests/cues.test.ts` (new cue listed in `CUE_INFO`), `tests/areahead.test.ts` (chip)

- [ ] **Step 1: Failing tests** for the cue entry and the header chip.
- [ ] **Step 2–4:** implement, green; screenshots of map with a route and the Aufträge tab.
- [ ] **Step 5:** Docs, `npm test`, typecheck, build; commit `Logistikzentrale: Belohnung, Karte, Doku`; push.
