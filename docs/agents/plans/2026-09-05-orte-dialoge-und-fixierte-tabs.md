---
date: 2026-09-05T18:21:29+00:00
git_commit: 05d8d907f24d24701ade1957db37561a9085cd39
branch: main
story: SLN-001
topic: "Orte-Seite mit Dialogen, Tab-Leiste oben fixiert"
tags: [plan, ui, locationsView, tabs, dialog]
status: ready
---

# PLAN: SLN-001 — Orte-Seite mit Dialogen, Tab-Leiste oben fixiert

Die neuen Items aus `docs/notes.txt` umsetzen: Die Tab-Leiste bleibt beim Scrollen
oben stehen, und die Orte-Seite wird von einer Formularseite zu einer reinen Liste
mit Dialogen. Anlegen laeuft ueber ein Plus-Symbol oben rechts, Bearbeiten und
Loeschen ueber einen Dialog hinter dem Listeneintrag.

Massgeblich fuer die fachlichen Entscheidungen bleibt `docs/design.md`; dieser Plan
ergaenzt sie dort, wo neue Entscheidungen fallen.

## Acceptance Criteria

- Die Tab-Leiste bleibt beim Scrollen am oberen Rand stehen, mit deckendem Grund;
  im Standalone-Modus scrollt kein Text sichtbar unter die Statusleiste.
- Die Orte-Seite besteht nur noch aus Ueberschrift, Plus-Symbol, Meldungszeile und
  der Ortsliste. Es steht kein Anlegeformular mehr auf der Seite.
- Ein Listeneintrag ist ein `<button>`, der nur den Namen traegt; die Liste ist
  alphabetisch sortiert (deutsch, Umlaute einsortiert).
- Das Plus oben rechts oeffnet einen modalen Dialog "Neuen Ort anlegen" mit
  vorbelegtem Namen, GPS-Weg und Koordinaten-Weg.
- Der Knopf "Namen vorschlagen" existiert nicht mehr; der Vorschlag steht beim
  Oeffnen des Dialogs im Feld und ist ueberschreibbar.
- Ein Klick auf einen Eintrag oeffnet einen modalen Dialog mit Anlagedatum und
  Genauigkeit, Namensfeld, "Namen speichern", "Loeschen" und "Abbrechen".
- "Loeschen" oeffnet einen zweiten Bestaetigungsdialog; "Abbrechen" dort fuehrt
  zurueck in den Bearbeiten-Dialog, ohne etwas zu aendern.
- Erfolg schliesst den Dialog, sagt die Bestaetigung an, schreibt sie in die
  Meldungszeile des Panels und setzt den Fokus: nach Anlegen und Umbenennen auf den
  betroffenen Eintrag in der Liste, nach dem Loeschen auf das Plus.
- Fehler (leerer Name, unlesbare Koordinate, kein Standort, veralteter Fix,
  Speicher voll) halten den Dialog offen und melden darin.
- Escape schliesst den obersten Dialog; der Fokus kehrt dorthin zurueck, wo der
  Dialog geoeffnet wurde. Ohne Tastatur traegt der Knopf "Abbrechen" denselben Weg.
- `docs/design.md` und `docs/notes.txt` geben den neuen Stand wieder.

## Technical Key Decisions and Tradeoffs

1. **Dialoge:** natives `<dialog>` mit `showModal()`.
   - Why: Safari ab 15.4, auf dem Zielgeraet also vorhanden. Der Browser setzt den
     Hintergrund inert, faengt den Fokus und behandelt Escape.
   - Impact: kleiner Helfer `src/ui/dialog.ts` fuer Oeffnen, Schliessen und
     Fokusrueckgabe. Keine selbst gebaute Fokusfalle, kein `aria-hidden` von Hand.
2. **Namensvorschlag:** Knopf raus, Feld beim Oeffnen vorbelegt.
   - Why: erfuellt die Notiz und haelt `design.md` 6 und Entscheidung 13 - im Stehen
     muss nichts getippt werden.
   - Impact: `LocationService.suggestName()` bleibt und wird beim Oeffnen gerufen.
