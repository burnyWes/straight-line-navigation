---
date: 2026-09-05T20:26:36+00:00
git_commit: a37a57bc9bf9befa860e8520222187ecd6647a23
branch: main
story: SLN-002
topic: "Orte ausblenden, ohne sie zu loeschen"
tags: [plan, ui, locationsView, locationService, location, serialization]
status: ready
---

# PLAN: SLN-002 — Orte ausblenden, ohne sie zu loeschen

Das offene Item „Ausblenden von Orten" aus `docs/notes.txt` umsetzen: Ein gespeicherter
Ort kann ausgeblendet werden. Er bleibt gespeichert, taucht in der Navigation aber nicht
mehr auf. Geschaltet wird das auf der Orte-Seite ueber einen zweiten Knopf am rechten
Rand jeder Zeile, mit einem Gluehbirnen-Symbol.

Der Zweck ist nicht Aufraeumen, sondern **Ruhe im Kegel**: Wer dauerhaft dreissig Orte
gespeichert hat, aber heute nur drei davon braucht, bekommt sonst bei jeder Drehung
Ein- und Austritts-Toene fuer Ziele, die ihn gerade nicht interessieren. Loeschen waere
die einzige heutige Abhilfe — und ohne Backend endgueltig (`design.md` 7).

Massgeblich fuer die fachlichen Entscheidungen bleibt `docs/design.md`; dieser Plan
ergaenzt sie dort, wo neue Entscheidungen fallen.

## Acceptance Criteria

- Jede Zeile der Orte-Liste hat rechts einen Knopf mit Gluehbirnen-Symbol.
- Der Knopf heisst `"<Name> ausblenden"`, wenn der Ort sichtbar ist, und
  `"<Name> einblenden"`, wenn er ausgeblendet ist. Symbolpfad und Klasse wechseln
  gemeinsam mit dem Namen.
- Tippen schaltet um und speichert sofort. Der Fokus bleibt auf dem Knopf; die uebrige
  Liste wird dabei **nicht** neu gebaut.
- Beim Umschalten geht **keine** zusaetzliche Ansage ueber den Announcer — der Knopf
  sagt sich durch seinen neuen Namen selbst an.
- Ausgeblendete Orte bleiben an ihrer alphabetischen Stelle in der Orte-Liste; die
  Reihenfolge haengt nicht am Zustand.
- Ausgeblendete Orte erscheinen nicht in der Navigationsliste und nehmen nicht am Kegel
  teil. Sind alle Orte ausgeblendet, bleibt die Navigationsliste leer.
- Auf der Orte-Seite steht die Zeile `"N von M Orten sind ausgeblendet."` — nur wenn
  `N > 0`, ohne `role="status"`, also ohne Live-Region.
- Der Zustand ueberlebt den Neustart der App und steckt in Sicherung wie Import.
- Bestehende Sicherungen ohne das Feld werden als sichtbar gelesen.
  `STORAGE_FORMAT_VERSION` bleibt 1.
- Neu angelegte Orte sind sichtbar.
- Schlaegt der Schreibzugriff fehl, bleibt der Knopf im alten Zustand, und der Fehlschlag
  wird in der Meldungszeile des Panels gemeldet.
- Wird waehrend eines Laufs ein Ort ausgeblendet, der gerade im Kegel liegt, klingt der
  Austritts-Ton — dasselbe Verhalten wie beim Loeschen.
- `docs/design.md` und `docs/notes.txt` geben den neuen Stand wieder.

## Technical Key Decisions and Tradeoffs

