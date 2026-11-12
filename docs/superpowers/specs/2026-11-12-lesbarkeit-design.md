# Optik, Teil 1: Lesbarkeit – Bereichsfarben, Kopfzeilen, Icons, Balken

Stand: 2026-11-12 · Status: Entwurf zur Freigabe durch Rocco

## Ziel

Die Tabs **Anlagen, Flotte, Börse und Aufträge** sehen heute gleich aus (gleiche Karte, Überschrift, Zeile mit Knöpfen, eine Akzentfarbe). Man erkennt nicht ohne zu lesen, wo man ist und was los ist.

**Erfolg heißt:**
1. Nach einem Tab-Wechsel weiß man ohne Lesen, in welchem Bereich man ist.
2. Die Lage eines Bereichs (z. B. „1 Schiff kritisch“) ist sichtbar, ohne zu scrollen.
3. Drohender Stillstand, knappe Fristen und schlechter Zustand fallen auf, bevor sie passieren.
4. Bedienung, Touch-Größen und Tempo auf dem Tablet bleiben wie bisher; `npm test` bleibt grün.

## Einordnung

Die Optik wird in vier Teilen aufgewertet, jeder mit eigenem Konzept, Plan und Umsetzung:

1. **Lesbarkeit** (dieses Dokument)
2. Atmosphäre und Sternkarte
3. Eigener Stil
4. Soundtrack aus Roccos MP3s mit eigenem Lautstärkeregler (unabhängig von 1–3)

## Leitplanken

- Nichts aus dem Original Dynatech (keine Grafik, keine Symbole).
- Keine Bild- oder Schriftdateien: Icons sind SVG-Pfade im Code.
- Die Simulation (`src/sim/`) wird nicht verändert. Alle Werte kommen aus vorhandenen Daten und `play.ts`.
- Grün/Gelb/Rot (`--good`, `--warn`, `--bad`) bleiben ausschließlich Status. Bereichsfarben färben nur den Rahmen (Tab, Kopfzeile, Kartenkante).
- Zustände zeigen immer Form **und** Farbe; der Text bleibt daneben stehen.
- `prefers-reduced-motion` wird beachtet.

## 1. Bereichsfarben

Neue CSS-Variablen in `game.css`:

| Bereich | Variable | Farbe | Begründung |
|---|---|---|---|
| Anlagen | `--area-facilities` | `#e8925a` Kupfer | Industrie |
| Flotte | `--area-fleet` | `#5aa9ff` Blau | Raumfahrt |
| Börse | `--area-market` | `#f07ab4` Rosé | Gold wäre naheliegend, kollidiert aber mit `--warn` und der Stufenfarbe für Zwischenprodukte |
| Aufträge | `--area-orders` | `#a98bff` Violett | Planung |

Terra, Karte und Statistik bleiben neutral (`--muted` als Icon-Farbe, `--accent` wenn aktiv), weil sie keine Arbeitslisten sind.

Jeder Tab-Inhalt bekommt `data-area="<tab>"` am Container; daraus setzt CSS eine lokale Variable `--area`, die von Kopfzeile, Kartenkante (`border-left: 3px solid var(--area)`, `border-radius` dort 0 auf der linken Seite) und Überschriften gelesen wird.

## 2. Kopfzeile pro Bereich

Oben in Anlagen, Flotte, Börse und Aufträgen steht eine Kopfzeile: Bereichs-Icon in Bereichsfarbe, Name, Kennzahlen als kleine Chips. Hintergrund: Bereichsfarbe zu ~12 % über `--panel`, links ein 4-px-Balken in Bereichsfarbe.

**Kennzahlen** (eine neue reine Funktion `areaStats(w, me)` in `play.ts`, ohne DOM, mit Tests):

| Bereich | Chips |
|---|---|
| Anlagen | Anzahl Anlagen · in Betrieb (grün) · Stillstand (rot, nur wenn > 0) · im Bau (nur wenn > 0) · unterwegs von Terra (nur wenn > 0) |
| Flotte | Anzahl Schiffe · frei (grün) · unterwegs · kritisch (rot, nur wenn > 0) |
| Börse | passt zu dir (grün; = heutiger Badge-Wert) · offene Transportaufträge · Großauftrag von Terra (gelb, nur wenn > 0) |
| Aufträge | zugesagt · ohne Transport (gelb, nur wenn > 0) · nächste Frist in X Tagen (rot, wenn überzogen) |

Chips mit Wert 0 und dem Zusatz „nur wenn > 0“ entfallen. Status-Chips tragen ihr Zustands-Icon (Abschnitt 3).

**Layout:**
- Tablet (≥ 700 px): eine Zeile, Icon · Name · Chips (umbrechen bei Bedarf).
- Handy hochkant (< 700 px): Name entfällt (steht in der Tab-Leiste), Icon · Chips, Höhe ≤ 48 px.
- Die Kopfzeile scrollt mit (nicht fixiert), damit sie auf dem Handy keinen Platz dauerhaft belegt.

**Nicht enthalten:** Tippen auf einen Chip filtert nicht. Lange Tippen auf einen Chip zeigt wie überall eine Erklärung (`data-tip`).

## 3. Icon-Satz

**Stil:** Linien-Icons auf 24×24-Raster, Strichstärke 2, runde Enden und Ecken, keine Flächen. Farbe über `currentColor`.