3. **Anlegen-Dialog:** ein Dialog, beide Speicherwege untereinander.
   - Why: kuerzester Wischweg, keine zweite Ebene.
   - Impact: Der GPS-Knopf bleibt sichtbar und nennt bei fehlendem Fix den Grund,
     statt zu verschwinden. Ein fehlender Knopf ist mit VoiceOver schwerer zu
     deuten als einer, der sich erklaert.
4. **Loeschen:** eigener Bestaetigungsdialog ueber dem Bearbeiten-Dialog.
   - Why: unmissverstaendliche Frage; ohne Backend ist ein Fehlgriff endgueltig
     (`design.md` 7).
   - Impact: verschachteltes `showModal()` - laut Spezifikation zulaessig, der
     Top-Layer ist ein Stapel. Das zweistufige "Wirklich loeschen?" am Listenknopf
     entfaellt.
5. **Bearbeiten-Dialog zeigt Datum und Genauigkeit, keine Koordinate.**
   - Why: sagt, wie verlaesslich der Punkt ist, ohne dass VoiceOver zwoelf Ziffern
     mitliest.
   - Impact: neue reine Funktion `formatLocationDetails()` in `ui/format.ts`, mit
     Tests.
6. **Fixierung:** nur `.tablist` klebt, die `h1` scrollt weg.
   - Why: minimaler Eingriff, entspricht der Notiz woertlich.
   - Impact: `position: sticky` mit eigenem safe-area-Polster; das obere
     Body-Polster wandert auf die `h1`, sonst scrollt Text sichtbar unter die
     Statusleiste.
7. **Absicherung:** keine DOM-Testumgebung.
   - Why: haelt die schlanke Abhaengigkeitsliste aus `design.md` 9; die Oberflaeche
     wird auch heute am Geraet geprueft.
   - Impact: testbare Logik wandert nach `ui/format.ts`; Dialogverhalten, Fokus und
     VoiceOver stehen als manuelle Pruefpunkte im Plan.

## Current State

Die Orte-Seite ist eine Formularseite: Das Anlegen steht **vor** der Liste, jeder
Eintrag traegt zwei Knoepfe, und das Umbenennen greift quer ueber die Seite zurueck
auf das Namensfeld ganz oben.

```
body  (padding-top: 12px + safe-area)
  h1   Straight-Line-Navigation                  scrollt weg
  .tablist  [Navigation][Orte][Einstellungen]    scrollt ebenfalls weg
  section.panel  (Orte)
    h2   Orte
    h3   Neuen Ort anlegen
         Name                  [#ort-name        ]
         [ Namen vorschlagen              ]   <- soll weg
         [ Aktuellen Standort speichern   ]
         Koordinate einfuegen  [#ort-koordinate  ]
         [ Koordinate speichern           ]
         p.status  feedback
    h3   Gespeicherte Orte
    ul.entries
       li  <span>Bahnhof</span> [ Umbenennen ] [ Loeschen ]
       li  ...
```

Beteiligte Stellen:

- `src/ui/locationsView.ts` - die gesamte Ansicht. `startRename()` (ab Zeile 178)
  schreibt den Namen in `#ort-name` ganz oben und haengt einen Ad-hoc-Knopf hinter
  die Meldungszeile. `buildRow()` (ab Zeile 141) baut Name plus zwei Knoepfe und
  traegt das zweistufige Loeschen ueber das Feld `pendingDelete`.
- `src/main.ts:93-130` - verdrahtet `onSaveHere`, `onSaveText`, `onRename`,
  `onRemove`, `suggestName`. `handleSave()` (ab Zeile 396) meldet **vor** dem
  Neu-Rendern; `onRemove` rendert selbst und sagt selbst an.
- `src/application/locationService.ts:36-38` - `all()` sortiert bereits
  `localeCompare(..., 'de')`. **Alphabetisch ist damit erledigt** und nur noch zu
  bestaetigen.
