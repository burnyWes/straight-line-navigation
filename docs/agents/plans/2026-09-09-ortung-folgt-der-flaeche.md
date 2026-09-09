---
date: 2026-09-09T11:31:43+00:00
git_commit: 3cf5c4cf72e7da8619c425e56f0e245168154b32
branch: main
story: SLN-007
topic: "Ortung folgt der Flaeche statt einem Start-Knopf"
tags: [plan, navigation, trackingPolicy, navigationView, locationsView, wakeLock, serviceWorker]
status: done
---

# PLAN: SLN-007 — Ortung folgt der Flaeche statt einem Start-Knopf

Das offene Item `- Navigation-Tracking ueberdenken` aus `docs/notes.txt` umsetzen.

Der Start/Stopp-Knopf verlangt eine Entscheidung, die nie eine war: Auf der
Navigationsseite will man **immer** Ortungsdaten, sonst waere man nicht dort. Ein
Szenario fuer "hier sein und nicht orten wollen" gibt es nicht. Was der Knopf dagegen
tatsaechlich erzeugt hat, sind zwei Fehlermodi — der vergessene Start (die App sieht aus
wie kaputt: leere Liste, keine Toene, kein Hinweis) und der vergessene Stopp (Bildschirm
wach, GPS laeuft, niemand navigiert).

Kuenftig ist die **Flaeche der Schalter**: Navigationsseite und Anlegen-Dialog orten,
alles andere nicht. Was bleibt, ist genau der eine Tipp, den iOS technisch erzwingt — und
auch der nur, solange er noch etwas bewirkt.

Massgeblich fuer die fachlichen Entscheidungen bleibt `docs/design.md`; dieser Plan
ergaenzt sie dort, wo neue Entscheidungen fallen.

## Acceptance Criteria

- Auf der Navigationsseite laufen Ortung und Kompass, **ohne** dass ein Knopf gedrueckt
  wurde — in beiden Betriebsarten, "Orientierung" wie "Ziel".
- Im Dialog "Neuen Ort anlegen" laeuft die Ortung, auch wenn er von der Orte-Seite aus
  geoeffnet wurde. Kompass, Earcons und Wake Lock laufen dort **nicht**.
- Auf den Seiten "Orte" (ohne offenen Dialog), "Gruppen" und "Einstellungen" laeuft weder
  Ortung noch Kompass.
- Es gibt **keinen** Start- und **keinen** Stopp-Knopf mehr.
- Auf iOS steht im Kopf ein Knopf mit `aria-label` `"Kompass freigeben"`, wenn
  `DeviceOrientationEvent.requestPermission` existiert **und** eine Sekunde nach dem
  Oeffnen der Navigationsseite keine Kompassmessung eingetroffen ist. Nach der Freigabe
  verschwindet er fuer die Sitzung, und der Fokus springt auf die `h2`.
- Auf Browsern ohne `requestPermission` erscheint der Knopf nie.
- Wird die Freigabe abgelehnt, steht der bisherige Satz in der Statuszeile und wird einmal
  angesagt; der Knopf bleibt stehen, ein zweiter Versuch ist moeglich.
- Ein Tabwechsel ist eine **Pause**: Kegel-Hysterese, Listenzeilen, Betriebsart und der
  Zustand des Anhalten-Knopfes bleiben erhalten.
- Das **erste Bild**, nachdem die Navigationsseite wieder rechnet, loest keine Ein- und
  Austritts-Toene aus — auch nicht beim Kaltstart.
- Ein verborgenes Dokument pausiert Ortung und Kompass. Beim Zurueckkommen laufen beide
  ohne erneute Freigabe weiter.
- Eine neue Fassung der App wird beim Weglegen weiterhin uebernommen.
- Der Bildschirm bleibt wach, **sobald Standort und Kompass beide geliefert haben** —
  nicht davor. Beim Verlassen der Navigationsseite und beim Weglegen wird er freigegeben.
- Der zuletzt empfangene Standort wird beim Verlassen der Navigationsseite **nicht**
  verworfen; allein `isPositionStale()` entscheidet, ob er noch etwas taugt.
- "Aktuellen Standort speichern" meldet ohne Fix `"Noch kein Standort. Einen Moment warten
  und erneut versuchen."` statt `"… Zuerst die Navigation starten."`.
- Trifft im offenen Anlegen-Dialog der erste Fix ein, meldet dessen Statuszeile einmal
  `"Standort bereit, Genauigkeit 12 Meter."`.
- Die Statuszeile der Navigation folgt der neuen sechsstufigen Rangfolge (siehe unten).
- Beim Tabwechsel wird **nichts** angesagt — weder beim Verlassen noch beim Zurueckkommen.
- `docs/design.md` gibt den neuen Stand wieder: 2.1, 4.3, 4.6, 4.7, 5 und 6.1 sind
  angepasst, die Entscheidungstabelle bekommt einen Eintrag 49, Entscheidung 26 ist als
  ueberholt gekennzeichnet.

## Technical Key Decisions and Tradeoffs

