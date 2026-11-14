# Story-Ereignisse – Entwurf

Stand: 2026-11-14 · Status: zur Freigabe durch Rocco · Weg A (Ereignisse aus einem Baukasten), Weg B (Ausgang je nach Lieferung) folgt nach dem Test von A

## Warum

Nach einigen Stunden Spieltest auf dem Tablet wünscht sich Rocco mehr „Wuselfaktor“ und Tiefe: Phasen, in denen die Nachfrage steigt oder fällt, erzählt als kleine Geschichten. Seine Beispiele:

- eine Pandemie auf einem Planeten, der dann mehr Medikamente braucht – für die Zeit der Aktion mit Sonderpreisen;
- ein Entwicklungssprung auf Terra, der mehr Roboter verlangt, bis die Technik ausgereift ist und sich die Zahlen normalisieren.

Jeder neue Spielstart soll eine neue Erfahrung sein: die Geschichten werden **ohne Roccos Zutun automatisch erzeugt** – stimmig zur Nachfrage, weil Regeln festlegen, was zusammenpasst.

## Ziele

- Ereignisse verändern die Nachfrage nach bestimmten Waren für eine begrenzte Zeit: ansteigen, Höhepunkt, abklingen.
- Ort ist Terra oder ein anderer Planet. Ein Planet kann jetzt selbst bestellen und bezahlt wie Terra.
- Manche Ereignisse bringen einen Sonderpreis für die betroffene Ware.
- Die Geschichten entstehen pro Spiel aus dem Startwert (Seed): eigene Namen, eigene Kombinationen, eigene Texte.
- Neue Ursachen und Textvarianten lassen sich später ohne Code in den Daten ergänzen.

## Nicht-Ziele (jetzt)

- Kein Ausgang je nach Lieferung (das ist Weg B, kommt nach dem Test). Das Datenmodell zählt aber schon mit, was geliefert wurde.
- Keine Schäden an Anlagen oder Schiffen durch Stories – das machen weiter nur die Gravo-Stürme.
- Keine KI-Textgenerierung, kein Internet, keine Kosten im Spiel.
- Kein neuer Ton (bestehende Hinweise reichen für den ersten Test).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Eine Story behauptet etwas, das die Wirtschaft nicht zeigt (Medikamentenknappheit, aber keine Medikamenten-Nachfrage).
- Eine Story passt nicht zum Ort (Ernteausfall auf einer Ölwelt) oder zur Ware (Seuche → Stahl).
- Ereignisse überrollen das Spiel: mehr als zwei gleichzeitig, Dauerkrise, Wirtschaftskollaps durch eine Rezession.
- Meldungen wiederholen sich wortgleich so oft, dass sie langweilen.
- Etwas aus dem Original Dynatech (Namen, Texte), Kampf, Sabotage, Piraterie.

## Ansätze (erwogen)

| Ansatz | Bewertung |
|---|---|
| **A · Ereigniskatalog als Daten, Story-Baukasten erzeugt die Geschichten pro Spiel** | gewählt (Rocco): stimmig durch Regeln, offline, kostenlos, deterministisch pro Seed, erweiterbar ohne Code |
| B · wie A plus Ausgang je nach Lieferung (Erfolg/Misserfolg, Folge-Story) | später, nach dem Test von A (Rocco) |
| C · nur Nachfrage-Schwankungen bei Terra | verworfen: Pandemie auf einem Planeten ginge nicht |
| KI schreibt Stories beim Spielstart | verworfen: braucht Internet, API-Schlüssel ließe sich in PWA/APK nicht verstecken, offline stumm, kann Unstimmiges behaupten |

## Entscheidungen

### Ablauf eines Ereignisses

- Ein Ereignis hat **Ursache** (aus dem Katalog), **Ort**, **betroffene Waren mit Wirkung**, **Verlauf** und **Texte**.
- Verlauf: Anlauf → Höhepunkt → Abklingen; die Wirkung steigt im Anlauf linear auf den vollen Wert, bleibt am Höhepunkt und fällt im Abklingen linear auf null. Typische Dauer 30–90 Tage, je Ursache in Grenzen festgelegt.
- Zu Beginn, am Höhepunkt und am Ende erscheint je eine Meldung (Ticker Priorität 3 + Toast beim Beginn).

