# Entwurf: Welt abschließen, Kampagne und Gesamtübersicht (Stufe 2 der Modulwelten)

Stand 14.11.2026, mit Rocco erarbeitet. Grundlage: `docs/konzept.md`, Abschnitt „Vision: Großprojekte und Modulwelten“ und die Entscheidungstabelle „Großprojekte und Quark“.

## Absicht

Ist eine Welt so ausgebaut, dass sie für sich läuft, schließt der Spieler sie als **Modul** ab und beginnt die nächste. Sechs Module mit sechs verschiedenen Quarks vervollständigen „das Standardmodell“. Das gibt dem Endgame ein Ziel jenseits von Geld, und die Wahl der Reihenfolge wird zum Planungsrätsel. Diese Stufe baut die ganze Schleife (abschließen → neue Welt → Gesamtübersicht → Finale) mit der heutigen Warenwelt; die zweite Warenwelt mit eigenen Waren folgt später.

## Ziele

1. **Baufortschritt der Großprojekte:** Nach dem Material folgen 200 Tage Bau.
2. **„Welt abschließen…“** mit freier Wahl eines freigeschalteten Quarks.
3. **Kampagne:** eingefrorene Module, neue Welt mit neuer Firma, das Abschlussprojekt wirkt global.
4. **Zufallswelt:** neue Planetennamen, Lagen und Grafiken bei vergleichbaren Wegen.
5. **Gesamtübersicht** mit sechs Plätzen im Kreis und Beschleuniger in der Mitte; Finale nach dem sechsten Quark.
6. **Musik pro Welt:** Welt 1 hat ihre drei Stücke, ab Welt 2 die drei neuen; Wahl in den Musikoptionen.

## Nicht in dieser Stufe

- Eigene Waren pro Welt, eigener Heimathafen statt Terra (kommt mit der zweiten Warenwelt).
- Startneigung einer Welt (Rocco: die Zufallswelt bringt genug Veränderung).
- Einfluss eines Moduls über das globale Abschlussprojekt hinaus.
- Kleinere oder kürzere Modulwelten.

## Darf nicht passieren

- Eine Welt schließt sich, ohne dass der Spieler es gewählt hat.
- Ein heutiger Spielstand wird unbrauchbar oder verändert sich beim Laden spürbar.
- Welt 1 sieht anders aus als heute (Planeten, Namen, Lagen) – alle Tests und Spielstände bauen darauf.
- Eine neue Welt hat Wege, die deutlich kürzer oder länger sind als in Welt 1.
- Eine Kette ist in einer neuen Welt nicht baubar.

## Entscheidungen (Rocco)

| Thema | Entscheidung |
|---|---|
| Abschluss | Spieler wählt selbst eins der freigeschalteten Quarks, das noch nicht erzeugt ist |
| Mehrere Projekte pro Welt | erwünscht, jedes schaltet sein Quark frei |
| Abschlussprojekt | wirkt in allen weiteren Welten, ohne neu gebaut zu werden; nur dieses eine; Prestige zählt einmal |
| Firma in der nächsten Welt | **Neustart** (A): neue Firma, normales Startkapital; mit kommen nur Abschlussprojekt und Prestige der alten Welten |
| Warenwelt der nächsten Welten | dieselbe wie heute, bis die zweite Warenwelt entworfen ist |
| Nächste Welt | Zufallswelt ohne Startneigung; neue Namen, Grafiken, Lagen; Rohstoffe eher innen, Endprodukte eher außen; Entfernungen nicht dramatisch anders |
| Bau eines Großprojekts | nach vollständigem Material 200 Tage, fest für alle Projekte (1 % alle 2 Tage) |
| Planeten technisch | **Weg A:** jede Welt trägt ihre eigene Planetenliste; Weg B (globale Liste beim Laden austauschen) verworfen, weil Tests, Beobachtungsseite und Spielstände sich sonst in die Quere kommen und die zweite Warenwelt ohnehin Daten pro Welt braucht |
| Musik | ab Modulwelt 2 die drei neuen Stücke; in den Musikoptionen wählbar: Musik der Welt (Standard), nur Welt 1, alle Stücke gemischt |
| Veröffentlichung | ganz am Ende, nach den Modulwelten |

## Ansätze, die erwogen wurden

- **Planeten pro Welt (gewählt, A)** gegen globalen Austausch (B), siehe Tabelle.
- **Kampagne im Weltzustand (gewählt, meine Wahl):** `World.campaign` hält die Module. Spielstand-Format, Autosave und die zehn Speicherplätze bleiben unverändert (`SaveData.version 1`). Ein eigener Spielstand-Typ „Kampagne“ neben der Welt wäre sauberer getrennt, verlangt aber einen zweiten Ladeweg und eine Umwandlung alter Stände; dafür gibt es keinen Gewinn, solange ein Modul nur ein paar KB ist.
- **Kein eigener Spielmodus (meine Wahl):** Jedes Spiel ist Welt 1 einer Kampagne, auch heutige Spielstände. Der Startbildschirm bekommt keine neue Wahl.

## Entwurf

### 1. Baufortschritt der Großprojekte