1. **Die Flaeche ist der Schalter, nicht der Knopf:** Der Sensorbedarf wird aus
   `{navigationVisible, createDialogOpen, documentVisible, hasFix, hasHeading}` abgeleitet.
   - Why: Der vergessene Start sah aus wie eine kaputte App, der Stopp-Knopf hatte keinen
     Anwendungsfall. Ein abgeleiteter Zustand kann nicht vergessen werden.
   - Impact: Neues reines Anwendungsmodul `application/trackingPolicy.ts`, vollstaendig
     ohne Browser testbar. `running` in `main.ts` wird zur abgeleiteten Groesse; aus
     `startNavigation()`/`stopNavigation()` wird ein `updateTracking()`, das Abonnements
     mit dem Bedarf abgleicht.

2. **Ein Tipp pro App-Start bleibt — aber nur auf iOS und nur, solange er wirkt:** Knopf
   `"Kompass freigeben"` an der Stelle des bisherigen Start-Knopfes.
   - Why: iOS gibt den Kompass nur nach `requestPermission()` aus einer echten Beruehrung
     frei, und die Freigabe ueberlebt den Seitenaufbau nicht (`design.md` 5). Das ist
     Apples Sicherheitsmodell, keine Gestaltungsfrage.
   - Impact: Erkannt wird der Bedarf durch **Zuhoeren** (eine Sekunde ohne Messung), nicht
     durch einen ungefragten `requestPermission()`-Aufruf: Ein Aufruf ausserhalb einer
     Beruehrung koennte als Ablehnung haengenbleiben und die App dauerhaft lahmlegen.

3. **Tabwechsel ist Pause, nicht Ende:** kein `navigationService.reset()`, und das erste
   Bild nach dem Zurueckkommen wird stumm gerechnet.
   - Why: Ein Reset feuerte `"eingetreten"` fuer alles, was im Kegel liegt — genau der
     Schwall, vor dem `design.md` 4.7 schon einmal gewarnt hat.
   - Impact: Die Mechanik von `cuePort()` (rechnen, aber schweigen) wird einmalig statt
     dauerhaft benutzt. `markRunning()`/`markStopped()` weichen einem `setActive()`;
     `tabFreeze` entfaellt ersatzlos, weil eine pausierte Seite nichts umsortieren kann.

4. **Verborgenes Dokument pausiert die Sensoren:** damit ist der Bedarf beim Weglegen
   falsch, und das Update-Tor des Service Workers bleibt unveraendert wirksam.
   - Why: Sonst kaeme nie wieder eine neue Fassung an — die App wird immer auf der
     Navigationsseite weggelegt, und `isBusy()` waere dann immer wahr.
   - Impact: `visibilitychange` speist die Policy. Die Kompass-Freigabe muss das erneute
     `addEventListener` im selben Dokument ueberleben; das ist der eine Punkt, der am
     Geraet zu pruefen ist (Rueckfallweg in Phase 3 beschrieben).

5. **Der letzte Fix wird nicht mehr verworfen:** die vorhandene 12-Sekunden-Regel aus
   `design.md` 4.6 ist die Schonfrist fuer "Hier speichern".
   - Why: Kein zweiter Zeitbegriff neben den 12 Sekunden. Wer innerhalb dieser Frist vom
     Navigations-Tab ueber "Orte" zum Plus kommt, speichert ohne Wartezeit.
   - Impact: `latestFix = null` faellt weg; `isPositionStale()` entscheidet allein.

6. **Wake Lock erst, wenn Daten fliessen:** erster Fix **und** erste Kompassmessung.
   - Why: Sonst brennt der Bildschirm genau dort, wo er nichts nuetzt — abgelehnter
     Standort, nicht freigegebener Kompass, nichts laeuft.
   - Impact: Eine zusaetzliche Bedingung in der Policy, sonst nichts.

## Current State

```
Tipp auf "Navigation starten" (Symbol rechts neben der h2)
  |   main.ts:529 startNavigation()
  +- audioCue.unlock()                 Web Audio braucht eine echte Beruehrung
  +- requestHeadingPermission()        iOS: NUR aus einer echten Beruehrung
  |     abgelehnt -> showError(), Ende
  +- running = true                    main.ts:91
  +- navigationView.markRunning()      Liste, Anhalten-Knopf, Tonschalter sichtbar
  +- navigationService.reset()         Kegel-Hysterese und Freeze zurueck
  +- wakeLock.acquire()
  +- Geolocation.watchPosition()  -->  latestFix
  +- DeviceOrientation-Listener   -->  latestHeading
  +- requestAnimationFrame(tick)       ein Bild je Sekunde

Tipp auf "Navigation beenden"  ->  main.ts:590 stopNavigation()
  Sensoren ab, Wake Lock frei, latestFix/latestHeading = null, Dienste zurueck,
  Liste geleert, Ansage "Navigation beendet."
```

`running` wird an vier Stellen gelesen:

| Stelle | Wirkung |
|---|---|
| `tick()` main.ts:612,621 | Renderschleife und Sekunden-Herzschlag |
| `applyGuidanceTone()` main.ts:693 | Zielton klingt nur im Lauf |
| `registerServiceWorker(() => running)` main.ts:99 | keine neue Fassung waehrend eines Laufs |
| `NavigationView.running` | Sichtbarkeit von Liste, Anhalten-Knopf, Lautsprecher |

Der Tabwechsel beendet den Lauf **nicht**:

```
Tabs(..., (id) => navigationView.setPanelActive(id === 'navigation'))   main.ts:492
   +- nur tabFreeze: die Liste steht, Sensoren + Wake Lock + Earcons laufen weiter
      Begruendung design.md 4.3: "Hier speichern" im Bereich Orte braucht einen frischen Fix
```

