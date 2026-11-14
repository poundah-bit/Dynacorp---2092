# Großprojekte und Quark-Trend – Entwurf

Stand: 2026-11-14 · Status: zur Freigabe durch Rocco · Stufe 1 der Vision „Großprojekte und Modulwelten“ (`docs/konzept.md`)

## Warum

Roccos Tablet-Spiel nach 2.128 Tagen: Platz 1 der Rangliste, Firmenindex 60.976, 22 Mio. Cr bar, 7 Anlagen, 12 Schiffe, Logistikzentrale voll ausgebaut. Große Aufträge bringen viel Geld, aber **das Geld hat keinen sinnvollen Gegenwert mehr**. Die Logistikzentrale zeigt, was funktioniert: ein teures Sparziel mit spürbarer Belohnung.

Dazu kommt die Vision der Modulwelten: Jede abgeschlossene Welt wird zu einem Quark, und alle sechs Sorten vervollständigen das Standardmodell. Roccos Idee verbindet beides: **Großprojekte verlangen große Mengen bestimmter Waren**, und die Wahl des Projekts lenkt die Wirtschaft der Welt bewusst in eine Quark-Richtung.

## Ziele

- Sechs Großprojekte als teure Sparziele: Geld zum Start, danach große Warenmengen, die geliefert werden müssen.
- Jedes fertige Projekt bringt **Prestige** (im Firmenindex) und einen **Komfort-Vorteil** – nie zusätzliches Einkommen (Rocco: Richtung C).
- Jede Welt zeigt einen **Quark-Trend** im Statusbalken; die Projekte sind das Werkzeug, ihn planbar zu steuern.
- Zwei Varianten, wie der Quark-Balken sich füllt, sind im selben Spiel per **Testschalter** wählbar, damit Rocco beide auf dem Tablet ausprobieren und sich dann entscheiden kann (Rocco: Weg A).

## Nicht-Ziele (jetzt)

- Kein Abschließen der Welt, keine Modulwelten, keine Gesamtübersicht, keine neuen Warenwelten. Ist der Quark-Balken voll, meldet das Spiel nur, als welches Quark sich die Welt jetzt schließen *würde*.
- Kein automatischer Verkauf an Terra („Handelskontor“) – der kommt mit den Modulwelten.
- Die KI baut keine Großprojekte.

## Anti-Ziele

- Ein Projekt, das mehr Geld einbringt – dann kehrt das Ausgangsproblem zurück.
- Ein Quark-Trend, den der Spieler nicht gezielt erreichen kann.
- Ein Testschalter, der nach Roccos Entscheidung im Spiel bleibt.
- Physik, die etwas Falsches behauptet.

## Ansätze (erwogen)

| Ansatz | Bewertung |
|---|---|
| Großprojekte nur gegen Geld, Prestige als Belohnung (A) | verworfen: fühlt sich leer an |
| Großprojekte mit Einkommensvorteil (B) | verworfen: verschärft das Geldproblem |
| **Komfort und Möglichkeiten plus Prestige (C)** | gewählt (Rocco) |
| Projekte verlangen Waren und steuern den Quark-Trend | gewählt (Roccos Idee) |
| Zwei Varianten auf zwei Branches testen | verworfen: GitHub Pages baut nur `main`, doppelte Pflege |
| **Beide Varianten in einem Spiel mit Testschalter** | gewählt (Rocco) |
| Varianten nur per Simulation vergleichen | verworfen: sagt nichts über das Spielgefühl |

## Entscheidungen

### Quark-Klassen der Waren

Jede Ware gehört zu einer **Seite** (Industrie = up-artig, Versorgung = down-artig) und einem **Gewicht** (leicht, mittel, schwer – nach Basispreis). Das ergibt sechs Felder, eines pro Quark-Sorte. Neu in `goods.json`: `"quark": { "side": "industry" | "supply", "weight": 1 | 2 | 3 }`.

| Feld | Waren |
|---|---|
| up (Industrie, leicht) | Erdöl, Erz, Brennstoff, Chemikalien, Kunststoff |
| down (Versorgung, leicht) | Wasser, Dünger, Agrarprodukte, Webstoff |
| charm (Industrie, mittel) | Stahl, Plastikwaren |
| strange (Versorgung, mittel) | Vieh, Getränke, Nahrung, Textilien |
| top (Industrie, schwer) | Maschinen, Roboter |
| bottom (Versorgung, schwer) | Medikamente |