- `ProjectState` bekommt eine Bauphase: sobald alles Material da ist, beginnt `buildDaysLeft` = `config.projects.buildDays` (200) und zählt täglich herunter. Vorteil, Prestige und Quark-Freischaltung erst bei 0.
- Der Status bleibt `'building'`, bis der Bau fertig ist; daran hängen „eine Baustelle zur Zeit“ und `abortProject` (Abbruch in der Bauphase: alles verloren, wie heute).
- Anzeige in der Projektkarte und im Quark-Chip: erst „Material 73 %“ (wie heute je Ware ein Balken), danach ein Balken „Bau 12 % – noch n Tage“.
- `quarkStatus`: das laufende Projekt füllt den Balken je zur Hälfte mit Material und Bau (0–50 % Material, 50–100 % Bau); die Meldung „verdichtet sich“ kommt bei 90 %, also in der Bauphase.
- Alte Spielstände: fertige Projekte bleiben fertig (heute endet ein Projekt am selben Tag, an dem das letzte Material ankommt – ein laufendes Projekt hat also nie vollständiges Material). Laufende Projekte gehen nach dem letzten Material normal in die Bauphase; beim Laden ändert sich nichts.
- Es gibt genau sechs Projekte, eins je Quark (`projects.json`); keine neuen Projekte nötig.

### 2. Welt abschließen

- **Bedingung:** mindestens ein freigeschaltetes Quark, das in der Kampagne noch nicht erzeugt ist. Dann zeigt die Quark-Karte (Statistik) und die Gesamtübersicht den Knopf **„Welt abschließen…“**.
- **Dialog:** die freien Quarks zur Wahl, je mit dem Projekt, das danach global wirkt, und seinem Vorteil. Darunter klar: „Die Welt wird eingefroren. Du beginnst Welt n+1 mit einer neuen Firma und normalem Startkapital.“ Läuft gerade ein Großprojekt, der Hinweis, dass es mit Geld und Waren verloren geht wie beim Abbrechen (keine Erstattung; meine Wahl, gleiche Regel wie `abortProject`). Bestätigen mit einem zweiten Tipp.
- **Wirkung:**
  1. Ein **Moduldatensatz** wird angelegt (siehe 3).
  2. Eine neue Welt entsteht: neuer Seed, gleiche Schwierigkeit, gleiche Zahl KI-Firmen, gleiche Story-Einstellung, gleicher Firmenname des Spielers; Planeten aus dem Generator (siehe 4).
  3. Die Kampagne wandert in die neue Welt; dort steht das globale Projekt als fertig (`ProjectState` mit `fromModule: n`), ohne Prestige in dieser Welt.
  4. Autosave sofort; ein Toast „Welt n abgeschlossen – Willkommen in Welt n+1“.
- **Sechstes Quark:** keine neue Welt. Das Finale (siehe 5) erscheint, die Welt bleibt spielbar; der Knopf verschwindet.
- Die KI schließt nie ab.

### 3. Kampagne und Module

- `World.campaign?: { world: number; modules: ModuleRecord[] }` – fehlt = Welt 1 ohne Module (alte Stände).
- `ModuleRecord` (nur Zahlen und Namen, wenige KB; mehr zeigt auch das Antippen in der Gesamtübersicht nicht – die Welt selbst wird nicht gespeichert): Nummer, Quark, Abschlussprojekt, Name der Welt (z. B. „Welt 1 · Terra-Sektor“ – Namensregel dem Bauer überlassen), Firmenname, Spieltage, Firmenindex beim Abschluss, Zahl der Anlagen und Schiffe, Abschlusstag.
- **Globale Projekte:** `hasProject` gilt auch für Abschlussprojekte früherer Module. Die Projektliste zeigt sie als „aktiv aus Modul n“ ohne Startknopf; ihr Quark ist ausgegraut.
- **Erzeugte Quarks** sind in jeder späteren Welt ausgegraut; ihr Projekt kann nicht neu gebaut werden (es wirkt ja schon).
- **Was in die neue Welt mitkommt (meine Wahl, folgt aus Neustart A):** nur die Kampagne (Module) und damit die globalen Abschlussprojekte. Die neue Firma beginnt mit Prestige 0, ohne Logistikzentrale, ohne Anlagen und Schiffe. Die Vorteile der globalen Projekte gelten für die neue Firma (Dock, Kuppel, Werft, +1 Standort, +2 Routen sobald eine Logistikzentrale gekauft ist, Sturmschutz). Das Prestige der alten Welten steckt im Firmenindex ihres Moduls und zählt so im Kampagnenwert – darum „einmal“.
- **KI-Firmen** werden wie bei jedem neuen Spiel aus `companies.json` gezogen; Namen dürfen sich zwischen Welten wiederholen (meine Wahl).
- **Kampagnenwert:** Summe der Firmenindizes aller Module plus der laufenden Welt; in der Statistik und in der Gesamtübersicht.

### 4. Zufallswelt