Und daran haengt der zweite Verbraucher:

```
Orte > Plus > Dialog "Neuen Ort anlegen" > "Aktuellen Standort speichern"
   main.ts:145  fix = latestFix
   fix === null  -> "Kein Standort verfügbar. Zuerst die Navigation starten."  locationsView.ts:46
   fix veraltet  -> abgelehnt (design.md 6.1)
```

## Desired End State

```
                    +---------------------------------------------+
   Tabwechsel ----> |                                             |
   Dialog auf/zu -> |   trackingDemand(context)                   | --> position:   an/aus
   visibilitychange>|   application/trackingPolicy.ts (rein)      | --> navigating: an/aus
   erster Fix ----> |                                             | --> wakeLock:   an/aus
   erste Messung -> +---------------------------------------------+
                                       |
                    +------------------+------------------+
                    |                  |                  |
              Abonnements        NavigationView      ScreenWakeLock
           (Geo / Orientation)     setActive()        acquire/release
                    |
              registerServiceWorker(() => position || navigating)
```

| Flaeche | Standort | Kompass | Earcons / Zielton | Wake Lock |
|---|---|---|---|---|
| Navigation (Orientierung wie Ziel) | ja | ja | ja | sobald beide Daten liefern |
| Anlegen-Dialog (Orte > Plus) | ja | nein | nein | nein |
| Orte, Gruppen, Einstellungen | nein | nein | nein | nein |
| Dokument verborgen | nein | nein | nein | nein |

Der Kopf der Navigationsseite, vorher und nachher:

```
heute, vor dem Start:                     heute, waehrend des Laufs:
+------------------------------------+    +------------------------------------+
| Orientierung            [Dreieck]  |    | Orientierung            [Quadrat]  |
| ---------------------------------- |    | ---------------------------------- |
|                                    |    | Bahnhof, 1,2 Kilometer             |
| Noch nicht gestartet.              |    | Navigation läuft.                  |
+------------------------------------+    +------------------------------------+

neu, iOS vor der Freigabe:                neu, sobald der Kompass liefert:
+------------------------------------+    +------------------------------------+
| Orientierung            [Dreieck]  |    | Orientierung                       |
| ---------------------------------- |    | ---------------------------------- |
|                                    |    | Bahnhof, 1,2 Kilometer             |
| Kompass noch nicht freigegeben.    |    | Navigation läuft.                  |
| Den Knopf oben rechts tippen.      |    |                                    |
+------------------------------------+    +------------------------------------+
   aria-label "Kompass freigeben"            kein Knopf mehr im Kopf
```

Neue Rangfolge der Statuszeile (ersetzt die Tabelle in `design.md` 4.6):

| Rang | Bedingung | Orientierung | Ziel |
|---|---|---|---|
| 1 | gemeldete Stoerung | Text des Fehlers | Text des Fehlers |
| 2 | Kompass nicht freigegeben | "Kompass noch nicht freigegeben. Den Knopf oben rechts tippen." | dito |
| 3 | Standort veraltet | "Standort veraltet. Die Liste ist angehalten." | "Standort veraltet. Der Ton schweigt." |
| 4 | noch keine Daten | "Warte auf Standort und Kompass." | dito |
| 5 | Liste angehalten | "Liste angehalten." | entfaellt |
| 6 | sonst | "Navigation läuft." | "Navigation läuft." |

## Abstractions and Code Reuse

Wiederverwendet wird, was es schon gibt:

- `cuePort()` in `main.ts` kennt bereits "rechnen, aber schweigen" — das stumme erste Bild
  ist dieselbe Idee, nur einmalig statt dauerhaft.
- `isPositionStale()` in `application/positionFreshness.ts` bleibt der einzige Zeitbegriff
  fuer die Guete eines Fixes.
- `ScreenWakeLock.acquire()`/`release()` bleiben unveraendert; neu ist nur, wer sie ruft.
  `reacquireIfWanted()` faellt dagegen weg: Es hielt die Absicht "der Bildschirm soll wach
  sein" im Adapter fest, und genau diese Absicht steht jetzt in der Policy. Zwei Stellen,
  die dasselbe wissen, waeren eine zu viel.
- `ModalDialog` und die vorhandene Statuszeile des Anlegen-Dialogs (`createFeedback`,
  `role="status"`) tragen die neue Meldung ohne zusaetzlichen Knoten im Wischweg. Sein
  `close`-Ereignis — natives `<dialog>`, feuert auch bei Escape — traegt das Abmelden der
  Ortung, ohne dass jeder Schliessweg einzeln bedacht werden muss.
- `ui/format.ts` bleibt die eine Stelle fuer Wortlaute und Rundungen; die neue Meldung
  kommt dort dazu und nicht in die Ansicht.

Neu ist genau eine Abstraktion — die Regel selbst, als reine Funktion:

- `src/application`
  - `trackingPolicy.ts` — **neu**: leitet den Sensorbedarf aus der offenen Flaeche ab
    - `TrackingContext` - was gerade offen und was schon gemessen ist
    - `TrackingDemand` - `position`, `navigating`, `wakeLock`
    - `trackingDemand()` - die Regel, frei von DOM und Browser-APIs
  - `trackingPolicy.test.ts` — **neu**: Tabelle aller Faelle
