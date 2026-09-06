---
date: 2026-09-06T19:19:52+00:00
git_commit: 203297d0ddc28e4507129878f28891a7947441ea
branch: main
story: SLN-004
topic: "Abstaende fuer den Finger, Sicherung hinter einem Dialog"
tags: [plan, ui, styles, settingsView, dialog, accessibility]
status: ready
---

# PLAN: SLN-004 — Abstaende fuer den Finger, Sicherung hinter einem Dialog

Das offene Item „Optionsmenue ueberarbeiten" aus `docs/notes.txt` umsetzen. Zwei
Aenderungen, die dasselbe Ziel haben — die Oberflaeche wieder erkundbar machen:

1. **Mehr Abstand zwischen zwei Bedienpunkten, in der ganzen App.** Heute liegen
   zwei gestapelte Knoepfe 8 px auseinander, auf dem Geraet rund 1,3 mm. Beim
   Erkunden mit dem Finger ist das kein Zwischenraum, sondern eine Kante: Der
   Finger ueberquert sie ohne Pause und landet auf dem Nachbarn.
2. **Die vier Sicherungswege wandern in einen Unterdialog.** „Sicherung" ist
   der laengste Abschnitt der Einstellungen — elf Stationen im Wischweg, auch
   dann, wenn nur der Kegelwinkel geaendert werden soll.

Der Anlass ist eine Nutzermeldung nach dem Praxistest: „Die Menues wirken zu
vollgestopft, beim Streichen lande ich oft daneben." Der Finger ist der
fuehrende Grund, das Auge der zweite.

Massgeblich fuer die fachlichen Entscheidungen bleibt `docs/design.md`; dieser
Plan ergaenzt sie dort, wo neue Entscheidungen fallen.

## Acceptance Criteria

### Abstaende

- Ein Token in `src/ui/styles.css` traegt den Abstand fuer die ganze App; er
  ist an einer Stelle aenderbar.
- Zwei gestapelte Bedienpunkte (Dialoge, Einstellungen) liegen 20 px
  auseinander statt 8 px.
- In einer Listenzeile liegen Namensknopf und Gluehbirne 20 px auseinander
  statt 8 px.
- Der senkrechte Abstand zweier Listenzeilen bleibt bei 22 px wie heute.
- Die Tab-Leiste bleibt in Hoehe und Aufteilung **unveraendert** (6 px
  zwischen vier Tabs, gleiche Gesamthoehe wie vor der Aenderung).
- Ein Label klebt weiterhin an seinem Feld (4 px); der Zuwachs liegt ueber dem
  Label.
- Abschnittsueberschriften (`h3`) bleiben als Einschnitt erkennbar: mehr Luft
  ueber einer Ueberschrift als zwischen zwei Knoepfen.
- Trefferflaechen bleiben unveraendert gross (Knopf mindestens 52 px hoch,
  Symbolknopf 52 x 52).
- Der schwebende Anhalten-Knopf und die angeheftete Statusleiste stehen
  weiterhin dort, wo sie heute stehen.

### Unterdialog „Daten speichern / laden"

- Die Einstellungen zeigen unter der Ueberschrift **„Daten"** nur noch das
  Datum der letzten Sicherung und einen Knopf **„Daten speichern / laden"**.
- Der Knopf oeffnet einen modalen Dialog gleichen Namens mit allen vier Wegen:
  als Datei sichern, in die Zwischenablage kopieren, Sicherungsdatei einlesen,
  Sicherung als Text einlesen.
- Der Warnsatz „Orte und Gruppen liegen nur auf diesem Geraet. Es gibt keine
  zweite Kopie." steht im Dialog.
- Beim Oeffnen liegt der Fokus auf „Als Datei sichern"; das Textfeld ist leer.
- Der Dialog bleibt nach jeder der vier Handlungen offen; jede Meldung — Erfolg
  wie Fehler — steht in seiner eigenen Statuszeile.
- „Schliessen" beendet den Dialog, der Fokus kehrt auf „Daten speichern /
  laden" zurueck.
- Nach dem Schliessen nennt das Panel das aktualisierte Sicherungsdatum.
- Fehler aus den Einstellungen selbst (fehlgeschlagenes Speichern des
  Kegelwinkels) landen weiter in der Meldungszeile des Panels.
- Der Wischweg der Einstellungen wird kuerzer: **8 Bedienpunkte werden 4**
  (zwei Auswahlraeder, Ankreuzfeld, Oeffner), **rund 20 Stationen werden 12**
  (Ueberschriften und Hinweiszeilen mitgezaehlt, die VoiceOver ebenfalls
  anlaeuft).