### Wirkungen (nur Nachfrage und Preis)

- **Terra-Nachfrage rauf/runter:** Die Bestellwahrscheinlichkeit Terras für die Ware wird mit dem aktuellen Faktor multipliziert (z. B. ×2,5 bei einem Boom, ×0,6 bei einer Rezession). Die Auftragsgröße folgt weiter der Regel aus dem Kurzentwurf „mitwachsende Terra-Aufträge“.
- **Planeten-Nachfrage:** Der Ort bestellt selbst. Bestellungen kommen wie Terra-Aufträge (gleiche Größenregel, gleiche Börse), Ziel ist der Planet, bezahlt wird aus dem Nichts wie bei Terra. Anzeige als Auftraggeber: „Bevölkerung von {Planet}“.
- **Sonderpreis:** Aufträge, die während des Ereignisses entstehen, bekommen einen Aufschlag (0–40 %, je Ursache). Sie werden an der Börse mit einem Story-Abzeichen markiert.
- Die KI behandelt Planeten-Aufträge wie Terra-Aufträge.
- **Grundrate für Planeten** (Entscheidung beim Entwurf): Planeten bestellen sonst nichts. Ihre Bestellwahrscheinlichkeit pro Ware und Tag ist `stories.planetBaseChance` (Start 0,06) × Faktor – eine Seuche mit ×3 bringt also etwa alle 5–6 Tage einen Auftrag, rund 10 über die ganze Dauer.
- **Ereignis-Nachfrage zählt für die Kurse** wie Terra-Nachfrage (`marketBalance`): ein Boom hebt den Kurs, der Sonderpreis kommt obendrauf; bei einer Flaute fängt Terras Preisstabilisator einen Teil ab – gewollt, damit keine Rezession die Wirtschaft kippt.
- **Obergrenze offener Aufträge** (`terra.maxOpenPerGood`) wächst mit dem Faktor (× aufgerundeter Faktor), sonst zeigte ein Boom bei einer Ware mit schon 3 offenen Aufträgen keine Wirkung. Für Planeten gilt dieselbe Grenze je Ort und Ware.

### Grenzen (Balance, gegen die Anti-Ziele)

- Höchstens **2 Ereignisse gleichzeitig**, höchstens **1 Rezession/Flaute** gleichzeitig.
- Erstes Ereignis frühestens ab Tag 40 (der Einstieg mit „Nächster Schritt“ bleibt ruhig); zwischen zwei Ereignisstarts 20–50 Tage Pause.
- Faktor Nachfrage 0,5–3, Sonderpreis 0–40 %, Dauer 20–120 Tage. Rezessionen erst ab Tag 250, höchstens eine je 300 Tage, Faktor nicht unter 0,6.
- **Startbedingung:** Eine Ware wird nur dann stärker nachgefragt, wenn mindestens eine Firma ein Werk dafür hat (sonst kann niemand liefern). Eine Ursache ohne passende Ware oder passenden Ort wird nicht gezogen.
- Alle Zahlen in `src/data/config.json` unter `stories`, nichts davon im Code.
- Ein Schalter **„Ereignisse“** beim neuen Spiel (Vorgabe an); aus = Spiel wie bisher. Damit kann Rocco vergleichen, und die Tore aus Phase 0–2 laufen wahlweise mit und ohne.

### Story-Baukasten (Generierung pro Spiel)