- `src/adapters`
  - `deviceOrientationHeadingProvider.ts` - `headingPermissionRequired()` ergaenzt
    (existiert `requestPermission` ueberhaupt?)
- `src/ui`
  - `navigationView.ts` - Start/Stopp raus, Freigabe-Knopf rein, `setActive()` statt
    `markRunning()`/`markStopped()`, `tabFreeze` raus, neue `statusText()`-Raenge
  - `locationsView.ts` - meldet Oeffnen und Schliessen des Anlegen-Dialogs, neuer
    Fehlertext, `reportPositionReady()`
  - `format.ts` / `format.test.ts` - `formatPositionReady()` ergaenzt
- `src/main.ts` - `startNavigation()`/`stopNavigation()` weichen `updateTracking()`;
  `visibilitychange` speist die Policy; `registerServiceWorker` bekommt den neuen Bedarf
- `docs/design.md`, `docs/notes.txt` - Stand nachziehen

## Logging & Observability

Die App hat bewusst kein Logging: Sie laeuft auf einem Telefon in der Hand eines blinden
Nutzers, und die einzige Beobachtungsflaeche ist die Statuszeile. Genau deshalb ist ihre
Rangfolge oben Teil der Akzeptanzkriterien und nicht Kosmetik — sie ersetzt die Auskunft,
die bisher der Knopfname gab ("Navigation beenden" hiess ja auch: es laeuft).

Kein `console.log` im ausgelieferten Stand.

## Implementation

### Phase 1: Ortung folgt der Flaeche

Dependencies: None

Nach dieser Phase hat die Navigationsseite keinen Start- und keinen Stopp-Knopf mehr. Sie
ortet, sobald sie offen ist, pausiert beim Tabwechsel und nimmt beim Zurueckkommen den
Faden wieder auf, ohne zu klingen.

**Tasks**:

- [x] `src/application/trackingPolicy.ts` anlegen: `TrackingContext`, `TrackingDemand`,
      `trackingDemand()`. Rein, ohne Browser-APIs.
      ```ts
      export function trackingDemand(context: TrackingContext): TrackingDemand {
        const navigating = context.documentVisible && context.navigationVisible;
        return {
          position:
            context.documentVisible &&
            (context.navigationVisible || context.createDialogOpen),
          navigating,
          wakeLock: navigating && context.hasFix && context.hasHeading,
        };
      }
      ```
      In Phase 1 wird `documentVisible` fest mit `true` gespeist; Phase 3 haengt
      `visibilitychange` daran.
- [x] `src/application/trackingPolicy.test.ts`: Tabelle aller Kombinationen —
      Navigationsseite offen, nur Dialog offen, beides zu, Dokument verborgen, Wake Lock
      erst bei `hasFix && hasHeading`.
- [x] `deviceOrientationHeadingProvider.ts`: `headingPermissionRequired()` exportieren —
      `typeof ctor.requestPermission === 'function'`. Kommentar: Warum gefragt wird, ob
      gefragt werden muss.
- [x] `navigationView.ts`: `startButton`/`stopButton` durch **einen** `releaseButton`
      ersetzen (`aria-label` und `title` `"Kompass freigeben"`, `ICON_PLAY`, Klasse
      `icon-button primary`), von Anfang an `hidden`. Callback `onReleaseHeading()`
      ersetzt `onStart`/`onStop`.
- [x] `navigationView.ts`: `showHeadingRelease(show: boolean)` ergaenzen. Beim Ausblenden
      **nach** erfolgter Freigabe den Fokus auf `this.heading` setzen, falls der Fokus auf
      dem Knopf stand — sonst faellt der VoiceOver-Cursor auf den Rumpf.
- [x] `navigationView.ts`: `markRunning()`/`markStopped()` durch
      `setActive(active: boolean)` ersetzen. Aktiv: Liste, Anhalten-Knopf und Lautsprecher
      wie bisher ueber `applyMode()`. Inaktiv: **Zeilen bleiben stehen**, `rows` wird nicht
      geleert, `targetView.reset()` entfaellt, keine Ansage.
- [x] `navigationView.ts`: `setPanelActive()` und das Feld `tabFreeze` entfernen;
      `syncFreeze()` meldet nur noch `manualFreeze || modeFreeze`. Der Kommentar an
      `syncFreeze()` haelt fest, warum der dritte Grund entfaellt: Eine pausierte Seite
      rechnet nicht und kann darum nichts umsortieren.
- [x] `navigationView.ts`: `statusText()` auf die sechs Raenge umbauen. Zwei neue
      Parameter: `headingReleasePending` und `hasData`. Die Wortlaute
      `"Noch nicht gestartet."` und `"Navigation beendet."` fallen ersatzlos weg.
- [x] `navigationView.ts`: `render()` bricht nicht mehr bei `!running` ab, sondern bei
      `!active`. Die Statuszeile muss auch ohne Daten geschrieben werden — sonst steht beim
      ersten Oeffnen nichts da.
