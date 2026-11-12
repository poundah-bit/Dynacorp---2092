# Optik Teil 2: Atmosphäre und Sternkarte – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the star map into a living space panorama – generated planets that look like their industry with a tier-coloured atmosphere, a parallax star sky with nebulae, a visible gravo-storm zone, ship trails, production pulses and arrival sparks – fluid on a tablet.

**Architecture:** Two new pure-ish modules (`planets.ts`: looks + pixel generator; `mapfx.ts`: day events + effect list) with vitest tests, then `starmap.ts` draws pre-rendered offscreen layers (sky, planet sprites) plus live layers (routes, trails, ships, effects) per frame. `game.ts` feeds day events to the map and keeps redrawing while effects run in pause. No sim change, no new runtime dependency.

**Tech Stack:** TypeScript, Canvas 2D, OffscreenCanvas-free (plain `document.createElement('canvas')`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-sternkarte-design.md`

## Global Constraints

- No change in `src/sim/` or `src/data/*.json`.
- No image files, no new runtime dependency, no WebGL.
- Deterministic looks: same planet id → same pixels; sky from fixed seed `'dynacorp-sky'`.
- Effects run in real time: pulse 1.2 s, spark 0.8 s, storm 3 s; at most one pulse per planet per 1.5 s.
- `prefers-reduced-motion: reduce` → no pulse, spark, veil shimmer; storm drawn as steady glow at 45 % alpha; trails stay.
- Map meaning unchanged: turquoise ring = own facility (red when stopped or condition < `facilities.repairBelow`), yellow ring = selection, triangle = own ship, critical ships blink red.
- Planet radius: Terra `clamp(11 × z, 11, 24)`, others `clamp(7 × z, 7, 16)` with `z = scale / fitScale` (zoom relative to the fitted view).
- Atmosphere: radial gradient in tier colour from 0.9 R (≈ 65 % alpha) to 1.9 R (0).
- Frame budget: < 8 ms per frame with 20 AI firms while time runs (measured in Task 6).
- Code/comments English, player-facing text German. Commits on `optik-teil-2`, German messages with the session attribution lines.

## Review Focus

1. Extreme zoom (0.15–8) → planets stay sharp (sprite size tier ≥ drawn size) and never exceed the clamp; hit area grows with the drawn radius. Test in Task 1 (`spriteTier`).
2. Map element hidden (width 0) or moved between side column and Karte tab, window resized, `devicePixelRatio` changed → sky layer rebuilt for the new size, nothing drawn at size 0. Checked in Task 3 (`skyKey`) and Task 6 screenshots.
3. Storm log line of another day, a planet name with spaces, two log entries on one day → `mapEvents` returns only today's storm, correct id. Test in Task 2.
4. Loading another save or starting a new game while effects run → effect list cleared, no spark from the old world. Test in Task 2 (`fx.clear`) + wiring in Task 5.
5. Speed 4× → pulses limited per planet, effect list stays small (no unbounded growth). Test in Task 2.

---

### Task 1: Planet looks and pixels

**Files:**
- Create: `src/ui/planets.ts`
- Test: `tests/planets.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PlanetLook { palette: [string, string, string]; pattern: 'bands' | 'spots'; clouds?: number; craters?: boolean; lava?: string; lights?: string; ring?: boolean; haze?: boolean; land?: [string, string] }
export const LOOKS: Record<string, PlanetLook>            // 17 facility ids + 'terra'
export function lookOf(p: PlanetDef): PlanetLook          // p.facility ?? 'terra'
export function planetPixels(id: string, look: PlanetLook, r: number): Uint8ClampedArray  // RGBA, size (2r+2)², pure
export const SPRITE_TIERS = [8, 12, 16, 24, 32, 48] as const
export function spriteTier(px: number): number            // smallest tier ≥ px, else the largest
export function planetRadius(isTerra: boolean, zoom: number): number
export function planetSprite(p: PlanetDef, rPx: number): HTMLCanvasElement  // cached by `${id}@${tier}`, browser only
export function hashRng(seed: string): () => number      // also used by the sky in Task 3
```
Palettes and extras exactly as the spec table (`LOOKS`). Rings: steelworks, plantation, textilemill. Light direction normalised (-0.55, -0.45, 0.7). Edge alpha `min(1, (1 - dist) × r × 1.5)`. Noise: value noise on a 64×64 grid from `hashRng(id)`, 2–3 octaves; coordinates mapped from the sphere so features bend at the limb.

- [ ] **Step 1: Failing tests** `tests/planets.test.ts`:
  - every `FACILITIES` id and `'terra'` has a look; every palette entry matches `/^#[0-9a-f]{6}$/`.
  - `planetPixels('ferrox', LOOKS.mine, 16)` has length `34 * 34 * 4`; called twice → identical arrays; `planetPixels('aquilon', …)` with another id differs.
  - corner pixel (index 3) alpha is 0; centre pixel alpha 255.
  - `spriteTier(7) === 8`, `spriteTier(12) === 12`, `spriteTier(30) === 32`, `spriteTier(500) === 48`.
  - `planetRadius(false, 1) === 7`, `planetRadius(false, 100) === 16`, `planetRadius(true, 1.5) === 16.5`, `planetRadius(true, 0.3) === 11`.
- [ ] **Step 2:** `npx vitest run tests/planets.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `planets.ts` (port the approach of the approved prototype: palette lerp over noise, bands vs spots, clouds/craters/lava/lights/land, lighting). `planetSprite` draws `planetPixels` via `ImageData` into a canvas of the tier size × `devicePixelRatio`.
- [ ] **Step 4:** Tests pass, typecheck clean.
- [ ] **Step 5:** Commit `Planeten: Aussehen je Industrie, im Code erzeugt`.

### Task 2: Day events and effect list

**Files:**
- Create: `src/ui/mapfx.ts`
- Test: `tests/mapfx.test.ts`

**Interfaces:**
- Consumes: sim `productionEfficiency`, `facilitiesOf`, `PLANETS`.
- Produces:
```ts
export interface DayEvents { pulses: string[]; arrivals: string[]; storm: string | null }
export function mapEvents(w: World, me: string): DayEvents
export type FxKind = 'pulse' | 'spark' | 'storm'
export interface Fx { kind: FxKind; planet: string; start: number }
export const FX_DURATION: Record<FxKind, number>   // ms: pulse 1200, spark 800, storm 3000
export const PULSE_GAP = 1500                       // ms per planet
export interface FxList { add(e: DayEvents, now: number): void; active(now: number): Fx[]; busy(now: number): boolean; clear(): void }
export function createFx(): FxList
```
Storm: last log entry with `day === w.day`, `company === null`, text matching `/^Gravo-Sturm bei (.+)!/`, name → planet id via `PLANETS`.

- [ ] **Step 1: Failing tests** `tests/mapfx.test.ts` (use `oilWellWithTanker`, `soloWorld`, `player` from helpers):
  - quiet fresh world → `{ pulses: [], arrivals: [], storm: null }`.
  - running oil well → `pulses` equals `['vesta-nova']`; stopped well (`stopFacility`) → `[]`.
  - a transport with `carrier = me`, `status 'done'`, `doneDay = w.day`, `toPlanet 'terra'` → `arrivals` contains `'terra'`; same with `doneDay = w.day - 1` → not.
  - push log `{ day: w.day, company: null, text: 'Gravo-Sturm bei Ceres Minor! Schiffe und Anlagen beschädigt.', priority: 3 }` → `storm === 'ceres-minor'` (check the id in `planets.json`); same text with `day: w.day - 1` → `null`.
  - `createFx`: add pulse at 0 → `active(100)` has 1; `active(1300)` has 0; `busy(1300)` false.
  - pulse brake: add same pulse at 0 and 500 → 1 active; at 0 and 1600 → second accepted.
  - 100 days of adds at 250 ms spacing for one planet → `active(now).length` never above 2.
  - `clear()` → `active(0)` empty.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `mapfx.ts`; `active` drops expired entries from the internal array.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `Karte: Tagesereignisse und Effektliste`.

### Task 3: Star sky, nebulae, storm zone

**Files:**
- Modify: `src/ui/starmap.ts`
- Create: `src/ui/sky.ts`
- Test: `tests/planets.test.ts` → `describe('sky')`

**Interfaces:**
- Consumes: `hashRng` (Task 1).
- Produces (`sky.ts`):
```ts
export interface Star { x: number; y: number; size: number; alpha: number; layer: 0 | 1 | 2 }
export function makeStars(count: number, w: number, h: number, seed?: string): Star[]   // pure
export const PARALLAX = [0.2, 0.45, 0.7] as const
export const skyKey = (w: number, h: number, dpr: number) => `${Math.round(w)}x${Math.round(h)}@${dpr}`
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, offX: number, offY: number, layers: HTMLCanvasElement[]): void
export function buildSkyLayers(w: number, h: number, dpr: number): HTMLCanvasElement[]   // 3 star layers (tiled, 2× size) + 1 nebula layer
```
- [ ] **Step 1: Failing tests:** `makeStars(400, 1000, 600)` deterministic, all inside bounds, every layer present, layer 2 stars larger on average than layer 0; `skyKey(800.4, 600, 2) === '800x600@2'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `sky.ts`. In `starmap.ts` `paint()`: replace the flat fill by `drawSky` with offsets `(cx × scale × PARALLAX[i]) mod tile`; rebuild layers when `skyKey` changes; replace the dashed storm circle by a ring band (`createRadialGradient` around Terra between `(outerRing − 40) × scale` and `(outerRing + 40) × scale`, `--bad` at max 13 % alpha); veil alpha `0.13 + 0.04 × sin(t / 8000 × 2π)` only while `running` (new param, see Task 5), else 0.13.
- [ ] **Step 4:** Tests pass; `npm run dev` + quick screenshot (Task 6 script can be run early) shows stars and band.
- [ ] **Step 5:** Commit `Karte: Sternenhimmel mit Parallaxe, Nebel, Sturmzone als Schleier`.

### Task 4: Planets on the map and legend

**Files:**
- Modify: `src/ui/starmap.ts`, `src/ui/game.css`

**Interfaces:**
- Consumes: `planetSprite`, `planetRadius`, `lookOf` (Task 1).

- [ ] **Step 1:** No new unit test (canvas only); covered by Task 1 tests and Task 6 screenshots.
- [ ] **Step 2:** In `paint()`: compute `zoom = scale / fitScale` (store `fitScale` in `fit()`); per planet `R = planetRadius(tier === 'terra', zoom)`; draw atmosphere gradient, back half of ring (if `look.ring`), sprite at `R`, front half of ring; own-facility ring at `R + 3.5`; selection ring at `R + 7`; labels at `y + R + 15/28`. `hit()` radius `max(26, R + 10)`.
- [ ] **Step 3:** Legend: replace the three tier dots by glow swatches (`box-shadow: 0 0 6px 3px var(--tier-…)` on a dark dot) labelled „Leuchten: Rohstoff / Zwischenprodukt / Endprodukt“, keep „deine Anlage“, „dein Schiff“, rename „Gravo-Sturm-Zone“ swatch to a soft red band (`.ring` → `.veil`).
- [ ] **Step 4:** `npm test`, typecheck green; screenshot check.
- [ ] **Step 5:** Commit `Karte: erzeugte Planeten mit Atmosphärensaum und Ringen, Legende`.

### Task 5: Trails, effects and game loop wiring

**Files:**
- Modify: `src/ui/starmap.ts`, `src/ui/game.ts`

**Interfaces:**
- Consumes: `mapEvents`, `createFx`, `FX_DURATION` (Task 2).
- Produces on `StarMap`: `dayEvents(e: DayEvents): void`, `busy(): boolean`, `reset(): void`, and `draw(w, me, frac?, refresh?, running?: boolean)`.

- [ ] **Step 1:** Extend `tests/mapfx.test.ts` with a pure helper test: `trailLength(traveledPx: number) === Math.min(40, traveledPx)` exported from `mapfx.ts`.
- [ ] **Step 2:** Run → FAIL; implement `trailLength`; PASS.
- [ ] **Step 3:** `starmap.ts`: own ship trail = gradient line back along the route over `trailLength(distance from route start in px)`, 3 px, turquoise 90 % → 0; others 15 px, 1.5 px, 25 %. Effects from `fx.active(performance.now())`: pulse ring `R + 3.5 → R + 22`, alpha 0.7 → 0, 2 px; spark glow `#fff0b4` up to 14 px + 8 rays moving outward; storm red glow up to 2.5 R with noise flicker. Reduced motion (`matchMedia('(prefers-reduced-motion: reduce)')`): skip pulse/spark, storm steady 45 %.
- [ ] **Step 4:** `game.ts`: after each `advance()` call `map.dayEvents(mapEvents(w, me))`; pass `running = speed > 0` to `draw`; in the paused branch of `frame()` also redraw while `map.busy()`; call `map.reset()` when a game is started or loaded (wherever `w` is replaced).
- [ ] **Step 5:** `npm test`, typecheck green; commit `Karte: Schiffsspuren, Produktionspuls, Ankunftsfunke, Sturmflackern`.

### Task 6: Screens, performance, docs

**Files:**
- Modify: `tools/screens.ts`, `CLAUDE.md`, `docs/konzept.md`

- [ ] **Step 1:** `tools/screens.ts`: add `map` to the tabs for the phone run, and a tablet shot of the side column with zoom 2 (`page.click('[data-zoom="1.4"]')` twice); add a game with 20 AI firms run 120 days for a busy map; measure frame time with `page.evaluate` over 120 `requestAnimationFrame` calls at speed 4× and print the median.
- [ ] **Step 2:** Run it; inspect shots: planets distinct, tier glow readable, labels readable over nebulae, storm band visible but quiet, trails visible, no blur at zoom 2. Median frame time < 8 ms.
- [ ] **Step 3:** Fix what the shots show; rerun.
- [ ] **Step 4:** Docs: `CLAUDE.md` architecture lines for `planets.ts`, `sky.ts`, `mapfx.ts` and the map layers; `docs/konzept.md` section „Entscheidungen zur Optik, Teil 2“. `npm test`, typecheck, build green.
- [ ] **Step 5:** Commit `Optik Teil 2: Sichtprüfung, Leistung, Doku`; push `optik-teil-2`.
