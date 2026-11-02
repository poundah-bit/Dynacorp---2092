# Scorched Earth Revival

Private test project with Claude Code of the classic game. No commercial use!

Eigene Version des Artillerie-Klassikers für Android-Tablets: zwei Spieler, ein Gerät, zerstörbares Gelände.
Umgesetzt als Web-App (HTML5 Canvas) und als PWA installierbar.

## Spielprinzip

- Zwei Panzer stehen auf zufällig erzeugtem Gelände und schießen abwechselnd.
- Pro Schuss stellst du **Winkel** und **Kraft** ein und drückst **FEUER**.
- Der **Wind** (oben in der Mitte) lenkt die Granate ab und ändert sich nach jedem Zug.
- Einschläge reißen Krater ins Gelände, Panzer rutschen nach.
- Ein Volltreffer macht 70 Schaden, jeder Panzer hat 100 Lebenspunkte. Wer zuerst nicht mehr kann, verliert die Runde.

## Steuerung

| Aktion | Touch | Tastatur |
| --- | --- | --- |
| Winkel ändern | Regler oder −/+ (gedrückt halten wiederholt) | ← / → |
| Kraft ändern | Regler oder −/+ | ↑ / ↓ |
| Schießen | FEUER | Leertaste / Enter |

## Lokal ausprobieren

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen.

## Auf dem Tablet spielen (GitHub Pages)

1. Im Repo auf GitHub: **Settings → Pages**.
2. Bei „Build and deployment" als Source **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, speichern.
3. Nach ca. einer Minute ist das Spiel unter `https://<dein-user>.github.io/scorched-earth-revival/` erreichbar.
4. Auf dem Android-Tablet in Chrome öffnen und über das Menü **„App installieren"** bzw. **„Zum Startbildschirm hinzufügen"** wählen. Danach startet es im Vollbild und läuft nach dem ersten Laden auch offline.

Nach Änderungen am Spiel in `sw.js` die Zahl bei `CACHE` erhöhen (z. B. `v2`), damit das Tablet die neue Version lädt.

## Projektstruktur

- `index.html`, `style.css` – Oberfläche und Steuerleiste
- `game.js` – Spiellogik (Gelände, Physik, Runden)
- `manifest.json`, `sw.js`, `icons/` – PWA

## Mögliche nächste Schritte

- Waffen und Waffenshop mit Geld zwischen den Runden
- Computergegner
- Mehr als zwei Spieler
- Fallschaden, Schutzschilde, Fallschirme