- [x] `main.ts`: Zustand umbauen — `running` weicht `context: TrackingContext` plus
      `positionUnsubscribe`/`headingUnsubscribe`. `startNavigation()` und
      `stopNavigation()` entfallen.
      ```ts
      function updateTracking(patch: Partial<TrackingContext>): void {
        context = { ...context, ...patch };
        const demand = trackingDemand(context);
        applyPositionSubscription(demand.position);
        applyHeadingSubscription(demand.navigating);
        applyWakeLock(demand.wakeLock);
        navigationView.setActive(demand.navigating);
        if (demand.navigating) {
          startLoop();
        }
      }
      ```
- [x] `main.ts`: `applyPositionSubscription()` und `applyHeadingSubscription()` gleichen
      Abonnements mit dem Bedarf ab — anmelden, wenn gewuenscht und nicht vorhanden;
      abmelden, wenn nicht gewuenscht und vorhanden. Beim Abmelden des Standorts
      `latestFix` **nicht** loeschen (Entscheidung 5); `latestHeading` ebenfalls halten,
      damit die Peilzeile beim Zurueckkommen nicht leer ist.
- [x] `main.ts`: `applyWakeLock(wanted)` — `acquire()` bei Bedarf und noch nicht gehalten,
      `release()`, sobald der Bedarf faellt. `ScreenWakeLock.isHeld` liefert die Bedingung
      bereits.
- [x] `main.ts`: Der erste Fix meldet `updateTracking({ hasFix: true })`, die erste Messung
      `updateTracking({ hasHeading: true })`. Ohne diese beiden Meldungen wird der Wake Lock
      nie angefordert — er haengt genau an ihnen (Entscheidung 6). Nur beim Wechsel melden,
      nicht bei jedem Ereignis: `watchPosition` und `deviceorientation` feuern laufend.
- [x] `main.ts`: `resumeSilent`-Flagge. Wird gesetzt, sobald `navigating` von falsch auf
      wahr wechselt (Kaltstart eingeschlossen). Im naechsten `renderNavigation()` mit
      gueltigem Fix werden `snapshot.entered`/`snapshot.left` verworfen und die Flagge
      geloescht — der Kegel setzt sich neu, ohne zu klingen.
- [x] `main.ts`: Renderschleife an `navigating` haengen statt an `running`. `startLoop()`
      merkt sich, dass sie laeuft, damit ein zweiter Aufruf keine zweite Schleife startet;
      `tick()` beendet sich selbst, sobald `navigating` falsch ist.
- [x] `main.ts`: `applyGuidanceTone()` prueft `trackingDemand(context).navigating` statt
      `running`. Der Kommentar ueber der Funktion bleibt gueltig und wird nur im Wortlaut
      von "Lauf" auf "Navigationsseite offen" gezogen.
- [x] `main.ts`: Tab-Rueckruf meldet
      `updateTracking({ navigationVisible: id === 'navigation' })` statt
      `navigationView.setPanelActive(...)`.
- [x] `main.ts`: Freigabe-Probe. Wird `navigating` wahr, ist noch nie eine Messung
      eingetroffen und `headingPermissionRequired()` wahr, laeuft ein Zeitgeber ueber
      1000 ms; ist danach immer noch keine Messung da,
      `navigationView.showHeadingRelease(true)`. Die erste eingetroffene Messung loescht
      Zeitgeber und Knopf endgueltig fuer die Sitzung.
- [x] `main.ts`: `onReleaseHeading()` — `audioCue.unlock()` (dieselbe Beruehrung entsperrt
      Web Audio), dann `requestHeadingPermission()`. Bei `false` den bisherigen
      Ablehnungstext ueber `navigationView.showError()`, Knopf bleibt stehen. Bei `true`
      das Kompass-Abonnement abmelden und neu anmelden — vor der Freigabe angemeldete
      Listener liefern auf iOS nichts nach.
- [x] `main.ts`: `registerServiceWorker` bekommt
      `() => { const d = trackingDemand(context); return d.position || d.navigating; }`
      statt `() => running`. Solange `documentVisible` in dieser Phase fest `true` ist,
      sperrt das Tor beim Weglegen von der Navigationsseite aus **jede** neue Fassung —
      das ist bekannt und wird in Phase 3 durch `visibilitychange` aufgeloest. Bis dahin
      nicht als Fehler behandeln.
- [x] `main.ts`: Einmalige Web-Audio-Entsperrung fuer Browser ohne Kompass-Freigabe — ein
      `pointerdown`-Lauscher mit `{ once: true }` auf `document`, der `audioCue.unlock()`
      ruft. Ohne ihn blieben Earcon und Zielton dort stumm, wo es keinen Freigabe-Knopf
      gibt.
- [x] `docs/design.md` 4.3: Der Absatz "Ein anderer Bereich haelt die Liste weiterhin an"
      wird ersetzt — der Bereichswechsel haelt jetzt den ganzen Lauf an, nicht nur die
      Liste. Der Satz "Der Navigationslauf selbst geht weiter" ist damit ueberholt. Ebenso
      der Punkt "Der Freeze-Zustand gehoert dem Lauf": Er gehoert jetzt dem Kaltstart, weil
      es kein Ende mehr gibt.
- [x] `docs/design.md` 4.6: Die Tabelle der Statuszeile durch die sechsstufige ersetzen.
- [x] `docs/design.md` 4.7: Der Satz "Der Anhalten-Knopf erscheint nur in Orientierung …
      beide nur bei laufender Navigation" bleibt richtig, "laufend" heisst jetzt "Seite
      offen". Ergaenzen, dass das erste Bild nach dem Zurueckkommen stumm gerechnet wird
      und warum (Schwall von Eintritts-Toenen).