**Datei:** `src/ui/icons.ts`
- `ICONS: Record<IconName, string>` – SVG-Pfaddaten (ein oder mehrere `d`-Strings).
- `icon(name, cls?)` → `<svg class="ic …" viewBox="0 0 24 24" aria-hidden="true">…</svg>` als HTML-String.
- Die Pfaddaten sind so abgelegt, dass die Sternkarte sie in Teil 2 per `Path2D` auf dem Canvas zeichnen kann.
- Ein Test prüft: jeder Anlagentyp aus `facilities.json` und jede Frachtart hat ein Icon.

**Umfang (~40):**
- **Tabs (7):** terra, map, facilities, fleet, market, orders, stats – ersetzen die Unicode-Zeichen in `TABS` (`game.ts`).
- **Frachtarten (5):** tank, bulk, piece, cooled, live – ersetzen `CARGO_ICON` in `format.ts`; zusätzlich neben jeder Ware in Börse und Aufträgen.
- **Anlagentypen (17):** in der Anlagen-Karte vor dem Namen und in der Planeten-Infokarte (`mapinfo.ts`).
- **Zustände (10):** construction (Bau), stopped (stillgelegt), running (in Betrieb), idle (frei), travelling (unterwegs), loading (lädt), repairMarked (Reparatur vorgemerkt), critical (kritisch), deadline (Frist), bigOrder (Großauftrag). Verwendet in Badges und Kopfzeilen-Chips.
- Waren bekommen **kein** eigenes Icon.

**Größen:** Tab-Leiste 24 px, Kopfzeile 24 px, in Text und Badges 16 px. Unter 16 px wird kein Icon verwendet.

**Tab-Leiste:** Icon in Bereichsfarbe (gedämpft, ~60 % Deckkraft), aktiver Tab mit getöntem Hintergrund, voller Deckkraft und 3-px-Balken oben in Bereichsfarbe. Der heutige „hot“-Zustand (Börse blinkt) und die Badge-Zahlen bleiben.

## 4. Füllbalken

Ein Bauteil `bar(opts)` in `format.ts`, reines HTML/CSS:

```ts
bar({ value, max, reserved?, incoming?, tone, label })
// tone: 'good' | 'warn' | 'bad' | 'neutral'
```

Ausgabe: `<span class="bar" role="meter" aria-valuenow aria-valuemin="0" aria-valuemax aria-label>` mit Füll-Segment (Breite in %), optional schraffiertem Segment (`reserved`) innerhalb der Füllung und Umriss-Segment (`incoming`) dahinter. Höhe 6 px, in Tabellen 8 px. Übergang der Breite 300 ms, entfällt bei reduzierter Bewegung.

**Einsatz:**

| Ort | Wert | Ton |
|---|---|---|
| Anlagen-Tabelle, Spalte „Lager“ (Zahl bleibt) | Lager / Kapazität; zugesagt schraffiert; bestellt als Umriss | Rohstoff: < 10 % rot, < 25 % gelb. Produkt: > 90 % rot, > 75 % gelb. Sonst neutral. Schwellen als Konstanten in `format.ts` |
| Anlage, unter dem Namen | Zustand % | ≥ `facilities.repairBelow` grün, darunter gelb, < 30 rot (Konstante in `format.ts`; Anlagen haben keine kritische Schwelle in `config.json`) |
| Schiff, unter dem Namen | Zustand % | ≥ 50 grün (heutige UI-Schwelle „bald zur Reparatur“), darunter gelb, < `ships.criticalBelow` rot |
| Schiff, bei Ladung | belegter Laderaum / Kapazität (`shipLoads`, `shipRoom`) | neutral |
| Schiff, im Flug | `route.traveled / route.distance`, daneben Resttage | neutral |
| Aufträge, je Zeile mit Frist | verbleibende Zeit = (deadlineDay − day) / (deadlineDay − createdDay) | > 50 % neutral, ≤ 50 % gelb, überzogen rot (voll) |

Die Börse bekommt keine Balken.

## Betroffene Dateien

- `src/ui/game.css` – Bereichsvariablen, `.area-head`, `.chip`, `.bar`, Tab-Leiste, Kartenkante
- `src/ui/icons.ts` – neu
- `src/ui/format.ts` – `bar()`, `cargoIcon` auf SVG umgestellt, Schwellen-Konstanten
- `src/ui/play.ts` – `areaStats()`
- `src/ui/views.ts` – Kopfzeilen, Icons, Balken in Anlagen, Flotte, Börse, Aufträge
- `src/ui/game.ts` – `TABS` mit Icon-Namen, `data-area` am Tab-Container
- `src/ui/mapinfo.ts` – Anlagen-Icon
- `tests/` – neuer Test für `areaStats()`, `bar()` und Icon-Vollständigkeit

## Prüfung

- `npm test` und `npm run typecheck` grün.
- Sichtprüfung im Browser auf 1280×800 (Tablet quer) und 390×844 (Handy hoch): alle vier Bereiche, ein Spiel mit kritischem Schiff, stillstehender Anlage und überzogener Frist (Speicherstand aus einem Testlauf).
- Abnahme durch Rocco auf Tablet und Handy: Erkennt er jeden Bereich ohne Lesen?
