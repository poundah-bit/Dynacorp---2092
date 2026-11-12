# Konzept: Automatische Lieferrouten („Logistikzentrale“)

Stand: 2026-11-12 · Status: Entscheidungen getroffen (siehe Ende), zur Freigabe durch Rocco

## Idee in einem Satz

Ein teures Endgame-Upgrade bei Dynacore schaltet **Lieferrouten** frei: Der Spieler legt fest „Öl von Vesta Nova zum Kunststoffwerk auf Polymer IX, immer 100.000 l, mit Tanker E #12“ – ab dann bestellt, belädt und fliegt das Spiel diese Fahrt von selbst, sobald genug Ware frei ist und am Ziel Platz ist.

## Ziel

- **Entlastung im Endgame:** Mit 8–10 Anlagen wird das wiederholte „Eigen-Nachfrage → Transport → Schiff zuweisen“ zur Fleißarbeit. Eine Route nimmt genau diese Fleißarbeit ab, die Entscheidungen bleiben beim Spieler.
- **Belohnung:** Man spart lange darauf, der Kauf fühlt sich wie ein Meilenstein an, und man sieht danach jeden Tag, dass er sich lohnt.
- **Kein Selbstläufer:** Routen ersetzen nicht das Spiel. Börse, Terra-Aufträge, Kredite, Reparaturen und neue Anlagen bleiben Handarbeit.

## Machbarkeit und Aufwand

**Kurz: gut machbar, mittlerer Aufwand, kein Umbau.** Alles, was eine Route tun muss, kann das Spiel heute schon – nur per Hand:

| Schritt einer Route | gibt es schon als Aktion |
|---|---|
| Eigen-Nachfrage am Ziel stellen, eigene Quelle liefert | `postDemand(…, ownSupplier)` – nimmt die Nachfrage sofort selbst an und reserviert die Ware |
| Eigenen Transport dafür anlegen | `postTransportForDemand(…, 'own')` |
| Eigenes Schiff zuweisen | `assignShip()` |
| Laden, Fliegen, Entladen, Bezahlen | läuft bereits automatisch in `step()` |

Wichtig: Eigene Nachfragen und Transporte sind schon heute **von Verspätungsstrafen und Rufverlust ausgenommen** (`engine.ts`, nur `!own` wird bestraft), und Geld fließt bei eigener Ware nur von der Firma an sich selbst. Eine Route kann also nichts kaputtmachen, was nicht auch per Hand passieren würde.

**Geschätzter Umfang** (zum Vergleich: die Reihenfolge-Funktion von heute hatte rund 250 Zeilen):

| Teil | etwa |
|---|---|
| Simulation: Datentyp Route, Kauf des Upgrades, Route anlegen/pausieren/löschen, tägliche Prüfung | 150 Zeilen |
| Oberfläche: Karte bei Dynacore, Bereich „Lieferrouten“ im Tab Aufträge, Dialog „Neue Route“ | 250 Zeilen |
| Tests: Bedingungen, Fahrt läuft durch, Pause mit Grund, alte Spielstände | 150 Zeilen |

Das passt in einen eigenen Teil mit Konzept → Plan → Umsetzung wie Optik Teil 1.

## So spielt es sich

### 1. Freischalten

Bei **Dynacore auf Terra** erscheint eine neue Karte „Logistikzentrale“:

| Stufe | Preis | Routen | Freigeschaltet ab |
|---|---|---|---|
| Logistikzentrale I | 2.500.000 Cr | 1 | 5 eigene Anlagen |
| Logistikzentrale II | +4.000.000 Cr | 3 | Stufe I |
| Logistikzentrale III | +6.000.000 Cr | 6 | Stufe II |

**Warum diese Preise** (gemessen in einem 1.000-Tage-Lauf mit 10 KI-Firmen):
- Die teuerste Anlage (Pharma) kostet 950.000 Cr, der größte Tanker 640.000 Cr. Stufe I kostet so viel wie gut zwei Pharmawerke.
- Eine starke Firma macht um Tag 500 etwa 18.000 Cr Umsatz pro Tag, um Tag 1.000 etwa 47.000 Cr. Stufe I ist also um Tag 500 „lange sparen“ (Monate Spielzeit), Stufe III ein Ziel für die letzte Phase.
- Bezahlt wird **aus Barkapital, und nur schuldenfrei** (kein offener Kredit) – für alle drei Stufen. Das ist echtes Sparen, kein Kredit-Kauf. Nach dem Kauf darf man wieder Kredite aufnehmen.
- Alle Zahlen stehen in `config.json` (`automation.levels`) und lassen sich im Balancing anpassen.
- Laufende Kosten: 1.500 Cr pro Route und Tag („Personal der Logistikzentrale“), damit eine Route nicht gratis ist und man sie bei schlechten Kursen pausiert.

### 2. Route anlegen

Neuer Bereich **„Lieferrouten“** im Tab Aufträge (nur sichtbar nach dem Kauf), Knopf „Neue Route…“. Der Dialog fragt in dieser Reihenfolge:

1. **Quelle** – eine eigene Anlage, die etwas herstellt (z. B. Ölförderanlage auf Vesta Nova). Die Ware ergibt sich daraus.
2. **Ziel** – nur eigene Anlagen, die diese Ware als Rohstoff brauchen (z. B. Kunststoffwerk, Raffinerie).
3. **Schiff** – nur eigene Schiffe der passenden Frachtart. Das Schiff wird zum **Linienschiff** dieser Route: Es fährt nur noch diese Route und taucht in den normalen Liefer-Dialogen nicht mehr als „frei“ auf.
4. **Menge pro Fahrt** – Vorgabe: Laderaum des Schiffs; höchstens Laderaum, höchstens Lager am Ziel.
5. **Nachschubgrenze am Ziel** – die Route fährt erst, wenn am Ziel weniger als diese Menge auf Lager ist (inklusive schon unterwegs). Vorgabe: die Hälfte der Lagerkapazität am Ziel für diese Ware.