- [x] `docs/design.md` 5: Den Punkt "Starten und Beenden stehen als Symbol rechts neben der
      Ueberschrift" durch "Kompass freigeben" ersetzen, samt Begruendung, warum der eine
      Tipp bleibt und warum durch Zuhoeren erkannt wird, ob er noetig ist.
- [x] `docs/design.md` Entscheidungstabelle: Eintrag 49 ergaenzen (Flaeche statt Knopf,
      Pause statt Ende, stummes erstes Bild, Freigabe-Knopf). Entscheidung 26 als durch 49
      ueberholt kennzeichnen, statt sie zu loeschen — die Tabelle ist ein Verlauf.

**Automated Verification**:
- [x] `npm test` — `trackingPolicy.test.ts` deckt ab: nur Navigationsseite -> Standort und
      `navigating`; nur Dialog offen -> Standort ohne `navigating`; nichts offen -> nichts;
      verborgenes Dokument schlaegt beides aus; `wakeLock` nur bei `hasFix && hasHeading`.
- [x] `npm test` — die bestehende Suite laeuft unveraendert durch.
- [x] `npm run typecheck` — keine Verweise auf `markRunning`, `markStopped`,
      `setPanelActive`, `onStart`, `onStop` mehr uebrig.
- [x] `npm run build`

**Manual Verification**:
- [x] Am Geraet: App vom Home-Bildschirm starten. Der Knopf `"Kompass freigeben"` steht im
      Kopf, die Statuszeile nennt den Grund. Ein Tipp, Systemdialog bestaetigen — Knopf
      weg, Fokus auf "Orientierung, Ueberschrift", Liste fuellt sich.
- [x] Am Geraet: Die Freigabe ablehnen. Der bisherige Satz wird angesagt, der Knopf bleibt,
      ein zweiter Tipp funktioniert.
- [x] Am Geraet: Auf "Orte" wechseln und zurueck. **Kein** Schwall von Eintritts-Toenen,
      die Liste steht sofort mit ihren alten Zeilen da und zieht binnen einer Sekunde nach.
- [x] Am Geraet: Liste anhalten, auf "Gruppen" wechseln, zurueck — der Knopf heisst weiter
      "Liste fortsetzen", die Liste steht.
- [x] Am Geraet: In "Ziel" wechseln, auf "Einstellungen" gehen — der Zielton verstummt;
      zurueck auf Navigation — die App steht wieder in "Ziel" und der Ton laeuft weiter.
- [x] Am Geraet: Waehrend die Navigationsseite offen ist, einmal ganz herumdrehen — Ein-
      und Austritts-Toene klingen wie bisher.

### Phase 2: Der Anlegen-Dialog ortet selbst

Dependencies: Phase 1

Nach dieser Phase braucht "Aktuellen Standort speichern" keinen laufenden Lauf mehr, und
der Dialog sagt, woran er gerade ist.

**Tasks**:

- [x] `locationsView.ts`: Zwei Rueckrufe in `LocationsViewCallbacks` ergaenzen —
      `onCreateDialogOpen()` und `onCreateDialogClose()`. Der erste wird in `openCreate()`
      gerufen, der zweite haengt an **einem** Lauscher auf `close` des
      `createDialog.element`. `ModalDialog` nutzt natives `<dialog>`; `close` feuert bei
      jedem Weg nach draussen — Knopf "Schließen", Escape und `closeKeepingFocus()` nach
      erfolgreichem Speichern. Ein Dialog, der zugeht, ohne die Ortung abzumelden, liesse
      GPS auf der Orte-Seite weiterlaufen; ein einziger Lauscher schliesst genau diese
      Luecke.
- [x] `locationsView.ts:46`: `'no-position'` umtexten auf
      `"Noch kein Standort. Einen Moment warten und erneut versuchen."`
- [x] `ui/format.ts`: `formatPositionReady(accuracyMetres: number)` ergaenzen —
      `"Standort bereit, Genauigkeit 12 Meter."`, gerundet wie `formatSaveConfirmation()`
      (`format.ts:72`). Die Wortlaute der App liegen in `format.ts` und sind dort getestet;
      eine zweite Rundungsregel neben der vorhandenen waere der Anfang zweier Wahrheiten.
- [x] `ui/format.test.ts`: Fall fuer `formatPositionReady()` — gerundete Meterzahl,
      derselbe Satzbau wie die Bestaetigung nach dem Speichern.
- [x] `locationsView.ts`: `reportPositionReady(accuracyMetres: number)` ergaenzen —
      schreibt `formatPositionReady(...)` in `createFeedback`, aber nur, wenn der
      Anlegen-Dialog offen ist.
- [x] `main.ts`: Die beiden Rueckrufe an `updateTracking({ createDialogOpen: … })` haengen.
- [x] `main.ts`: Im Fix-Rueckruf des Standort-Abonnements — trifft ein Fix ein, waehrend
      der Anlegen-Dialog offen ist und **vorher keiner** oder nur ein veralteter vorlag,
      einmal `locationsView.reportPositionReady(fix.accuracyMetres)`. Einmal, nicht je Fix:
      `watchPosition` liefert im Sekundentakt.
