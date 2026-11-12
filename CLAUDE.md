# CLAUDE.md – Dynacorp 2092

Non-commercial Android fan game inspired by Dynatech (1992). Owner: Rocco (GitHub poundah-bit). Talk to him in German; code, identifiers and comments in English; all player-facing text in German.

## Read first

- `docs/konzept.md` – the full game concept (German): original game analysis, goods/facilities/ships, planets, credit, storage, touch UI plan, roadmap, legal notes, and the decisions taken while building Phases 0 and 1. When concept and `src/data/*.json` disagree, the data wins.

## Project rules

- No assets, code, texts or names from the original Dynatech. Planets, companies and values are our own design.
- No combat, sabotage or piracy. Cooperation via the order exchange is the core idea.
- Single player against 1–20 AI companies (chosen before the game, default 10). No split-screen / local multiplayer (decided). Online multiplayer is a maybe-later.
- Music: the soundtrack is by Thamanoidis (Rocco's Suno account name). Every music credit or reference (credits, start screen, settings, docs) names Thamanoidis, never Rocco.
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
  - `metrics.ts` Phase-2 checks against the concept's target values (amortisation, transport days, loan share, storage share, loss-making planets) plus run statistics
- `src/ui/` – the game (`index.html`): one player vs. 1–20 AI companies (default 10, `AI_DEFAULT` in `play.ts`). Seven tabs (Terra, Karte, Anlagen, Flotte, Börse, Aufträge, Statistik); on a tablet in landscape (≥ 1100 px wide) the star map sits in the side column next to the lists and the Karte tab is hidden.
  - `play.ts` pure player-side logic, no DOM: queries (deliverable demands, waiting transports), combined one-tap moves (`deliver`, `moveTransport`, `carry`, `shipDemand` with a `Choice` of own ship / buy ship / public), `guide()` (the "Nächster Schritt" hint derived from world state) and `fittingOffers`/`newOffers` for the exchange notification. Tests drive the game through this module.
  - `game.ts` start screen, intro sheet, time loop (paused, 1× = 6 s/day, 2×, 4×), click dispatch via `data-act`, sheets, toasts, autosave, save-slot sheets, exchange notification (tab blinks + toast), long press on anything with `data-tip` shows the explanation instead of running it (mouse: hover title)
  - `views.ts` HTML of the list tabs; `data-guide` attributes mark what the guide highlights, `data-tip` holds the long-press explanation
  - `starmap.ts` canvas star map (drag, pinch, wheel, zoom buttons, tap a planet); one element that `game.ts` moves between side column and Karte tab. `mapinfo.ts` the planet panel under it (pure HTML)
  - `chain.ts` chain graph in the Statistik tab: goods as SVG nodes in columns by their longest production path, tap for producers, consumers and market (pure HTML/SVG)
  - `sheets.ts` dialogs (loan, repay, deliver, transport, order goods); `format.ts` German number formatting and labels; `save.ts` one autosave slot in localStorage; `slots.ts` ten save slots in IndexedDB (a late game is ≈ 0.5 MB, too big for ten slots in localStorage)
  - `cues.ts` pure detection of the sound cues of one game day (`cueTracker`): big Terra order for an own good, plant stops producing, ship critical, plant built, ship idle again; `repair` is played on the player's tap. `sound.ts` makes the sounds with the Web Audio API (no sound files: soft sine/triangle notes, low-pass, short generated room echo), settings in localStorage (`dynacorp2092.sound.v1`), at most two cues per day and a cooldown per cue; the menu has a "Musik und Töne" sheet with volume, on/off per cue and a listening test
  - `music.ts` soundtrack by Thamanoidis: three Opus files in `public/music/` (80 kbit/s, ≈ 2.4 MB each, the only sound files in the game), played with an `<audio>` element so they stream; random order, never the same track twice in a row (`nextTrack`), 3 s gap, starts on the first tap, pauses while the app is hidden, skips a track that fails to load. Own settings in localStorage (`dynacorp2092.music.v1`, default on, 40 %), on/off, volume, now playing and „Nächstes Stück“ in the „Musik und Töne“ sheet. Opus does not play on older iPhones/iPads – the game then stays silent
  - Readability (Optik Teil 1): `icons.ts` own line icons (24 grid, stroke 2, `currentColor`) for tabs, cargo types, the 17 facility types and states – `icon(name)` returns inline SVG, the path data is reusable with `Path2D`; `format.ts` `bar()` fill bars (`role="meter"`) and the tone rules `stockTone`, `facilityConditionTone`, `shipConditionTone`, `deadlineTone`; `play.ts` `areaStats()` key figures; `views.ts` `areaHead()` header of Anlagen/Flotte/Börse/Aufträge. Area colours `--area-facilities/-fleet/-market/-orders` colour only frame elements (tab, header, card edge); green/yellow/red stay status only. `npx tsx tools/screens.ts` takes screenshots of the four area tabs (tablet + phone) with a local Chrome into `screens/`
  - Star map look (Optik Teil 2): `planets.ts` generates every planet in code from its id – `LOOKS` per facility type (palette, bands/spots, clouds, craters, lava, night lights, ring), `planetPixels()` pure RGBA, `planetSprite()` cached per size tier; `sky.ts` three parallax star layers + nebulae drawn once per map size; `mapfx.ts` `mapEvents()` (own plants that produced today, own deliveries today, today's gravo storm read from the log) and `createFx()` (pulse 1.2 s, spark 0.8 s, storm 3 s, at most one pulse per planet per 1.4 s, real time; the pulse uses `idleDays === 0` because efficiency after the step describes tomorrow). `starmap.ts` draws sky → storm veil → routes → planets (tier-coloured atmosphere, size grows with zoom) → effects → ships with light trails; `game.ts` feeds `map.dayEvents()` after every day and keeps drawing in pause only while `map.busy()`. Reduced motion: no pulse/spark/veil breathing, storm as steady glow. `tools/screens.ts` also shoots the map and prints the frame time with 20 AI firms at 4×
  - `debug.ts` + `observe.html` – observation page where 20 AI companies play alone
- `tools/simulate.ts` – headless run: `npm run sim -- <days> <seed> <difficulty>`
- `tools/balance.ts` – balancing report against the target values: `npm run balance -- <days> <seeds,comma> <difficulty>` (default 1000 days, seeds 1,2,3, med)

## Key game rules (as implemented)

- One facility type per planet; extending = bringing another unit of the same type to the same planet. Max 10 sites per company.
- Facilities are bought at Terra and must be flown out as piece goods; then 5 days construction; maintenance costs from built, operating costs while running.
- Every ship carries one cargo type (tank, bulk, piece, cooled, live); amount must fit the hold. Units shown to the player follow the cargo (`CARGO_UNIT`): tank in litres (l), bulk in tonnes (t), piece/cooled/live in FE; internally all amounts are plain numbers.
- Several transports with the same pickup and destination can share one trip: `assignShip` on a ship that is still flying to the pickup or loading adds the transport to `ship.joined` if it fits (`canJoin`, `shipRoom`, `shipLoads`). All loads are loaded together, delivered and paid one by one.
- Ships are never scrapped. Below `ships.criticalBelow` (30 %) a ship flies at `criticalSpeedFactor` (30 %) of its speed, logs a warning once, takes no new orders and blinks red on the map and in the fleet tab until it is repaired on Terra.
- Demand flow: requester posts demand → supplier accepts (stock gets reserved; accepting more than is on stock is allowed as an entrepreneurial risk – the ship waits at the plant and a missed deadline costs a penalty – but the amount must fit the plant's storage) → supplier posts own or public transports (a demand can be split over several ships via `postTransportForDemand(…, amount)`; `shipped`/`delivered` track the parts, each part is paid on arrival) → ship loads at supplier, unloads at requester → requester pays goods, issuer pays carrier fee.
- Terra buys final goods always and other goods as base demand; now and then (`terra.bigOrderChance`) it places a big order, marked `Demand.big`; the cheaper a good, the more Terra buys (price stabiliser).
- Order size: at most `orders.maxAmount` (15,000 FE) per demand, or the capacity of the biggest own ship of that cargo (`maxOrderAmount`). Terra orders 20–30 days of one plant's output, sometimes a big order (×2–4), never more than the biggest ship of the cargo.
- Ships are bought in the shipyard only; the delivery dialogs offer own idle ships, own ships already flying the same route ("zuladen") or public posting (exception: flying a newly bought facility/storage). A ship can be marked `repairAtTerra` and is repaired automatically when it stands idle on Terra.
- An order from an own plant (Eigen-Nachfrage) may be placed before the goods exist, like accepting a demand early; the amount must fit the supplier's storage.
- AI: prefers other companies' demands over Terra's base demand for intermediate goods (score × 0.5 for Terra), and withdraws an own order nobody took within 12 days, then orders the minimum amount – both keep long chains (chemicals → fertilizer → agro → food) from starving.
- Difficulty tightens credit and interest for the player only; AI reaction speed, deadlines and penalties apply to everyone.

## Commands

- `npm test` must stay green. `tests/balance.test.ts` is the Phase-0 gate (200 days, no collapse, ≤3 bankruptcies, processing plants appear); `tests/phase1.test.ts` is the Phase-1 gate (following only `guide()` leads from loan to the first paid order with 1, 10 and 20 AI firms); `tests/endless.test.ts` is the Phase-2 gate (1,000 days, no collapse, ≤3 bankruptcies, all 17 facility types built, every final good reaches Terra); `tests/phase3.test.ts` covers the pure parts of the touch UI (notifications, chain graph, planet panel). The Phase-3 gate itself is a test round by Rocco on tablet and phone without the manual.
- `npm run typecheck` before committing.
- `npm run dev` serves the game at `/` and the observation page at `/observe.html`.

## Status

Phase 1 is done (short test on a real tablet by Rocco). Phase 2 is done: the 1,000-day gate passes and `npm run balance` meets every target at base prices (transport duration is reported only, by decision after the play test). Base prices were solved along the chain (raw ≈ 70, intermediate ≈ 150, final ≈ 175 days to amortise); market prices of final goods run 10–40 % above base. Phase 3 (touch UI) is built: star map, chain graph, exchange notification, long-press help, intro, ten save slots. Open: the test round on tablet and phone. Dragging an order onto a ship was left out (the delivery dialog picks ships in one tap).