### Die sechs Großprojekte

Jedes Projekt gehört zu einem Quark-Feld und verlangt Waren aus diesem Feld. Die Reihenfolge ist frei, jedes Projekt gibt es einmal.

| Quark | Projekt | Geld | Waren (Richtwert) | Vorteil |
|---|---|---|---|---|
| up | **Orbitaldock Terra** | 10 Mio. | Kunststoff, Brennstoff | Jedes eigene Schiff wird bei jedem Halt auf Terra automatisch repariert (wie vorgemerkt). |
| down | **Forschungskuppel** | 10 Mio. | Wasser, Agrarprodukte, Webstoff | Frühwarnung: Story-Ereignisse werden 7 Tage vor Beginn angekündigt. Nur mit Kuppel wird das nächste Ereignis 7 Tage früher ausgewürfelt; ohne Kuppel bleibt der Ablauf der Ereignisse (und jeder Seed) wie heute. |
| charm | **Großwerft** | 25 Mio. | Stahl, Plastikwaren | Reparatur vor Ort: eigene Schiffe lassen sich an jedem Planeten mit eigener Anlage zum Werftpreis reparieren. |
| strange | **Siedlerstadt** | 25 Mio. | Nahrung, Textilien, Getränke | Ein elfter Standort. |
| top | **Rechenzentrum** | 60 Mio. | Roboter, Maschinen | Zwei zusätzliche Lieferrouten in der Logistikzentrale (wirkt, sobald sie gekauft ist). |
| bottom | **Klinikring** | 60 Mio. | Medikamente | Schäden durch Gravo-Stürme an eigenen Anlagen und Schiffen halbiert. |

- **Warenmengen:** Richtwert ist, dass der Marktwert der Waren etwa dem Geldpreis entspricht (ein 60-Mio.-Projekt verlangt also Waren im Wert von rund 60 Mio. Cr). Genaue Mengen pro Ware stehen in den Daten.
- **Prestige** pro Projekt (Richtwert): 5.000 Indexpunkte für leichte, 10.000 für mittlere, 20.000 für schwere Projekte – zum Vergleich: Roccos Index ist 60.976.

### Ablauf eines Projekts

- **Start:** auf dem Terra-Tab (Karte „Großprojekte“ neben der Logistikzentrale), schuldenfrei, Geldpreis aus Barkapital, nur ein Projekt zur Zeit im Bau.
- **Baustelle:** Das Projekt liegt im Orbit von Terra. Es gibt seine Waren als **Bestellungen des Spielers** an der Börse auf (Auftraggeber: die eigene Firma, Ziel Terra, Größe wie Eigen-Nachfragen), immer ein paar zugleich, bis alle Mengen geliefert sind.
  - Liefert der Spieler aus eigenen Anlagen, zahlt er nichts (wie bei Eigen-Nachfragen).
  - Eine KI-Firma darf ebenfalls liefern; dann zahlt der Spieler den Marktpreis. Das ist ein gewollter zweiter Geldabfluss und stellt sicher, dass jedes Projekt erreichbar ist, auch ohne eigene Anlage für jede Ware.
  - Eine neue Bestellung wird nur aufgegeben, wenn das Barkapital ihren Marktwert deckt; sonst wartet die Baustelle („wartet auf Geld“). So kann ein Projekt den Spieler nicht in Schulden treiben. (Entscheidung beim Entwurf)
- **Fortschritt** je Ware als Balken auf der Projektkarte; fertig, wenn alle Waren geliefert sind → Meldung, Prestige, Vorteil aktiv, Ton wie bei der Logistikzentrale.
- **Abbrechen** ist möglich; das Geld ist dann verloren, gelieferte Waren auch.
- **Karte:** Fertige Projekte erscheinen als kleine Bauwerke im Orbit von Terra auf der Sternkarte; die Station wächst mit jedem Projekt.

### Quark-Trend und der Testschalter

Beim neuen Spiel wählt man (als „Test“ gekennzeichnet): **Quark-Modus: Projekt** oder **Trend**. Alte Spielstände: Trend.