- `src/main.ts` bleibt unveraendert.

## Technical Key Decisions and Tradeoffs

1. **Ein Abstandstoken statt Einzelwerte:** `--abstand: 20px` in `:root`.
   - Why: „An einer Stelle nachjustierbar" war die Vorgabe; nach dem
     Praxistest ist der Wert eine Zeile. 20 px sind auf dem Geraet rund
     3,2 mm — beim Streichen eine spuerbare Pause, ohne dass ein Ort weniger
     auf den Bildschirm passt.
   - Impact: Der Abstand muss je Zusammenhang an **genau eine** Stelle —
     Knopfrand im Stapel, Zeilenpolster in der Liste, `gap` in der Zeile.
     Sonst addieren sich zwei Quellen wie heute (8 + 4 + 2 + 8 = 22).

2. **Listen behalten ihre 22 px, die Quelle wechselt:** Das Polster wandert vom
   Knopfrand ans `li`.
   - Why: Die Listen fuehlen sich richtig an — die Meldung nennt Einstellungen
     und Dialoge, nicht die Ortsliste. Geaendert wird nur, dass ihr Abstand
     nicht mehr am globalen Knopfrand haengt.
   - Impact: `.entries li` traegt 10 px oben und unten, die Knoepfe darin
     tragen keinen Rand mehr. Ohne diesen Tausch waeren es nach der Anhebung
     20 + 2 + 4 + 20 = 46 px.

3. **`h3` bekommt mehr als das Token (30 px):** Abschnittsgrenzen bleiben
   staerker als Elementgrenzen.
   - Why: Bei gleichem Wert fallen die Raender zusammen und ein Themenwechsel
     saehe aus wie der naechste Knopf. Heute traegt genau dieser Unterschied
     (20 gegen 8) die Gliederung.
   - Impact: Ein abgeleiteter Wert (`calc(var(--abstand) * 1.5)`) statt eines
     zweiten Tokens.

4. **Die Tab-Leiste ist ausgenommen — und muss dafuer aktiv festgehalten
   werden.**
   - Why: Eine geschlossene Reihe ohne Zwischenraum; der Finger landet immer
     auf einem Tab, nie im Nichts, und VoiceOver sagt beim Ueberstreichen
     jeden an. Danebenlanden heisst hier „ein Tab weiter", nicht „falsche
     Handlung ausgeloest". Abstand kostet dort nur Breite, die
     „Einstellungen" schon heute fehlt.
   - Impact: `.tab` ist ein `button` **und** ein Flex-Kind — Raender fallen
     dort nicht zusammen. Ohne `margin: 0` waechst die angeheftete Leiste um
     24 px. Das kompensierende Polster wandert an `.tablist`.

5. **Der Dialog bleibt nach jeder Handlung offen, die Meldung in seiner
   Zeile.**
   - Why: Vier Werkzeuge, kein Formular — sichern als Datei *und* zusaetzlich
     in die Zwischenablage ist ein sinnvoller Doppelgriff. Fehler zwingen
     ohnehin zum Offenbleiben; schloesse Erfolg und Misserfolg nicht, muesste
     man aus dem Zustand des Dialogs erschliessen, was passiert ist. Es ist
     das Muster des Gruppen-Dialogs (`design.md` 6.6).
   - Impact: `SettingsView.report()` bekommt dieselbe Weiche wie
     `LocationsView.report()` — offener Dialog zuerst, sonst Panel.