- `src/ui/dom.ts` - `el()`, `setText()`, `icon()`, `ICON_PLAY/STOP/PAUSE`.
- `src/ui/styles.css:85` - `.tablist` und `.tab`; ab Zeile 162 `.panel-head`
  und `.icon-button`, bereits fuer Start und Stopp im Navigationsbereich in Gebrauch.
- `vite.config.ts` - `environment: 'node'`, kein DOM in den Tests.

## Desired End State

```
body  (padding-top: 0)
  h1   Straight-Line-Navigation                  padding-top traegt die safe-area
  .tablist  [Navigation][Orte][Einstellungen]    position: sticky, top: 0
  section.panel  (Orte)
    .panel-head   h2 Orte                              [ + ]
    p.status      Meldung nach dem Schliessen eines Dialogs
    p.status      "Noch keine Orte gespeichert."
    ul.entries
       li  [ Auto    ]      <- Knopf, nur der Name
       li  [ Bahnhof ]
       li  [ Zuhause ]
    dialog#ort-neu          Neuen Ort anlegen
    dialog#ort-bearbeiten   <Name des Ortes>
    dialog#ort-loeschen     <Name> loeschen?
```

Wege durch die Oberflaeche:

```
 [ + ] ------> dialog#ort-neu ---- Erfolg ----> zu, Fokus auf neuen Eintrag
                     |                          Meldung im Panel
                     +-- Fehler ---> bleibt offen, Meldung im Dialog

 [ Bahnhof ] -> dialog#ort-bearbeiten
                     |
                     +-- Namen speichern -- Erfolg --> zu, Fokus auf Eintrag
                     |
                     +-- Loeschen --> dialog#ort-loeschen
                     |                   |
                     |                   +-- Abbrechen --> zurueck, Fokus auf
                     |                   |                 [ Loeschen ]
                     |                   +-- Loeschen ----> beide zu,
                     |                                      Fokus auf [ + ]
                     +-- Abbrechen / Escape --> zu, Fokus auf [ Bahnhof ]
```

Die drei Dialoge haengen im Orte-Panel. Das ist unkritisch, weil ein modaler Dialog
den Bereichswechsel blockiert: Ein Dialog kann nie offen sein, waehrend das Panel
ueber `hidden` aus dem Baum genommen wird.

## Abstractions and Code Reuse

Wiederverwendet:

- `.panel-head` und `.icon-button` aus `styles.css` - dasselbe Muster wie Start und
  Stopp im Navigationsbereich (`design.md` 5): Symbol ohne Text, Name im
  `aria-label`, mindestens 52 Pixel im Quadrat.
- `icon()` und die `ICON_*`-Konstanten aus `dom.ts`.
- `Announcer` fuer jede Rueckmeldung; die Meldungszeile ist der sichtbare Zwilling
  der Ansage.
- `LocationService` unveraendert - Sortierung, `suggestName()`, `rename()`,
  `remove()` und die Fehlergruende bleiben, wie sie sind.

Neu:

- `src/ui`
  - `dialog.ts` - **neu**. Duenne Huelle um `<dialog>`.
    - `ModalDialog` - baut das Element mit Ueberschrift, oeffnet ueber
      `showModal()`, gibt beim Schliessen den Fokus an den Oeffner zurueck.
  - `locationsView.ts` - Formular raus, drei Dialoge rein.
    - `LocationsView` - Panel auf Kopf, Meldung und Liste reduziert.
    - `buildRow` - liefert `li > button` mit dem Namen, oeffnet den Dialog.
    - `startRename`, `pendingDelete` - **entfallen**.
    - `reportSaved`, `reportFailure`, `reportStorageError` - melden in den offenen
      Dialog statt ins Panel, solange einer offen ist.
    - `reportRemoved` - **neu**, schliesst beide Dialoge und setzt den Fokus.
    - `focusEntry` - **neu**, Fokus auf einen Eintrag ueber seine Kennung.
  - `format.ts`
    - `formatLocationDetails` - **neu**, Infozeile aus `createdAt` und
      `accuracyMetres`.
  - `dom.ts`
    - `ICON_PLUS` - **neu**.
  - `styles.css` - `.tablist` klebt; `dialog.sheet` und `::backdrop` neu.
