# Info-Kachel

Frei einstellbare Kacheln für Home-Assistant-Dashboards – alles im visuellen Editor: ein großer Wert
(Zustand oder Attribut einer beliebigen Entität), kleine Zeilen mit weiteren Werten darunter und ein
farbiger Rand links als Ampel. Dazu ein Container, der beliebig viele Kacheln in Reihen mit
Überschriften anordnet.

*English: Freely configurable info tiles (big value, extra lines, traffic-light border) plus a container
card with titled rows – everything in the visual editor. German user interface.*

## Karten

| Karte | Inhalt |
|---|---|
| `custom:info-kachel` | eine Kachel als eigene Karte |
| `custom:info-kachel-container` | eine oder mehrere Reihen, jede mit Überschrift und beliebig vielen Kacheln |

## Installation

1. **Einstellungen → Marketplace → Über Link hinzufügen** und `https://github.com/bryce2071/info-kachel`
   eintragen (Typ *Dashboard*), dann **Info-Kachel** herunterladen. Die Ressource trägt der Marketplace
   selbst ein.
2. Browser bzw. App einmal neu laden. Danach stehen „Info-Kachel“ und „Info-Kachel-Container“ in der
   Kartenauswahl.

## Kachel

- **Kopfzeile:** Icon und Titel (leer = Icon und Name der Entität).
- **Hauptwert:** Entität mit Suche, dazu Zustand oder Attribut – die Auswahl zeigt alle Attribute mit
  Vorschau, auch verschachtelte wie `forecast.0.temperature`; eigene Pfade lassen sich eintippen.
- **Format:** automatisch, Zahl, Text, Datum (heute, morgen, Mo 21.12.), Datum und Uhrzeit, Uhrzeit,
  relativ („in 3 T 4 h“, „vor 5 min“), Tage bis dahin. Einheit und Nachkommastellen (leer = wie die
  Entität). Schrift **automatisch** (so groß wie möglich, ohne abzuschneiden) oder **fest** in px.
- **Zeilen:** beliebig viele, je Zeile eine Beschriftung und ein Zustand oder Attribut dieser oder einer
  anderen Entität – mit eigenem Format oder als fester Text.
- **Ampel (Rand links):** nach Grenzen (Grundfarbe plus „ab Wert → Farbe“; bei Datum und Uhrzeit zählen
  die Tage bis dahin, 0,5 = 12 Stunden) oder nach Zustand (Rohwert oder angezeigter Text, „sonst“).
  Grundlage ist der Hauptwert, ein Attribut oder eine andere Entität. Farben: Grün, Orange, Rot, Blau,
  Lila, Grau oder eigene (`#hex`, `rgb()`, `var(--…)`).
- **Antippen:** Details der Entität (Standard), eine Seite oder Adresse öffnen oder nichts.
- In Abschnitts-Ansichten: Standardbreite 4 von 12 Spalten, Höhe automatisch.

## Container

- Optional Kartentitel und Icon; Reihen mit Überschrift (und Icon) und beliebig vielen Kacheln – mit
  demselben Kachel-Editor wie oben, zusätzlich „Breite in der Reihe“ (1–4 Spalten).
- **Raster:** Spalten automatisch (Mindestbreite je Kachel, Standard 140 px, über alle Reihen gleich breit
  und bündig) oder fest 1–6; „Kacheln strecken“ füllt eine Reihe mit wenigen Kacheln; Mindesthöhe.
- **Editor:** Reihen hinzufügen, umsortieren, löschen; Kacheln aufklappen und bearbeiten; mit den Pfeilen
  innerhalb der Reihe und am Rand in die Reihe davor oder danach verschieben, oder am Griff ziehen;
  kopieren, verdoppeln, ausschneiden, löschen und in jeder Reihe einfügen. Die Ablage gilt im ganzen
  Browser, also auch zwischen Karten und Dashboards.

## Beispiel

```yaml
type: custom:info-kachel-container
reihen:
  - titel: Klima
    kacheln:
      - entity: sensor.wohnzimmer_temperatur
        titel: Wohnzimmer
        nachkommastellen: 1
        zeilen:
          - label: Luftfeuchte
            entity: sensor.wohnzimmer_luftfeuchte
        ampel:
          modus: grenzen
          grund: blau
          grenzen:
            - ab: 19
              farbe: gruen
            - ab: 25
              farbe: orange
      - entity: sun.sun
        attribut: next_rising
        titel: Sonnenaufgang
        format: zeit
```

## YAML-Felder

- **Kachel:** `titel`, `icon`, `entity`, `attribut`, `format` (`auto`, `zahl`, `text`, `datum`,
  `datum_zeit`, `zeit`, `relativ`, `tage`), `einheit`, `nachkommastellen`, `schrift` (px), `zeilen`
  (`label`, `entity`, `attribut`, `format`, `einheit`, `nachkommastellen`, `text`), `ampel` (`modus`:
  `grenzen` oder `zustaende`, `entity`, `attribut`, `grund`, `grenzen` mit `ab` und `farbe`, `zustaende`
  mit `wert` und `farbe`, `sonst`), `aktion` (`mehr`, `seite`, `keine`), `pfad`, `breite` (nur im
  Container).
- **Container:** `titel`, `icon`, `spalten`, `min_breite`, `min_hoehe`, `strecken`, `reihen` (`titel`,
  `icon`, `kacheln`). Kurzform: `kacheln:` direkt ohne `reihen:` ergibt eine Reihe.

## Hinweise

- Eine Datei ohne fremde Bibliotheken; der Editor nutzt die Bausteine von Home Assistant.
- Die Karten zeichnen nur neu, wenn sich eine beteiligte Entität ändert, und einmal pro Minute (für
  relative Zeiten).
- Wer die Datei vorher von Hand eingebunden hatte (`/local/info-kachel.js`), entfernt diese Ressource
  (**Einstellungen → Dashboards → ⋮ → Ressourcen**), sonst lädt der Browser die ältere Fassung.

## Lizenz

MIT
