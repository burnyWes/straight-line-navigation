---
date: 2026-09-09T06:54:16+00:00
git_commit: 707d651f59aa0bdf41d03815893e0833ff1e1091
branch: main
story: SLN-006
topic: "Solo-Knopf: nur diesen Ort, nur diese Gruppe"
tags: [plan, ui, locationsView, groupsView, locationService, settings, solo]
status: ready
---

# PLAN: SLN-006 — Solo-Knopf auf der Orte- und der Gruppen-Seite

Das offene Item `- Solo-Button` aus `docs/notes.txt` umsetzen: In jeder Ortszeile und in
jeder nicht leeren Gruppenzeile steht zwischen dem Namensknopf und der Gluehbirne ein
dritter Knopf. Ein Tipp blendet **alles andere** aus; ein zweiter Tipp auf dieselbe Zeile
holt den Stand zurueck, der vorher galt.

Der Zweck ist derselbe wie beim Ausblenden und bei den Gruppen — **Ruhe im Kegel**
(`design.md` 6.5) —, aber mit einem Griff statt einer Reihe. Und mit einem Zugewinn, den
es bisher nicht gab: Der Griff ist **umkehrbar**. Die Gruppen-Birne hebt beim Einblenden
eine einzeln gesetzte Ausblendung endgueltig auf; `design.md` 6.6 nennt das einen bewusst
gezahlten Preis. Solo merkt sich den Stand von vorher und stellt ihn wieder her.

Massgeblich fuer die fachlichen Entscheidungen bleibt `docs/design.md`; dieser Plan
ergaenzt sie dort, wo neue Entscheidungen fallen.

## Acceptance Criteria

- Jede Ortszeile und jede **nicht leere** Gruppenzeile hat einen dritten Knopf, im DOM
  zwischen Namensknopf und Gluehbirne. Leere Gruppen bekommen weder Birne noch Solo.
- Der Knopf heisst `"Alle außer <Name> ausblenden"`, solange diese Zeile nicht solo ist,
  und `"Vorherige Auswahl zurückholen"`, wenn sie es ist. `aria-label`, `title` und
  Symbolpfad wechseln gemeinsam.
- Das Symbol sind drei Punkte in einer Reihe: nicht solo drei Scheiben, solo Ring —
  Scheibe — Ring. `ICON_SOLO_ALL` ist `ICON_SOLO_ONE` plus zwei innere Scheiben.
- Solo auf Ort A: A ist sichtbar, **alle** anderen Orte sind ausgeblendet — auch dann,
  wenn A selbst vorher ausgeblendet war.
- Solo auf Gruppe G: **alle** Mitglieder sind sichtbar, auch einzeln ausgeblendete; alle
  Nichtmitglieder sind ausgeblendet.
- Beim Uebergang „kein Solo" nach „Solo" wird der Schnappschuss geschrieben: die
  Kennungen der in diesem Moment ausgeblendeten Orte. Laeuft **schon** ein Solo, wandert
  es auf die neue Zeile, und der Schnappschuss bleibt unberuehrt.
- Ein zweiter Tipp auf die solo geschaltete Zeile stellt den Schnappschuss her:
  ausgeblendet ist danach genau, wer darin steht. Der Schnappschuss ist damit verbraucht.
- Der Schnappschuss **verfaellt** bei: einzelner Gluehbirne, Gruppen-Gluehbirne, Loeschen
  der solo geschalteten Zeile. Er **bleibt** bei: neuem Ort, Import, Loeschen einer
  anderen Zeile — deren Kennung faellt beim Zurueckholen still weg.
- Verfaellt er, heisst der Knopf der vorher solo geschalteten Zeile **sofort** wieder
  `"Alle außer <Name> ausblenden"` — auch dann, wenn die Birne, die ihn verfallen liess,
  in einer **anderen** Zeile stand.
- Der Solo-Zustand ueberlebt den Kaltstart und wird beim Start **nicht** aufgeloest.
- Der Solo-Zustand steht **nicht** in der Sicherung: `serializeBackup()` kennt die
  Einstellungen nicht.
- Nach jedem Solo-Tipp geht eine Ansage ueber den Announcer:
  `"6 von 7 Orten sind ausgeblendet."` bzw. `"Alle Orte sind eingeblendet."` Die stille
  Hinweiszeile auf der Orte-Seite bleibt ohne Live-Region.
- Der Fokus bleibt auf dem Solo-Knopf. In der **sichtbaren** Ansicht wird keine Zeile neu
  gebaut; alle betroffenen Knoepfe werden nur im Inhalt nachgezogen. Die jeweils andere,
  verdeckte Ansicht wird vollstaendig neu gezeichnet — dort steht kein Fokus.
- Die Orte werden in **einem** Schreibzugriff geschaltet (`replaceAll`), danach die
  Einstellungen. Schlaegt der erste fehl, ist nichts passiert. Bei jedem Fehlschlag: die
  uebliche Meldung und vollstaendiges Neuzeichnen beider Ansichten.
- Die Hinweiszeile ist auch im Singular richtig: `"1 von 7 Orten ist ausgeblendet."`
- `docs/design.md` und `docs/notes.txt` geben den neuen Stand wieder.

## Technical Key Decisions and Tradeoffs