- [x] `docs/design.md` 6.1: Den Satz "und nennt dann den Grund ('Kein Standort verfügbar.
      Zuerst die Navigation starten.')" auf den neuen Wortlaut ziehen und ergaenzen, dass
      der Dialog selbst ortet und den ersten Fix meldet. Die 12-Sekunden-Regel als
      Schonfrist benennen (Verweis auf 4.6).

**Automated Verification**:
- [x] `npm test` — `format.test.ts` deckt `formatPositionReady()` ab, die uebrige Suite
      bleibt gruen.
- [x] `npm run typecheck`
- [x] `npm run build`

**Manual Verification**:
- [x] Am Geraet: Ohne vorher auf der Navigationsseite gewesen zu sein, direkt auf "Orte",
      Plus tippen, warten — die Zeile meldet `"Standort bereit, Genauigkeit … Meter."`,
      danach speichert "Aktuellen Standort speichern" auf Anhieb.
- [x] Am Geraet: Sofort nach dem Oeffnen auf "Aktuellen Standort speichern" tippen, bevor
      ein Fix da ist — es kommt `"Noch kein Standort. Einen Moment warten und erneut
      versuchen."`, der eingegebene Name bleibt stehen, der Dialog bleibt offen.
- [x] Am Geraet: Von der Navigationsseite zuegig ueber "Orte" zum Plus — der Fix ist sofort
      da, ohne Wartezeit (12-Sekunden-Schonfrist).
- [x] Am Geraet: Dialog schliessen und einige Minuten auf der Orte-Seite bleiben; danach
      erneut oeffnen — es wird wieder frisch geortet und der neue Fix gemeldet.

### Phase 3: Hintergrund, Bildschirm und Updates

Dependencies: Phase 1

Nach dieser Phase pausiert die App, wenn niemand hinsieht — und genau das haelt den Weg
fuer neue Fassungen offen.

**Tasks**:

- [x] `main.ts`: Den vorhandenen `visibilitychange`-Lauscher erweitern —
      `updateTracking({ documentVisible: document.visibilityState === 'visible' })`. Der
      bisherige `wakeLock.reacquireIfWanted()`-Aufruf entfaellt, weil das aus Phase 1
      stammende `applyWakeLock()` beim Sichtbarwerden ohnehin neu anfordert.
- [x] `main.ts`: Beim Wechsel von verborgen auf sichtbar die `resumeSilent`-Flagge setzen —
      derselbe Grund wie beim Tabwechsel: Was sich waehrend der Pause im Kegel geaendert
      hat, darf nicht in einem Schwall nachklingen.
- [x] `adapters/wakeLock.ts`: `reacquireIfWanted()` und das Feld `wanted` entfernen — ihr
      einziger Aufrufer ist weg, und die Absicht liegt jetzt in der Policy statt im
      Adapter. Der Klassenkommentar wird entsprechend gekuerzt.
- [x] `main.ts`: Nach dem Zurueckkommen darf die Freigabe-Probe **nicht** erneut anlaufen,
      wenn die Freigabe in dieser Sitzung schon erteilt wurde — sonst blinkt der Knopf bei
      jedem Wiedersehen kurz auf.
- [x] `docs/design.md` 2.1: Die Zeile "Kein Hintergrundbetrieb" ergaenzen — die App
      pausiert bei verborgenem Dokument jetzt **ausdruecklich**, statt es dem Einfrieren
      durch Safari zu ueberlassen; das ist die Bedingung dafuer, dass eine neue Fassung
      beim Weglegen ankommt.
- [x] `docs/design.md` 5: Den Punkt "Waehrend der Navigation haelt navigator.wakeLock den
      Bildschirm wach" praezisieren — jetzt: solange die Navigationsseite offen und sichtbar
      ist **und** Standort wie Kompass geliefert haben.
- [x] `docs/notes.txt`: `- Navigation-Tracking ueberdenken` nach DONE ziehen, mit
      Zusammenfassung im Stil der uebrigen Eintraege; die drei offenen Praxistests des
      Solo-Knopfes bleiben unberuehrt.
- [x] `docs/notes.txt`: Den Praxistest zur Kompass-Freigabe nach dem Hintergrund als
      offenen Punkt eintragen, falls er am Geraet nicht sauber abzunehmen ist.