- `src`
  - `main.ts` - `handleSave()` rendert vor dem Melden; `onRemove` meldet ueber
    `reportRemoved()`.

Bewusst **nicht** eingefuehrt: keine DOM-Testumgebung, kein UI-Framework, keine
weitere Abhaengigkeit (`design.md` 9).

## Logging & Observability

Die App hat kein Logging und bekommt keines. Beobachtbar ist sie ueber genau zwei
Kanaele, und beide werden hier bedient:

- die `aria-live`-Ansage (`Announcer`) - jede Rueckmeldung laeuft darueber;
- die sichtbare Meldungszeile - dieselbe Aussage in Text, damit Mitlesende sie
  ebenfalls sehen.

Regel fuer diese Aenderung: **Solange ein Dialog offen ist, gehoert die Meldung in
den Dialog.** Eine Meldung im Panel waere hinter dem modalen Dialog weder erreichbar
noch erswipebar. Erst beim Schliessen wandert die Bestaetigung ins Panel.

## Implementation

### Phase 1: Tab-Leiste oben fixieren

Dependencies: None

Die Leiste bleibt beim Scrollen stehen. Der Fallstrick ist die safe-area: Mit
`top: 0` pinnt die Leiste am Rand des Viewports, waehrend das obere Body-Polster
weiter unten anfaengt - der Streifen unter der Statusleiste zeigte dann
durchscheinenden Text. Deshalb wandert das obere Polster vom Body auf die `h1`, und
die Leiste bringt ihr eigenes mit.

**Tasks**:
- [ ] `src/ui/styles.css`: oberes `body`-Polster auf `0` setzen, die drei uebrigen
      Werte unveraendert lassen.
- [ ] `src/ui/styles.css`: `h1` bekommt
      `padding-top: calc(12px + env(safe-area-inset-top))`, damit der Abstand oben
      bleibt, wo er war.
- [ ] `src/ui/styles.css`: `.tablist` klebt und deckt ab.
      ```css
      .tablist {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        gap: 6px;
        /* Eigenes Polster: Angeheftet liegt die Leiste am Viewport-Rand, der
           Streifen unter der Statusleiste gehoert dann ihr. */
        padding: calc(6px + env(safe-area-inset-top)) 0 8px;
        margin-bottom: 6px;
        /* Deckender Grund und Kante, sonst scrollt der Inhalt sichtbar durch. */
        background: var(--bg);
        border-bottom: 2px solid var(--line);
      }
      ```
- [ ] `src/ui/styles.css`: Kommentar ueber `.tablist` ergaenzen - warum sie klebt und
      warum das Polster hier haengt und nicht am Body.
- [ ] `docs/design.md` 5: Die Aussage "Tab-Leiste oben" um den Satz ergaenzen, dass
      sie beim Scrollen stehen bleibt.
- [ ] `docs/design.md` 12: Entscheidung 29 aufnehmen - "Tab-Leiste bleibt beim
      Scrollen oben stehen". Begruendung: Der Bereichswechsel darf nicht davon
      abhaengen, wie weit die Ortsliste gescrollt ist.
- [ ] `docs/notes.txt`: "Tabs oben fixieren" aus dem TODO nehmen und als `x` in den
      DONE-Block einordnen.

**Automated Verification**:
- [ ] `npm run typecheck` laeuft ohne Fehler.
- [ ] `npm test` laeuft ohne Fehler.
- [ ] `npm run build` laeuft ohne Fehler.

**Manual Verification**:
- [ ] Am iPhone, Bereich Orte mit mehr Eintraegen als auf einen Bildschirm passen:
      Beim Scrollen bleiben die drei Tabs oben stehen, die Ueberschrift scrollt weg.
- [ ] Vom Home-Bildschirm gestartet (Standalone): Unter der Statusleiste bleibt der
      Grund weiss, es scrollt kein Text sichtbar hindurch.