6. **Das Sicherungsdatum bleibt im Panel, nicht im Dialog.**
   - Why: `design.md` 7 legt es ausdruecklich in die Einstellungen („Kein
     Noergel-Dialog"); hinter einem Dialog saehe es niemand mehr, und genau
     das ist sein Zweck.
   - Impact: Nach dem Sichern bestaetigt die Dialogzeile die Handlung, das
     Datum aktualisiert sich dahinter und steht beim Schliessen da.

7. **`src/main.ts` bleibt unberuehrt.** Die Rueckrufe `onExportFile`,
   `onExportClipboard`, `onImport` und `onChange` aendern sich nicht.
   - Why: Der Umzug ist eine Frage der Darstellung, nicht der Verdrahtung.
   - Impact: Auch `markBackedUp()` funktioniert unveraendert — es ruft
     `setSettings()` und `report()`, und `report()` findet den offenen Dialog
     selbst.

8. **Der Knopfname behaelt den Schraegstrich.** Nutzerentscheidung.
   - Why: Der Einwand ist genannt und abgewogen — VoiceOver spricht den
     Schraegstrich je nach Interpunktions-Einstellung mit („Daten speichern
     Schraegstrich laden"). Der Nutzer hat den Namen danach bestaetigt.
   - Impact: Der Name steht in einer Konstante, damit Knopf und Dialogtitel
     nicht auseinanderlaufen. Sollte sich der Schraegstrich am Geraet stoerend
     lesen, ist es eine Zeile.

9. **Kein jsdom, keine DOM-Tests.**
   - Why: Drei Entwicklungspakete sind eine bewusste Eigenschaft dieses
     Projekts (`design.md` 9); eine vierte Abhaengigkeit fuer ein paar
     CSS-Regeln und einen Dialog ist ein schlechter Tausch. Der massgebliche
     Test ist ohnehin die Bedienung mit VoiceOver am Geraet (`design.md` 3).
   - Impact: Die Abnahme der Abstaende und des Dialogs ist manuell; automatisch
     laufen `typecheck`, `test` und `build`.

## Current State

Die Abstaende entstehen heute an drei verschiedenen Stellen. Deshalb sind es im
Stapel 8 px und in der Liste 22 px, ohne dass irgendwo eine Zahl „22" steht:

```
Knopfstapel (Dialog, Einstellungen)     Listenzeile (Orte, Gruppen, Kegel)

┌──────────────────────────┐            ┌─────────────────────────────────┐
│ Aktuellen Standort spei… │            │ Bahnhof                  │▏│ 💡 │
└──────────────────────────┘            └─────────────────────────────────┘
   ↕  8 px                                 ↕  8 px  Knopfrand unten
   (button margin 8px 0, Raender             +  2 px  li border-top
    fallen zusammen: max(8,8) = 8)           +  4 px  li padding-top
┌──────────────────────────┐               +  8 px  Knopfrand oben
│ Koordinate speichern     │               = 22 px
└──────────────────────────┘            ┌─────────────────────────────────┐
                                        │ Kiez, 4 Orte             │▏│ 💡 │
waagerecht in der Zeile:                └─────────────────────────────────┘
.entry-row { gap: 8px }
```

Betroffene Regeln in `src/ui/styles.css`:

| Selektor | heute | Wirkung |
|---|---|---|
| `button` | `margin: 8px 0` | 8 px im Stapel; wirkt auch auf `.tab` und `.entry` |
| `.icon-button` | `margin: 0` | Kopf- und Zeilensymbole tragen keinen Rand |
| `.entries li` | `border-top: 2px`, `padding-top: 4px` | Trennlinie plus 4 px |
| `.entry-row` | `gap: 8px` | waagerecht zwischen Name und Gluehbirne |
| `.tablist` | `padding: calc(6px + safe-area) 0 8px`, `gap: 6px` | zusammen mit dem Knopfrand 14 px oben / 16 px unten |
| `label` | `margin: 12px 0 4px` | Label klebt an seinem Feld |
| `.check` | `margin: 10px 0` | Ankreuzfeld-Zeile |
| `h3` | `margin: 20px 0 8px` | Abschnittsgrenze, heute deutlich groesser als 8 px |

Der Bereich Einstellungen (`src/ui/settingsView.ts`). Rechts die Zaehlung:
`B` = Bedienpunkt, jede Zeile ist zugleich eine Station im Wischweg, weil
VoiceOver auch Ueberschriften und Hinweiszeilen anlaeuft:

```
h2  Einstellungen                                                    Station
h3  Sichtkegel                                                       Station
    label "Oeffnungswinkel"                                          Station
    select                                                        B  Station
    label "Groesste Entfernung"                                      Station
    select                                                        B  Station
h3  Signale                                                          Station
    hint "Der Ton ist bei gestelltem Lautlos-Schalter …"              Station
    [x] Ton bei Ein- und Austritt                                 B  Station
h3  Sicherung                                                        Station
    hint "Orte und Gruppen liegen nur auf diesem Geraet …"            Station
    status "Zuletzt gesichert: 5. September 2026, 21:40"              Station
    [ Als Datei sichern ]                                         B  Station
    [ In die Zwischenablage kopieren ]                            B  Station
    label "Sicherungsdatei einlesen"                                 Station
    input[type=file]                                              B  Station
    label "Oder Sicherung als Text einfuegen"                        Station
    hint  "Den kopierten Text hier einfuegen und dann …"              Station
    textarea                                                      B  Station
    [ Sicherung einlesen ]                                        B  Station
    status (Meldungszeile, still solange leer)                       —

                                                    8 Bedienpunkte, 20 Stationen
```

Elf der zwanzig Stationen gehoeren allein der Sicherung — auch dann, wenn nur
der Kegelwinkel geaendert werden soll.

Die Rueckrufe der Ansicht (`SettingsViewCallbacks`) sind in `src/main.ts`
verdrahtet: `onExportFile` baut einen Blob und klickt einen `<a download>`,
`onExportClipboard` schreibt in die Zwischenablage, `onImport` liest die
Sicherung ein und meldet die Zusammenfassung. Alle drei melden ueber
`settingsView.report()` in **eine** Zeile am Ende des Panels; `markBackedUp()`
setzt zusaetzlich das Sicherungsdatum.

Zum Vergleich das Muster, dem der neue Dialog folgt — `LocationsView.report()`
schickt jede Meldung in die Zeile des obersten offenen Dialogs, sonst in die des
Panels, weil die Panel-Zeile hinter dem modalen Hintergrund weder zu sehen noch
zu erswipen waere (`design.md` 6.4).

## Desired End State

Abstaende: eine Quelle je Zusammenhang, alle am selben Token.

```
:root { --abstand: 20px; }

Knopfstapel        button        margin: var(--abstand) 0        → 20 px
Listenzeile senkr. .entries li   padding: calc(--abstand / 2) 0  → 10+2+10 = 22 px
                   .entries li button  margin: 0                  (Quelle entfaellt)
Listenzeile waagr. .entry-row    gap: var(--abstand)             → 20 px
Label ueber Feld   label         margin: var(--abstand) 0 4px    → 20 px / 4 px
Ankreuzfeld        .check        margin: var(--abstand) 0        → 20 px
Abschnitt          h3            margin: calc(--abstand*1.5) 0 8px → 30 px oben
Tab-Leiste         .tab          margin: 0                        (ausgenommen)
                   .tablist      padding gleicht die 8 px aus     (Hoehe wie heute)
Anhalten-Knopf     .freeze       unveraendert                     (traegt .icon-button)
```

Einstellungen nach dem Umzug — 4 Bedienpunkte, 12 Stationen (die elf der
Sicherung sind zu dreien geworden: Ueberschrift, Datum, Oeffner):

```
Einstellungen (Panel)                    Dialog "Daten speichern / laden"
┌──────────────────────────────┐         ┌──────────────────────────────┐
│ Einstellungen                │         │ Daten speichern / laden      │
│                              │         │                              │
│ Sichtkegel                   │         │ Orte und Gruppen liegen nur  │
│ Oeffnungswinkel              │         │ auf diesem Geraet. Es gibt   │
│ [plus minus 20 Grad      ▾]  │         │ keine zweite Kopie.          │
│ Groesste Entfernung          │         │                              │
│ [unbegrenzt              ▾]  │         │ [ Als Datei sichern        ] │ ← Fokus
│                              │         │                              │
│ Signale                      │         │ [ In die Zwischenablage …  ] │
│ Der Ton ist bei gestelltem…  │         │                              │
│ [x] Ton bei Ein- und Austritt│         │ Sicherungsdatei einlesen     │
│                              │         │ [ Datei waehlen            ] │
│ Daten                        │         │                              │
│ Zuletzt gesichert:           │         │ Oder Sicherung als Text      │
│ 5. September 2026, 21:40     │         │ einfuegen                    │
│                              │         │ Den kopierten Text hier …    │
│ [ Daten speichern / laden  ] │────────▶│ [__________________________] │
│                              │         │                              │
│ (Meldungszeile des Panels)   │         │ [ Sicherung einlesen       ] │
└──────────────────────────────┘         │                              │
                                         │ (Meldungszeile des Dialogs)  │
                                         │                              │
                                         │ [ Schliessen               ] │
                                         └──────────────────────────────┘
```

Wege der Meldungen danach:

```
                        backupDialog offen?
                         ┌────────┴────────┐
                       ja│                 │nein
                         ▼                 ▼
                 backupFeedback         feedback
                 (im Dialog)            (im Panel)
                         └────────┬────────┘
                                  ▼
                        announcer.announce()

"Sicherung als Datei erstellt."          → Dialog
"Die Zwischenablage war nicht erreichbar." → Dialog
"3 Orte ergaenzt, 1 waren schon vorhanden." → Dialog
"Speichern fehlgeschlagen." aus onChange   → Panel
"Speichern fehlgeschlagen." aus onImport   → Dialog

Die letzten beiden zeigen: Die Weiche entscheidet nach dem Zustand des
Dialogs, nie nach dem Text. Dieselbe Meldung landet je nach Herkunft an
verschiedenen Stellen - und beide Male dort, wo sie zu hoeren ist.
```

## Abstractions and Code Reuse

Nichts Neues wird erfunden. Der Dialog ist der vorhandene `ModalDialog`, die
Meldungsweiche ist das Muster aus `LocationsView.report()`, der oeffnende Knopf
ist ein gewoehnlicher `button` im Panel (kein Symbolknopf im Kopf — der Kopf der
Einstellungen hat keine `panel-head`, und ein Plus haette hier keine Bedeutung).

- `src/ui`
  - `styles.css` — Abstandstoken, acht angepasste Regeln, eine neue
    - `:root` — neues `--abstand: 20px`
    - `button`, `.entries li`, `.entry-row`, `label`, `.check`, `h3` — Werte
      ans Token
    - `.tab`, `.tablist` — Ausnahme festhalten, Hoehe der Leiste erhalten
    - neu `.entries li button` — Rand aus, das Polster traegt jetzt das `li`
  - `settingsView.ts` — Sicherung in einen `ModalDialog`
    - `SettingsView` — neue Felder `backupDialog`, `backupButton`,
      `exportFileButton`, `backupFeedback`. „Schliessen" bleibt eine lokale
      Konstante wie `closeCreate` in den anderen Ansichten - nur der
      Erstfokus muss festgehalten werden
    - `report()` — Weiche: offener Dialog vor Panel
    - neu `openBackup()` — Textfeld und Meldungszeile leeren, Dialog oeffnen,
      Fokus auf „Als Datei sichern"
    - `panel` — „Sicherung"-Block ersetzt durch `h3 Daten`, Datumszeile,
      Oeffner-Knopf; Dialog haengt wie in den anderen Ansichten im Panel
    - `SettingsViewCallbacks` — **unveraendert**
  - `dialog.ts`, `dom.ts`, `announcer.ts` — unveraendert
- `src`
  - `main.ts` — **unveraendert**
- `docs`
  - `design.md` — 3 (Abstand), 5 (Tabelle Einstellungen), 7 (Dialog),
    12 (Entscheidungen 36 und 37)
  - `notes.txt` — „Optionsmenue ueberarbeiten" von TODO nach DONE

Zwei Fallstricke, die im Stylesheet schon dokumentiert sind und hier gelten:

- **`.tab` ist ein Flex-Kind.** Raender fallen zwischen Flex-Kindern nicht
  zusammen. Der globale Knopfrand wirkt dort heute als 8 px oben *und* unten
  innerhalb der angehefteten Leiste; ohne `margin: 0` waechst sie um 24 px.
- **`.entry-row` ist ein Flex-Container.** Dieselbe Regel — deshalb traegt der
  Namensknopf dort heute seine vollen 8 px oben und unten, waehrend im Stapel
  die Raender zusammenfallen.
- **`.freeze` ist geprueft und braucht nichts** — der Punkt steht hier, damit
  ihn niemand spaeter „repariert". Bei `position: fixed` mit gesetztem `bottom`
  ginge ein Rand in die Offset-Rechnung ein, der Knopf wanderte also mit dem
  Token nach oben. Er traegt aber `class="icon-button freeze"`, und
  `.icon-button { margin: 0 }` schlaegt als Klassenregel den Element-Selektor
  `button`. Sein Rand ist heute null und bleibt es. `bottom` bleibt
  unveraendert.

## Logging & Observability

Keine. Die App hat kein Logging; ihre Rueckmeldung ist die Ansage. Neu ist
allein, dass die vorhandenen Meldungen bei offenem Dialog in dessen Statuszeile
laufen statt in die des Panels.

## Implementation

### Phase 1: Abstaende fuer den Finger

Dependencies: None.

Ein Token, acht angepasste Regeln, eine neue. Ziel ist, dass zwei
Bedienpunkte ueberall dort, wo sie ohne Zwischenraum aneinanderstossen,
20 px auseinander liegen — bei unveraenderter Listendichte, unveraenderter
Tab-Leiste und unveraenderten Trefferflaechen.

**Tasks**:

- [ ] Token in `:root` in `src/ui/styles.css` ergaenzen, mit Begruendung im
      Kommentar (Erkundung mit dem Finger, nicht Optik).
  ```css
  /*
   * Abstand zwischen zwei Bedienpunkten. Kein Geschmackswert: Bei 8 px - rund
   * 1,3 mm auf dem Geraet - ueberquert der erkundende Finger die Grenze ohne
   * Pause und landet auf dem Nachbarn (docs/design.md 3).
   */
  --abstand: 20px;
  ```
- [ ] `button { margin: 8px 0 }` auf `margin: var(--abstand) 0` umstellen.
- [ ] `.tab { margin: 0 }` ergaenzen und `.tablist`-Polster auf
      `calc(14px + env(safe-area-inset-top)) 0 16px` anheben, damit die
      angeheftete Leiste exakt so hoch bleibt wie heute (6 + 8 oben,
      8 + 8 unten). Kommentar: Die Leiste ist von der Anhebung bewusst
      ausgenommen.
- [ ] `.entries li` auf `padding: calc(var(--abstand) / 2) 0` umstellen
      (`border-top` bleibt) und `.entries li button { margin: 0 }` ergaenzen.
      Kommentar: Der Zeilenabstand haengt am `li`, nicht am Knopf darin —
      sonst zaehlte er doppelt.
- [ ] `.entry-row { gap: var(--abstand) }` — waagerecht zwischen Namensknopf
      und Gluehbirne.
- [ ] `.freeze` **nicht** anfassen — der Knopf traegt `icon-button freeze`,
      und `.icon-button { margin: 0 }` schlaegt als Klassenregel den
      Element-Selektor `button`. Sein Rand ist schon heute null, `bottom`
      bleibt wie es ist. Nur pruefen, dass er nach der Aenderung unveraendert
      steht.
- [ ] `label { margin: var(--abstand) 0 4px }` — die 4 px unten bleiben, damit
      das Label an seinem Feld klebt.
- [ ] `.check { margin: var(--abstand) 0 }`.
- [ ] `h3 { margin: calc(var(--abstand) * 1.5) 0 8px }` mit Kommentar: Ein
      Abschnittswechsel muss groesser sein als ein Elementwechsel, sonst
      fallen die Raender zusammen und die Gliederung verschwindet.
- [ ] `docs/design.md` Abschnitt 3 um einen Aufzaehlungspunkt zum Abstand
      ergaenzen: 20 px zwischen zwei Bedienpunkten, Begruendung Fingererkundung,
      ein Token, Tab-Leiste ausgenommen und warum.
- [ ] `docs/design.md` Abschnitt 12 um Entscheidung 36 ergaenzen:
      „Abstand zwischen zwei Bedienpunkten auf 20 px, als ein Token; Tab-Leiste
      ausgenommen — Nutzerentscheidung nach dem Praxistest: beim Erkunden mit
      dem Finger war 8 px keine Grenze, sondern eine Kante. Die Leiste ist eine
      geschlossene Reihe; dort kostet Abstand nur Breite."
- [ ] `docs/notes.txt`: Zeile in der DONE-Liste ergaenzen (Abstand 20 px,
      Token, Tab-Leiste ausgenommen, Listendichte unveraendert).

**Automated Verification**:

- [ ] `npm run typecheck` laeuft ohne Fehler.
- [ ] `npm run test` laeuft vollstaendig gruen (Domaene und Anwendung sind von
      der Aenderung nicht betroffen — der Lauf belegt genau das).
- [ ] `npm run build` erzeugt ein Bundle ohne Fehler.
- [ ] `grep -n "margin: 8px 0;" src/ui/styles.css` findet nichts mehr — der
      Knopfrand war die einzige Fundstelle dieser Schreibweise (Zeile 145);
      `margin: 8px 0 0` an `.entries` bleibt bewusst stehen.

**Manual Verification**:

- [ ] Am Geraet mit VoiceOver ueber den Dialog „Neuen Ort anlegen" streichen:
      Zwischen „Aktuellen Standort speichern" und „Koordinate speichern" ist
      eine Pause spuerbar; der Finger landet nicht mehr ungewollt auf dem
      Nachbarknopf.
- [ ] Ortsliste: Der Abstand zweier Zeilen fuehlt sich an wie vorher; zwischen
      Namensknopf und Gluehbirne derselben Zeile ist jetzt eine spuerbare
      Luecke.
- [ ] Tab-Leiste: gleiche Hoehe wie vorher, „Einstellungen" bricht nicht
      staerker um, alle vier Tabs sind wie gewohnt zu treffen.
- [ ] Navigation starten: Der schwebende Anhalten-Knopf und die angeheftete
      Statusleiste stehen unveraendert, der letzte Listeneintrag wird nicht
      verdeckt.
- [ ] Einstellungen: Die drei Abschnitte sind sehend weiterhin als Bloecke
      erkennbar — ueber einer Ueberschrift ist mehr Luft als zwischen zwei
      Knoepfen.

### Phase 2: Unterdialog „Daten speichern / laden"

Dependencies: Phase 1 (der Dialog wird gleich mit den neuen Abstaenden
abgenommen; fachlich unabhaengig).

Die vier Sicherungswege ziehen aus dem Panel in einen modalen Dialog. Im Panel
bleiben Ueberschrift, Sicherungsdatum und der oeffnende Knopf.

**Tasks**:

- [ ] In `src/ui/settingsView.ts` eine Konstante fuer den Namen anlegen, damit
      Knopf und Dialogtitel nicht auseinanderlaufen:
  ```ts
  // Knopf und Dialog tragen denselben Namen - VoiceOver sagt den Titel beim
  // Oeffnen an, ein anderer Name klaenge, als sei man woanders gelandet.
  const BACKUP_TITLE = 'Daten speichern / laden';
  ```
- [ ] Die vorhandenen fuenf Bedienelemente unveraendert lassen
      (`exportFile`, `exportClipboard`, `importFileField`, `importField`,
      `importButton` — vier Wege, aber fuenf Knoten: der Textweg braucht Feld
      und Knopf) und `exportFile` als Feld `exportFileButton` festhalten — es
      traegt beim Oeffnen den Fokus.
- [ ] Neue Felder `backupFeedback` (`p.status` mit `role="status"`) und
      `backupDialog` (`ModalDialog`, id `sicherung`, Titel `BACKUP_TITLE`)
      anlegen; „Schliessen" bleibt eine lokale Konstante wie `closeCreate` in
      `locationsView.ts` — auf ihn muss spaeter nichts zugreifen. Reihenfolge im Dialog: Warnsatz, „Als Datei sichern",
      „In die Zwischenablage kopieren", Label + Dateiauswahl, Label + Hinweis +
      Textfeld, „Sicherung einlesen", Meldungszeile, „Schliessen".
      Die Meldungszeile steht **vor** „Schliessen": Sie muss erreichbar sein,
      bevor der Weg aus dem Dialog kommt.
- [ ] `backupButton` anlegen (`button` mit Text `BACKUP_TITLE`), Klick ruft
      `openBackup()`.
- [ ] `openBackup()` ergaenzen:
  ```ts
  private openBackup(): void {
    // Leeren wie beim Anlegen-Dialog: Ein stehen gebliebener Text aus einer
    // frueheren Sitzung liesse sich versehentlich ein zweites Mal einlesen.
    this.importField.value = '';
    setText(this.backupFeedback, '');
    this.backupDialog.open(this.backupButton, this.exportFileButton);
  }
  ```
- [ ] `report()` auf die Weiche umstellen — dasselbe Muster wie
      `LocationsView.report()`:
  ```ts
  report(text: string): void {
    // Solange der Dialog offen ist, laege die Zeile des Panels hinter dem
    // modalen Hintergrund - weder zu sehen noch zu erswipen (design.md 6.4).
    setText(this.backupDialog.isOpen ? this.backupFeedback : this.feedback, text);
    this.announcer.announce(text);
  }
  ```
- [ ] Panel neu zusammensetzen: Der Block ab `h3 Sicherung` wird ersetzt durch
      `h3` „Daten", `this.backupLine`, `this.backupButton`, `this.feedback`
      und `this.backupDialog.element`. Kommentar dazu: Das Datum bleibt
      **draussen** (`design.md` 7 — kein Noergel-Dialog; hinter einem Dialog
      saehe es niemand), der Warnsatz zieht mit hinein, weil er die Handlung
      begruendet.
- [ ] Pruefen, dass `renderBackupDate()` und `setSettings()` unveraendert
      bleiben und weiter in `this.backupLine` im Panel schreiben.
- [ ] Pruefen, dass `SettingsViewCallbacks` und `src/main.ts` unveraendert
      bleiben.
- [ ] `docs/design.md` Abschnitt 5, Zeile „Einstellungen" der Tabelle:
      „Kegelwinkel, max. Entfernung, Signalkanal, Datum der letzten Sicherung;
      Sichern und Einlesen hinter dem Dialog „Daten speichern / laden"".
- [ ] `docs/design.md` Abschnitt 7 um einen Absatz ergaenzen: Alle vier Wege
      liegen hinter einem Dialog; im Panel stehen unter „Daten" nur Datum und
      Oeffner; der Dialog bleibt nach jeder Handlung offen und meldet in seine
      eigene Zeile (vier Werkzeuge, kein Formular; Fehler zwingen ohnehin zum
      Offenbleiben); der Fokus liegt beim Oeffnen auf „Als Datei sichern".
- [ ] `docs/design.md` Abschnitt 12 um Entscheidung 37 ergaenzen:
      „Sicherung hinter dem Dialog „Daten speichern / laden", Ueberschrift
      „Daten", Datum bleibt im Panel — Nutzerentscheidung: Der Abschnitt war
      elf Stationen lang und lag bei jedem Besuch der Einstellungen im Weg.
      Der Dialog bleibt nach jeder Handlung offen, damit Erfolg und Fehler an
      derselben Stelle stehen."
- [ ] `docs/notes.txt`: „- Optionsmenue ueberarbeiten" aus der TODO-Liste
      entfernen und als `x`-Zeile in die DONE-Liste aufnehmen, mit dem
      Ergebnis in einem Satz.

**Automated Verification**:

- [ ] `npm run typecheck` laeuft ohne Fehler.
- [ ] `npm run test` laeuft vollstaendig gruen.
- [ ] `npm run build` erzeugt ein Bundle ohne Fehler.
- [ ] `git status --porcelain src/main.ts` bleibt leer (Beleg fuer
      Entscheidung 7: Der Umzug beruehrt die Verdrahtung nicht).

**Manual Verification**:

- [ ] Einstellungen mit VoiceOver von oben nach unten erswipen: zwoelf
      Stationen, die letzte ist „Daten speichern / laden"; darunter kommt
      nichts mehr, solange keine Fehlermeldung im Panel steht.
- [ ] Knopf tippen: VoiceOver sagt „Daten speichern / laden" an, der Fokus
      liegt auf „Als Datei sichern".
- [ ] „Als Datei sichern": Die Datei landet in der Dateien-App, der Dialog
      bleibt offen, die Meldung „Sicherung als Datei erstellt." steht in seiner
      Zeile und wird angesagt.
- [ ] Direkt danach „In die Zwischenablage kopieren": funktioniert ohne den
      Dialog erneut zu oeffnen.
- [ ] „Schliessen": Der Fokus steht wieder auf „Daten speichern / laden", und
      das Panel nennt das neue Sicherungsdatum.
- [ ] Sicherungsdatei ueber die Dateiauswahl einlesen: Orte und Gruppen kommen
      zurueck, die Zusammenfassung steht in der Dialogzeile.
- [ ] „Sicherung einlesen" mit leerem Textfeld: „Das Feld war leer. …" steht in
      der Dialogzeile, der Dialog bleibt offen.
- [ ] Dialog erneut oeffnen: Das Textfeld ist leer, die Meldungszeile still.
- [ ] Escape bzw. der Ruecknahmeweg ohne Tastatur schliesst den Dialog und gibt
      den Fokus an den Oeffner zurueck.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/design.md` 3 — Barrierefreiheit, fester Farbsatz, Bedienung mit
  VoiceOver als massgeblicher Test
- `docs/design.md` 5 — Interaktionsmodell, Tab-Leiste, Inhalt der Bereiche
- `docs/design.md` 6.4 — Dialoge, „Schliessen" statt „Abbrechen", Meldung
  gehoert in den offenen Dialog
- `docs/design.md` 6.6 — Gruppen-Dialog: wirkt sofort, meldet in seine Zeile,
  bleibt offen
- `docs/design.md` 7 — Sicherung auf beiden Wegen, Datum in den Einstellungen
- `docs/design.md` 9 — kein Framework, drei Entwicklungspakete
- `docs/design.md` 12 — Entscheidungen 29 (angeheftete Leiste), 30/31
  (Dialoge), 35 („Schliessen")
- `docs/notes.txt` — offenes Item „Optionsmenue ueberarbeiten"
- `src/ui/styles.css` — Abstaende, `[hidden]`-Fallstrick, Flex-Kommentare
- `src/ui/settingsView.ts` — heutiger Aufbau der Einstellungen
- `src/ui/locationsView.ts` — Muster fuer `report()` und Dialogfuehrung
- `src/ui/dialog.ts` — `ModalDialog`, Fokusrueckgabe an den Oeffner
- `src/main.ts` — Verdrahtung der Sicherungswege, `markBackedUp()`