- **Wann:** Beim Spielstart wird aus dem Seed ein **Welt-Lexikon** erzeugt (für jeden Planeten eine Hauptstadt, ein Gouverneur oder eine Sprecherin, ein Forschungsinstitut, ein Spitzname). Die einzelnen Ereignisse werden erst gezogen, wenn sie beginnen – so können die Startbedingungen den Spielstand berücksichtigen. Beides läuft über `World.rng`, also wiederholbar pro Seed.
- **Bausteine** in `src/data/stories.json`:
  - Ursachen mit Kategorie (Boom, Notlage, Engpass, Flaute), erlaubten Waren, Ortsregel, Wirkungsgrenzen, Dauergrenzen, Gewicht (Häufigkeit), optional einer Bedingung (z. B. „Gravo-Sturm in den letzten 20 Tagen“).
  - Ortsregeln: `terra`, `planet` (beliebig), `planet:industrie=<Anlagentypen>`, `nahe:<Bedingung>`.
  - Namensbausteine: Silben für Erreger, Technologien, Modewellen; Muster für Institute, Städte, Personen (erfundene Vor- und Nachnamen ohne reale Personen).
  - Texte: je Ursache **mindestens 3 Varianten** für Beginn, Höhepunkt und Ende, mit Platzhaltern `{ort}`, `{stadt}`, `{person}`, `{institut}`, `{erreger}`, `{technik}`, `{ware}`, `{faktor}`, `{tage}`.
- Die Texte werden beim Ereignisbeginn fertig zusammengesetzt und im Spielstand gespeichert (sie ändern sich nach dem Laden nicht).

### Katalog der Ursachen (erste Fassung, 20)

| # | Ursache | Kategorie | Ort | Waren und Wirkung |
|---|---|---|---|---|
| 1 | Technologiesprung („{technik}“) | Boom | Terra | Roboter ↑ stark, lange; klingt langsam ab (Rocco) |
| 2 | Seuche „{erreger}“ | Notlage | Planet | Medikamente ↑ stark, Sonderpreis (Rocco) |
| 3 | Kolonisierungswelle | Boom | Terra | Maschinen, Plastikwaren, Textilien ↑ |
| 4 | Bauboom – neuer Habitatring | Boom | Planet | Stahl, Maschinen ↑ |
| 5 | Jahrhundertfest | Boom | Terra | Getränke, Nahrung ↑ stark, kurz |
| 6 | Modewelle „{mode}“ | Boom | Terra | Textilien ↑ |
| 7 | Automatisierungsprogramm | Boom | Planet mit Industrie (Fabrik, Maschinen-, Stahl-, Roboterwerk) | Roboter, Maschinen ↑ |
| 8 | Flottenausbau der Raumfahrtbehörde | Boom | Terra | Brennstoff, Stahl ↑ |
| 9 | Agrarreform | Boom | Planet mit Agro-Betrieb oder Plantage | Dünger, Chemikalien ↑ |
| 10 | Kälteeinbruch / Polarnacht | Notlage | Planet | Nahrung, Textilien, Brennstoff ↑, Sonderpreis |
| 11 | Missernte auf Terras Farmen | Notlage | Terra | Nahrung, Agrarprodukte ↑ |
| 12 | Dürre | Notlage | Planet ohne Wasserstation | Wasser ↑, Sonderpreis |
| 13 | Tierseuche | Notlage | Planet mit Zuchtfarm | Medikamente ↑ dort; Vieh ↑ auf Terra |
| 14 | Habitatschaden nach Beben | Notlage | Planet | Stahl, Maschinen, Plastikwaren ↑, Sonderpreis |
| 15 | Flüchtlinge nach Gravo-Sturm | Notlage | inneren Planet, nur nach einem Gravo-Sturm | Nahrung, Medikamente, Textilien ↑ |
| 16 | Ausfall der Erzlieferungen aus dem Asteroidengürtel | Engpass | Terra | Erz, Stahl ↑, Sonderpreis |
| 17 | Streik in Terras Raffinerien | Engpass | Terra | Brennstoff, Chemikalien ↑ |
| 18 | Rezession | Flaute | Terra | alle Endprodukte ↓ (mind. 0,6), lang, selten |
| 19 | Sparprogramm der Regierung | Flaute | Terra | Maschinen, Roboter ↓ |
| 20 | Gesundheitswelle | gemischt | Terra | Getränke ↓, Nahrung ↑, Medikamente ↑ leicht |

Optionale **Nachwehe** (einfach in A, ohne Lieferbezug): eine Ursache kann eine Folge-Ursache auslösen, z. B. nach dem Technologiesprung eine kurze Sättigung (Roboter ↓). Rocco: „bis sich die Zahlen normalisieren“ – das deckt das Abklingen schon ab; die Nachwehe ist eine Würze, nicht Pflicht.