- [ ] Mit VoiceOver: Die Reihenfolge beim Wischen ist unveraendert - Ueberschrift,
      dann Tabs, dann Bereichsinhalt.

---

### Phase 2: Ortsliste auf den Namen reduzieren, Bearbeiten und Loeschen in Dialogen

Dependencies: Phase 1 (nur Reihenfolge, keine technische Abhaengigkeit)

Diese Phase kommt **vor** dem Anlegen-Dialog: Das heutige Umbenennen greift auf das
Namensfeld des Anlegeformulars zu (`locationsView.ts:178`). Dieser Griff muss
verschwunden sein, bevor das Formular in einen Dialog umzieht.

Nach dieser Phase steht das alte Anlegeformular unveraendert oben auf der Seite; die
Liste darunter besteht bereits aus Namensknoepfen mit Dialog.

**Tasks**:
- [ ] `src/ui/dialog.ts` anlegen: `ModalDialog` mit Kopfkommentar (warum nativ:
      inerter Hintergrund, Fokusfalle und Escape kommen vom Browser).
      ```ts
      export class ModalDialog {
        readonly element: HTMLDialogElement;
        private readonly heading: HTMLElement;
        private opener: HTMLElement | null = null;

        constructor(id: string, title: string, body: readonly Node[]) { /* ... */ }

        /** Oeffnet modal; der Fokus landet auf `initialFocus`. */
        open(opener: HTMLElement, initialFocus: HTMLElement): void

        /** Schliesst und gibt den Fokus an den Oeffner zurueck - auch bei Escape. */
        close(): void

        /** Schliesst, ohne den Fokus zu setzen - der Aufrufer uebernimmt ihn. */
        closeKeepingFocus(): void

        get isOpen(): boolean
        setTitle(text: string): void
      }
      ```
      Die Fokusrueckgabe haengt am `close`-Ereignis, damit sie auch bei Escape
      greift. `closeKeepingFocus()` setzt `opener` vorher auf `null`. Die
      Ueberschrift ist ueber `aria-labelledby` mit dem Dialog verbunden.
- [ ] `src/ui/styles.css`: `dialog.sheet` und `dialog.sheet::backdrop` ergaenzen -
      heller Grund, kraeftiger Rand, `width: min(100%, 420px)`, `margin: auto`,
      `max-height` mit `overflow-y: auto`. **Keine `display`-Angabe**: Der Browser
      haelt einen geschlossenen Dialog ueber `display: none`; eine eigene Regel
      machte ihn dauerhaft sichtbar - derselbe Fallstrick wie bei `[hidden]`
      (Kommentar in `styles.css:31-39`).
- [ ] `src/ui/format.ts`: `formatLocationDetails(location)` ergaenzen.
      ```ts
      /** Infozeile im Bearbeiten-Dialog: "Angelegt am 4. September 2026, Genauigkeit 12 Meter." */
      export function formatLocationDetails(
        location: Pick<Location, 'createdAt' | 'accuracyMetres'>,
      ): string
      ```
      Faelle: Datum mit Genauigkeit; Datum ohne Genauigkeit (eingegebene
      Koordinate); unlesbares `createdAt` aus einer fremden Sicherung - dann
      "Anlagedatum unbekannt" statt einer erfundenen Angabe.
- [ ] `src/ui/format.test.ts`: Tests fuer alle drei Faelle.
- [ ] `src/ui/locationsView.ts`: `buildRow()` liefert `li > button.entry` mit dem
      Namen als Text und ohne weitere Knoepfe. Klick oeffnet den Bearbeiten-Dialog.
- [ ] `src/ui/locationsView.ts`: `startRename()`, den Ad-hoc-Bestaetigungsknopf und
      das Feld `pendingDelete` entfernen.
- [ ] `src/ui/locationsView.ts`: `render()` fuellt zusaetzlich eine
      `Map<string, HTMLButtonElement>`, damit `focusEntry(id)` einen Eintrag gezielt
      fokussieren kann.
