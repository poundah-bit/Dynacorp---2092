# Sammelladung und mitwachsende Terra-Aufträge – Kurzentwurf

Stand: 2026-11-14 · Status: von Rocco freigegeben

## Warum

Aus Roccos Testrunde (Phase 3) auf dem Tablet: Im Endgame kommen Terra-Aufträge für Endprodukte nur in kleinen Portionen (Roboter 600–900 FE, Großauftrag etwa das Doppelte). Ein Stückgut-D-Frachter (55.000 FE) bleibt selbst mit 10–20 Aufträgen halb leer, und jeden Auftrag einzeln über „Transport organisieren…“ → Schiff → „Los“ zuzuladen ist mühsam.

## 1 · Knopf „Alle Lieferungen“

- Im Dialog „Transport organisieren…“ (Aufträge → „Zugesagte Lieferungen ohne Transport“, `arrangeSheet`) steht neben „Los“ ein zweiter Knopf **„Alle Lieferungen (n · Menge)“**.
- Er nimmt diese Lieferung und alle anderen zugesagten Lieferungen ohne Transport mit **gleicher Abholanlage-Planet, gleichem Ziel und gleicher Frachtart** auf die angehakten Schiffe, knappste Frist zuerst.
- Es kommen nur **ganze** Aufträge mit (die Lieferung, aus der der Dialog geöffnet wurde, darf wie bisher aufgeteilt werden); was nicht passt, bleibt in der Liste.
- Ist kein Schiff angehakt oder passt keine weitere Lieferung, ist der Knopf ausgegraut bzw. fehlt.
- „Los“ bleibt unverändert für die einzelne Lieferung (inkl. Rest öffentlich / später).
- Die Regel „gleiche Strecke“ (gleicher Start, gleiches Ziel) bleibt bestehen (Rocco).

## 2 · Terra-Bestellungen für Endprodukte wachsen mit

- Für Endprodukte zählt Terra die Werke dieser Ware bei der **Firma mit den meisten Werken (gebaute Einheiten)**: `n`.
- Auftragsmenge = Ausstoß von `n` Werken für 20–30 Tage, Großauftrag weiter ×2–4; Obergrenze bleibt das größte Schiff der Frachtart.
- Damit eine einzelne Firma den Auftrag in der Frist schafft, bleibt die Frist bei 40 Tagen.
- **Gesamtmenge bleibt gleich:** die Bestellwahrscheinlichkeit wird durch `n` geteilt (weniger, dafür größere Aufträge), damit die Balance aus Phase 2 hält.
- Mit `n ≤ 1` bleibt alles wie heute. Grundnachfrage nach Zwischenprodukten bleibt unverändert.
- Beispiel: 4 Roboterwerke → 2.400–3.600 FE, Großaufträge bis 14.400 FE.

## Ansätze (erwogen)

| Ansatz | Bewertung |
|---|---|
| Bestellmenge fest verdoppeln | verworfen: mit einem Werk in 40 Tagen nicht zu schaffen |
| nach allen Werken der Galaxie skalieren | verworfen: Aufträge würden größer als eine Firma liefern kann |
| **nach der größten Herstellerfirma skalieren** | gewählt: Endgame bekommt große Aufträge, frühes Spiel bleibt gleich |
| Mehrfahrten-Flüge mit mehreren Zielen | verworfen (Rocco): „gleiche Strecke“ bleibt |

## Prüfung

`npm test` (Phase-0/1/2-Tore) und `npm run typecheck` grün; `npm run balance` hält die Zielwerte.