- `World.planets?: PlanetDef[]` – fehlt = `planets.json` (Welt 1, unverändert). Alle Abfragen laufen über die Welt: `planet(w, id)`, `distance(w, a, b)`, `planetsFor(w, type)`; etwa 50 Stellen in `src/sim` und `src/ui`.
- **Generator** `generatePlanets(w)`, deterministisch über `World.rng`:
  - Terra bei (0, 0), gleiche Kennung `terra`.
  - Gleiche Zusammensetzung wie `planets.json`: dieselbe Zahl Planeten je Anlagentyp.
  - **Ringe nach Stufe** der Ware der Anlage (`raw`, Zwischenprodukt, Endprodukt aus `goods.json` `tier`): Radius-Bereich je Stufe gemessen aus `planets.json` (Mittel ± Streuung); zufälliger Winkel.
  - **Mindestabstand** zwischen Planeten (Richtwert: kleinster Abstand in Welt 1).
  - **Vergleichbare Wege:** mittlere Entfernung aller Planetenpaare und mittlere Entfernung zu Terra je höchstens ±10 % von Welt 1; sonst neu würfeln (begrenzte Versuche, dann der beste Versuch).
  - **Namen** aus einem neuen Vorrat `src/data/planetnames.json` (≥ 60 eigene Namen, keine aus dem Original-Dynatech), keine Wiederholung innerhalb der Kampagne. Kennungen aus dem Namen abgeleitet (Grafik entsteht aus der Kennung, also automatisch neu).
- Es ändern sich nur Kennung, Name und Lage; der Anlagentyp je Planet und alle anderen Felder bleiben wie in `planets.json`, also bleibt jede Kette baubar. Die ±10 % gelten für die Luftlinie (Reisezeit = Luftlinie ÷ Tempo, also gleichwertig).
- `planet`, `distance`, `planetsFor` bekommen die Welt als ersten Parameter; alle Aufrufer und Tests werden umgestellt, keine Altsignatur (meine Wahl). Planetensprites bleiben nach Kennung gecacht – neue Kennungen sind eindeutig.
- Planetenbezogene Texte (Stories mit Ortsregeln, Bevölkerung von …) nehmen die Planeten der Welt.

### 5. Gesamtübersicht und Finale

- **Zugang:** Knopf auf der Sternkarte („Gesamtübersicht“, Herauszoomen) und Verweis in der Quark-Karte.
- **Bild:** sechs Plätze im Kreis, je in der Farbe ihres Quarks (`q-*`-Farben gibt es schon), angeordnet nach den Generationen (up/down, charm/strange, top/bottom). Besetzte Plätze zeigen Weltname und Firmenindex; freie Plätze sind angedeutet. In der Mitte der Beschleuniger. Die laufende Welt als „Welt n läuft“ mit ihren freigeschalteten Quarks.
- **Antippen:** besetzter Platz → Werte des Moduls; freier Platz → Zielangaben (welches Großprojekt dieses Quark freischaltet, Preis, Waren).
- **Finale** nach dem sechsten Quark: Bild „Das Standardmodell ist vervollständigt“, der Beschleuniger weist alle sechs Sorten nach, Kampagnenwert, Liste der Module. Danach weiterspielen.
- Form und Animation dem Bauer überlassen; als SVG/HTML wie der Ketten-Graph, ohne Bilddateien.

### 6. Musik

- `TRACKS` bekommt pro Stück die Welt-Gruppe: Welt 1 = die drei heutigen Stücke, Welt 2 = Iron Bullet Clash (Dubstep), Iron Bullet Clash (Jazzy RnB Cover), Is It Worth (schon als Opus in `public/music/`).
- Musikeinstellung `choice`: **„Musik der Welt“** (Standard: Welt 1 → Gruppe 1, ab Welt 2 → Gruppe 2, bis es weitere Gruppen gibt), **„Nur Welt 1“**, **„Alle Stücke gemischt“**. Fehlender Wert in alten Einstellungen = Standard.
- Beim Wechsel in Welt 2 endet das laufende Stück, die neue Gruppe beginnt (klare akustische Untermalung).
- Credits nennen Thamanoidis mit den neuen Titeln.

## Tests (Richtwerte)

- Bauphase: Material komplett → 200 Tage → fertig; Vorteil erst danach; Abbruch in der Bauphase; alter Stand mit vollem Material.
- Abschluss: Bedingung, Wahl, neuer Seed, neue Firma mit Startkapital, globales Projekt wirkt (`hasProject`), Prestige nicht doppelt, erzeugtes Quark ausgegraut, sechstes Quark → keine neue Welt.
- Generator über viele Seeds (z. B. 100): Zusammensetzung, Ringe in der richtigen Reihenfolge, Mindestabstand, mittlere Wege ±10 %, eindeutige Namen.
- Welt 1 unverändert: `createWorld` ohne Kampagne liefert genau die Planeten aus `planets.json`.
- Eine generierte Welt besteht das 1.000-Tage-Tor (ein Seed, damit die Testzeit klein bleibt).
- Musik: Gruppenwahl je Einstellung und Welt.

## Dem Bauer überlassen

Namensregel der Welten, genaue Ring-Streuung, Zahl der Würfelversuche, Gestaltung von Gesamtübersicht und Finale, Texte im Rahmen der Projektregeln (deutsch, keine Dynatech-Inhalte).