### Beispiel, wie eine erzeugte Story aussehen soll

> **Tag 212 · Seuche auf Liora.** Im Hafen von Neu-Arvel häufen sich Fälle des Kessler-Fiebers. Gouverneurin Mira Talvén bittet um Medikamente – Liora zahlt 30 % über Kurs.
> **Tag 236 · Höhepunkt.** Das Institut für Xenomedizin Liora meldet den Höchststand. Die Nachfrage nach Medikamenten ist dreimal so hoch wie sonst.
> **Tag 268 · Entwarnung.** Das Kessler-Fieber geht zurück; Liora bestellt wieder wie gewohnt.

### Oberfläche

- **Terra-Tab:** Abschnitt „Lage in der Galaxie“ mit den laufenden Ereignissen: Titel, Ort, betroffene Waren (Icons), Phasen-Balken, Sonderpreis.
- **Börse:** Aufträge aus einem Ereignis tragen ein Story-Abzeichen (wie „Großauftrag“), langes Drücken zeigt den Story-Text.
- **Karte:** der Ort eines laufenden Ereignisses bekommt eine ruhige Markierung (Gestaltung dem Bau überlassen; „weniger Bewegung“ beachten).
- **Statistik → Nachrichten:** die drei Meldungen pro Ereignis.
- Der „Nächster Schritt“-Hinweis bleibt unverändert.

### Spielstand

- `World.stories` (laufende und beendete Ereignisse: Ursache, Ort, Waren, Faktoren, Tage, fertige Texte, gelieferte Menge für Weg B) und `World.lore` (Welt-Lexikon).
- Alte Spielstände: keine `stories` = keine laufenden Ereignisse; fehlt `lore`, wird es beim Laden aus dem Spielstand-RNG nacherzeugt. Fehlt die Einstellung, gilt „Ereignisse an“.

### Prüfung – sparsam (Rocco: Test soll wenig Aufwand/Credits kosten)

- **Generator-Test ohne Wirtschaft:** 1.000 Stories aus den Seeds 1–1.000 erzeugen und prüfen – Ware passt zur Ursache, Ort erfüllt die Regel, kein offener Platzhalter `{…}`, Wirkung und Dauer in den Grenzen, Texte nicht leer und nicht überlang, mindestens 3 Varianten je Text im Katalog. Läuft in Millisekunden, ohne Spieltage zu simulieren.
- **Ein kurzer Wirtschafts-Test:** ein erzwungenes Ereignis (z. B. Seuche), 120 Tage, ein Seed – die Nachfrage nach Medikamenten am Ort steigt und kehrt danach zurück; Planeten-Aufträge werden bezahlt.
- **Kein zusätzlicher Langlauf:** der bestehende 1.000-Tage-Test (Phase-2-Tor) läuft künftig mit eingeschalteten Ereignissen; damit sind Kollaps und Pleiten mit abgedeckt. Die Tore aus Phase 0 und 1 laufen ohne Ereignisse (sie prüfen die Grundlagen und den geführten Einstieg). `npm run balance` läuft mit Ereignissen, einmal von Hand zum Abschluss.
- Verfehlt ein Zielwert nur mit Ereignissen, werden die Ereignisse (Faktoren, Häufigkeit) nachjustiert, nicht die Grundpreise aus Phase 2.

## Reihenfolge

Erst der Kurzentwurf „Sammelladung und mitwachsende Terra-Aufträge“ (die Ereignis-Faktoren setzen auf dessen Bestellformel auf), dann die Story-Ereignisse.

## Dem Bau überlassen

- Exakte Formeln (Verteilung der Phasenlängen, Gewichte je Ursache), solange die Grenzen oben gelten.
- Formulierung aller Textvarianten (Deutsch, erfundene Namen, nichts aus dem Original).
- Gestaltung der Kartenmarkierung und des Abschnitts „Lage in der Galaxie“ im Stil von Optik Teil 1/2.
- Wie Planeten-Aufträge intern als Auftraggeber geführt werden (z. B. `requester: 'world:<planetId>'`), solange Bezahlung, KI und Anzeige wie bei Terra funktionieren.