1. **Der zweite Druck stellt den Stand von vorher her, nicht „alles hell".**
   - Why: Ein dauerhaft ausgeblendeter Ort („die Baustelle, die mich nie interessiert")
     soll nicht bei jedem Solo-Ausstieg zurueckkommen. Nutzerentscheidung.
   - Impact: Es braucht einen gespeicherten Schnappschuss. Solo ist damit die erste
     Funktion der App mit einem Gedaechtnis ueber eine **vergangene** Welt.
2. **Solo wandert wie am Mischpult; der Schnappschuss wird dabei nicht neu geschrieben.**
   - Why: Der gemerkte Stand bedeutet „mein normaler Stand", nicht „der Stand von eben".
     Wuerde jeder Tipp neu schnappen, merkte sich die App beim Sprung von Kiez zu Arbeit
     einen **Solo-Zustand** als Rueckkehrpunkt, und der Weg in den Alltag wuerde mit
     jedem Sprung einen Druck laenger.
   - Impact: Geschrieben wird nur beim Uebergang kein-Solo nach Solo. Der Weg zum
     Ursprung ist genau der zweite Druck auf die gerade solo geschaltete Zeile.
3. **Der Schnappschuss liegt in `AppSettings` und ueberlebt den Kaltstart.**
   - Why: Der Kaltstart mitten im Solo ist der Normalfall, nicht die Ausnahme — iOS wirft
     die App aus dem Speicher, und „heute nur der Kiez" dauert Stunden. Ohne Persistenz
     gaebe es Entscheidung 1 nur bis zum naechsten App-Start, und ein haengendes Solo
     waere **still**: derselbe Fehlermodus, der die App schon einmal einen ganzen Lauf
     gekostet hat (`design.md` 4.3, Entscheidung 44). Praezedenzfall ist `targetId`
     (Entscheidung 39): Was eine Absicht ist, ueberlebt den Kaltstart.
   - Impact: Ein Feld mehr in den Einstellungen, tolerant gelesen. Aus der Sicherung
     bleibt es von selbst heraus. Das Solo wird beim Start ausdruecklich **nicht**
     aufgeloest — das blendete beim Oeffnen Orte ein, die gestern bewusst weggeschaltet
     wurden, also genau die Ueberraschung, gegen die 6.5 beim Gruppen-Loeschen
     argumentiert.
4. **„Solo laeuft" wird gespeichert, nicht abgeleitet — Kennung und Art dazu.**
   - Why: Die Ableitung („dieser Ort ist hell, alle anderen dunkel") bricht am haeufigsten
     Fall ueberhaupt: Wer im Kiez unterwegs ist, speichert dort einen neuen Ort — und neue
     Orte sind sichtbar (SLN-002). Danach saehe die Ableitung „kein Solo", der naechste
     Tipp schriebe den Solo-Zustand als Schnappschuss, und der Weg zurueck waere verloren.
     Der Widerspruch zu 6.6 ist keiner: Dort ging es um die **Sichtbarkeit**, und die
     bleibt allein am Feld `hidden`. Ein Schnappschuss ist eine vergangene Welt und
     prinzipiell nicht aus der gegenwaertigen ableitbar.
   - Impact: Die Verfallsregeln muessen aktiv gepflegt werden — an vier Stellen in
     `main.ts`.
5. **Der Knopf heisst `"Alle außer Bahnhof ausblenden"`.**
   - Why: Er sagt die **Handlung**, nicht das Ergebnis („Nur Bahnhof anzeigen") und nicht
     den Funktionsnamen („Bahnhof solo schalten") — in der Vokabel, die die Seite ohnehin
     fuehrt. Und er klingt an der ersten Silbe anders als sein Nachbar
     `"Bahnhof ausblenden"`; der gefaehrlichste Fehlgriff waere, die Birne zu treffen
     statt Solo.
   - Impact: Die laengste Ansage der Liste, einmal je Ort beim Durchwischen. Der
     Rueckweg-Name nennt den Ort nicht — es gibt in der ganzen Liste immer nur **einen**
     solchen Knopf, und der Name der Zeile steht eine Station davor.
6. **Symbol: drei Punkte, einer bleibt. Symbol zeigt den Zustand, Name die Wirkung.**
   - Why: Ein Bild der Sache selbst statt einer Metapher, die man uebersetzen muss. Es
     baut sich wie die Birne (`ICON_BULB_ON = ICON_BULB_OFF + Strahlen`): eine Silhouette,
     ein Detail als Zustand. Und es folgt der Konvention des Nachbarknopfes in derselben
     Zeile — dort zeigt die Birne den Zustand und der Name die Wirkung.
   - Impact: Zwei neue Pfade in `ui/dom.ts`. Die Ringe haben 1,5 px Wandstaerke, die
     feinste Linie der App — Praxistestfrage wie seinerzeit die Birne. Bekannte Naehe:
     `ICON_LIST` sind drei Balken, steht aber schwebend auf der Navigationsseite und nie
     in einer Zeile daneben.
7. **Solo steht ueberall dort, wo auch die Gluehbirne steht.**
   - Why: Ein Wischweg, der die Laenge wechselt, ist teurer als ein toter Knopf — bei
     einer dynamischen Regel verschwaende und erschiene die mittlere Station, waehrend man
     Birnen umschaltet. Die leere Gruppe ist der einzige schaedliche Fall (Solo darauf
     blendete **alles** aus), und sie hat schon heute keine Birne.
   - Impact: Bei genau einem gespeicherten Ort und bei einer Gruppe, die alle Orte
     enthaelt, ist der Knopf folgenlos. Beides ist harmlos und fluechtig.
8. **Solo auf eine Gruppe holt auch einzeln ausgeblendete Mitglieder.**
   - Why: „Nur der Kiez" ist eine Aussage ueber die **ganze** Gruppe. Ein Kiez mit einem
     Loch darin waere genau das stille Filtern, gegen das 6.5 die Hinweiszeile eingefuehrt
     hat. Dieselbe Regel faehrt die Gruppen-Birne schon (6.6).
   - Impact: Der in 6.6 eingestandene Preis faellt hier weg — der Schnappschuss macht den
     Griff umkehrbar. Das ist der eigentliche Zugewinn dieser Story und gehoert so in
     `design.md`.
9. **Ansage ueber den Announcer, mit der Zahl.**
   - Why: Die Begruendung der Birne („dieselbe Information ein zweites Mal") traegt hier
     nicht: Der Knopfname sagt nichts darueber, dass sechs **andere** Zeilen dunkel
     geworden sind. 6.5 hat die Hinweiszeile genau dafuer erfunden, und auf der
     Gruppen-Seite gibt es sie gar nicht — dort aendern sich die Zahlen in allen Zeilen
     still mit.
   - Impact: Zwei Ansagen nach einem Tipp — der Knopfname durch den Fokus, der Umfang
     durch die Live-Region. Das ist gewollt: zwei verschiedene Auskuenfte.
10. **Ein Schreibzugriff fuer die Orte, danach die Einstellungen.**
    - Why: `replaceAll()` ist **ein** `setItem` — ganz oder gar nicht. Die Gruppen-Birne
      macht dasselbe heute als N einzelne Schreibzugriffe, und 6.6 gesteht den Halbstand
      ausdruecklich ein. Die Reihenfolge ist wichtig: Der grosse Schreibzugriff scheitert
      zuerst (Speicher voll), und dann ist **nichts** passiert.
    - Impact: Kein Rueckabwickeln. Der Restfall — Orte geschrieben, Einstellungen
      gescheitert — laesst eine gefilterte Welt ohne Weg zurueck; er tritt nur ein, wenn
      der kleine Schreibzugriff unmittelbar nach dem grossen scheitert. Ein dritter
      Schreibzugriff dafuer waere mehr Angriffsflaeche als Absicherung.

## Current State

**Eine Zeile heute** (`locationsView.ts:376`, `groupsView.ts:448`)

```
┌──────────────────────────────────────────┬────────┐
│ Bahnhof                                  │  (¤)   │
└──────────────────────────────────────────┴────────┘
  button.entry -> Dialog                     .icon-button -> hidden umschalten

VoiceOver:  "Bahnhof, Button"  ->  "Bahnhof ausblenden, Button"     2 Stationen
```

**Datenfluss der Sichtbarkeit**

```
Location.hidden  (ein Feld, eine Wahrheit)
   ▲
   │ LocationService.setHidden(id, hidden)  -> repository.save(one)   1 Schreibzugriff
   │
   ├─ locationsView   Birne je Zeile        -> applyHidden(location)  1 Zeile nachziehen
   ├─ groupsView      Birne je Gruppe       -> Reihenschalter in main.ts:
   │                                            for (member of membersOf) setHidden(...)
   │                                            N Schreibzugriffe, jeder kann brechen
   └─ main.renderNavigation()
        navigationService.update(..., locationService.visible())
        guidanceService.update(..., locationService.all())   <- Ziel sieht auch Dunkles
```

**Was es heute schon gibt und wiederverwendet wird**

- `setButtonLabel(button, label, path)` in `dom.ts:82` — tauscht `aria-label`, `title` und
  Symbol gemeinsam. Beide vorhandenen Umschalter rufen sie erst, nachdem sie selbst
  geprueft haben, ob sich etwas geaendert hat (`navigationView.ts:586`,
  `targetView.ts:132`).
- `.entry-row` ist eine Flex-Zeile mit `gap: var(--abstand)`; der Namensknopf hat
  `flex: 1`, Symbolknoepfe bleiben bei ihrer Groesse (`styles.css:426`). **Eine dritte
  Schaltflaeche braucht dort keine Aenderung** — 2 × 52 px Knopf plus 2 × 20 px Abstand
  lassen auch auf 320 px Breite ueber 140 px fuer den Namen.
- `AppSettings` haelt mit `targetId` bereits eine **Absicht**, die den Kaltstart
  ueberlebt, und `loadSettings()` liest jedes Feld tolerant (`storedSettings.ts:38`).
- `settingsView.setSettings(settings)` muss nach **jeder** Aenderung an den Einstellungen
  gerufen werden, sonst ueberschreibt die naechste Kegelwinkel-Aenderung den neuen Stand
  mit einer veralteten Kopie — der Grund steht bei `chooseTarget()` in `main.ts`.
- `guardStorage()` meldet jeden Fehlschlag, statt ihn zu schlucken (`main.ts`).
- Die Gluehbirne zieht **eine** Zeile nach (`applyHidden`), die Gruppen-Birne **alle**
  (`applyGroupHidden`) — in beiden Faellen nur der Inhalt bestehender Knoten, nie ein
  Knotenwechsel.

## Desired End State

```
AppSettings
   solo: { kind: 'location' | 'group'; id: string; hiddenBefore: string[] } | null

application/solo.ts        reine Zustandsmaschine, kennt kein Repository
   tapSolo({ current, target, allIds, hiddenNow, keep })
        -> { hiddenAfter: string[], solo: SoloState | null }

LocationService
   hiddenIds()             Kennungen der gerade ausgeblendeten Orte
   setHiddenIds(ids)       ausgeblendet ist genau, wer darin steht - EIN replaceAll
```

**Eine Zeile danach**

```
Orte                                                        (+)
─────────────────────────────────────────────────────────────────
6 von 7 Orten sind ausgeblendet.                    <- still, keine Live-Region
─────────────────────────────────────────────────────────────────
┌────────────────────────────────┬────────┬────────┐
│ Baecker                        │ (•••)  │  (·)   │   dunkel, nicht solo
└────────────────────────────────┴────────┴────────┘
┌────────────────────────────────┬────────┬────────┐
│ Bahnhof                        │ (o•o)  │  (¤)   │   hell und solo
└────────────────────────────────┴────────┴────────┘

VoiceOver, Wischweg ueber Bahnhof:
  "Bahnhof, Button"
  "Vorherige Auswahl zurueckholen, Button"
  "Bahnhof ausblenden, Button"

VoiceOver, Wischweg ueber Baecker:
  "Baecker, Button"
  "Alle außer Baecker ausblenden, Button"
  "Baecker einblenden, Button"
```

**Ein Tipp, Schritt fuer Schritt**

```
Ausgangslage: 7 Orte, Baecker einzeln ausgeblendet, kein Solo.

Tipp auf Solo bei Bahnhof
  tapSolo  -> hiddenAfter = alle ausser Bahnhof
              solo        = { location, Bahnhof, hiddenBefore: [Baecker] }
  setHiddenIds(hiddenAfter)          1 setItem   <- scheitert das, ist nichts passiert
  saveSettings(...)                  1 setItem
  locationsView.applySolo(...)       alle Zeilen im Inhalt nachgezogen, Fokus bleibt
  renderGroups()                     verdecktes Panel, vollstaendig
  Announcer: "6 von 7 Orten sind ausgeblendet."
  dirty = true                       Kegel rechnet im naechsten Bild kuerzer

Tipp auf Solo bei Kiosk (Solo wandert)
  hiddenBefore bleibt [Baecker], hiddenAfter = alle ausser Kiosk

Zweiter Tipp auf Solo bei Kiosk
  hiddenAfter = [Baecker], solo = null       <- der Ursprung, nicht das Bahnhof-Solo
```

Die Navigationsansicht aendert sich nicht — sie bekommt weiter `visible()` gereicht.

## Abstractions and Code Reuse

Wiederverwendet werden `el()`/`setText()`/`icon()`/`setButtonLabel()` aus `ui/dom.ts`, die
Klasse `.icon-button`, die Flex-Zeile `.entry-row`, das Umschaltmuster der Gluehbirne, das
Nachziehen ohne Knotenwechsel aus `applyGroupHidden()`, `guardStorage()` und
`settingsView.setSettings()`. Neu sind eine reine Zustandsmaschine, ein Feld in den
Einstellungen, zwei Methoden am `LocationService`, zwei Symbolpfade und die dritte
Schaltflaeche je Zeile. Kein neuer Port, kein neues Repository, **keine** CSS-Aenderung.

Der `GroupService` bleibt unberuehrt: `main.ts` loest die Mitglieder ueber `membersOf()`
auf und reicht ihre Kennungen weiter. Damit kennt der Gruppendienst den Ortsdienst
weiterhin nicht (`design.md` 6.6).

- `src/application`
  - `solo.ts` — **neu**, reine Zustandsmaschine ohne Abhaengigkeiten
    - `SoloKind`, `SoloState`, `SoloTap` — Typen
    - `tapSolo` — was ein Tipp bewirkt
  - `solo.test.ts` — **neu**
  - `settings.ts` — `AppSettings.solo`, `DEFAULT_SETTINGS.solo`
  - `locationService.ts`
    - `hiddenIds` — Kennungen der ausgeblendeten Orte
    - `setHiddenIds` — Sichtbarkeit aller Orte in einem Schreibzugriff
  - `locationService.test.ts` — beide Methoden
- `src/adapters`
  - `storedSettings.ts` — `solo` tolerant lesen (`toSolo`)
  - `storedSettings.test.ts` — Rundlauf und kaputte Faelle
- `src/ui`
  - `dom.ts` — `ICON_SOLO_ONE`, `ICON_SOLO_ALL`; `setButtonLabel` schreibt nur bei
    geaendertem Namen
  - `format.ts` — `formatHiddenHint` (mit Singular), `formatSoloAnnouncement`
  - `format.test.ts` — beide
  - `locationsView.ts` — dritte Schaltflaeche, `applySolo`, Ansage
    - `LocationsViewCallbacks` — `onToggleSolo(id)`
    - `Row` — `readonly solo: HTMLButtonElement`
    - `render(locations, soloId)`, `applySolo(locations, soloId)`, `setSolo(soloId)`,
      `dressSolo(row)`
  - `groupsView.ts` — dasselbe, Knopf entfaellt bei leerer Gruppe
    - `GroupsViewCallbacks` — `onToggleSolo(groupId)`
    - `Row` — `readonly solo: HTMLButtonElement | null`
    - `render(groups, locations, soloId)`, `applySolo(locations, soloId)`,
      `setSolo(soloId)`, `dressSolo(row)`
- `src/main.ts` — `toggleSolo()`, `forgetSolo()`, `soloIdFor()`, Verfall an vier Stellen
- `docs/design.md`, `docs/notes.txt` — neuer Stand

## Logging & Observability

Keine. Die App hat kein Logging; Rueckmeldung geschieht ausschliesslich ueber die
Meldungszeile und den Announcer, und beides steht in den Akzeptanzkriterien.

## Implementation

### Phase 1: Der Zustand und die Regel

Dependencies: None

Die Zustandsmaschine, das Feld in den Einstellungen und der Schreibzugriff auf einen
Schlag. Ohne jede Aenderung an der Oberflaeche — vollstaendig ueber Vitest nachweisbar.

**Tasks**:
- [x] `src/application/solo.ts` anlegen: Typen und die reine Regel.
  ```ts
  export type SoloKind = 'location' | 'group';

  export interface SoloState {
    readonly kind: SoloKind;
    readonly id: string;
    /** Wer ausgeblendet war, bevor das Solo begann - der Weg zurueck. */
    readonly hiddenBefore: readonly string[];
  }

  export interface SoloTap {
    /** Ausgeblendet ist danach genau, wer hier steht. */
    readonly hiddenAfter: readonly string[];
    readonly solo: SoloState | null;
  }

  export function tapSolo(input: {
    readonly current: SoloState | null;
    readonly target: { readonly kind: SoloKind; readonly id: string };
    readonly allIds: readonly string[];
    readonly hiddenNow: readonly string[];
    /** Was hell bleiben soll: der Ort selbst bzw. die Mitglieder der Gruppe. */
    readonly keep: readonly string[];
  }): SoloTap {
    const { current, target, allIds, hiddenNow, keep } = input;

    // Nichts zu verschonen hiesse: alles ausblenden. Die Ansichten lassen den
    // Knopf dort gar nicht erst zu (leere Gruppe); hier steht der Riegel ein
    // zweites Mal, weil der Fall der einzige waere, der etwas kaputt macht.
    if (keep.length === 0) {
      return { hiddenAfter: hiddenNow, solo: current };
    }

    // Zweiter Druck auf dieselbe Zeile: zurueck auf den gemerkten Stand.
    if (current !== null && current.kind === target.kind && current.id === target.id) {
      return { hiddenAfter: current.hiddenBefore, solo: null };
    }

    // Laeuft schon ein Solo, wandert es - der Schnappschuss bleibt der erste.
    // Sonst waere der gemerkte Stand selbst ein Solo-Zustand, und der Weg in
    // den Alltag wuerde mit jedem Sprung einen Druck laenger.
    const hiddenBefore = current?.hiddenBefore ?? hiddenNow;
    const spared = new Set(keep);
    return {
      hiddenAfter: allIds.filter((id) => !spared.has(id)),
      solo: { kind: target.kind, id: target.id, hiddenBefore },
    };
  }
  ```
- [x] `src/application/solo.test.ts` anlegen. Faelle: erster Tipp merkt den aktuellen
      Stand und blendet alles andere aus; ein Ort, der selbst ausgeblendet war, wird durch
      sein Solo sichtbar; Solo wandert und laesst `hiddenBefore` unberuehrt; zweiter Tipp
      auf dieselbe Zeile stellt `hiddenBefore` her und liefert `solo: null`; gleiche
      Kennung bei **anderer** Art (`location` gegen `group`) zaehlt **nicht** als
      dieselbe Zeile; mehrere Mitglieder in `keep` bleiben alle hell; leeres `keep`
      aendert nichts.
- [x] `src/application/settings.ts`: Feld ergaenzen und im Standard belegen.
  ```ts
  import type { SoloState } from './solo.js';

  export interface AppSettings {
    // …
    /**
     * Laeuft ein Solo, und wie war es vorher?
     *
     * Liegt hier und nicht am Ort: Ein Schnappschuss ist keine Aussage ueber
     * die Gegenwart, sondern die Erinnerung an eine vergangene Welt - und
     * damit nichts, was sich aus `hidden` ableiten liesse. Die Sichtbarkeit
     * selbst bleibt allein am Ort (docs/design.md 6.6).
     */
    readonly solo: SoloState | null;
  }

  export const DEFAULT_SETTINGS: AppSettings = {
    // …
    solo: null,
  };
  ```
- [x] `src/adapters/storedSettings.ts`: `solo` tolerant lesen. Der Typ kommt aus der
      Anwendungsschicht — `import type { SoloState } from '../application/solo.js';`
  ```ts
  solo: toSolo(record['solo']),

  /**
   * Halb Gelesenes wird zu "kein Solo".
   *
   * Lieber den Weg zurueck verlieren als eine falsche Welt herstellen: Ohne
   * `hiddenBefore` wuesste der zweite Druck nicht, wohin.
   */
  function toSolo(value: unknown): SoloState | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const kind = record['kind'];
    const id = record['id'];
    const before = record['hiddenBefore'];
    if ((kind !== 'location' && kind !== 'group') || typeof id !== 'string') {
      return null;
    }
    if (!Array.isArray(before)) {
      return null;
    }
    return {
      kind,
      id,
      hiddenBefore: before.filter((entry): entry is string => typeof entry === 'string'),
    };
  }
  ```
- [x] `src/adapters/storedSettings.test.ts`: Rundlauf mit gesetztem Solo; ein Dokument
      **ohne** das Feld liest sich als `null`; `kind: "gruppe"`, fehlendes
      `hiddenBefore` und `hiddenBefore: "x"` liefern jeweils `null`; Nicht-Zeichenketten
      in `hiddenBefore` fallen weg, ohne den Rest zu verwerfen.
- [x] `src/application/locationService.ts`: die beiden Methoden.
  ```ts
  /** Kennungen der gerade ausgeblendeten Orte - Grundlage des Schnappschusses. */
  hiddenIds(): readonly string[] {
    return this.all()
      .filter((location) => location.hidden)
      .map((location) => location.id);
  }

  /**
   * Setzt die Sichtbarkeit aller Orte auf einen Schlag.
   *
   * Ein einziger Schreibzugriff, ganz oder gar nicht - anders als der
   * Reihenschalter der Gruppen-Birne, der bei N Orten N mal scheitern kann
   * (docs/design.md 6.6). Geschrieben wird ueber die Speicherreihenfolge, nicht
   * ueber die sortierte Sicht: Sortiert wird beim Lesen.
   */
  setHiddenIds(ids: readonly string[]): void {
    const hidden = new Set(ids);
    this.repository.replaceAll(
      this.repository.all().map((location) => {
        const next = hidden.has(location.id);
        return location.hidden === next ? location : createLocation({ ...location, hidden: next });
      }),
    );
  }
  ```
- [x] `src/application/locationService.test.ts`: `hiddenIds()` nennt nur die
      ausgeblendeten; `setHiddenIds()` blendet aus **und** ein, ruehrt die uebrigen Felder
      nicht an, laesst die Speicherreihenfolge stehen, schreibt genau **einmal**
      (`replaceAll`, nicht `save`) und ignoriert unbekannte Kennungen in der Liste;
      `setHiddenIds([])` blendet alles ein.

**Automated Verification**:
- [x] `npm test` — alle Suiten gruen, inklusive `solo.test.ts` und der neuen Faelle in
      `storedSettings.test.ts` und `locationService.test.ts`.
- [x] `npm run typecheck` — fehlerfrei. Das Feld ist nicht optional; von Hand gebaut wird
      `AppSettings` nur in `DEFAULT_SETTINGS`, alles andere geht ueber Spread.
- [x] `npm run build` — laeuft durch.

### Phase 2: Der Knopf auf der Orte-Seite

Dependencies: Phase 1

Die dritte Station je Ortszeile, das Symbolpaar, die Ansage und die Verdrahtung samt
Verfallsregeln. Danach ist Solo fuer Orte vollstaendig benutzbar.

**Tasks**:
- [x] `src/ui/dom.ts`: Zwei Symbolpfade ergaenzen, von Hand geschrieben wie die uebrigen
      (`design.md` Entscheidung 25). Drei Kreise auf einer Linie, Radius 3,2, Mitten bei
      x = 4,5 / 12 / 19,5. Die Ringe entstehen aus zwei gegenlaeufigen Boegen — dieselbe
      Nonzero-Technik wie beim Muelleimer und beim Fadenkreuz.
  ```ts
  /**
   * Drei Punkte, nur der mittlere gefuellt: Diese Zeile ist solo geschaltet.
   *
   * Ein Bild der Sache selbst - viele Orte, einer bleibt. Die Ringe sind mit
   * 1,5 px die feinste Linie der App; ob sie auf 26 Pixeln traegt, steht als
   * Praxistestfrage in docs/notes.txt, so wie es die Gluehbirne war.
   */
  export const ICON_SOLO_ONE =
    'M1.3 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M2.8 12a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1-3.4 0' +
    'M8.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0' +
    'M16.3 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M17.8 12a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1-3.4 0';

  /**
   * Dieselben drei Punkte, alle gefuellt: Diese Zeile ist nicht solo.
   *
   * Bewusst aus ICON_SOLO_ONE zusammengesetzt, wie Birne und Lautsprecher: Die
   * Silhouette muss in beiden Zustaenden dieselbe sein, sonst liest sich der
   * Wechsel als anderes Symbol statt als anderer Zustand. Die beiden Scheiben
   * laufen mit den Aussenkreisen, stopfen deren Loecher also zu.
   */
  export const ICON_SOLO_ALL =
    `${ICON_SOLO_ONE} M2.8 12a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0` +
    'M17.8 12a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0';
  ```
- [x] `src/ui/dom.ts`: `setButtonLabel()` schreibt nur, wenn sich der Name geaendert hat —
      dieselbe Begruendung wie bei `setText()`. Solo zieht in einem Tipp bis zu dreissig
      Zeilen mit je zwei Symbolknoepfen nach; ohne den Riegel wuerde jedes Mal jedes SVG
      neu gebaut. Sicher, weil es **keine** Aufrufstelle gibt, an der der Name gleich
      bleibt und nur der Symbolpfad wechselt: Bei `dressToggle`, `dressRow`, dem
      Anhalten-Knopf und dem Tonknopf haengen Name und Symbol an derselben Bedingung; der
      Muelleimer in `buildMemberRow` traegt zwar immer `ICON_TRASH`, wird aber von
      `renderMembers()` jedes Mal neu gebaut, hat also noch gar kein `aria-label`.
  ```ts
  export function setButtonLabel(button: HTMLButtonElement, label: string, path: string): void {
    if (button.getAttribute('aria-label') === label) {
      return;
    }
    // …
  }
  ```
- [x] `src/ui/format.ts`: Die Hinweiszeile bekommt einen eigenen Formatierer — mit
      Singular, den sie heute falsch hat — und die Ansage einen daneben.
  ```ts
  /** Text der stillen Hinweiszeile; leer, wenn nichts ausgeblendet ist. */
  export function formatHiddenHint(hidden: number, total: number): string {
    if (hidden === 0) {
      return '';
    }
    return `${hidden} von ${total} Orten ${hidden === 1 ? 'ist' : 'sind'} ausgeblendet.`;
  }

  /**
   * Ansage nach einem Solo-Tipp.
   *
   * Der Knopfname sagt, was der Tipp getan hat; diese Zeile sagt, **wie viel**
   * davon betroffen war - die einzige Information, die der Name nicht traegt
   * (docs/design.md 6.5). Ohne Ausgeblendete ohne Zahl: "Alle 1 Orte" waere
   * ein Satz, den man nicht schreiben will.
   */
  export function formatSoloAnnouncement(hidden: number, total: number): string {
    return hidden === 0 ? 'Alle Orte sind eingeblendet.' : formatHiddenHint(hidden, total);
  }
  ```
- [x] `src/ui/format.test.ts`: `formatHiddenHint` — leer bei 0, `"ist"` bei 1, `"sind"`
      bei 2; `formatSoloAnnouncement` — `"Alle Orte sind eingeblendet."` bei 0, sonst
      derselbe Satz wie die Hinweiszeile.
- [x] `src/ui/locationsView.ts`: Rueckruf ergaenzen — `onToggleSolo(id: string): void`.
      Kein zweiter Parameter: Ob geschaltet oder zurueckgeholt wird, entscheidet
      `tapSolo()` aus dem gespeicherten Stand, nicht die Ansicht.
- [x] `src/ui/locationsView.ts`: `Row` um `readonly solo: HTMLButtonElement` erweitern,
      Feld `private soloId: string | null = null;` ergaenzen.
- [x] `src/ui/locationsView.ts`: `render(locations, soloId)` nimmt die Kennung entgegen,
      merkt sie und baut die Zeile mit drei Knoepfen.
  ```ts
  const solo = el('button', { type: 'button', class: 'icon-button' }) as HTMLButtonElement;
  solo.addEventListener('click', () => {
    this.callbacks.onToggleSolo(location.id);
  });
  // Name, Solo, Gluehbirne - in dieser Reihenfolge im DOM, damit der Wischweg
  // erst den Ort nennt und dann, was mit ihm zu tun ist.
  return el('li', {}, [el('div', { class: 'entry-row' }, [entry, solo, toggle])]) as HTMLLIElement;
  ```
- [x] `src/ui/locationsView.ts`: `dressSolo(row)` — eine Stelle, die den Zustand aufs Bild
      bringt, gerufen von `buildRow()` **und** `applySolo()`, wie `dressToggle()` es
      vormacht.
  ```ts
  private dressSolo(row: Row): void {
    const isSolo = this.soloId === row.location.id;
    setButtonLabel(
      row.solo,
      isSolo ? 'Vorherige Auswahl zurückholen' : `Alle außer ${row.location.name} ausblenden`,
      isSolo ? ICON_SOLO_ONE : ICON_SOLO_ALL,
    );
  }
  ```
- [x] `src/ui/locationsView.ts`: `setSolo(soloId)` — zieht **nur** die Solo-Knoepfe nach,
      ohne Ansage. Gebraucht wird das, wenn der gemerkte Stand **verfaellt**: Dann aendert
      sich keine Sichtbarkeit, aber die vorher solo geschaltete Zeile darf nicht weiter
      `"Vorherige Auswahl zurückholen"` heissen — und sie ist in der Regel eine **andere**
      als die, deren Birne gerade getippt wurde.
  ```ts
  setSolo(soloId: string | null): void {
    this.soloId = soloId;
    for (const row of this.rows.values()) {
      this.dressSolo(row);
    }
  }
  ```
- [x] `src/ui/locationsView.ts`: `applySolo(locations, soloId)` — zieht **alle** Zeilen
      nach und sagt den Umfang an. Kein `render()`, kein Knotenwechsel: Der Fokus steht
      auf dem Solo-Knopf.
  ```ts
  applySolo(locations: readonly Location[], soloId: string | null): void {
    for (const location of locations) {
      const row = this.rows.get(location.id);
      if (row === undefined) {
        continue;
      }
      row.location = location;
      this.dressToggle(row);
    }
    // Danach, nicht davor: dressSolo liest den Namen aus row.location.
    this.setSolo(soloId);
    this.renderHiddenHint();
    // Der Knopf liest seinen neuen Namen selbst vor - aber nicht, dass sechs
    // andere Zeilen dunkel geworden sind (docs/design.md 6.5).
    this.announcer.announce(
      formatSoloAnnouncement(locations.filter((location) => location.hidden).length, locations.length),
    );
  }
  ```
- [x] `src/ui/locationsView.ts`: `renderHiddenHint()` benutzt `formatHiddenHint()`; der
      Satz wird nicht mehr an Ort und Stelle gebaut.
- [x] `src/main.ts`: Drei Hilfen ergaenzen.
  ```ts
  function soloIdFor(kind: SoloKind): string | null {
    return settings.solo?.kind === kind ? settings.solo.id : null;
  }

  /**
   * Der gemerkte Stand gilt nur, solange niemand sonst an der Sichtbarkeit dreht.
   *
   * Wer eine Birne tippt, sagt damit: So will ich es haben. Der Stand von vor
   * dem Solo ist danach nicht mehr "mein normaler Stand".
   *
   * Ruft der Aufrufer danach nicht ohnehin vollstaendig neu, muss er die
   * Solo-Knoepfe seiner Ansicht ueber setSolo(null) nachziehen: Die vorher solo
   * geschaltete Zeile ist meist eine **andere** als die getippte und hiesse
   * sonst weiter "Vorherige Auswahl zurückholen".
   */
  function forgetSolo(): void {
    if (settings.solo === null) {
      return;
    }
    settings = { ...settings, solo: null };
    saveSettings(store, settings);
    settingsView.setSettings(settings);
  }

  /**
   * Ein Tipp auf einen Solo-Knopf - fuer einen Ort wie fuer eine Gruppe.
   *
   * `keep` sind die Orte, die hell bleiben: bei einem Ort er selbst, bei einer
   * Gruppe ihre aufgeloesten Mitglieder. Der Gruppendienst kennt den Ortsdienst
   * damit weiterhin nicht (docs/design.md 6.6).
   */
  function toggleSolo(
    target: { kind: SoloKind; id: string },
    keep: readonly string[],
    apply: () => void,
    report: (message: string) => void,
  ): void {
    // Nichts zu verschonen: Die Ansichten lassen den Knopf dort gar nicht erst
    // zu. Hier steht der Riegel ein zweites Mal - und zwar VOR guardStorage,
    // damit ein Nichts nicht zwei Schreibzugriffe und eine Ansage kostet.
    if (keep.length === 0) {
      return;
    }
    const result = tapSolo({
      current: settings.solo,
      target,
      allIds: locationService.all().map((location) => location.id),
      hiddenNow: locationService.hiddenIds(),
      keep,
    });
    guardStorage(
      () => {
        // Erst die Orte: Der grosse Schreibzugriff scheitert zuerst, und dann
        // ist nichts passiert. Er ist ein einziges setItem - ganz oder gar
        // nicht, anders als der Reihenschalter der Gruppen-Birne.
        locationService.setHiddenIds(result.hiddenAfter);
        settings = { ...settings, solo: result.solo };
        saveSettings(store, settings);
        settingsView.setSettings(settings);
        apply();
        // Der Kegel rechnet im naechsten Bild mit der geaenderten Liste. Ein-
        // und Austritts-Toene klingen wie beim einzelnen Ort.
        dirty = true;
      },
      (message) => {
        // Ehrlich bleiben: Was tatsaechlich geschrieben wurde, weiss nur der
        // Speicher. Beide Ansichten werden deshalb vollstaendig neu gezeichnet.
        report(message);
        renderLocations();
        renderGroups();
        dirty = true;
      },
    );
  }
  ```
- [x] `src/main.ts`: `renderLocations()` reicht die Kennung durch —
      `locationsView.render(all, soloIdFor('location'))`.
- [x] `src/main.ts`: `onToggleSolo` der Orte-Ansicht verdrahten.
  ```ts
  onToggleSolo: (id) => {
    toggleSolo(
      { kind: 'location', id },
      [id],
      () => {
        // Nur die Inhalte nachziehen: Der Fokus steht auf dem Solo-Knopf.
        locationsView.applySolo(locationService.all(), soloIdFor('location'));
        // Die Gruppenzeilen nennen, wie viele ihrer Orte ausgeblendet sind -
        // ihr Panel ist verdeckt, vollstaendiges Zeichnen also unkritisch.
        renderGroups();
      },
      (message) => {
        locationsView.reportStorageError(message);
      },
    );
  },
  ```
- [x] `src/main.ts`: In `onToggleHidden` das Solo verfallen lassen — **vor**
      `locationService.setHidden()`, innerhalb desselben `guardStorage()`. Die Reihenfolge
      ist der Punkt: Scheitert das Schreiben der Einstellungen, ist der Ort noch nicht
      geschaltet, und der Kommentar „Der Knopf bleibt im alten Zustand" im Fehlerzweig
      bleibt wahr. Danach `locationsView.setSolo(null)` — sonst heisst die vorher solo
      geschaltete Zeile weiter `"Vorherige Auswahl zurückholen"`; `applyHidden()` ruehrt
      nur die eine getippte Zeile an.
  ```ts
  onToggleHidden: (id, hidden) => {
    guardStorage(
      () => {
        // Erst vergessen, dann schalten: Scheitert das Vergessen, ist der Ort
        // noch unveraendert - und der Knopf bleibt wirklich im alten Zustand.
        forgetSolo();
        const updated = locationService.setHidden(id, hidden);
        if (updated === null) {
          return;
        }
        locationsView.applyHidden(updated);
        // Die vorher solo geschaltete Zeile ist meist eine andere als diese.
        locationsView.setSolo(null);
        renderGroups();
        dirty = true;
      },
      // …
    );
  },
  ```
- [x] `src/main.ts`: In `onRemove` (Ort) das Solo vergessen, wenn es auf genau diesen Ort
      zeigt — **vor** `renderLocations()`, damit der Neuaufbau schon `soloIdFor()` mit
      `null` sieht:
      `if (settings.solo?.kind === 'location' && settings.solo.id === id) { forgetSolo(); }`
      Ein eigenes `setSolo()` braucht es hier nicht: `renderLocations()` baut die Liste
      ohnehin vollstaendig neu.
- [x] `docs/design.md`: Abschnitt **6.5** um einen Block „Solo" ergaenzen — was der Knopf
      tut, warum der zweite Druck den Stand von vorher herstellt statt alles einzublenden,
      warum „Solo laeuft" gespeichert und nicht abgeleitet wird (mit dem Fall „neuer Ort
      waehrend des Solo"), warum das Solo den Kaltstart ueberlebt und beim Start nicht
      aufgeloest wird, warum es hier — anders als bei der Birne — eine Ansage gibt, und
      dass die dritte Station je Zeile der bewusst gezahlte Preis ist. Im Absatz
      „Geschaltet wird in der Liste" (`design.md:637`) steht `„**zwei VoiceOver-Stationen
      je Ort** statt einer"` — auf drei berichtigen. In **6.4** (`design.md:602`) den Satz
      ueber den zweiten, unbeschrifteten Knopf rechts der Zeile um den dritten ergaenzen.

**Automated Verification**:
- [x] `npm test` — alle Suiten gruen, inklusive der neuen Faelle in `format.test.ts`.
- [x] `npm run typecheck` — fehlerfrei; insbesondere der neue Rueckruf in
      `LocationsViewCallbacks` und die geaenderte Signatur von `render()`.
- [x] `npm run build` — laeuft durch.

**Manual Verification**:
- [ ] Mit VoiceOver ueber die Orte-Liste wischen: Je Ort kommen drei Stationen —
      `"Bahnhof, Button"`, `"Alle außer Bahnhof ausblenden, Button"`,
      `"Bahnhof ausblenden, Button"`.
- [ ] Einen Ort einzeln ausblenden, dann Solo bei einem anderen tippen: Der Knopf liest
      sich als `"Vorherige Auswahl zurückholen"` neu vor, danach kommt
      `"6 von 7 Orten sind ausgeblendet."`, und der Fokus steht weiter auf dem Knopf.
- [ ] Erneut tippen: Der Ausgangsstand ist zurueck — der einzeln ausgeblendete Ort ist
      **noch immer dunkel**, alle anderen hell. Ansage
      `"1 von 7 Orten ist ausgeblendet."`, im Singular richtig.
- [ ] Solo auf A, dann direkt Solo auf B, dann zweiter Druck auf B: Der Ausgangsstand ist
      zurueck, nicht das A-Solo.
- [ ] Solo auf einen Ort tippen, der **selbst** ausgeblendet ist: Er wird hell, alle
      anderen dunkel.
- [ ] Waehrend eines Solos einen einzelnen Ort ueber seine Birne einblenden, dann den
      Solo-Knopf der vorher solo geschalteten Zeile suchen: Er heisst wieder
      `"Alle außer … ausblenden"` — der gemerkte Stand ist verfallen.
- [ ] App vom Home-Bildschirm neu starten, waehrend ein Solo laeuft: Der Knopf heisst
      weiter `"Vorherige Auswahl zurückholen"`, und ein Druck bringt den Ursprung zurueck.
- [ ] Waehrend eines Solos einen neuen Ort speichern, dann zweiter Druck auf die
      Solo-Zeile: Der neue Ort bleibt sichtbar, der Rest kommt wie gemerkt zurueck.
- [ ] Navigation starten und waehrend eines Laufs Solo tippen, wenn mehrere Ziele im Kegel
      liegen: Die absteigenden Zweiklaenge klingen, die Liste wird kuerzer.
- [ ] Zwei Symbole ansehen: Sind die Ringe auf 26 Pixeln von den Scheiben zu
      unterscheiden, und ist die Solo-Zeile beim Ueberfliegen zu finden?

### Phase 3: Der Knopf auf der Gruppen-Seite

Dependencies: Phase 2

Dieselbe dritte Station an jeder nicht leeren Gruppenzeile, verdrahtet ueber die
aufgeloesten Mitglieder. Danach ist die Story vollstaendig, und die Dokumentation zieht
nach.

**Tasks**:
- [x] `src/ui/groupsView.ts`: Rueckruf ergaenzen — `onToggleSolo(groupId: string): void`;
      `Row` um `readonly solo: HTMLButtonElement | null` erweitern; Feld
      `private soloId: string | null = null;`.
- [x] `src/ui/groupsView.ts`: `render(groups, locations, soloId)` merkt die Kennung.
      `buildRow()` legt den Solo-Knopf nach derselben Regel an wie die Birne — **nur** bei
      Mitgliedern.
  ```ts
  // Wie die Birne: Eine leere Gruppe bekommt keinen Solo-Knopf. Ein Tipp dort
  // blendete alles aus und liesse nichts uebrig - der einzige Fall, in dem Solo
  // etwas kaputt macht.
  const solo =
    members.length === 0
      ? null
      : (el('button', { type: 'button', class: 'icon-button' }) as HTMLButtonElement);
  solo?.addEventListener('click', () => {
    this.callbacks.onToggleSolo(group.id);
  });

  const children = [entry, ...(solo === null ? [] : [solo]), ...(toggle === null ? [] : [toggle])];
  return el('li', {}, [el('div', { class: 'entry-row' }, children)]) as HTMLLIElement;
  ```
- [x] `src/ui/groupsView.ts`: `dressSolo(row)` nach dem Vorbild der Orte-Ansicht; aus
      `dressRow()` mitgerufen, damit es nur eine Stelle gibt, die eine Zeile aufs Bild
      bringt.
  ```ts
  private dressSolo(row: Row): void {
    if (row.solo === null) {
      return;
    }
    const isSolo = this.soloId === row.group.id;
    setButtonLabel(
      row.solo,
      isSolo ? 'Vorherige Auswahl zurückholen' : `Alle außer ${row.group.name} ausblenden`,
      isSolo ? ICON_SOLO_ONE : ICON_SOLO_ALL,
    );
  }
  ```
- [x] `src/ui/groupsView.ts`: `setSolo(soloId)` — setzt die Kennung und zieht die Zeilen
      ueber `dressRow()` nach, ohne Ansage. Gebraucht wird das, wenn der gemerkte Stand
      **verfaellt**: `applyGroupHidden()` ruehrt zwar alle Zeilen an, weiss aber nichts
      von der neuen Solo-Kennung.
  ```ts
  setSolo(soloId: string | null): void {
    this.soloId = soloId;
    for (const row of this.rows.values()) {
      this.dressSolo(row);
    }
  }
  ```
- [x] `src/ui/groupsView.ts`: `applySolo(locations, soloId)` — zieht **alle** Zeilen nach
      (die Zahlen im Eintragsknopf aendern sich ueberall mit, ein Ort darf in mehreren
      Gruppen stehen) und sagt den Umfang an. Wie `applyGroupHidden()` nur Inhalte, nie
      Knoten.
  ```ts
  applySolo(locations: readonly Location[], soloId: string | null): void {
    this.soloId = soloId;
    this.locations = locations;
    for (const row of this.rows.values()) {
      row.members = this.callbacks.membersOf(row.group);
      // dressRow ruft dressSolo mit - die Kennung steht schon.
      this.dressRow(row);
    }
    this.announcer.announce(
      formatSoloAnnouncement(locations.filter((location) => location.hidden).length, locations.length),
    );
  }
  ```
- [x] `src/main.ts`: `renderGroups()` reicht die Kennung durch —
      `groupsView.render(groupService.all(), locationService.all(), soloIdFor('group'))`.
- [x] `src/main.ts`: `onToggleSolo` der Gruppen-Ansicht verdrahten. Die Mitglieder werden
      **vor** dem Schreiben aufgeloest, gegen die heutigen Orte.
  ```ts
  onToggleSolo: (groupId) => {
    const group = groupService.byId(groupId);
    if (group === null) {
      return;
    }
    const members = groupService.membersOf(group, locationService.all());
    toggleSolo(
      { kind: 'group', id: groupId },
      members.map((member) => member.id),
      () => {
        groupsView.applySolo(locationService.all(), soloIdFor('group'));
        // Das Orte-Panel ist verdeckt - vollstaendiges Zeichnen unkritisch.
        renderLocations();
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  ```
- [x] `src/main.ts`: In `onToggleGroupHidden` `forgetSolo()` rufen — **vor** der Schleife
      ueber `setHidden()`, aus demselben Grund wie bei der einzelnen Birne —, und nach
      `applyGroupHidden()` zusaetzlich `groupsView.setSolo(null)`. Der Fehlerzweig dort
      zeichnet ohnehin schon beide Ansichten vollstaendig neu und braucht nichts.
- [x] `src/main.ts`: Im `onRemove` der Gruppen das Solo vergessen, wenn es auf genau diese
      Gruppe zeigt — vor `renderGroups()`. Ein `setSolo()` ist hier unnoetig: Die Liste
      wird vollstaendig neu gebaut.
- [x] `docs/design.md`: Abschnitt **6.6** um einen Block zum Solo an der Gruppe ergaenzen —
      dass er wie die Birne nur an nicht leeren Gruppen steht, dass er **alle** Mitglieder
      hell macht, auch einzeln ausgeblendete, und dass der in 6.6 eingestandene Preis der
      Gruppen-Birne („Einblenden hebt eine einzeln gesetzte Ausblendung auf") hier
      **nicht** anfaellt: Der Schnappschuss macht den Griff umkehrbar. Dazu, dass Solo die
      Orte in einem einzigen Schreibzugriff schaltet und deshalb keinen Halbstand kennt,
      anders als der Reihenschalter daneben. In 6.5 auf 6.6 verweisen und zurueck. Der
      Satz „Die Gruppenzeile hat mit der Glühbirne ohnehin schon zwei Stationen"
      (`design.md:746`) wird zu drei — und derselbe Satz steht als Kommentar an
      `formatGroupEntryLabel` in `src/ui/format.ts`; er wird mit berichtigt.
- [x] `docs/design.md`: Entscheidungsprotokoll um **Nr. 48** ergaenzen — Solo-Knopf als
      dritte Station je Zeile; der zweite Druck stellt den Stand von vorher her; „Solo
      laeuft" wird gespeichert, die Sichtbarkeit bleibt allein am Ort.
- [x] `docs/notes.txt`: `- Solo-Button` nach DONE verschieben, auf `x` setzen und in zwei
      Saetzen beschreiben. Drei Praxistestfragen in die TODO-Liste: Faellt die dritte
      Station je Zeile im Gebrauch auf, nachdem die zweite es nicht tat? Ist das
      Punkte-Symbol auf 26 Pixeln als „einer von dreien" lesbar? Stoert die zusaetzliche
      Ansage nach dem Knopfnamen, oder traegt sie?

**Automated Verification**:
- [x] `npm test` — alle Suiten gruen.
- [x] `npm run typecheck` — fehlerfrei; insbesondere die geaenderte Signatur von
      `groupsView.render()` und der neue Rueckruf.
- [x] `npm run build` — laeuft durch.

**Manual Verification**:
- [ ] Mit VoiceOver ueber die Gruppen-Liste wischen: Nicht leere Gruppen haben drei
      Stationen, leere Gruppen weiterhin **eine**.
- [ ] Eine Gruppe mit einem einzeln ausgeblendeten Mitglied solo schalten: **Alle**
      Mitglieder sind hell, der Eintragsknopf sagt `"Kiez, 4 Orte"` ohne den Zusatz, und
      alle Nichtmitglieder sind dunkel.
- [ ] Zweiter Druck auf dieselbe Gruppe: Das einzeln ausgeblendete Mitglied ist **wieder
      dunkel**, der Zusatz `", 1 ausgeblendet"` ist zurueck, die uebrigen Orte sind hell.
- [ ] Nach einem Gruppen-Solo auf die Orte-Seite wechseln: Die Birnen und die
      Hinweiszeile dort zeigen denselben Stand.
- [ ] Solo auf eine Gruppe, dann Solo auf einen einzelnen Ort, dann zweiter Druck auf
      diesen Ort: Der Ursprung ist zurueck, nicht das Gruppen-Solo.
- [ ] Waehrend eines Gruppen-Solos die Gruppen-Birne einer anderen Gruppe tippen, dann die
      solo geschaltete Zeile suchen: Der gemerkte Stand ist verfallen, der Knopf heisst
      wieder `"Alle außer … ausblenden"`.
- [ ] Die solo geschaltete Gruppe loeschen: Die Orte behalten ihre Sichtbarkeit, und kein
      Knopf verspricht danach noch ein Zurueckholen.
- [ ] Sicherung erstellen und wieder einlesen: Die Orte kommen mit ihrer Sichtbarkeit
      zurueck; ein Solo-Zustand steht erwartungsgemaess **nicht** in der Datei.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/design.md` 3 (Farbsatz und Form statt Farbe), 4.3 (Knotenidentitaet und Fokus),
  6.4 (Liste und Dialoge), 6.5 (Ausblenden), 6.6 (Gruppen), 7 (keine zweite Kopie),
  9 (kein Framework)
- `docs/notes.txt` — offenes Item `- Solo-Button`
- `docs/agents/plans/2026-09-05-orte-ausblenden.md` (SLN-002) — legte `hidden`, die
  Gluehbirne und die Hinweiszeile an
- `docs/agents/plans/2026-09-05-gruppen.md` (SLN-003) — legte die Gruppen und den
  Reihenschalter an, dessen Halbstand dieser Plan vermeidet
- `src/main.ts` — `chooseTarget()` nennt den Grund, warum `settingsView.setSettings()`
  nach jeder Aenderung an den Einstellungen gerufen werden muss
- `src/ui/groupsView.ts` — `applyGroupHidden()` als Vorbild fuer das Nachziehen aller
  Zeilen ohne Knotenwechsel