**Variante „Projekt“:** Das laufende Großprojekt ist die Quelle des Quarks. Der Balken zeigt den Lieferfortschritt des aktuellen Projekts; ist das Projekt fertig, ist der Balken voll und die Welt „würde sich“ als dessen Quark schließen. Danach bleibt der volle Balken des zuletzt fertigen Projekts stehen, bis ein neues Projekt beginnt; dann zeigt er dessen Fortschritt. Vor dem ersten Projekt steht „kein Projekt“. (Entscheidung beim Entwurf)

**Variante „Trend“:** Der Trend kommt aus dem, was die Welt des Spielers hervorbringt (Entscheidung beim Entwurf, welche Lieferungen zählen):

- Es zählen Lieferungen des Spielers an Terra, an Planeten und an andere Firmen, und jede Lieferung in ein Großprojekt des Spielers, egal wer sie fährt (er hat sie bezahlt).
- Lieferungen zwischen eigenen Anlagen (Eigen-Nachfragen, Lieferrouten) zählen nicht: das ist interne Verarbeitung, sonst würden Zwischenprodukte doppelt zählen.


- Sechs Speicher, je einer pro Quark-Feld. Jede Lieferung legt ihren Warenwert in den Speicher ihres Feldes.
- Alle Speicher klingen täglich ab (Richtwert: Halbwertszeit 120 Tage). So kann der Balken sinken – durch Umbau, eine Rezession oder einen Durchbruch aus den Story-Ereignissen (Rocco).
- Trend = der Speicher, der am weitesten gefüllt ist; Balken = sein Stand im Verhältnis zu seinem Ziel.
- Ziel je Gewicht (Richtwert, im Test nachzustellen): leicht 15 Mio., mittel 30 Mio., schwer 60 Mio. Cr Warenwert. Schwere Quarks brauchen mehr „Energie“ (E = mc²).
- Ein laufendes Großprojekt ist der starke Hebel: Seine großen Mengen ziehen den Trend in sein Feld.

**Beide Varianten:**

- Statusbalken oben: Quark-Symbol, Sorte, Füllstand, z. B. `◐ charm ▓▓▓▓▓▓▓░░░ 68 %`. Langes Drücken erklärt, was es bedeutet und wie man es lenkt.
- Statistik-Tab: Karte „Quark-Trend“ mit den sechs Feldern (2 × 3 wie die Tabelle oben), Füllstand je Feld, kurzer Erklärung der Physik (Ladung, Masse, warum sechs Sorten).
- Meldungen kommen je Quark-Sorte einmal pro Spiel (Entscheidung beim Entwurf). Bei 90 %: Meldung „Deine Welt verdichtet sich zu einem Charm-Quark.“ Bei 100 %: „Deine Welt hat sich zu einem Charm-Quark verdichtet. In der fertigen Version würde sie jetzt als Modul abgeschlossen.“ Das Spiel läuft weiter.
- Quark-Farben (Gestaltung): sechs gut unterscheidbare Farben, nicht Grün/Gelb/Rot (die bleiben Status).

### Spielstand

- `World.quark`: Modus, Speicher (Trend), gemeldete Schwellen; `World.projects`: Stand jedes Projekts (offen, im Bau mit gelieferten Mengen, fertig).
- `Company.prestige` (nur der Spieler hat welches); fließt in `companyIndex` ein.
- Alte Spielstände: keine Projekte, Modus Trend, leere Speicher.

### Prüfung (sparsam)

- Reine Tests: Quark-Klasse jeder Ware; Projekt starten (Bedingungen, Geld), Bestellungen, Lieferung aus eigener Anlage ohne Bezahlung, Lieferung durch KI mit Bezahlung, Abschluss mit Prestige und Vorteil; jeder der sechs Vorteile einzeln; Trend-Speicher füllen und abklingen; Variante Projekt füllt mit dem Lieferfortschritt; Meldungen bei 90 / 100 %.
- Kein neuer Langlauf: die KI baut keine Projekte, die Tore aus Phase 0–2 bleiben unverändert. Ein kurzer Lauf (ein Seed) prüft, dass ein konzentrierter Spieler den Trend-Balken in vertretbarer Zeit füllt (Richtwert 200–400 Tage im späten Spiel).

## Dem Bau überlassen

- Genaue Warenmengen je Projekt (Regel: Warenwert ≈ Geldpreis), Größe und Zahl der gleichzeitigen Bestellungen.
- Abklingrate und Ziele des Trends innerhalb der Richtwerte.
- Gestaltung der Projektkarte, der Quark-Felder, der Station auf der Karte.
- Wortlaut aller Texte.