1. **Die Zeile bekommt einen zweiten Knopf:** Name links, Gluehbirne rechts.
   - Why: Ausblenden ist eine Reihenhandlung („heute nur die drei im Kiez"). Der Weg
     ueber den Bearbeiten-Dialog waere pro Ort zwei Tipps und eine Ebene tiefer.
   - Impact: Der Wischweg ueber die Orte-Seite verdoppelt sich — zwei VoiceOver-Stationen
     je Ort statt einer. Das ist der bewusst gezahlte Preis; der Knopf steht deshalb
     **hinter** dem Namen, damit ihn nur hoert, wer weiterwischt statt zu tippen.
2. **Der Knopf sagt, was der Tipp tut** (`"… ausblenden"` / `"… einblenden"`), kein
   `aria-pressed`.
   - Why: Dasselbe Muster faehrt der Anhalten-Knopf bereits (navigationView.ts:429–436).
     „Ausgewaehlt" muesste gedeutet werden — ausgewaehlt wofuer?
   - Impact: `aria-label` und Symbolpfad wechseln bei jedem Druck. Die Regel aus
     `design.md` 4.3 („ein fokussiertes Element nicht umbenennen") zielt auf die
     Navigationsliste, die sich **von allein** im Sekundentakt aendert. Hier ist die
     Umbenennung die Folge des eigenen Tippens und damit die Bestaetigung, nicht der
     Stoerer. Genau deshalb entfaellt die zusaetzliche Announcer-Meldung: Sie waere
     dieselbe Information ein zweites Mal.
3. **Stille Hinweiszeile auf der Orte-Seite** statt eines Eintrags in der
   Navigations-Statuszeile.
   - Why: `navigationService.ts:22` haelt fest, dass ein stillschweigend gefiltertes
     Ziel in einer Audio-App nicht bemerkbar ist — das ist der Grund, warum die
     Maximalentfernung standardmaessig unbegrenzt ist. Dieselbe Sorge trifft hier zu.
     Die Statuszeile scheidet aus: Sie hat eine feste Rangfolge und meldet nur, was
     *gerade jetzt* passiert (`design.md` 4.6).
   - Impact: ein neuer Knoten im Panel, bewusst **ohne** Live-Region.
4. **`LocationService.visible()` filtert, nicht `NavigationService`.**
   - Why: `NavigationService` beantwortet genau eine Frage — welche dieser Orte liegen
     im Kegel, wie weit, in welche Richtung. Das ist Geometrie. Ob ein Ort ueberhaupt
     mitspielen darf, ist eine Verwaltungsregel und gehoert zum verwaltenden Dienst.
   - Impact: eine Zeile in `main.ts`. Bekannter Preis: Ein spaeterer zweiter Aufrufer,
     der `all()` statt `visible()` nimmt, umgeht die Regel — bei einer Filterung im
     `NavigationService` koennte das nicht passieren. Es gibt genau einen Aufrufer, und
     er steht sichtbar in der aeussersten Schale.
5. **Das Feld heisst `hidden`, wird immer geschrieben, `STORAGE_FORMAT_VERSION` bleibt 1.**
   - Why: Die Aenderung ist rein additiv. Eine alte App-Fassung liest eine neue Datei und
     zeigt alle Orte; eine neue liest eine alte und nimmt „sichtbar" an. Kein Leser
     verhaelt sich je nach Nummer anders — `deserializeLocations` liest `version`
     ueberhaupt nicht. Eine Nummer hochzuzaehlen, die niemand prueft, behauptet eine
     Unvertraeglichkeit, die es nicht gibt.
   - Impact: `createLocation` bekommt `hidden?: boolean` mit Standard `false`. Bekannte
     Kollision: Im DOM heisst `element.hidden` etwas anderes, und in `locationsView.ts`
     stehen beide nebeneinander. `visible` haette die Kollision nicht, dafuer waere
     „fehlt bedeutet true" der unangenehmere Standardwert, und die ganze Sprache der App
     (Knopf, Hinweiszeile, Notizdatei) sagt „ausblenden".
6. **Ausblenden im laufenden Betrieb klingt wie Loeschen.**
   - Why: `navigationService.ts:138` entscheidet das fuer geloeschte Ziele bereits so.
     Der Ton meldet keinen erfundenen Weltzustand im Sinne von `design.md` 4.6, sondern
     eine Aenderung, die der Nutzer gerade selbst ausgeloest hat.
   - Impact: kein `forget()` an `NavigationService`, keine Verdrahtung von der
     Orte-Ansicht dorthin. Nur `dirty = true` nach dem Umschalten, damit das naechste
     Bild wirklich neu rechnet.
7. **Umschalten baut die Liste nicht neu, sondern aendert eine Zeile.**
   - Why: `render()` wirft heute die ganze Liste weg (`list.textContent = ''`). Wuerde
     das Umschalten `render()` rufen, verschwaende der gerade fokussierte Knopf und der
     VoiceOver-Cursor fiele auf den Rumpf — derselbe Fehlermodus, den `design.md` 9
     beschreibt.
   - Impact: `LocationsView` merkt sich je Ort beide Knoepfe statt nur den Namensknopf.
8. **Absicherung: keine DOM-Testumgebung.**
   - Why: haelt die schlanke Abhaengigkeitsliste aus `design.md` 9. Die Oberflaeche wird
     wie bisher am Geraet geprueft.
   - Impact: Domaene, Serialisierung und `LocationService` sind vollstaendig durch
     Vitest gedeckt; das Verhalten der Zeile steht in der manuellen Pruefung.

## Current State

**Datenfluss der Orte heute**

```
localStorage
  └─ StoredLocationRepository       Cache, save / remove / replaceAll
       └─ LocationService.all()     alphabetisch sortiert (de)
            ├─ locationsView.render(all())                    Orte-Seite
            └─ main.renderNavigation():
                 navigationService.update(fix, heading, all())
                      measure -> withinRange -> ViewCone -> sortFarthestFirst
```

`Location` (src/domain/location.ts:7) hat fuenf Felder: `id`, `name`, `coordinate`,
`accuracyMetres`, `createdAt`. Serialisiert wird flach (`locationSerialization.ts:29`)
unter `version: 1`; `toLocation()` verwirft einen Eintrag nur bei fehlendem
`id`/`name`/`lat`/`lon` und ignoriert unbekannte Felder.

**Eine Zeile der Orte-Liste heute** (locationsView.ts:301)

```
<li>
  └─ <button class="entry">Bahnhof</button>       volle Breite, nur der Name
</li>

VoiceOver:  "Bahnhof, Button"                     eine Station je Ort
Tippen  ->  Bearbeiten-Dialog
```

`render()` leert die Liste und baut alle Zeilen neu. Das ist heute unkritisch, weil die
Orte-Liste nur nach einer abgeschlossenen Handlung gezeichnet wird — anders als die
Navigationsliste, die im Sekundentakt laeuft und deshalb Knotenidentitaet wahrt.

**Muster, an die sich das Neue anlehnt**

- `icon(path)` erzeugt ein `aria-hidden`-SVG; der Name des Knopfes steht im `aria-label`
  (dom.ts:52). Symbolpfade sind Konstanten: `ICON_PLAY`, `ICON_STOP`, `ICON_PAUSE`,
  `ICON_PLUS`.
- `.icon-button` ist mindestens 52 x 52 Pixel gross (styles.css:198).
- Der Anhalten-Knopf tauscht bei jedem Wechsel `aria-label` und Symbolpfad gemeinsam
  (navigationView.ts:429–436).
- Schreibzugriffe laufen durch `guardStorage()` in `main.ts:390` und melden jeden
  Fehlschlag, statt ihn zu schlucken.

## Desired End State

```
LocationService
   all()      -> alle Orte, alphabetisch          -> Orte-Seite
   visible()  -> ohne ausgeblendete, alphabetisch -> Navigation
   setHidden(id, hidden) -> Location | null
```

**Eine Zeile der Orte-Liste danach**

```
Orte                                              (+)
──────────────────────────────────────────────────────
2 von 7 Orten sind ausgeblendet.                        <- neu, still
──────────────────────────────────────────────────────
┌──────────────────────────────────────────┬────────┐
│ Baecker                                  │  (·)   │   ausgeblendet
└──────────────────────────────────────────┴────────┘
┌──────────────────────────────────────────┬────────┐
│ Bahnhof                                  │  (¤)   │   sichtbar
└──────────────────────────────────────────┴────────┘

VoiceOver, Wischweg:
  "Baecker, Button"  ->  "Baecker einblenden, Button"
  "Bahnhof, Button"  ->  "Bahnhof ausblenden, Button"
```

Die Navigationsansicht aendert sich nicht — sie bekommt schlicht eine kuerzere Liste
gereicht.

## Abstractions and Code Reuse

Wiederverwendet werden `icon()`/`el()`/`setText()` aus `ui/dom.ts`, die Klasse
`.icon-button`, das Umschaltmuster des Anhalten-Knopfes und `guardStorage()` in `main.ts`.
Neu ist nur ein Feld auf `Location`, zwei Methoden auf `LocationService`, zwei Symbolpfade
und die zweite Schaltflaeche je Zeile. Kein neuer Port, kein neuer Dienst.

- `src/domain`
  - `location.ts` — neues Feld und Standardwert
    - `Location` — `readonly hidden: boolean`
    - `createLocation` — nimmt `hidden?: boolean`, Standard `false`
  - `location.test.ts` — Standardwert und Durchreichen
- `src/adapters`
  - `locationSerialization.ts` — Feld schreiben und tolerant lesen
    - `serializeLocations` — schreibt `hidden` immer
    - `toLocation` — `typeof value === 'boolean' ? value : false`
  - `storedLocationRepository.test.ts` — Rundlauf mit ausgeblendetem Ort
- `src/application`
  - `locationService.ts` — Verwaltungsregel
    - `visible()` — `all()` ohne ausgeblendete
    - `setHidden(id, hidden)` — schreibt und gibt den neuen Stand zurueck
  - `locationService.test.ts` — beide Methoden, inklusive unbekannter Kennung
- `src/testing`
  - `fixtures.ts`
    - `testLocation` — optionaler vierter Parameter `hidden = false`
- `src/ui`
  - `dom.ts` — `ICON_BULB_ON`, `ICON_BULB_OFF`
  - `locationsView.ts` — zweite Schaltflaeche, Hinweiszeile, gezieltes Aktualisieren
    - `LocationsViewCallbacks` — `onToggleHidden(id, hidden)`
    - `rows` — `Map<string, { entry, toggle, location }>` statt `entryButtons`
    - `buildRow` — `li > div.entry-row > [button.entry][button.icon-button]`
    - `applyHidden(location)` — aendert genau eine Zeile plus Hinweiszeile
    - `renderHiddenHint()` — `"N von M Orten sind ausgeblendet."` oder leer
  - `styles.css` — `.entry-row`, `.bulb-off`
- `src/main.ts` — `visible()` fuer die Navigation, `onToggleHidden` verdrahten
- `docs/design.md`, `docs/notes.txt` — neuer Stand

## Logging & Observability

Keine. Die App hat kein Logging; Rueckmeldung geschieht ausschliesslich ueber die
Meldungszeile und den Announcer, und beides ist in den Akzeptanzkriterien beschrieben.

## Implementation

### Phase 1: Der Zustand

Dependencies: None

Der Ort traegt sein Ausgeblendet-Sein, es ueberlebt Speichern, Sicherung und Import, und
die Navigation bekommt nur noch die sichtbaren Orte gereicht. Ohne jede Aenderung an der
Oberflaeche — nachweisbar, indem eine Sicherung mit `"hidden": true` eingelesen wird.

**Tasks**:
- [x] `src/domain/location.ts`: Feld ergaenzen und im Erzeuger belegen.
  ```ts
  export interface Location {
    // …
    /** Ausgeblendet: bleibt gespeichert, nimmt aber nicht an der Navigation teil. */
    readonly hidden: boolean;
  }

  export function createLocation(input: {
    // …
    hidden?: boolean;
  }): Location {
    // …
    return { /* … */ hidden: input.hidden ?? false };
  }
  ```
- [x] `src/domain/location.test.ts`: Ein Ort ohne Angabe ist sichtbar; `hidden: true`
      wird durchgereicht.
- [x] `src/testing/fixtures.ts`: `testLocation(name, point, accuracyMetres = null,
      hidden = false)` — vierter Parameter, damit bestehende Aufrufe unveraendert bleiben.
- [x] `src/adapters/locationSerialization.ts`: In `serializeLocations` `hidden` immer
      mitschreiben; in `toLocation` tolerant lesen — `typeof record['hidden'] ===
      'boolean' ? record['hidden'] : false`. `STORAGE_FORMAT_VERSION` bleibt 1.
- [x] `src/adapters/storedLocationRepository.test.ts`: Rundlauf mit einem ausgeblendeten
      Ort; ein Dokument **ohne** das Feld liest sich als sichtbar.
- [x] `src/application/locationService.ts`: `visible()` und `setHidden()`.
  ```ts
  /**
   * Was navigiert wird. Ausgeblendete Orte bleiben gespeichert, nehmen aber
   * nicht am Kegel teil (docs/design.md 6.5).
   */
  visible(): readonly Location[] {
    return this.all().filter((location) => !location.hidden);
  }

  setHidden(id: string, hidden: boolean): Location | null {
    const existing = this.repository.all().find((location) => location.id === id);
    if (existing === undefined) {
      return null;
    }
    const next = createLocation({ ...existing, hidden });
    this.repository.save(next);
    return next;
  }
  ```
- [x] `src/application/locationService.test.ts`: `visible()` laesst ausgeblendete weg und
      bleibt alphabetisch; `setHidden()` schreibt ins Repository und gibt den neuen Stand
      zurueck; unbekannte Kennung liefert `null` und schreibt nichts; ein neu ueber
      `saveCurrentPosition`/`saveFromText` angelegter Ort ist sichtbar; `merge()` behaelt
      den Zustand eingelesener Orte.
- [x] `src/main.ts`: In `renderNavigation()` `locationService.visible()` statt
      `locationService.all()` uebergeben. Die Aufrufe fuer `locationsView.render(…)`
      bleiben bei `all()`.

**Automated Verification**:
- [x] `npm test` — alle Suiten gruen, inklusive der neuen Faelle in `location.test.ts`,
      `storedLocationRepository.test.ts` und `locationService.test.ts`.
- [x] `npm run typecheck` — fehlerfrei. Fangnetz fuer die Stellen, an denen `Location`
      von Hand gebaut wird: Das Feld ist nicht optional.
- [x] `npm run build` — laeuft durch.

**Manual Verification**:
- [ ] Eine Sicherung von Hand um `"hidden": true` an einem Ort ergaenzen, ueber
      Einstellungen einlesen, Navigation starten: Der Ort erscheint nicht in der Liste,
      auch nicht, wenn man sich zu ihm dreht. Auf der Orte-Seite steht er weiterhin.
- [ ] Eine **bestehende** Sicherung ohne das Feld einlesen: alle Orte sichtbar, keine
      Meldung ueber beschaedigte Eintraege.

### Phase 2: Der Knopf

Dependencies: Phase 1

Die Gluehbirne in der Zeile, die Hinweiszeile darueber, und die Dokumentation.

**Tasks**:
- [x] `src/ui/dom.ts`: Zwei Symbolpfade ergaenzen, im Stil der vorhandenen (von Hand
      geschrieben, keine Bildbibliothek — `design.md` Entscheidung 25). Leuchtend traegt
      Strahlen, dunkel nicht; die Silhouetten muessen sich auch ohne Farbe unterscheiden.
  ```ts
  /** Gluehbirne mit Strahlen: der Ort wird navigiert. */
  export const ICON_BULB_ON =
    'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3zM8.5 17.5h7v2h-7zm1.5 3h4v1.5h-4z' +
    'M1.5 11h3v1.6h-3zm18 0h3v1.6h-3zM4 3.9l1.1-1.1 2.1 2.1-1.1 1.1zm12.8 1l2.1-2.1 1.1 1.1-2.1 2.1z';

  /** Dieselbe Birne ohne Strahlen: der Ort ist ausgeblendet. */
  export const ICON_BULB_OFF =
    'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3zM8.5 17.5h7v2h-7zm1.5 3h4v1.5h-4z';
  ```
- [x] `src/ui/locationsView.ts`: Rueckruf ergaenzen —
      `onToggleHidden(id: string, hidden: boolean): void`.
- [x] `src/ui/locationsView.ts`: `entryButtons` durch `rows` ersetzen.
  ```ts
  interface Row {
    readonly entry: HTMLButtonElement;
    readonly toggle: HTMLButtonElement;
    location: Location;
  }
  private readonly rows = new Map<string, Row>();
  ```
      `focusEntry(id)` greift danach auf `rows.get(id)?.entry`.
- [x] `src/ui/locationsView.ts`: `buildRow()` erzeugt beide Knoepfe nebeneinander.
  ```ts
  const toggle = el('button', {
    type: 'button',
    class: 'icon-button',
  }) as HTMLButtonElement;
  toggle.addEventListener('click', () => {
    const row = this.rows.get(location.id);
    if (row !== undefined) {
      // Der Zustand kommt aus der Zeile, nicht aus der Schliessung: Nach dem
      // Umschalten haelt die Zeile den neuen Stand, die Schliessung den alten.
      this.callbacks.onToggleHidden(location.id, !row.location.hidden);
    }
  });
  // Name links, Gluehbirne rechts - im DOM in dieser Reihenfolge, damit der
  // Wischweg erst den Ort nennt und dann, was man mit ihm tun kann.
  return el('li', {}, [el('div', { class: 'entry-row' }, [button, toggle])]);
  ```
- [x] `src/ui/locationsView.ts`: Eine private `dressToggle(row)` setzt `aria-label`,
      `title`, Symbolpfad und Klasse aus `row.location.hidden` — von `buildRow()` **und**
      `applyHidden()` gerufen, damit es nur eine Stelle gibt, die den Zustand aufs Bild
      bringt. `aria-label` ist `` `${name} ausblenden` `` bzw. `` `${name} einblenden` ``.
      Der Symbolwechsel folgt dem Anhalten-Knopf: das alte SVG ersetzen, wie
      `navigationView.ts:434` es tut.
- [x] `src/ui/locationsView.ts`: `applyHidden(location: Location): void` — aktualisiert
      `row.location`, ruft `dressToggle()` und `renderHiddenHint()`. **Kein**
      `render()`, kein `announcer.announce()`: Der Knopf traegt seinen neuen Namen und
      sagt sich damit selbst an; der Fokus bleibt, wo er ist.
- [x] `src/ui/locationsView.ts`: Hinweiszeile als `el('p', { class: 'hint' })` — bewusst
      ohne `role="status"`, sonst spraeche sie bei jedem Umschalten mit. Sie steht im
      Panel zwischen Meldungszeile und Liste. `renderHiddenHint()` zaehlt ueber `rows`
      und setzt `"N von M Orten sind ausgeblendet."` oder leert die Zeile; bei `N === 0`
      zusaetzlich `hidden = true`, damit sie gar nicht erst im Wischweg liegt.
- [x] `src/ui/locationsView.ts`: `render()` fuellt `rows` statt `entryButtons` und ruft am
      Ende `renderHiddenHint()`.
- [x] `src/ui/styles.css`: `.entry-row` als Flex-Zeile (Namensknopf `flex: 1`, Gluehbirne
      `flex: none`, `gap: 8px`, `align-items: center`), `button.entry` verliert dort seine
      volle Breite. `.icon-button.bulb-off` bekommt `color: var(--dim)` — auf `--panel`
      (#333 auf #fff) liegt das ueber 7:1 und bleibt damit im Farbrahmen aus `design.md` 3.
      Der bestehende Kommentar ueber `[hidden] { display: none !important; }` gilt weiter:
      Die neue Regel setzt `display` nur auf `.entry-row`, nicht auf die Knoepfe.
- [x] `src/main.ts`: `onToggleHidden` verdrahten.
  ```ts
  onToggleHidden: (id, hidden) => {
    guardStorage(
      () => {
        const updated = locationService.setHidden(id, hidden);
        if (updated === null) {
          return;
        }
        locationsView.applyHidden(updated);
        // Der Kegel rechnet im naechsten Bild mit der kuerzeren Liste. Liegt der
        // Ort gerade darin, klingt der Austritts-Ton - wie beim Loeschen.
        dirty = true;
      },
      (message) => {
        // Der Knopf bleibt im alten Zustand: applyHidden wurde nicht erreicht.
        locationsView.reportStorageError(message);
      },
    );
  },
  ```
- [x] `docs/design.md`: Neuer Abschnitt **6.5 „Ausblenden"** — was es tut, warum es nicht
      Loeschen ist, warum der zweite Knopf den Wischweg wert ist, warum die Hinweiszeile
      existiert (Gegenstueck zur Begruendung der unbegrenzten Maximalentfernung) und warum
      das Ausblenden im Lauf denselben Ton erzeugt wie das Loeschen. In 6.4 den Satz „zeigt
      **nur den Namen**" um den zweiten Knopf ergaenzen, damit die beiden Abschnitte sich
      nicht widersprechen. In 4.1 beim harten Filter vermerken, dass ausgeblendete Orte den
      Kegel gar nicht erst erreichen. Entscheidungsprotokoll um **Nr. 33** ergaenzen.
- [x] `docs/notes.txt`: `- Ausblenden von Orten` nach DONE verschieben und auf `x` setzen.
      Praxistestfrage in der TODO-Liste ergaenzen: Verdoppelt der zweite Knopf den
      Wischweg spuerbar, oder faellt es im Gebrauch nicht auf?

**Automated Verification**:
- [x] `npm test` — alle Suiten gruen.
- [x] `npm run typecheck` — fehlerfrei; insbesondere der neue Rueckruf in
      `LocationsViewCallbacks` und die verschwundene `entryButtons`-Verwendung.
- [x] `npm run build` — laeuft durch.

**Manual Verification**:
- [ ] Mit VoiceOver ueber die Orte-Liste wischen: Je Ort kommen zwei Stationen, erst
      `"Bahnhof, Button"`, dann `"Bahnhof ausblenden, Button"`.
- [ ] Den Gluehbirnen-Knopf antippen: VoiceOver sagt `"Bahnhof einblenden"`, der Fokus
      bleibt auf dem Knopf, die uebrige Liste ruehrt sich nicht, und es kommt **keine**
      zweite Ansage.
- [ ] Erneut antippen: zurueck auf `"Bahnhof ausblenden"`.
- [ ] Vom Seitenanfang wischen: Die Zeile `"2 von 7 Orten sind ausgeblendet."` ist zu
      hoeren, sobald mindestens ein Ort ausgeblendet ist — und bei keinem gar nicht.
- [ ] Navigation starten und in die Blickrichtung eines ausgeblendeten Ortes drehen: Der
      Ort erscheint nicht in der Liste, es klingt kein Eintritts-Ton.
- [ ] Waehrend eines Laufs: einen Ort ausblenden, der gerade im Kegel liegt — der
      absteigende Zweiklang klingt, beim Einblenden der aufsteigende.
- [ ] App vom Home-Bildschirm neu starten: Der ausgeblendete Ort ist noch ausgeblendet.
- [ ] Sicherung erstellen, in eine Notiz einfuegen, wieder einlesen: Der Zustand kommt mit.
- [ ] Reihenfolge pruefen: Ein ausgeblendeter Ort bleibt an seiner alphabetischen Stelle
      und wandert nicht ans Listenende.

## Implementation Notes

**Abweichung vom Plan (Phase 2):** `setButtonLabel()` war eine modulprivate Funktion in
`navigationView.ts`. Statt sie in `locationsView.ts` ein zweites Mal zu schreiben, ist sie
nach `ui/dom.ts` gewandert; beide Ansichten benutzen jetzt dieselbe. Der Plan sagte nur
„wie `navigationView.ts:434` es tut" — eine Kopie waere die woertlichere, aber schlechtere
Umsetzung gewesen, weil Name und Symbol dann an zwei Stellen auseinanderlaufen koennen.

**Noch offen:** Die beiden Symbolpfade sind von Hand geschrieben und am Rechner nie
gesehen worden. Ob die Birne auf 26 Pixeln als Birne lesbar ist, steht als Praxistestfrage
in `docs/notes.txt`. Sie zu aendern beruehrt nichts ausser `ui/dom.ts`.

**Manuelle Pruefung Phase 1:** Der Import einer von Hand um `"hidden": true` ergaenzten
Sicherung ist durch die Pruefungen in Phase 2 mit abgedeckt — sobald der Knopf da ist,
laesst sich derselbe Zustand ohne Texteditor herstellen. Die zweite Haelfte (eine
bestehende Sicherung ohne das Feld liest sich als sichtbar) bleibt sinnvoll und steht in
der Liste unten.

## References

- `docs/design.md` 3 (Farbsatz), 4.1 (harter Filter), 4.3 (Knotenidentitaet und Fokus),
  4.6 (Rangfolge der Statuszeile), 6.4 (Liste und Dialoge), 7 (keine zweite Kopie),
  9 (kein Framework)
- `docs/notes.txt` — offenes Item „Ausblenden von Orten"
- `docs/agents/plans/2026-09-05-orte-dialoge-und-fixierte-tabs.md` (SLN-001) — legte die
  Zeilenstruktur und die Dialoge an, auf denen dieser Plan aufsetzt
- `src/application/navigationService.ts:22` — Begruendung, warum stillschweigendes
  Filtern in einer Audio-App gefaehrlich ist
- `src/application/navigationService.ts:138` — geloeschte Ziele melden sich als
  ausgetreten; Vorbild fuer Entscheidung 6
- `src/ui/navigationView.ts:429` — Umschaltmuster fuer `aria-label` und Symbolpfad
