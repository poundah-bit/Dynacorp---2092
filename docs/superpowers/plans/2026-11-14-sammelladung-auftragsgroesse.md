# Sammelladung und mitwachsende Terra-Aufträge – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One tap loads all waiting deliveries of the same route onto the chosen ships, and Terra's orders for final goods grow with the biggest producer.

**Architecture:** A pure combined move `shipAll` in `src/ui/play.ts` (built from the existing `shipDemand`, `postTransportForDemand`, `assignShip`), a second submit button in the sheet framework (`Sheet.alt`), and a scale factor `terraOrderScale` in `src/sim/engine.ts` used by `terraDemands`.

**Tech Stack:** TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-sammelladung-auftragsgroesse-design.md`

## Global Constraints

- Code, identifiers, comments in English; all player-facing text in German.
- Numbers belong in `src/data/*.json`; this plan adds none (it reuses `terra.*`).
- „Gleiche Strecke“ stays: same pickup planet, same destination, same cargo (`canJoin`).
- `npm test` and `npm run typecheck` green before every commit; `npm run balance` meets the targets at the end.
- Commit messages in German, ending with the attribution lines from the session.

## Review Focus

- First delivery larger than the chosen ships: it is split as today (rest stays under „ohne Transport“), further deliveries only join whole → test in Task 1.
- Deliveries from a different plant or to a different destination must never be bundled → test in Task 1.
- „Alle Lieferungen“ with no ship ticked must not post anything publicly → Task 2 (button disabled) and Task 1 (`shipAll` with `[]` fails).
- A company with plants still under construction must not inflate Terra's orders → test in Task 3.
- Early game (one plant) behaves exactly as before → existing `terraDemandAmount` tests stay, plus a check in Task 3.

---

### Task 1: `shipAll` – bundle all deliveries of one route

**Files:**
- Modify: `src/ui/play.ts` (next to `shipDemand`)
- Test: `tests/gameplay.test.ts` (new `describe('Sammelladung')`)

**Interfaces:**
- Consumes: `shipDemand(w, me, demandId, plan)`, `unshippedDemands(w, me)`, `unshippedAmount(d)`, `postTransportForDemand(w, me, demandId, 'own', undefined, amount)`, `assignShip`, `canJoin`, `facility`, `good`.
- Produces:
  - `bundleCandidates(w: World, me: string, demandId: string): Demand[]` – other accepted, not yet shipped demands of the player with the same pickup planet (via `supplierFacility`), same `toPlanet`, same cargo; sorted by `deadlineDay` ascending; excludes `demandId`.
  - `shipAll(w: World, me: string, demandId: string, shipIds: string[]): Result<{ count: number; amount: number }>` – fails with `'Bitte wähle mindestens ein Schiff.'` when `shipIds` is empty; ships `demandId` with `shipDemand(…, { ships: shipIds, rest: 'later' })`, then for each candidate puts its whole `unshippedAmount` on the first chosen ship where `canJoin` holds; `count`/`amount` include the first delivery's shipped part.

- [ ] **Step 1: Write the failing tests**

Setup per test: `soloWorld()`, the oil well from `setupOilWell`, stock 30.000, `company.cash += 2_000_000`, a `tank-c` (capacity from `ships.json`) and helper-made accepted Terra demands (create with `bigTerraDemand`, then `acceptDemand(w, me, id, well.id)`).

```ts
it('lädt alle Lieferungen derselben Strecke auf ein Schiff, knappste Frist zuerst', () => {
  // three accepted oil demands Vesta Nova → Terra: 4.000 / 3.000 / 5.000, deadlines +30 / +10 / +20
  const r = shipAll(w, me, first.id, [tanker.id]);
  expect(r.ok && r.value).toEqual({ count: 3, amount: 12000 });
  expect(unshippedDemands(w, me)).toEqual([]);
  expect(tanker.joined?.length).toBe(2);
});
it('nimmt nur ganze Aufträge mit und lässt den Rest in der Liste', () => {
  // tank-a (16.000): first 10.000; others 5.000 (deadline +10) and 4.000 (deadline +20)
  // → 10.000 + 5.000 fit, 1.000 left, the 4.000 stays
  expect(unshippedDemands(w, me).map((d) => d.amount)).toEqual([4000]);
});
it('bündelt keine Lieferungen mit anderem Ziel oder anderer Anlage', () => {
  // second demand toPlanet 'pyros' (requester an AI-less own order is fine: set toPlanet directly)
  expect(r.ok && r.value.count).toBe(1);
});
it('ohne Schiff passiert nichts', () => {
  expect(shipAll(w, me, first.id, []).ok).toBe(false);
  expect(w.transports.filter((t) => t.demand === first.id)).toEqual([]);
});
```

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/gameplay.test.ts -t Sammelladung` → `shipAll is not a function` / import error.

- [ ] **Step 3: Implement `bundleCandidates` and `shipAll` in `src/ui/play.ts`.** Check the ships with the same rules as `checkPlan` before changing anything (unknown/foreign ship → fail). After the first `shipDemand`, iterate candidates; a candidate that fits no chosen ship is skipped, not an error.

- [ ] **Step 4: Run, expect PASS** – same command; then `npm test`.

- [ ] **Step 5: Commit** – `git commit -m "Sammelladung: alle Lieferungen einer Strecke auf ein Schiff"`

---

### Task 2: Button „Alle Lieferungen“ in „Transport organisieren…“

**Files:**
- Modify: `src/ui/sheets.ts` (`Sheet` interface, `arrangeSheet`, `planLive`)
- Modify: `src/ui/game.ts` (`openSheet`)
- Test: `tests/phase3.test.ts` (pure part only)

**Interfaces:**
- Consumes: `bundleCandidates`, `shipAll` (Task 1).
- Produces: `Sheet.alt?: { label: string; tip?: string; run: (form: HTMLFormElement) => SheetResult }`.

- [ ] **Step 1: Write the failing test**

```ts
it('Transport organisieren bietet „Alle Lieferungen“ nur bei weiteren Lieferungen derselben Strecke', () => {
  expect(arrangeSheet(w, me, single.id).alt).toBeUndefined();
  // after accepting a second demand of the same route
  expect(arrangeSheet(w, me, first.id).alt?.label).toBe('Alle Lieferungen (2 · 9.000 l)');
});
```

(label = `Alle Lieferungen (${n} · ${qty(sum, cargo)})`, n and sum include this delivery's open amount.)

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/phase3.test.ts -t "Alle Lieferungen"`.

- [ ] **Step 3: Implement.**
  - `arrangeSheet`: set `alt` only when `bundleCandidates(...)` is non-empty; `alt.run` reads `readPlan(form).ships` and calls `shipAll`; message `${count} Lieferungen sind unterwegs (${qty(amount, cargo)}).`. `tip`: `'Lädt alle zugesagten Lieferungen aus derselben Anlage zum selben Ziel auf die gewählten Schiffe – knappste Frist zuerst, nur ganze Aufträge.'`
  - `game.ts openSheet`: render `<button type="submit" name="alt" class="primary" data-alt data-tip="…">label</button>` before the confirm button; in the submit handler run `s.alt.run` when `(e as SubmitEvent).submitter?.hasAttribute('data-alt')`.
  - `planLive`: disable `[data-alt]` while no ship checkbox is checked.
  - „Los“ unchanged.

- [ ] **Step 4: Run, expect PASS** – `npm test`, `npm run typecheck`. Check in the browser once (`npm run dev`): accept two Terra orders of one plant, open „Transport organisieren…“, tap „Alle Lieferungen“ → both rows leave the list, the ship card in Flotte shows both loads.

- [ ] **Step 5: Commit** – `git commit -m "Knopf „Alle Lieferungen“ im Transport-Dialog"`

---

### Task 3: Terra-Aufträge für Endprodukte wachsen mit der größten Herstellerfirma

**Files:**
- Modify: `src/sim/engine.ts` (`terraDemands`, new export), `src/sim/index.ts` (export)
- Test: `tests/gameplay.test.ts`

**Interfaces:**
- Produces: `terraOrderScale(w: World, goodId: string): number` – the largest sum of `units` over one non-bankrupt company's facilities whose type outputs `goodId` and whose status is not `'construction'`; at least 1.

- [ ] **Step 1: Write the failing tests**

```ts
it('Terra-Aufträge für Endprodukte wachsen mit der größten Herstellerfirma', () => {
  // soloWorld; push 4 robotworks units for the player (one facility with units 4, status 'running') and 1 in 'construction' for the same player on another planet
  expect(terraOrderScale(w, 'robots')).toBe(4);
  expect(terraOrderScale(w, 'medicine')).toBe(1);
  w.demands = [];
  run(w, 400);
  const robots = w.demands.filter((d) => d.requester === 'terra' && d.good === 'robots');
  expect(robots.length).toBeGreaterThan(0);
  for (const d of robots) expect(d.amount).toBeGreaterThanOrEqual(d.big ? 4800 : 2400);
});
```

- [ ] **Step 2: Run, expect FAIL** – `npx vitest run tests/gameplay.test.ts -t "wachsen mit"`.

- [ ] **Step 3: Implement.** In `terraDemands`, for `g.tier === 'final'` only: `n = terraOrderScale(w, g.id)`; chance `= min(0.9, base * cheapness) / n`; amount `= terraDemandAmount(g.id, days, big * n)` (the existing ship cap stays). Intermediate/raw goods unchanged. Export from `index.ts`.

- [ ] **Step 4: Run, expect PASS** – `npm test` (Phase-0/1/2 gates included), `npm run typecheck`, then `npm run balance` – every target still met; note the numbers in the commit message.

- [ ] **Step 5: Docs and commit.** Add to `docs/konzept.md` a section „Entscheidungen nach dem Spieltest zu Phase 3, Teil 2“ (table: Sammelladung; mitwachsende Terra-Aufträge, with the spec's reasons) and to `CLAUDE.md` „Key game rules“ one line each (`shipAll`/„Alle Lieferungen“; `terraOrderScale`). `git commit -m "Terra-Aufträge für Endprodukte wachsen mit der größten Herstellerfirma"`, push.
