# Dynacorp 2092

Ein nichtkommerzielles Weltraum-Wirtschaftsspiel für Android, inspiriert von **Dynatech (1992)** von eleven Software / Magic Bytes.

Im Jahr 2092 sind die Rohstoffe der Erde erschöpft. Als Unternehmer kaufst du bei DYNATECH Förderanlagen, Fabriken und Frachter, baust Produktionsketten über 20 Kolonien auf und konkurrierst mit 20 KI-Firmen um Aufträge an der Frachtbörse – in Echtzeit, ohne Kampf, mit Kooperation als Kern.

> Fanprojekt ohne Gewinnabsicht. Kein Code, keine Grafik, keine Musik und keine Texte des Originals. Alle Planeten, Firmen und Werte sind neu entworfen und nur am Original orientiert.

**Live:** [poundah-bit.github.io/Dynacorp---2092](https://poundah-bit.github.io/Dynacorp---2092/) – spielbarer Prototyp, wird bei jedem Push auf `main` neu gebaut. Der [Beobachtungsmodus](https://poundah-bit.github.io/Dynacorp---2092/observe.html) lässt 20 KI-Firmen allein spielen.

## Stand: Phase 1 – spielbarer Prototyp

| Phase | Inhalt | Status |
| --- | --- | --- |
| 0 | Spieldaten als JSON, Wirtschaftskern ohne Grafik, Tests | ✅ fertig |
| 1 | Spielbarer Prototyp: ein Spieler gegen 3 KI-Firmen, schlichte Listen-Oberfläche | ✅ gebaut, Test auf echtem Tablet offen |
| 2 | Volle Wirtschaft und Balancing | offen |
| 3 | Touch-Oberfläche (Tabs, Sternkarte, Tutorial) | offen |
| 4 | Veröffentlichung als PWA und APK | offen |

Was bisher drin ist:

- **Spiel** (`index.html`, `src/ui/`): Du gegen 3 KI-Firmen. Sechs Tabs – Terra (Bank, DYNATECH, Werft), Anlagen, Flotte, Börse, Aufträge, Statistik –, Zeitsteuerung (Pause, 1×, 2×, 4×), Autosave. Ein Hinweiskasten „Nächster Schritt“ führt durch das Handbuch-Beispiel: Kredit → Ölförderanlage → Frachter → erster Auftrag.
- **Daten** (`src/data/`): 18 Waren, 17 Anlagen, 19 Frachter, 21 Welten, 15 Lager, Kredit- und Balancing-Parameter, 20 KI-Firmen.
- **Simulation** (`src/sim/`): Produktion mit Lagergrenzen und Verschleiß, Markt nach Angebot und Nachfrage, Warennachfragen und Transportaufträge (eigen und öffentlich), Flotte mit Flugzeiten und Zustand, Bank mit Verzug und Pfändung, Gravo-Stürme, Firmenindex, Bankrott und Wirtschaftskollaps, KI-Firmen.
- **Tests** (`tests/`): Datenprüfung, Handbuch-Ablauf, Aufträge, Bank, Determinismus, das Balancing-Tor (200 Tage ohne Kollaps auf allen Schwierigkeitsgraden) und das Phase-1-Tor (die Hilfe im Spiel führt gegen 3 KI-Firmen bis zum ersten bezahlten Auftrag).
- **Beobachtungsmodus** (`observe.html`): lässt die 20 KI-Firmen allein spielen und zeigt Rangliste, Kurse, Anlagen und Ticker.

## Loslegen

```bash
npm install
npm test            # alle Tests
npm run sim         # Headless-Lauf über 200 Tage mit Balancing-Report
npm run sim -- 300 7 hard   # Tage, Seed, Schwierigkeit
npm run dev         # Spiel im Browser (Beobachtungsmodus unter /observe.html)
npm run build       # Build nach dist/
```

Das vollständige Spielkonzept steht in [docs/konzept.md](docs/konzept.md).

## Architektur in einem Satz

Der Wirtschaftskern (`src/sim/`) ist reines, deterministisches TypeScript ohne DOM: `step(world)` rückt einen Spieltag vor, und alle Spielzüge laufen über die Funktionen in `actions.ts` – für den Spieler genauso wie für die KI.

## Lizenz

Code unter [MIT](LICENSE). „Dynatech“ ist ein Werk von eleven Software / Magic Bytes; dieses Projekt ist davon inspiriert, aber nicht damit verbunden.