- [ ] `src/ui/locationsView.ts`: Bearbeiten-Dialog bauen - Ueberschrift mit dem
      Namen, Infozeile aus `formatLocationDetails`, Label und Feld
      `#ort-bearbeiten-name`, "Namen speichern" (primary), "Loeschen" (danger),
      "Abbrechen" (secondary), Meldungszeile mit `role="status"`. Beim Oeffnen Fokus
      auf das Namensfeld.
- [ ] `src/ui/locationsView.ts`: Bestaetigungsdialog bauen - Ueberschrift
      "<Name> loeschen?", Hinweiszeile "Der Ort wird endgueltig entfernt. Es gibt
      keine zweite Kopie.", "Loeschen" (danger), "Abbrechen" (secondary). Beim
      Oeffnen Fokus auf **Abbrechen**: Ohne Backend ist ein Fehlgriff endgueltig,
      also ist der sichere Weg der voreingestellte.
- [ ] `src/ui/locationsView.ts`: Meldungen umleiten. Ein privates `report(text)`
      schreibt in die Meldungszeile des obersten offenen Dialogs, sonst in die des
      Panels, und sagt in beiden Faellen an. `reportFailure()` und
      `reportStorageError()` laufen darueber.
- [ ] `src/ui/locationsView.ts`: `reportSaved(location)` schliesst offene Dialoge
      ohne Fokusrueckgabe, meldet im Panel und ruft `focusEntry(location.id)`. Das
      Leeren der Eingabefelder bleibt erhalten - in dieser Phase steht das
      Anlegeformular noch flach auf der Seite.
- [ ] `src/ui/locationsView.ts`: `reportRemoved()` schliesst beide Dialoge ohne
      Fokusrueckgabe, meldet "<Name> geloescht." im Panel und setzt den Fokus auf das
      Panel. *(Phase 3 ersetzt dieses Ziel durch das Plus.)*
- [ ] `src/main.ts`: In `handleSave()` die Reihenfolge umdrehen - erst
      `locationsView.render(...)`, dann `reportSaved(...)`. Sonst fokussiert die
      Ansicht einen Knopf, den das folgende Rendern gleich wieder ersetzt.
- [ ] `src/main.ts`: `onRemove` ruft nach `render(...)` zusaetzlich
      `locationsView.reportRemoved()`; die Ansage dort entfaellt, sie liegt jetzt in
      der Ansicht.
- [ ] `docs/design.md` 6: Abschnitt 6.4 "Verwalten: Liste und Dialoge" ergaenzen -
      Liste zeigt nur Namen, Bearbeiten und Loeschen liegen in modalen Dialogen,
      Loeschen mit eigener Rueckfrage, Meldung gehoert in den offenen Dialog.
- [ ] `docs/design.md` 5: Zeile "Orte" in der Tab-Tabelle auf den neuen Inhalt
      bringen.
- [ ] `docs/design.md` 12: Entscheidung 30 aufnehmen - "Orte verwalten in modalen
      Dialogen, Loeschen mit eigener Rueckfrage".
- [ ] `docs/notes.txt`: Die Unterpunkte "Liste der Orte alphabetisch sortiert",
      "Eintrag zeigt nur den Namen" und "Klick oeffnet einen Dialog zum
      Bearbeiten/Loeschen" als erledigt in den DONE-Block ueberfuehren; beim
      Sortieren vermerken, dass `LocationService.all()` das schon leistete.

**Automated Verification**:
- [ ] `npm test` - die neuen Tests zu `formatLocationDetails` laufen: Datum mit
      Genauigkeit, Datum ohne Genauigkeit, unlesbares Datum.
- [ ] `npm run typecheck` laeuft ohne Fehler.
- [ ] `npm run build` laeuft ohne Fehler.
- [ ] `grep -n "pendingDelete\|startRename" src/ui/locationsView.ts` liefert nichts
      mehr.

**Manual Verification**:
- [ ] Am iPhone mit VoiceOver: Ein Eintrag wird als Knopf mit genau dem Namen
      angesagt - ohne Entfernung, ohne Zusatz.