### 3. Was jeden Tag passiert

Für jede aktive Route prüft die Simulation einmal pro Tag (nach Produktion und Schiffsbewegung):

- **Das Linienschiff ist frei**, egal wo es steht (es fliegt selbst zur Quelle).
- **An der Quelle ist genug frei:** `Lager − reserviert ≥ Menge`. Was für andere Aufträge zugesagt ist, zählt nicht – genau dein „nicht durch andere Bestellungen geblockt“.
- **Am Ziel ist Platz:** `Kapazität − Lager − schon unterwegs ≥ Menge`.
- **Das Ziel braucht Nachschub:** `Lager + schon unterwegs < Nachschubgrenze`. Bis dahin bleibt die Ware an der Quelle frei und kann an der Börse verkauft werden.
- **Kein Zustand unter der kritischen Schwelle** beim Schiff.

Sind alle Punkte erfüllt, legt die Route Eigen-Nachfrage, eigenen Transport und Zuweisung an – über dieselben Aktionen wie ein Spieler. Die Fahrt erscheint ganz normal unter Aufträgen, markiert mit dem Routen-Symbol.

**Wenn etwas nicht passt, pausiert die Route mit Grund** statt still zu hängen, und meldet sich einmal im Ticker:
- „Wartet auf Ware: 62.000 / 100.000 l“ und „Ziel hat genug: 41.000 l, Nachschub unter 30.000 l“ (kein Fehler, nur Status)
- „Lager am Ziel voll“
- „Linienschiff kritisch – zur Reparatur nach Terra“ (die Route merkt die Reparatur auf Terra automatisch vor, `repairAtTerra`)
- „Quelle oder Ziel verschrottet“ → Route wird beendet

### 4. Belohnungsgefühl

- **Der Kauf:** eigener Klang (kurze Fanfare aus den bestehenden Glockentönen), eine große Meldung „Logistikzentrale eröffnet“, und der Dialog „Neue Route“ öffnet sich direkt.
- **Auf der Karte:** Routen als feine goldene Linie zwischen Quelle und Ziel; Linienschiffe ziehen eine goldene statt türkise Spur.
- **Im Alltag:** In der Kopfzeile von Aufträgen ein Chip „2 Routen aktiv“; jede Route zeigt „automatisch geliefert: 1,4 Mio l in 14 Fahrten“ und „dir erspart: 42 Handgriffe“.
- **Statistik:** Summe der automatisch gelieferten Ware.

## Technik (Empfehlung)

**Die Routen laufen in der Simulation** (`src/sim/`), nicht in der Oberfläche:
- Sie arbeiten dann auch bei 4×, wenn ein anderer Tab offen ist, und in Headless-Tests.
- Die Regel „UI und KI gehen über `actions.ts`“ bleibt erfüllt – die Route ist nur ein weiterer Aufrufer.
- Neue Daten: `Company.automation` (Stufe 0–3) und `World.routes: Route[]` mit `{ id, owner, from, to, good, amount, refillBelow, ship, active, pausedReason, trips, delivered }`; `Ship.route` markiert Linienschiffe. Alte Spielstände laden mit „keine Routen“.
- Neue Aktionen: `buyAutomation`, `addRoute`, `setRouteActive`, `removeRoute`; neuer Schritt `routesTick(w)` in `step()` direkt vor der KI.

Verworfene Alternative: die Prüfung in der Oberfläche nach jedem Tag (`game.ts`). Weniger Code, aber sie liefe nicht in Tests und nicht in der Beobachtungsseite, und Spiellogik gehört nach Projektregel in die Simulation.

## Bewusst nicht enthalten (erste Version)

- **Lieferungen an Terra oder fremde Firmen.** Routen bedienen nur eigene Ketten. Automatischer Verkauf an Terra würde das Spiel zu sehr selbst spielen lassen.
- **Ware zukaufen.** Eine Route liefert nur aus eigenen Anlagen.
- **Mehrere Schiffe pro Route** und Zuladen fremder Ladung auf Linienschiffe.
- **KI-Firmen kaufen das Upgrade nicht** (sie sind ohnehin automatisch).

## Entscheidungen (Rocco, 2026-11-12)

| Frage | Entscheidung |
|---|---|
| Stufen und Preise | drei Stufen: 2,5 / +4 / +6 Mio Cr für 1 / 3 / 6 Routen, 1.500 Cr pro Route und Tag – hohe Ziele verlängern den Spielspaß; Werte in `config.json` |
| Kaufbedingung | ab 5 eigenen Anlagen, Barkapital, **schuldenfrei** (alle Stufen) |
| Linienschiff | **fest zugeordnet**: fährt nur diese Route, erscheint nicht in den Liefer-Dialogen, Abzeichen in der Flotte; zurück durch Pausieren oder Löschen der Route |
| Auslöser | Menge an der Quelle frei **und** Platz am Ziel **und** Lager am Ziel unter der **Nachschubgrenze** (Vorgabe: Hälfte der Kapazität, im Dialog änderbar) |
| Name | **Logistikzentrale I / II / III**, die Routen heißen **Lieferrouten**, die Schiffe **Linienschiffe** |