**Automated Verification**:
- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run build`

**Manual Verification**:
- [x] Am Geraet, **der entscheidende Test**: Navigationsseite offen, App weglegen (zur
      Startseite wischen), einige Sekunden warten, zurueckkehren. Die Liste laeuft wieder
      an, **ohne** dass der Knopf "Kompass freigeben" erscheint. Erscheint er doch, verlangt
      iOS die Freigabe im selben Dokument erneut — dann greift der Rueckfallweg: Nur die
      **Ortung** wird bei verborgenem Dokument abgemeldet, die Kompass-Listener bleiben
      haengen, und `isBusy()` fuer den Service Worker haengt allein an `demand.position`.
- [x] Am Geraet: Nach dem Zurueckkommen klingt **kein** Schwall von Eintritts-Toenen.
- [x] Am Geraet: Navigationsseite offen liegen lassen, ohne dass der Kompass freigegeben
      ist — der Bildschirm schlaeft nach der Systemzeit ein (Wake Lock haengt an
      fliessenden Daten).
- [x] Am Geraet: Nach der Freigabe bleibt der Bildschirm wach; Wechsel auf "Orte" — er
      schlaeft wieder ein.
- [x] Am Geraet: Neue Fassung ausliefern, App weglegen, zurueckkehren — die neue Fassung
      ist da. Das ist die Probe darauf, dass das Update-Tor nicht zugemauert wurde.

## Implementation Notes

**Am Geraet abgenommen:** Alle fuenfzehn manuellen Punkte der drei Phasen gehen durch -
einschliesslich des entscheidenden Wegs durch den Hintergrund: Die App kommt zurueck,
ohne dass "Kompass freigeben" erneut erscheint, ohne Schwall von Eintritts-Toenen, und
eine neue Fassung kommt beim Weglegen weiterhin an. Der im Plan beschriebene
Rueckfallweg - nur die Ortung bei verborgenem Dokument abzumelden - wird damit nicht
gebraucht.

Abweichungen und Entscheidungen aus der Umsetzung:

- **`render(snapshot)` nimmt `NavigationSnapshot | null`** statt zweier neuer Parameter
  `headingReleasePending` und `hasData`. Der Freigabe-Zustand liegt ohnehin in der
  Ansicht (`showHeadingRelease()` setzt ihn), und "noch keine Daten" ist genau der Fall,
  in dem `main.ts` keinen Schnappschuss bilden kann - ein `null` sagt das, ein zweites
  Flag daneben waere eine zweite Wahrheit. `statusText()` bekam nur
  `headingReleasePending` dazu.
- **`showError()` fuehrt die Meldung als gemeldete Stoerung** (Rang 1), statt nur in die
  Zeile zu schreiben. Nur so ueberlebt der Ablehnungstext das naechste Bild - frueher
  rechnete beim Fehlschlag niemand dagegen an, jetzt rendert die Seite im Sekundentakt.
  Angesagt wird er bei jedem Tipp, anders als bei `setHeadingProblem()`.
- **Die Ansage "Standort veraltet" / "wieder da" schweigt beim ersten Bild nach einer
  Pause** (`silentResume` in `NavigationView`). Ohne das kaemen beim Zurueckkommen binnen
  einer Sekunde beide Saetze hintereinander: Der letzte Fix altert waehrend der Pause,
  und der erste neue macht ihn sofort wieder frisch. Das Akzeptanzkriterium "beim
  Tabwechsel wird nichts angesagt" verlangt es.
- **Die Renderschleife wird ausdruecklich abgebrochen** (`cancelAnimationFrame` in
  `stopLoop()`) statt sich selbst auslaufen zu lassen. Ein verborgenes Dokument bekommt
  keine Bilder mehr; ein bloss angefordertes, nie gerufenes Bild bliebe als Rest zurueck,
  und der naechste Start haette entweder gar keine Schleife oder zwei.
- **`targetView.reset()` entfernt**: Der einzige Aufrufer war `markStopped()`, und die
  Methode tat nichts, was `render()` bei leerer Peilung nicht ohnehin tut.
  `navigationService.reset()` und `guidanceService.reset()` bleiben - sie gehoeren zum
  Vertrag der Dienste und sind dort getestet.
- **Entscheidung 27 zusaetzlich als ueberholt gekennzeichnet**: Ihr zweiter Teil ("beendet
  den Lauf aber nicht") ist durch 49 aufgehoben, und ihre Begruendung ("Hier speichern"
  braucht einen frischen Fix) traegt seit dem selbst ortenden Anlegen-Dialog nicht mehr.
- **Smoke-Test im Browser** (Chrome, Vite-Dev): Kaltstart ohne Konsolenfehler, Statuszeile
  "Warte auf Standort und Kompass.", kein Start-Knopf; Wechsel auf "Orte" blendet den
  Anhalten-Knopf aus, Zurueckkommen holt ihn zurueck; Anlegen-Dialog auf und zu
  (auch ueber `close`) ohne Fehler. Ein verborgenes Dokument pausiert nachweislich - das
  automatisierte Fenster meldete `visibilityState: "hidden"`, und die Seite rechnete erst
  nach dem Sichtbarwerden. Anmerkung: Dieses Chrome kennt
  `DeviceOrientationEvent.requestPermission`, der Freigabe-Knopf erscheint dort also
  erwartungsgemaess nach einer Sekunde ohne Messung.

## References

- `docs/design.md` 2.1 (Grenzen des PWA-Weges), 4.3 (Anhalten der Liste), 4.6 (Statuszeile
  und veralteter Standort), 4.7 (Zielmodus), 5 (Interaktionsmodell), 6.1 (Aktuellen
  Standort speichern), Entscheidungen 26, 27, 32, 39, 44
- `docs/notes.txt` — offenes Item `- Navigation-Tracking ueberdenken`
- `src/main.ts:91,99,492,529,590,611,693` — Laufzustand, Update-Tor, Tab-Rueckruf
- `src/ui/navigationView.ts` — Kopf, Statuszeile, Freeze-Gruende
- `src/ui/locationsView.ts:46,510` — Fehlertexte und `openCreate()`
- `src/adapters/deviceOrientationHeadingProvider.ts:34` — `requestHeadingPermission()`
- `src/adapters/serviceWorker.ts:75` — Uebernahme beim Weglegen
- `src/adapters/wakeLock.ts` — `acquire`/`release`/`reacquireIfWanted`
