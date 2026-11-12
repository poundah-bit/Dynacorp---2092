# Optik, Teil 2: Atmosphäre und Sternkarte

Stand: 2026-11-12 · Status: Entwurf zur Freigabe durch Rocco

## Ziel

Die Sternkarte soll sich wie ein Blick in ein lebendiges Sonnensystem anfühlen statt wie ein Diagramm aus farbigen Punkten – ohne an Lesbarkeit zu verlieren und flüssig auf dem Tablet, auch wenn die Zeit läuft.

**Erfolg heißt:**
1. Jeder Planet ist unverwechselbar und sieht aus wie das, was er herstellt; die Stufe (Rohstoff, Zwischen-, Endprodukt, Terra) bleibt auf einen Blick erkennbar.
2. Man sieht, dass die eigene Wirtschaft arbeitet: Schiffe ziehen Spuren, Anlagen pulsieren beim Produzieren, Ablieferungen blitzen auf, Gravo-Stürme sind sichtbar.
3. Kein Ruckeln auf dem Tablet bei 1×–4×; in der Pause zeichnet die Karte nicht dauernd neu.
4. Bedienung der Karte (ziehen, zoomen, tippen, Infokarte) bleibt unverändert; `npm test` bleibt grün.

## Entscheidungen aus dem Brainstorming

- Richtung: Weltraum-Panorama (A) plus ausgewählte Bewegung (C); Navigations-/Leitstand-Optik bleibt Teil 3 vorbehalten.
- Planeten werden im Code erzeugt, keine Bilddateien. (Große KI-Bilder in der Infokarte wären ein späterer, eigener Schritt.)
- Aussehen nach Industrie, Stufe als Atmosphärensaum in Stufenfarbe.
- Bewegung: Schiffsspuren, Produktionspuls, Ankunftsfunke, sichtbarer Gravo-Sturm. Keine Handelsbahnen aller Firmen (zu unruhig).
- Technik: Ebenen im Speicher vorzeichnen (Offscreen-Canvas), keine neue Bibliothek, kein WebGL.

## Leitplanken

- Keine Änderung in `src/sim/` oder `src/data/*.json`. Alles, was die Karte braucht, steht im Spielstand (Produktion, `doneDay`, Log-Meldung des Sturms).
- Nichts aus dem Original Dynatech.
- Deterministisch: derselbe Planet und derselbe Sternenhimmel sehen in jedem Spiel gleich aus (Startwert aus der ID).
- Alle Effekte laufen in Echtzeit (Sekunden), nicht in Spieltagen.
- `prefers-reduced-motion: reduce`: keine Pulse, Funken, kein Wabern; Sturm als ruhiges Leuchten.
- Bestehende Kartenzeichen bleiben in ihrer Bedeutung: türkiser Ring = deine Anlage (rot bei Stillstand oder Zustand unter `facilities.repairBelow`), gelber Ring = Auswahl, Dreieck = dein Schiff, kritische Schiffe blinken rot.

## 1. Hintergrund

- Drei Sternebenen (fern, mittel, nah) mit zunehmender Größe und Helligkeit, zusammen ~400 Sterne auf einer Fläche, die größer ist als die Karte bei kleinstem Zoom.
- Parallaxe beim Verschieben: fern 0,2, mittel 0,45, nah 0,7 der Kartenbewegung. Kein Zoom-Effekt auf die Sterne.
- Zwei bis drei weiche Nebelflecken (Violett `#3a1d5c`, Blau `#123a5c`) mit höchstens 18 % Deckkraft.
- Grundfarbe bleibt `--map-bg`.
- Sterne und Nebel werden einmal pro Kartengröße in eine Offscreen-Fläche gezeichnet.

## 2. Planeten

Neue Datei `src/ui/planets.ts`.

**Oberfläche:** Kugel mit Licht von oben links (gleich für alle), Farbe aus einer Palette von 3 Tönen, gemischt über weiches Rauschen (Value Noise, 2–3 Oktaven), wahlweise als Bänder (Gasriese-Optik) oder Flecken. Besonderheiten je Art (Wolken, Krater, Lavaadern, Lichter auf der Nachtseite). Weicher Rand (Antialiasing über die Kante).

