# CLAUDE.md – Dynacorp 2092

Non-commercial Android fan game inspired by Dynatech (1992). Owner: Rocco (GitHub poundah-bit). Talk to him in German; code, identifiers and comments in English; all player-facing text in German.

## Read first

- `docs/konzept.md` – the full game concept (German): original game analysis, goods/facilities/ships, planets, credit, storage, touch UI plan, roadmap, legal notes, and the decisions taken while building Phases 0 and 1. When concept and `src/data/*.json` disagree, the data wins.

## Project rules

- No assets, code, texts or names from the original Dynatech. Planets, companies and values are our own design.
- No combat, sabotage or piracy. Cooperation via the order exchange is the core idea.
- Single player against 20 AI companies. No split-screen / local multiplayer (decided). Online multiplayer is a maybe-later.
- Target: Android tablet first, then phone. Delivered as PWA (GitHub Pages) and later APK via Capacitor.

## Architecture

- `src/data/*.json` – all game data and balancing parameters. Change numbers here, not in code.
- `src/sim/` – the economy core. Pure TypeScript, no DOM, deterministic per seed (RNG state lives in `World.rng`).
  - `types.ts` world state and data types
  - `data.ts` typed data access, `validateData()`
  - `world.ts` world creation, RNG, lookups, money transfers (`pay`)
  - `actions.ts` every move a company can make; returns `{ ok, value } | { ok: false, error }` with German messages. The UI and the AI must both go through these.
  - `engine.ts` `step(world)` = one game day: bank → facilities → ships → orders → Terra demand → prices → storms → AI → bankruptcy → collapse
  - `ai.ts` rule-based AI companies
  - `report.ts` balancing report for headless runs
- `src/ui/` – the Phase-1 game (`index.html`): one player vs. 3 AI companies, plain list UI. The real touch UI (star map, tutorial, 10 save slots) comes in Phase 3.
  - `play.ts` pure player-side logic, no DOM: queries (deliverable demands, waiting transports), combined one-tap moves (`deliver`, `moveTransport`, `carry`, `shipDemand` with a `Choice` of own ship / buy ship / public) and `guide()`, the "Nächster Schritt" hint derived from world state. Tests drive the game through this module.
  - `game.ts` start screen, time loop (paused, 1× = 2 s/day, 2×, 4×), click dispatch via `data-act`, sheets, toasts, autosave
  - `views.ts` HTML of the six tabs (Terra, Anlagen, Flotte, Börse, Aufträge, Statistik); `data-guide` attributes mark what the guide highlights
  - `sheets.ts` dialogs (loan, repay, deliver, transport, order goods); `format.ts` German number formatting and labels; `save.ts` one autosave slot in localStorage
  - `debug.ts` + `observe.html` – observation page where 20 AI companies play alone
- `tools/simulate.ts` – headless run: `npm run sim -- <days> <seed> <difficulty>`

## Key game rules (as implemented)

- One facility type per planet; extending = bringing another unit of the same type to the same planet. Max 10 sites per company.
- Facilities are bought at Terra and must be flown out as piece goods; then 5 days construction; maintenance costs from built, operating costs while running.
- Every ship carries one cargo type (tank, bulk, piece, cooled, live); amount must fit the hold.
- Demand flow: requester posts demand → supplier accepts (stock gets reserved) → supplier posts own or public transport → ship loads at supplier, unloads at requester → requester pays goods, issuer pays carrier fee.
- Terra buys final goods always and other goods as base demand; the cheaper a good, the more Terra buys (price stabiliser).
- Difficulty tightens credit and interest for the player only; AI reaction speed, deadlines and penalties apply to everyone.

## Commands

- `npm test` must stay green. `tests/balance.test.ts` is the Phase-0 gate (200 days, no collapse, ≤3 bankruptcies, processing plants appear); `tests/phase1.test.ts` is the Phase-1 gate (following only `guide()` leads from loan to the first paid order against 3 AI firms).
- `npm run typecheck` before committing.
- `npm run dev` serves the game at `/` and the observation page at `/observe.html`.

## Status

Phase 1 (playable prototype) is built and played through in the browser at tablet size; a test on a real Android tablet is still open. Next is Phase 2: 20 AI companies, balancing against the target values in the concept. Known: with only 3 AI firms the economy stays stable but thin (4–8 facilities after 200 days).