- [ ] Tippen auf einen Eintrag oeffnet den Dialog; VoiceOver nennt den Namen als
      Ueberschrift und laesst sich nicht hinter den Dialog wischen.
- [ ] Umbenennen: Der Dialog schliesst, die Bestaetigung wird angesagt, der Fokus
      steht auf dem umbenannten Eintrag an seiner neuen alphabetischen Stelle.
- [ ] Leerer Name: Der Dialog bleibt offen und meldet darin "Bitte einen Namen
      eingeben."
- [ ] Loeschen: Die Rueckfrage kommt als eigener Dialog; "Abbrechen" fuehrt zurueck
      in den Bearbeiten-Dialog, und der Fokus steht wieder auf "Loeschen".
- [ ] Loeschen bestaetigen: Beide Dialoge schliessen, "<Name> geloescht." wird
      angesagt, der Eintrag ist weg.
- [ ] Ein geloeschter Ort verschwindet auch aus der Kegel-Liste im Bereich
      Navigation, waehrend ein Lauf aktiv ist.

---

### Phase 3: Anlegen hinter das Plus

Dependencies: Phase 2 (`ModalDialog` und die Meldungsumleitung stammen von dort)

Das Anlegeformular verschwindet von der Seite und zieht in einen Dialog hinter dem
Plus-Symbol oben rechts. Der Knopf "Namen vorschlagen" faellt weg; der Vorschlag
steht beim Oeffnen im Feld.

```
vorher                              nachher
+-------------------------------+   +-------------------------------+
| Orte                          |   | Orte                    [ + ] |
| Neuen Ort anlegen             |   |                               |
| Name [_______________]        |   |   Auto                        |
| [ Namen vorschlagen         ] |   |   Bahnhof                     |
| [ Aktuellen Standort spei.  ] |   |   Zuhause                     |
| Koordinate [__________]       |   +-------------------------------+
| [ Koordinate speichern      ] |
| Gespeicherte Orte             |
|   Bahnhof [Umben.] [Loeschen] |
+-------------------------------+
```

**Tasks**:
- [ ] `src/ui/dom.ts`: `ICON_PLUS` ergaenzen (Pfad auf demselben 24er-Raster wie die
      uebrigen Symbole).
- [ ] `src/ui/locationsView.ts`: Panel-Kopf auf `.panel-head` umstellen - `h2 Orte`
      plus `button.icon-button.primary` mit `aria-label="Neuen Ort anlegen"` und
      gleichlautendem `title`, wie beim Start-Knopf im Navigationsbereich.
- [ ] `src/ui/locationsView.ts`: Anlegen-Dialog bauen - Ueberschrift "Neuen Ort
      anlegen", Label und Feld `#ort-name`, "Aktuellen Standort speichern"
      (primary), Label und Feld `#ort-koordinate` mit dem bisherigen Platzhalter,
      "Koordinate speichern" (secondary), Meldungszeile, "Abbrechen" (secondary).
- [ ] `src/ui/locationsView.ts`: Beim Oeffnen
      `nameInput.value = callbacks.suggestName()`, Koordinatenfeld leeren,
      Meldungszeile leeren, Fokus auf das Namensfeld.
- [ ] `src/ui/locationsView.ts`: Knopf "Namen vorschlagen" und die beiden `h3`
      entfernen; das Panel besteht danach aus Kopf, Meldungszeile, Leerzeile, Liste
      und den drei Dialogen.
- [ ] `src/ui/locationsView.ts`: `reportRemoved()` setzt den Fokus jetzt auf das Plus
      statt auf das Panel.
- [ ] `src/main.ts`: Pruefen, dass `suggestName` in den Callbacks bleibt und die
      Fehlerwege `no-coordinate-found` (kein Standort) und `position-stale`
      unveraendert im Dialog landen - beide melden ueber `reportFailure()`.
- [ ] `docs/design.md` 6: Den Satz zum Namensvorschlag darauf umstellen, dass der
      Dialog das Feld vorbelegt (bisher: ein eigener Knopf).