**Aussehen je Anlagenart** (`LOOKS` in `planets.ts`):

| Art | Palette (dunkel → hell) | Muster | Extra |
|---|---|---|---|
| Terra | `#1d4f91` `#2f7fbf` Land `#3f8f4f` `#c9b27a` | Flecken | Wolken, Stadtlichter Nachtseite |
| oilwell | `#1a1410` `#3b2a1a` `#6b4a24` | Bänder | – |
| waterstation | `#0b2f6b` `#155ea8` `#2c86c9` | Flecken | Wolken |
| mine | `#4a1c10` `#8a3b1c` `#b8642e` | Flecken | Krater |
| refinery | `#2a241e` `#5a4632` `#9a7046` | Bänder | Dunst |
| plasticplant | `#3a5a5a` `#6a9a92` `#c8e0d0` | Bänder | – |
| chemplant | `#3a4a0f` `#7a8f1a` `#c8c43a` | Bänder | Dunst |
| steelworks | `#1c1c22` `#3a3a44` `#5c5c66` | Flecken | Lavaadern `#ff7a2a`, Ring |
| agrofarm | `#5a4a14` `#9a8a2a` `#d0c060` | Flecken | Wolken |
| plantation | `#0f3a1c` `#1f6b2c` `#3f9a3a` | Flecken | Wolken, Ring |
| ranch | `#3a3418` `#6a6a2a` `#9aa04a` | Flecken | – |
| brewery | `#4a2a0a` `#8a5a1a` `#d09a3a` | Bänder | – |
| foodplant | `#4a2a14` `#8a5a2a` `#c8a060` | Flecken | Wolken |
| textilemill | `#4a2a4a` `#8a5a8a` `#d0a0c8` | Bänder | Ring |
| factory | `#2a3a4a` `#5a7a8a` `#c0d8e0` | Bänder | – |
| machineworks | `#22303c` `#44586a` `#7a90a4` | Flecken | Lichter Nachtseite |
| robotworks | `#0d1424` `#1a2640` `#2a3a5c` | Flecken | Lichter `#5ad0ff` Nachtseite |
| pharma | `#9fb8d8` `#c8dcf0` `#e8f2ff` | Bänder | – |

Ringe: Planeten mit „Ring“ in der Tabelle; hinterer Halbbogen hinter, vorderer vor dem Planeten.

**Atmosphärensaum:** radialer Verlauf in der Stufenfarbe (`--tier-raw`, `--tier-mid`, `--tier-final`, `--tier-terra`) von 0,9 R bis 1,9 R, innen ~65 % Deckkraft, außen 0.

**Größe:** Radius auf dem Bildschirm wie heute plus Skalierung mit dem Zoom: Terra 11 → 11–24 px, andere 7 → 7–16 px (`clamp(base × zoomFaktor)`).

**Zwischenspeicher:** Jeder Planet wird als Sprite für eine Radius-Stufe gezeichnet (Stufen 8, 12, 16, 24, 32 px × `devicePixelRatio`) und im Speicher gehalten; gezeichnet wird mit der nächstgrößeren Stufe.

**Schnittstelle:**
```ts
export interface PlanetLook { palette: [string, string, string]; pattern: 'bands' | 'spots'; clouds?: number; craters?: boolean; lava?: string; lights?: string; ring?: boolean; haze?: boolean; land?: [string, string] }
export const LOOKS: Record<string, PlanetLook>          // key: facility id, plus 'terra'
export function lookOf(p: PlanetDef): PlanetLook
export function planetPixels(id: string, look: PlanetLook, radiusPx: number): Uint8ClampedArray  // RGBA, (2r+2)², pure, deterministic
export function planetSprite(p: PlanetDef, radiusPx: number): HTMLCanvasElement  // cached, browser only
```

## 3. Bewegung

Neue Datei `src/ui/mapfx.ts`.

