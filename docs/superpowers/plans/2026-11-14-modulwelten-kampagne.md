# Modulwelten: Kampagne Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Großprojekte bekommen 200 Tage Bauzeit. Danach kann der Spieler seine Welt mit einem freigeschalteten Quark abschließen, in einer neuen Zufallswelt weiterspielen und die Kampagne in einer Gesamtübersicht sehen. Ab Welt 2 läuft eigene Musik.

**Architecture:**
- Die Kampagne lebt im Weltzustand (`World.campaign`). Damit bleiben Spielstand-Format, Autosave und Speicherplätze unverändert.
- Jede Welt trägt optional ihre eigenen Planeten (`World.planets`). Fehlen sie, gilt `planets.json`, also Welt 1 wie heute.
- Alle Planetenabfragen bekommen die Welt als Parameter.
- Neue reine Module:
  - `src/sim/campaign.ts`: Abschluss, Module, Kampagnenwert
  - `src/sim/galaxy.ts`: Planetengenerator
  - `src/ui/overview.ts`: Gesamtübersicht als HTML/SVG

**Tech Stack:** TypeScript, Vitest, Vite (PWA). Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-11-14-modulwelten-kampagne-design.md`

## Global Constraints

- Alle Texte für Spieler deutsch. Code, Bezeichner und Kommentare englisch. Keine Namen oder Texte aus dem Original-Dynatech.
- Zahlen kommen nach `src/data/*.json`: `config.projects.buildDays = 200`, `config.campaign` (Generator-Toleranzen).
- Welt 1 muss bitgleich zu heute bleiben, mit denselben Planeten, demselben RNG-Verlauf und denselben Tests.
- Alte Spielstände laden ohne spürbare Änderung.
- `npm test` und `npm run typecheck` sind grün nach jeder Task.
- Commits auf `claude/awesome-mayer-2rxjhi`, deutsch, mit den Attributionszeilen. Merge nach `main` nur mit Roccos OK.
- Musik-Credits nennen Thamanoidis.
- Kosten klein halten: Generator-Tests über 100 Seeds, nur ein zusätzlicher 1.000-Tage-Lauf.

## Review Focus

- Abschluss bei laufendem Projekt, offenen Krediten oder pausiertem Spiel: Die neue Welt startet sauber, und das alte Projekt taucht nicht auf. Test in Task 4.
- Neu laden direkt nach dem Abschluss: Der Autosave enthält die neue Welt, mit Kampagne und Planeten. Test in Task 4 per JSON-Rundreise.
- Sternkarte und Planetengrafik mit generierten Kennungen: kein Absturz durch eine unbekannte Kennung. Test in Task 3, `planet(w, id)` für alle generierten Planeten.
- Story-Ereignisse mit Ortsregeln in einer generierten Welt: Sie wählen nur Planeten dieser Welt. Test in Task 3.
- Ein Projekt, dessen Quark schon erzeugt ist: kein Startknopf, und `startProject` lehnt ab. Test in Task 4.

---

## Teil A: separat mergbar

### Task 1: Baufortschritt der Großprojekte

**Files:**
- Modify: `src/data/config.json` (`projects.buildDays: 200`), `src/sim/types.ts` (`ProjectState.buildDaysLeft?: number`, `ProjectState.fromModule?: number`, das zweite Feld für Task 4 schon anlegen), `src/sim/projects.ts`, `src/sim/quark.ts`, `src/ui/views.ts` (`projectsCard`, `quarkChip`)
- Test: `tests/projects.test.ts`, `tests/phase3.test.ts`

**Interfaces:**
- Produces: `projectProgress(w: World, id: string): { material: number; build: number }` mit Werten 0..1 in `projects.ts`. `quarkStatus().fill` = `material/2 + build/2`.

- [ ] **Step 1: Failing tests** in `tests/projects.test.ts`, describe `'Bauphase'`:
  - `'nach dem letzten Material beginnen 200 Tage Bau, erst dann fertig'`:
    - Material voll setzen, `projectsTick`: `status === 'building'`, `buildDaysLeft === 200`, kein Prestige.
    - 199× `projectsTick`: weiter `'building'`.
    - 1× mehr: `status === 'done'`, Prestige gesetzt, `hasProject` true.
  - `'Balken: Material zählt bis 50 %, Bau bis 100 %'`:
    - halbes Material → `quarkStatus(w).fill === 0.25`
    - volles Material + 100 Tage Bau → `0.75`
  - `'Abbrechen in der Bauphase: alles verloren'`: `abortProject` ok, `w.projects` leer.
  - `'Meldung verdichtet sich erst in der Bauphase bei 90 %'`: Bei vollem Material + 159 Bautagen keine Meldung, bei 161 genau eine.
  - Den bestehenden Quark-Test „der Balken folgt dem laufenden Projekt…“ anpassen: `fill: 0.25` statt `0.5`, und vor „freigeschaltet“ 200 Ticks bauen.
- [ ] **Step 2:** `npx vitest run tests/projects.test.ts`, Expected: FAIL.
- [ ] **Step 3: Implement**
  - `projectsTick`: Ist alles Material da und `buildDaysLeft === undefined`, dann `buildDaysLeft = CONFIG.projects.buildDays` und Log „Material komplett – Bau beginnt (200 Tage)“.
  - Ist `buildDaysLeft > 0`, täglich `-1`. Bei 0 die heutige Fertig-Logik.
  - Bestellungen nur, solange Material fehlt (unverändert).
  - `projectProgress` exportieren, `quarkStatus` und `quarkTick` darauf umstellen.
- [ ] **Step 4: UI**
  - `projectsCard` im Bau: In der Bauphase statt der Warenbalken ein Balken `Bau ${pct} % – noch ${n} Tage`. `quarkChip` unverändert, der Wert kommt aus `fill`.
  - Test in `tests/phase3.test.ts`: Projektkarte in der Bauphase enthält `'Bau '` und `'noch 200 Tage'`.
- [ ] **Step 5:** `npm test && npm run typecheck`, Expected: alles grün.
- [ ] **Step 6:** Commit „Großprojekte: 200 Tage Bau nach dem Material“, mergen nach Roccos OK.

---

## Teil B: Kampagne

### Task 2: Planeten pro Welt (reiner Umbau, kein neues Verhalten)

**Files:**
- Modify: `src/sim/types.ts` (`World.planets?: PlanetDef[]`), `src/sim/data.ts`, alle Aufrufer in `src/sim/*`, `src/ui/*`, `tools/*`, `tests/*`

**Interfaces:**
- Produces in `data.ts`:
  - `worldPlanets(w: Pick<World,'planets'>): PlanetDef[]` (= `w.planets ?? PLANETS`)
  - `planet(w, id: string): PlanetDef`
  - `distance(w, a: string, b: string): number`
  - `planetsFor(w, facilityType: string): PlanetDef[]`
  - Lookup per `Map`, gecacht pro Planetenliste mit einer `WeakMap`.
- `PLANETS` bleibt nur für Welt 1, Tests und `validateData` exportiert.

- [ ] **Step 1:** Failing test in `tests/campaign.test.ts` (neu): `'Welt 1 nutzt planets.json, eine eigene Planetenliste ersetzt sie'`.
  - `createWorld({seed:1})`: `worldPlanets(w) === PLANETS`.
  - Mit `w.planets = [{...PLANETS[0]}, {id:'x', name:'X', x:3, y:4, facility:'mine'}]`: `distance(w,'terra','x') === 5`, `planetsFor(w,'mine').map(p=>p.id)` ist `['x']`.
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3:** Signaturen ändern, dann `npm run typecheck` als Wegweiser durch alle Aufrufer (≈ 50). `starmap.ts`, `mapinfo.ts`, `chain.ts` und `mapfx.ts` lesen die Planeten aus der aktuellen Welt.
- [ ] **Step 4:** `npm test && npm run typecheck`, Expected: alle bisherigen Tests unverändert grün (Beweis für „Welt 1 bitgleich“).
- [ ] **Step 5:** Commit „Planeten gehören zur Welt“.

### Task 3: Planetengenerator

**Files:**
- Create: `src/sim/galaxy.ts`, `src/data/planetnames.json` (≥ 60 eigene Namen, Kunstnamen im Stil der heutigen, z. B. „Orvana“, „Teskar Prime“; keine Namen aus `planets.json`), Test `tests/galaxy.test.ts`
- Modify: `src/data/config.json` `campaign: { pathTolerance: 0.1, minSpacingFactor: 1, attempts: 200 }`

**Interfaces:**
- Produces:
  - `generatePlanets(w: World, usedNames: string[]): PlanetDef[]`, deterministisch über `random(w)`
  - `tierOfFacility(type: string): 'raw' | 'intermediate' | 'final'` aus der Stufe der Ausgangsware in `goods.json`
  - `galaxyStats(planets: PlanetDef[]): { meanPair: number; meanTerra: number; minSpacing: number; ringMean: Record<Tier, number> }`

- [ ] **Step 1: Failing tests** über die Seeds 1..100 (je `createWorld({seed})` als RNG-Träger):
  - `'gleiche Zusammensetzung wie Welt 1'`: Terra bei (0,0) mit der Kennung `terra`. Anzahl je `facility` gleich wie in `PLANETS`.
  - `'Ringe: Rohstoffe innen, Endprodukte außen'`: `ringMean.raw < ringMean.intermediate < ringMean.final`.
  - `'Wege vergleichbar'`: `|meanPair/ref.meanPair − 1| ≤ 0.1` und dasselbe für `meanTerra`. `minSpacing ≥ ref.minSpacing` (ref = `galaxyStats(PLANETS)`).
  - `'eindeutige neue Namen und Kennungen'`: Namen eindeutig, keiner in `usedNames` oder `PLANETS`. Kennungen eindeutig, `planet(w, id)` findet jede.
  - `'Story-Orte nur aus dieser Welt'`: in einer Welt mit generierten Planeten und Stories an `run(w, 400)`. Jeder `event.planet` steht in `worldPlanets(w)`. Das deckt den Review-Fokus Stories ab.
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3: Implement `generatePlanets`**
  - Radius je Stufe: zufällig zwischen min und max der Radien dieser Stufe in `PLANETS`.
  - Winkel zufällig.
  - Ablehnen, wenn der Abstand zu einem gesetzten Planeten kleiner als `ref.minSpacing × minSpacingFactor` ist.
  - Ganze Welt verwerfen, wenn die Toleranz verletzt ist. Nach `attempts` Versuchen den besten Versuch nehmen (kleinste Abweichung).
  - Namen ohne Zurücklegen ziehen. Kennung = Name klein, mit Bindestrichen.
- [ ] **Step 4:** Run, Expected: PASS. `validateData` prüft zusätzlich `planetnames.json` (≥ 60, eindeutig, nicht in `planets.json`).
- [ ] **Step 5:** Commit „Zufallswelt: Planetengenerator“.

### Task 4: Kampagne – Welt abschließen (Kern)

**Files:**
- Create: `src/sim/campaign.ts`. Export über `src/sim/index.ts`.
- Modify:
  - `types.ts`: `ModuleRecord`, `CampaignState`, `World.campaign?`
  - `world.ts`: `NewWorldOptions.campaign?: CampaignState` → Planeten generieren, globale Projekte eintragen
  - `projects.ts`: `hasProject` / `startProject` für globale und erzeugte Quarks
- Test: `tests/campaign.test.ts`

**Interfaces:**
- Produces:
  - `interface ModuleRecord { n: number; quark: Flavour; project: string; worldName: string; firm: string; days: number; index: number; facilities: number; ships: number; closedDay: number }`
  - `interface CampaignState { world: number; modules: ModuleRecord[]; usedNames: string[] }`
  - `campaignOf(w): CampaignState` (fehlt = `{world:1, modules:[], usedNames: PLANETS-Namen}`)
  - `producedQuarks(w): Flavour[]`
  - `closableQuarks(w): Flavour[]` = freigeschaltet und noch nicht erzeugt
  - `closeWorld(w: World, f: Flavour): Result<World>`: gibt die neue Welt zurück; beim sechsten Quark die alte Welt mit Modul und ohne neue Welt
  - `campaignComplete(w): boolean`
  - `campaignValue(w): number`
  - `worldName(w): string`, Regel: `Welt ${n} · ${Name des äußersten Endprodukt-Planeten}-Sektor`; für Welt 1 „Welt 1 · Terra-Sektor“
- Projekt als global: `ProjectState` mit `status:'done'`, `fromModule: n`, ohne Prestige.

- [ ] **Step 1: Failing tests:**
  - `'abschließen nur mit freigeschaltetem, noch nicht erzeugtem Quark'`: ohne fertiges Projekt `closableQuarks` = `[]`, und `closeWorld` liefert `ok:false`.
  - `'Abschluss: neue Welt mit neuer Firma, Startkapital, gleichen Einstellungen'`:
    - nach Dock fertig `closeWorld(w,'up')`
    - neue Welt: `day 0`, Spieler-Cash = `CONFIG.startCapital`, Prestige 0, gleicher Firmenname, gleiche Schwierigkeit, gleiche Zahl KI, Stories gleich an/aus
    - `w.planets` gesetzt, `campaign.world === 2`, ein Modul mit `quark:'up'`, `project:'dock'`
  - `'das Abschlussprojekt wirkt global, Prestige zählt einmal'`:
    - in Welt 2 `hasProject(w2, me, 'dock')` true, `projectState(w2,'dock').fromModule === 1`, `company.prestige ?? 0` = 0
    - `campaignValue(w2) = module.index + companyIndex(w2, me)`
  - `'erzeugtes Quark: Projekt nicht neu startbar, nicht wieder abschließbar'`: `startProject(w2, me, 'dock')` ok:false. Eine Welt mit dock und yard fertig, aber up erzeugt: `closableQuarks` = `['charm']`.
  - `'laufendes Projekt geht beim Abschluss verloren'`: `yard` im Bau, Abschluss mit up → in Welt 2 kein `yard`.
  - `'sechstes Quark: keine neue Welt'`: Kampagne mit 5 Modulen künstlich gesetzt, Abschluss → `campaignComplete` true, `closableQuarks` = `[]`, die Welt bleibt dieselbe.
  - `'Rundreise durch JSON'`: `JSON.parse(JSON.stringify(w2))` → `run(…, 30)` ohne Fehler, Planeten und Kampagne erhalten.
  - `'Welt 1 unverändert'`: `createWorld({seed:1, playerName:'T'})` hat kein `planets`. RNG-Zustand gleich wie vor dem Umbau (Wert aus `main` als Konstante im Test festhalten).
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3: Implement**
  - `closeWorld` baut den `ModuleRecord` und ruft dann `createWorld({ seed: neuer Seed aus random(w), difficulty, playerName, aiCompanies: Zahl der KI-Firmen, stories: w.stories?.on, campaign })` auf.
  - `createWorld` mit `campaign`: Planeten generieren, danach Firmen wie heute. Für jedes Modul das globale Projekt eintragen, `usedNames` ergänzen.
  - `initStories` übernimmt den Story-Schalter. `ensureQuark` greift ohnehin.
- [ ] **Step 4:** Run, Expected: PASS. Dann `npm test`.
- [ ] **Step 5:** Commit „Kampagne: Welt abschließen“.

### Task 5: Abschluss in der Oberfläche

**Files:**
- Modify:
  - `src/ui/sheets.ts`: `closeWorldSheet(w)`
  - `src/ui/views.ts`: Quark-Karte mit Knopf „Welt abschließen…“, Projektkarte „aktiv aus Modul n“ ohne Knopf, ausgegraute erzeugte Quarks, Kampagnenwert in der Statistik
  - `src/ui/game.ts`: Acts `close-world` / `close-world-confirm`, Weltwechsel mit Autosave, Toast, Musikwechsel-Hook aus Task 7
- Test: `tests/phase3.test.ts`

**Interfaces:**
- Consumes: `closableQuarks`, `closeWorld`, `campaignOf`, `campaignValue` aus Task 4.

- [ ] **Step 1: Failing tests:**
  - `quarkCard` enthält `'Welt abschließen'` genau dann, wenn `closableQuarks` nicht leer ist.
  - `closeWorldSheet`:
    - listet je freiem Quark den Projektnamen und `effect`
    - enthält den Text `'neuen Firma und normalem Startkapital'`
    - enthält bei laufendem Projekt `'geht verloren'`
  - `projectsCard(w2)` enthält `'aktiv aus Modul 1'` und für `dock` keinen `project-start`.
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3: Implement**
  - Zweistufige Bestätigung wie bei anderen Sheets: erst wählen, dann „Wirklich abschließen“.
  - Nach `closeWorld` ruft `begin(neueWelt, false)` auf. Toast: „Welt n abgeschlossen – willkommen in Welt n+1“.
- [ ] **Step 4:** `npm test && npm run typecheck`. Screenshot von Quark-Karte und Dialog (Tablet, deviceScaleFactor 1, nur zur eigenen Kontrolle).
- [ ] **Step 5:** Commit.

### Task 6: Gesamtübersicht und Finale

**Files:**
- Create: `src/ui/overview.ts` (rein: `overviewHtml(w): string`, `moduleDetail(w, f: Flavour): string`, `finaleHtml(w): string`)
- Modify:
  - `src/ui/starmap.ts`: Knopf „Gesamtübersicht“ neben den Zoomknöpfen
  - `src/ui/game.ts`: Sheet öffnen, Tipp auf einen Platz, Finale nach dem sechsten Abschluss
  - CSS in `index.html` oder der bestehenden Stylesheet-Datei
- Test: `tests/phase3.test.ts`

- [ ] **Step 1: Failing tests:**
  - `overviewHtml` hat sechs Plätze (`data-quark` je Flavour) in der Reihenfolge up, down, charm, strange, top, bottom.
  - Ein besetzter Platz zeigt `worldName` und den Index.
  - Ein freier Platz zeigt „frei“.
  - Die Mitte enthält „Beschleuniger“ und „Welt n läuft“.
  - `moduleDetail` für einen freien Platz nennt das Projekt (z. B. „Großwerft“) und seinen Preis.
  - `finaleHtml` enthält „Das Standardmodell ist vervollständigt“ und den Kampagnenwert.
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3: Implement**
  - SVG-Kreis mit sechs Plätzen in den bestehenden `q-*`-Farben, Generationen benachbart.
  - Die Mitte als Ring (der Beschleuniger).
  - Ohne Bilddateien. Reduced Motion ohne Animation.
- [ ] **Step 4:** Tests und Typecheck grün. Screenshot Tablet und Telefon zur Kontrolle.
- [ ] **Step 5:** Commit.

### Task 7: Musik pro Welt

**Files:**
- Modify: `src/ui/music.ts`, das Sheet „Musik und Töne“ in `src/ui/game.ts`
- Test: `tests/music.test.ts` (bestehend, sonst neu)

**Interfaces:**
- Produces:
  - `Track.group: 1 | 2`
  - `MusicSettings.choice: 'world' | 'world1' | 'all'` (Standard `'world'`, fehlend → Standard)
  - `playlist(choice, worldNumber: number): number[]` (Indizes in `TRACKS`)
  - `setMusicWorld(n: number)`: beendet das laufende Stück, wenn sich die Liste ändert

- [ ] **Step 1: Failing tests:**
  - `playlist('world',1)` = Welt-1-Stücke
  - `playlist('world',2)` und `playlist('world',5)` = die drei neuen Stücke
  - `playlist('world1',3)` = Welt-1-Stücke
  - `playlist('all',1)` = alle sechs
  - `parseMusicSettings('{"on":true,"volume":0.5}').choice === 'world'`
  - `nextTrack` meidet weiter dasselbe Stück
- [ ] **Step 2:** Run, Expected: FAIL.
- [ ] **Step 3: Implement**
  - Neue Tracks:
    - `{ title: 'Iron Bullet Clash (Dubstep)', file: 'music/iron-bullet-clash.opus', group: 2 }`
    - `{ title: 'Iron Bullet Clash (Dubstep, Jazzy RnB Cover)', file: 'music/iron-bullet-clash-rnb.opus', group: 2 }`
    - `{ title: 'Is It Worth', file: 'music/is-it-worth.opus', group: 2 }`
  - Das Sheet bekommt drei Radioknöpfe: „Musik der Welt“, „Nur Welt 1“, „Alle Stücke gemischt“.
  - `begin()` ruft `setMusicWorld(campaignOf(w).world)` auf.
- [ ] **Step 4:** Tests grün. Commit.

### Task 8: Tor und Dokumentation

**Files:**
- Modify: `tests/endless.test.ts`, `CLAUDE.md`, `docs/konzept.md`

- [ ] **Step 1:** Test `'eine generierte Welt (Welt 2) bleibt 1.000 Tage stabil'`, mit denselben Kriterien wie das Standardspiel:
  - kein Kollaps, ≤ 3 Pleiten
  - alle Anlagentypen gebaut
  - jedes Endprodukt erreicht Terra

  Eine Welt, Seed 6: per `closeWorld` aus einer Welt mit fertigem Dock erzeugen.
- [ ] **Step 2:** `npm test`, Expected: PASS. Fällt er durch: `superpowers:systematic-debugging`, keine Toleranz aufweichen, ohne Rocco zu fragen.
- [ ] **Step 3: Doku**
  - `CLAUDE.md` beschreibt `campaign.ts`, `galaxy.ts`, `overview.ts`, `World.planets`, `World.campaign`, Bauphase und Musikgruppen.
  - `konzept.md`: Roadmap-Status „Welt abschließen und Kampagne gebaut“, Entscheidungstabelle ergänzen.
- [ ] **Step 4:** Commit. Danach eine Gesamtprüfung des Zweigs durch einen Reviewer. Zum Schluss Rocco fragen, ob gemergt wird.