- [ ] `docs/design.md` 6.1: Ergaenzen, dass der GPS-Knopf im Dialog sichtbar bleibt,
      auch wenn kein Fix vorliegt, und dann den Grund nennt.
- [ ] `docs/design.md` 12: Entscheidung 31 aufnehmen - "Anlegen hinter einem
      Plus-Symbol, Namensvorschlag vorbelegt statt auf Knopfdruck".
- [ ] `docs/notes.txt`: Die verbliebenen Unterpunkte "oben rechts ein Plus-Icon",
      "Klick oeffnet ein Dialogfeld" und "Name vorschlagen entfernen" in den
      DONE-Block ueberfuehren; der Sammelpunkt "Orte-Seite" verschwindet damit aus
      dem TODO.

**Automated Verification**:
- [ ] `npm run typecheck` laeuft ohne Fehler.
- [ ] `npm test` laeuft ohne Fehler.
- [ ] `npm run build` laeuft ohne Fehler.
- [ ] `grep -rn "Namen vorschlagen" src` liefert nichts mehr.

**Manual Verification**:
- [ ] Am iPhone mit VoiceOver: Der Bereich Orte wird als Ueberschrift, Knopf "Neuen
      Ort anlegen", Meldungszeile und Liste erswiped - kein Formular dazwischen.
- [ ] Das Plus oeffnet den Dialog; das Namensfeld enthaelt den Vorschlag mit Datum
      und Uhrzeit und laesst sich ueberschreiben.
- [ ] Bei laufender Navigation: "Aktuellen Standort speichern" legt den Ort an, der
      Dialog schliesst, die Bestaetigung nennt die Genauigkeit, und der Fokus steht
      auf dem neuen Eintrag.
- [ ] Ohne laufende Navigation: Derselbe Knopf haelt den Dialog offen und meldet
      darin, dass zuerst die Navigation zu starten ist.
- [ ] Eine aus der Karten-App kopierte Koordinate einfuegen und speichern - der
      Dialog schliesst, der Eintrag steht an alphabetisch richtiger Stelle.
- [ ] Unsinniger Text im Koordinatenfeld: Der Dialog bleibt offen und meldet darin.
- [ ] Das Plus ist im Gehen mit dem Daumen zu treffen und mindestens so gross wie der
      Start-Knopf im Navigationsbereich.

## Implementation Notes

Waehrend der Umsetzung hier festhalten, was auffaellt: Rueckmeldungen des Nutzers,
Probleme, geaenderte Entscheidungen.

- Offener Punkt fuer den Praxistest: ob die Rueckfrage vor dem Loeschen im Gehen als
  Absicherung oder als Umweg empfunden wird. Falls sie stoert, waere die Alternative
  ein einstufiges Loeschen im Bearbeiten-Dialog - eine Aenderung an Entscheidung 30,
  nicht am Code allein.

## References

- `docs/notes.txt` - die vier neuen Items (Tabs fixieren, Orte-Seite).
- `docs/design.md` 3 - Barrierefreiheit, Audio-First als Leitplanke.
- `docs/design.md` 5 - Interaktionsmodell, Tab-Leiste oben, Symbolknoepfe im Kopf.
- `docs/design.md` 6 - Erfassung von Orten, Namenspflicht und Vorschlag.
- `docs/design.md` 7 - keine zweite Kopie, deshalb die Rueckfrage vor dem Loeschen.
- `docs/design.md` 9 - kein Framework, schlanke Abhaengigkeiten.
- `src/ui/locationsView.ts`, `src/ui/tabs.ts`, `src/ui/navigationView.ts`,
  `src/ui/dom.ts`, `src/ui/styles.css`, `src/main.ts`,
  `src/application/locationService.ts`.
- HTML-Standard, `<dialog>` und Top-Layer: verschachteltes `showModal()` ist
  zulaessig, der Top-Layer ist ein Stapel. Safari unterstuetzt `<dialog>` seit 15.4.