**Ereignisse eines Tages** (rein, ohne DOM, getestet):
```ts
export interface DayEvents { pulses: string[]; arrivals: string[]; storm: string | null }  // planet ids
export function mapEvents(w: World, me: string): DayEvents
```
- `pulses`: Planeten deiner Anlagen mit Status `running` und `productionEfficiency > 0`.
- `arrivals`: Zielplaneten deiner Transporte (`carrier === me`) mit `doneDay === w.day`.
- `storm`: Planet aus der Log-Meldung „Gravo-Sturm bei <Name>!“ des aktuellen Tages, sonst `null`.

**Effektliste** (`createFx()`): hält `{ kind, planet, start }`, Dauer je Art: Puls 1,2 s, Funke 0,8 s, Sturm 3 s. `add(events, now)`, `active(now)`, `busy(now)`. Puls-Bremse: pro Planet höchstens ein Puls je 1,4 s (knapp unter einem 4×-Tag).

**Zeichnen:**
- Schiffsspuren: eigene Schiffe Linie mit Verlauf von Türkis (vorn, 90 %) zu transparent, Länge `min(40 px, zurückgelegter Weg)`, 3 px; fremde Schiffe 15 px, 1,5 px, 25 %.
- Puls: Kreis vom türkisen Ring (R + 3,5) bis R + 22, Deckkraft 0,7 → 0, Linie 2 px.
- Funke: Leuchten (radial, warmweiß `#fff0b4`) bis 14 px plus 8 Strahlen, die nach außen wandern, 0,8 s.
- Sturmzone: Ringband um `CONFIG.events.outerRingParsec` (±40 Pc) als radialer Verlauf in `--bad` mit höchstens 13 % Deckkraft; Deckkraft schwankt mit 8 s Periode um ±4 %, nur während die Zeit läuft.
- Sturm am Planeten: rotes Leuchten bis 2,5 R, Deckkraft flackert (Rauschen) 3 s lang; bei reduzierter Bewegung ruhig 45 %.

**Spielschleife (`game.ts`):** nach jedem `advance()` `map.dayEvents(mapEvents(w, me))`. Die Karte zeichnet in der Pause weiter, solange `fx.busy(now)` wahr ist; danach nicht mehr.

**Reduzierte Bewegung:** keine Pulse, Funken, kein Wabern; Sturm ruhig; Spuren bleiben (sie sind keine Animation, nur Form).

## 4. Legende

Unter der Karte ergänzt: „Leuchten = Stufe“ mit den vier Stufenfarben; „Ring = deine Anlage“, „Dreieck = dein Schiff“, „Schleier = Gravo-Sturm-Zone“ bleiben inhaltlich wie heute.

## Betroffene Dateien

- `src/ui/planets.ts` – neu
- `src/ui/mapfx.ts` – neu
- `src/ui/starmap.ts` – Hintergrund-Ebene, Planeten-Sprites, Spuren, Effekte, Sturmzone, `dayEvents()`, `busy()`
- `src/ui/game.ts` – Ereignisse nach `advance()`, Neuzeichnen in der Pause solange Effekte laufen
- `src/ui/game.css` – Legende
- `tests/planets.test.ts`, `tests/mapfx.test.ts` – neu
- `CLAUDE.md`, `docs/konzept.md` – Doku

## Prüfung

- `npm test`, `npm run typecheck`, `npm run build` grün.
- Tests: jede Anlagenart hat ein Aussehen; `planetPixels` ist deterministisch und hat außerhalb des Kreises Deckkraft 0; `mapEvents` findet Puls, Ankunft und Sturm und nichts an einem ruhigen Tag; die Effektliste verwirft abgelaufene Effekte und bremst Pulse.
- Screenshots der Karte (Tablet quer, Handy hoch) mit `tools/screens.ts`, erweitert um den Karte-Tab.
- Leistung: Zeichenzeit pro Bild im Browser bei 20 KI-Firmen und laufender Zeit gemessen, Ziel < 8 ms auf dem Prüfrechner.
- Abnahme durch Rocco auf dem Tablet.
