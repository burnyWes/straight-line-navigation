---
date: 2026-09-07T06:34:12+00:00
git_commit: 6bab587a6be7f17aea2654d8db9e0e335e9965b5
branch: main
story: SLN-005
topic: "Zielmodus: eine Peilung, ein Ton"
tags: [plan, ui, navigationView, targetView, guidanceService, guidance, format, settings, audio]
status: ready
---

# PLAN: SLN-005 — Zielmodus: eine Peilung, ein Ton

Das offene Item „Navigationsseite erweitern" aus `docs/notes.txt` umsetzen: Der Bereich
„Navigation" bekommt eine zweite Betriebsart. **Orientierung** ist die heutige
Kegel-Liste — was liegt gerade in Blickrichtung. **Ziel** ist neu: ein ausgewaehlter Ort,
eine Peilzeile, ein Kreisbild und ein fortlaufender Ton, dessen Hoehe die Richtung und
dessen Takt die Entfernung traegt.

Der Unterschied ist nicht kosmetisch. Die Orientierungsseite beantwortet „was ist da?",
die Zielseite beantwortet „wo ist **das**?" — und sie beantwortet es **ohne Sprache und
ohne Wischen**, waehrend beide Haende und die Aufmerksamkeit beim Gehen sind. Genau dafuer
ist der Ton da: Er laeuft nebenher, und man dreht sich, bis er am hoechsten klingt.

**Dieser Plan hebt ein Nicht-Ziel auf.** `design.md` §10 fuehrt „Entfernung als
Tonhoehe/Klickrate kodiert" als bewusst nicht gebaut, mit der Begruendung „reizvolle
Erweiterung, kein Fundament — **erst nach Praxiserfahrung**". Die Bedingung ist
eingetreten: Vier Praxistestrunden liegen hinter der App, das Fundament steht, und der
Nutzer fordert die Erweiterung an. Die Zeile in §10 wird deshalb nicht umgangen, sondern
gestrichen und durch den Verweis auf §4.7 ersetzt.

---

## Acceptance Criteria

- Der Bereich „Navigation" hat zwei Betriebsarten, **Orientierung** und **Ziel**. Ein
  schwebender Knopf unten links wechselt und benennt, was der Tipp bewirkt („Zum Ziel
  wechseln" / „Zur Orientierung wechseln").
- Die `h2` des Bereichs traegt den Namen der Betriebsart statt „Navigation"; nach dem
  Wechsel steht der Fokus auf ihr, ohne zusaetzliche Ansage.
- Die App startet **immer** in „Orientierung"; die Betriebsart wird nicht gespeichert.
- Die Zielseite zeigt oben ein Auswahlrad mit **allen** gespeicherten Orten,
  alphabetisch, mit Vorgabeoption „Ziel waehlen" — auch mit ausgeblendeten. Gibt es
  keine Orte, entfaellt das Rad und an seiner Stelle steht der Grund.
- Die Zielwahl liegt in `AppSettings` und ueberlebt Beenden und Neustart. Ein
  geloeschter Ort faellt still auf „kein Ziel" zurueck.
- Die Peilzeile ist ein `<button class="entry">` und liest „30 Grad rechts,
  1,2 Kilometer": Richtung zuerst, auf 5 Grad gerundet, „geradeaus" bei 0, „genau hinter
  dir" ab 175 Grad. Sie behaelt ihre Beschriftung, solange der Fokus auf ihr steht.
- Ohne gewaehltes Ziel steht an ihrer Stelle der Grund, nicht Stille.
- In der Betriebsart „Ziel" klingt **kein** Kegel-Earcon; der Kegel rechnet dabei
  weiter, damit seine Hysterese beim Zurueckwechseln keinen Schwall ausloest.
- Der Anhalten-Knopf erscheint nur in „Orientierung", der Lautsprecher-Knopf nur in
  „Ziel"; beide nur bei laufender Navigation.
- Ein Lautsprecher-Knopf unten rechts schaltet den Zielton; sein Zustand liegt in
  `AppSettings` und ueberlebt den Neustart.
- Der Zielton: Hoehe 220–880 Hz exponentiell ueber 0–180 Grad Abweichung, Panorama
  `sin(Abweichung)`, Takt 6 Hz bei 25 m bis 0,5 Hz ab rund 1750 m, Tonlaenge hoechstens
  0,12 s und nie mehr als die halbe Periode, Dauerton ab 25 m abwaerts mit Ruecksprung
  aufs Ticken erst ab 35 m.
- Der Ton schweigt bei veraltetem Standort (mit eigenem Wortlaut in der Ansage), ohne
  gewaehltes Ziel, ausserhalb der Betriebsart „Ziel" und bei stehendem Lauf. Die
  Kompassguete stoppt ihn **nicht**.
- Ein Kreisbild (SVG, `aria-hidden`) zeigt den App-Pfeil fest nach oben, vier Marken und
  den Zielpunkt mit Name und Entfernung an der relativen Peilung.
- Die Abbildungen Richtung→Tonhoehe, Richtung→Panorama, Entfernung→Takt, die
  Ankunfts-Hysterese und die Punktlage auf dem Ring sind reine Funktionen und ohne Geraet
  getestet.
- `docs/design.md` und `docs/notes.txt` sind nachgezogen: §4.6 (modusabhaengige
  Statuszeile), §4.7 (neu), §5, §10 (Nicht-Ziel aufgehoben), §11 (M4/M5),
  Entscheidungen 38–44.

---

## Technical Key Decisions and Tradeoffs

1. **Namen:** Der Tab bleibt „Navigation", die Betriebsarten heissen „Orientierung" und
   „Ziel"; die `h2` traegt den Modusnamen.
   - Why: „Navigation" doppelt als Tab **und** als Betriebsart waere mit VoiceOver nicht
     unterscheidbar — oben „Navigation, ausgewaehlt, Tab", unten „Zur Navigation
     wechseln, Button". Der Tab-Name ist die meistgehoerte Station und wird nicht
     angefasst.
   - Impact: Die `h2` sagt heute dasselbe wie der Tab darueber und ist damit ein Wisch
     ohne Aussage. Der Modusname repariert das nebenbei. Im Code heissen die Werte
     `'orientation' | 'target'` — die Bezeichner bleiben englisch, nur Texte und
     Kommentare sind deutsch, wie im gesamten Bestand.

2. **Die Betriebsart wird nicht gespeichert; die App startet in „Orientierung".**
   - Why: §5 haelt fest, dass die App **immer** auf „Navigation" startet — ein fester,
     bekannter Ausgangspunkt ist mit VoiceOver mehr wert als Kontinuitaet. Dieselbe
     Ueberlegung gilt eine Ebene tiefer. Anders als das Ziel (Entscheidung 4) ist die
     Betriebsart keine Absicht, sondern eine Art hinzusehen, und der Wechsel ist ein Tipp.
   - Impact: `AppSettings` bekommt **kein** Modusfeld. Das Ziel ueberlebt den Neustart,
     der Modus nicht — das ist gewollt und steht so in §4.7.

3. **Ein Lauf fuer beide Betriebsarten; der Kegel schweigt in „Ziel", rechnet aber weiter.**
   - Why: Zwei gleichzeitige Tonkanaele — Zweiklang bei jedem Kegel-Ein-/Austritt neben
     dem Dauerton — machen die Zielseite unbrauchbar. Zwei getrennte Laeufe kosten bei
     jedem Wechsel Sekunden, eine Kompass-Freigabe und eine Luecke bis zum ersten Fix.
   - Impact: `cuePort()` liefert im Zielmodus `silentCue`; `navigationService.update()`
     laeuft unveraendert. Wuerde der Kegel pausieren, feuerte er beim Zurueckwechseln
     „eingetreten" fuer alles, was inzwischen im Kegel liegt.

4. **Das Zielrad kennt alle Orte; die Wahl wird gespeichert.**
   - Why: `hidden` ist eine Regel ueber den Kegel, nicht ueber den Willen (§6.5) — das
     geparkte Auto blendet man aus, damit es tagsueber nicht toent, und will abends
     genau dorthin. Ein Ziel ist eine Absicht und muss den Kaltstart einer PWA
     ueberleben.
   - Impact: `targetId` in `AppSettings`; eine Kennung ohne Ort faellt still auf „kein
     Ziel" zurueck, wie eine verwaiste Gruppenmitgliedschaft (§6.6).

5. **Wischweg der Zielseite: Rad, Peilzeile, Bild, Modusknopf, Tonknopf, Fuss.**
   - Why: Die Regel hinter dem Anhalten-Knopf war nie „Schalter nach vorn", sondern
     „nicht hinter eine lange Liste". Auf der Zielseite gibt es keine.
   - Impact: Der Moduswechsel liegt als **zwei** Knoten im DOM — einer je Betriebsart,
     nie beide sichtbar. Sie tragen ohnehin verschiedene Namen und Symbole; ein
     einzelner Knoten koennte nur an einer der beiden richtigen Stellen stehen.

6. **Peilzeile: Richtung zuerst, auf 5 Grad gerundet, „genau hinter dir" ab 175 Grad.**
   - Why: Die App erklaert ihre eigene Richtungsangabe fuer „ungenau", sobald der
     gemeldete Fehler groesser ist als der halbe Kegel (§4.5) — bei Standardeinstellung
     also ab 20 Grad. Eine gradgenaue Zahl behauptet daneben eine Schaerfe, die dieselbe
     App an anderer Stelle bestreitet. §4.2 rundet aus einem anderen Grund (VoiceOver
     setzt bei einem sich staendig aendernden Label neu an), liefert aber den Praezedenzfall:
     Eine laufende Zahl wird in Stufen gezeigt, nicht roh. Rechts und links sind hinter
     einem nicht handlungsleitend, deshalb dort ein eigener Wortlaut.
   - Impact: `formatDirection()` aendert sich, `STRAIGHT_AHEAD_TOLERANCE_DEG` entfaellt,
     und **fuenf** Assertions in drei `it`-Bloecken von `format.test.ts` werden angepasst
     — der Block `it('rundet auf ganze Grad')` wird dabei auch im Namen falsch und heisst
     danach „rundet auf fuenf Grad". Die Funktion hat heute keinen Aufrufer im
     Produktionscode; die Aenderung ist folgenlos.

7. **Tonhoehe: stetiger Gleitton 220–880 Hz, exponentiell, ohne Zielmarkierung.**
   - Why: Das Gehoer hoert Tonhoehe logarithmisch; linear in Hertz laege „neben mir"
     schon fast bei „vor mir". Exponentiell treffen A3 / A4 / A5 die drei Anker der
     Vorgabe exakt, und 5 Grad Drehung aendern den Ton um zwei Drittel eines Halbtons.
     Eine zusaetzliche Markierung bei „geradeaus" waere der Zusatzkanal, den diese App
     wiederholt entfernt hat (§4.4, §6.5) — und flackerte an der Grenze.
   - Impact: Eine reine Funktion; eine Markierung liesse sich spaeter ohne Bruch
     nachruesten.

8. **Panorama nach `sin(Abweichung)`, ohne Einstellung.**
   - Why: Rein additiv — wer ueber den Geraetelautsprecher hoert, bekommt Mono und faellt
     auf das Drehen zurueck; es geht nichts verloren, es kommt nur nichts dazu. Ein
     Schalter fuer etwas, das nie stoert, ist eine Station zu viel (§6).
   - Impact: Neue Messfrage **M4** — reicht iOS Web-Audio-Panorama unter VoiceOver durch,
     oder legt es auf Mono?

9. **Takt: 6 Hz bei 25 m bis 0,5 Hz ab rund 1750 m, logarithmisch; Dauerton unter 25 m.**
   - Why: Zwischen 50 m und 5 km liegen zwei Groessenordnungen — linear waere alles ueber
     500 m ununterscheidbar langsam. Der Dauerton als Ankunft ist Nutzerentscheidung.
   - Impact: Zwei Folgen, die ohne sie zu Fehlern werden. Erstens braucht die Ankunft
     **Hysterese** (bis 25 m rein, ab 35 m raus), sonst kippt der Ton im Takt der
     GPS-Streuung zwischen Ticken und Dauerton — dasselbe Flackern, gegen das §4.1 die
     20/25-Hysterese des Kegels erfunden hat. Zweitens muss die **Tonlaenge mit dem Takt
     schrumpfen**: Bei 6 Hz ist die Periode 167 ms, und eine feste Tonlaenge von 120 ms
     liesse 47 ms Pause — das Ticken klaenge dann schon fast wie der Dauerton, den es
     ankuendigen soll. Also `min(0,12 s, halbe Periode)`.

10. **Der Ton verstummt bei veraltetem Standort; die Kompassguete stoppt ihn nicht.**
    - Why: Der Ton ist keine stehende Anzeige, sondern eine fortlaufende Behauptung — aus
      altem Fix klaenge er exakt so souveraen wie aus gueltigem (§4.6). „Ungenau" ist
      dagegen immer noch die beste verfuegbare Angabe; ein Ton, der bei jedem
      Kompasswackeln aussetzt, waere unbrauchbar.
    - Impact: Eigener Ansagewortlaut fuer den Zielmodus; das Verstummen selbst ist die
      Nachricht. Die Rangfolge der Statuszeile aus §4.6 wird modusabhaengig und muss
      dort nachgezogen werden.

11. **Der Tonschalter wird gespeichert, ohne Eintrag in den Einstellungen.**
    - Why: Der Anhalten-Knopf wird bei jedem Start zurueckgesetzt, weil ein haengender
      Freeze **stumm** war und einen ganzen Lauf gefressen hat (§4.3). Ein haengender
      Tonschalter ist das Gegenteil von stumm. Sein Knopf steht dort, wo er klingt — der
      Earcon hat einen Eintrag in den Einstellungen, weil er sonst nirgends abschaltbar
      waere.
    - Impact: Zweites neues Feld in `AppSettings`.

12. **Kreisbild mit vier Marken; fuenf neue Symbole von Hand.**
    - Why: Das Bild traegt fuer VoiceOver nichts und ist fuer Mitschauende da. Vier Marken
      machen „30 Grad rechts" auf einen Blick ablesbar; eine Gradskala liest niemand.
    - Impact: `ICON_ARROW` ist exakt das App-Symbol aufs 24er-Raster gerechnet;
      `ICON_SPEAKER_ON` entsteht wie die Gluehbirne aus `ICON_SPEAKER_OFF` plus
      Schallwellen, damit der Wechsel als **Zustand** gelesen wird und nicht als anderes
      Symbol (Entscheidung 25, `dom.ts:80-98`).

13. **Das Kreisbild kommt zuletzt.** Es ist die einzige Phase ohne Nutzen fuer den
    Primaernutzer.
    - Why: Nach Phase 1 ist die Seite bedienbar, nach Phase 2 tut sie, wofuer sie gebaut
      wird. Das Bild haengt an nichts, und nichts haengt an ihm.
    - Impact: Phase 3 ist rein additiv und jederzeit verschiebbar, ohne dass die
      vorherigen Phasen unvollstaendig blieben.

---

## Current State

**Der Bereich „Navigation" heute** — die DOM-Reihenfolge ist zugleich der Wischweg:

```
 ┌─ Tab-Leiste (sticky, oben) ──────────────────────┐
 │ [Navigation] [Orte] [Gruppen] [Einstellungen]    │
 └──────────────────────────────────────────────────┘
  1  panel-head:  h2 "Navigation"   ▶ starten / ■ beenden
  2  ⏸  Anhalten-Knopf      (DOM hier, sichtbar schwebend unten rechts)
  3  "Nichts in Sichtrichtung."   (nur wenn der Kegel leer ist)
  4  ul.entries — Kegel-Liste, je Zeile ein <button>
                  weitestes Ziel oben … naechstes unten
  5  panel-foot — Statuszeile + Kompassguete
                  (DOM hinten, sichtbar fixiert am unteren Rand)
```

`navigationView.ts:162-172` baut diese Reihenfolge. `--foot-height` misst die fixierte
Fussleiste per `ResizeObserver` zurueck ins Layout (`navigationView.ts:186-207`); gemessen
wird ausschliesslich `this.foot`, die schwebenden Knoepfe beruehren den Wert nicht.

**Datenfluss pro Bild** (`main.ts:501-552`):

```
Geolocation ──┐
              ├─► main.ts: latestFix / latestHeading, dirty-Flag
Orientation ──┘        │
                       ▼  tick() 501-521: 1 Bild/s Herzschlag + jedes Ereignis
        isPositionStale(fix, now) ──ja──► navigationService.holdStale()
                       │ nein                    (Liste halten, keine Signale)
                       ▼          renderNavigation() 523-552
   navigationService.update(coord, heading, locationService.visible())
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
  snapshot.entries              snapshot.entered / left
  → navigationView.render()     → cuePort().entered/left  (Earcon)
```

**Was schon traegt:**

| Baustein | Ort | Bedeutung |
|---|---|---|
| `measure()` rechnet `bearingDeg` **und** `offsetDeg` | `navigationService.ts:191-205` | Die Peilung existiert, ist aber privat und ungenutzt |
| `formatDirection(offsetDeg)` → „28 Grad rechts" | `format.ts:31-37` | Fertig und getestet, im Produktionscode **ohne Aufrufer** |
| `CuePort` | `ports.ts:79-82` | Der Signalkanal ist bereits ein Port |
| `<select>` mit Vorgabeoption, Knoten bleibt | `groupsView.ts:227-240`, `renderPicker()` `563-586` | Muster fuer das Zielrad, inklusive „Rad weg, Grund hin" bei leerer Auswahl |
| `.freeze` schwebend, `--foot-height` | `styles.css` | Position und Masse fuer die drei schwebenden Knoepfe |
| `settingsView.setSettings()` `:233`, `{...spread}` `:274` | `settingsView.ts` | Neue Felder ueberleben Aenderungen im Einstellungs-Panel — **wenn** main die Kopie nachzieht |
| `locationService.all()` `:44` / `visible()` `:56` | `locationService.ts` | Ganze bzw. gefilterte Ortsliste |
| Pfeil des App-Symbols als Polygon | `tools/make-icons.mjs:24-29` | Existiert **nur** dort, nicht als SVG-Pfad |

**Bindende Regeln aus `design.md`:** §4.5 die Kompassguete wird grundsaetzlich gemeldet
und heisst „ungenau", sobald der Fehler den halben Kegel uebersteigt; §4.6 „lieber kein
Signal als ein falsches" und die feste Rangfolge der Statuszeile (`design.md:284-285`);
§9 Knotenidentitaet ist die kritischste Anforderung; §10 fuehrt die Tonkodierung heute
noch als Nicht-Ziel (`design.md:751`); §11/M2 der Lautlos-Schalter schaltet Web Audio
stumm — **gemessen**; M3 (`design.md:765`) haelt fest, dass der Zahlenwert von
`webkitCompassAccuracy` bisher **nicht abgelesen** wurde.

---

## Desired End State

```
 ┌─ Tab-Leiste ─────────────────────────────────────┐
 │ [Navigation] [Orte] [Gruppen] [Einstellungen]    │
 └──────────────────────────────────────────────────┘

  Betriebsart ORIENTIERUNG            Betriebsart ZIEL
  ──────────────────────────          ──────────────────────────
  1 h2 "Orientierung"  ▶ ■            1 h2 "Ziel"        ▶ ■
  2 ⏸  Anhalten                       2 Zielrad  <select>
  3 ◎  "Zum Ziel wechseln"            3 Peilzeile <button>
  4 "Nichts in Sichtrichtung."        4 Kreisbild <svg aria-hidden>
  5 ul.entries — Kegel-Liste          5 ☰ "Zur Orientierung wechseln"
                                      6 🔊 "Ton einschalten"
  6 panel-foot — Status + Guete       7 panel-foot — Status + Guete

  Ein Lauf, eine Fussleiste, ein Start/Stopp. Der Kegel rechnet in beiden
  Betriebsarten; nur sein Signalkanal schweigt in "Ziel".
```

Sehend, bei „Bahnhof, 30 Grad rechts, 1,2 Kilometer":

```
┌──────────────────────────────────────────────┐
│ [Navigation] [Orte] [Gruppen] [Einstellungen]│
├──────────────────────────────────────────────┤
│ Ziel                                ▶    ■   │
│ Ziel                                         │
│ ┌──────────────────────────────────────────┐ │
│ │ Bahnhof                               ▾  │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ 30 Grad rechts, 1,2 Kilometer            │ │
│ └──────────────────────────────────────────┘ │
│                  · ─ ─ ─ ·                   │
│              ·               ●  Bahnhof      │
│            ·        ▲          ·   1,2 km    │
│           ─         █           ─            │
│            ·                   ·             │
│              ·               ·               │
│                  · ─ ─ ─ ·                   │
│  ┌────┐                             ┌────┐   │
│  │ ☰  │                             │ 🔊 │   │
│  └────┘                             └────┘   │
├──────────────────────────────────────────────┤
│ Navigation laeuft.                           │
│ Kompass in Ordnung                           │
└──────────────────────────────────────────────┘
```

Der Pfeil steht fest und zeigt nach oben — er ist die eigene Nase, nicht Norden. Der Ring
dreht sich unter ihm weg.

**Die Tonabbildung:**

```
  Abweichung   0°        45°       90°       135°      180°
  vor mir  ────┼─────────┼─────────┼─────────┼─────────┼──── hinter mir
  Ton        880 Hz    622 Hz    440 Hz    311 Hz    220 Hz
              (A5)                (A4)                (A3)
  Panorama    Mitte    halb r.   rechts    halb r.    Mitte   (Vorzeichen = Seite)

  Hoehe(θ)  = 220 · 4^((180-|θ|)/180)            eine Oktave je 90 Grad
  Panorama  = sin(θ)                             θ vorzeichenbehaftet, + = rechts

  Entfernung   ≤25 m   50 m   100 m   200 m   400 m   800 m   ≥1750 m
  Toene/Sek.   Dauer-   4,00    2,67    1,78    1,19    0,79     0,50
               ton
  Takt(d)   = 6 · (d/25)^log2(2/3),  gekappt auf 0,5 … 6 Hz
              — jede Verdopplung der Entfernung nimmt ein Drittel vom Takt;
                die untere Kappung greift bei d ≈ 1748 m
  Ankunft:    Dauerton bis 25 m einschliesslich, Ticken erst wieder ab 35 m
  Tonlaenge:  min(0,12 s, halbe Periode) — 0,12 s wie der Earcon (cues.ts
              NOTE_SECONDS), bei 6 Hz aber 0,083 s, damit die Pause hoerbar
              bleibt und der Dauerton sich davon abhebt
```

**Architektur** — die Abbildungen sind Domaene, weil sie ohne Geraet pruefbar sein
muessen. Genau das ist der Gewinn aus §8: „ich stehe hier, schaue dorthin" einspeisen und
nachrechnen, welcher Ton herauskommt.

```
┌─ Adapter ─────────────────────────────────────────────────┐
│  WebAudioGuidance (GuidancePort)   TargetView / Dial      │
│  sharedAudioContext()              NavigationView         │
│  ┌─ Anwendung ───────────────────────────────────────┐    │
│  │  GuidanceService     measureLocation()            │    │
│  │  GuidancePort        AppSettings.targetId         │    │
│  │  ┌─ Domaene (rein) ────────────────────────────┐  │    │
│  │  │  guidancePitchHz()   guidancePan()          │  │    │
│  │  │  guidanceRateHz()    ArrivalState           │  │    │
│  │  │  GuidanceTone                               │  │    │
│  │  └─────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────┘
```

---

## Abstractions and Code Reuse

**Wiederverwendet, nicht neu gebaut:**

- `measure()` aus `navigationService.ts` wird als `measureLocation()` exportiert — die
  Zielseite rechnet Entfernung, Peilung und Abweichung **nicht** ein zweites Mal.
- Das Auswahlrad folgt Zeile fuer Zeile dem Muster aus `groupsView.ts`: Knoten einmal
  anlegen, nur Optionen tauschen, Vorgabeoption ohne Wert — und bei leerer Auswahl das
  Rad ausblenden und den Grund an seine Stelle setzen (`renderPicker()` `563-586`).
- Die Peilzeile ist ein `button.entry` — dieselbe Klasse, dieselbe Fokusregel und
  dieselbe „nicht neu beschriften, solange der Fokus darauf steht"-Zusage wie eine
  Listenzeile. Dass sie keinen Click-Handler hat, ist kein Sonderfall
  (`navigationView.ts:388`).
- Die schwebenden Knoepfe erben Position und Masse von `.freeze`; die Regel wird zu
  `.floating` + `.floating-left` / `.floating-right` verallgemeinert, ohne einen Wert zu
  aendern.
- `ArrivalState` ist gebaut wie `ViewCone`: zustandsbehaftet, weil Hysterese Gedaechtnis
  braucht, mit `reset()`.
- Der `AudioContext` wird **geteilt**. Zwei Contexts auf iOS sind Verschwendung, und der
  vorhandene wird bereits aus einer echten Beruehrung heraus entsperrt (`main.ts:427`).

**Neu:**

- `src/domain/guidance.ts` — die drei Abbildungen und die Ankunfts-Hysterese
  - `GuidanceTone` — `{ frequencyHz, pan, rateHz, continuous }`
  - `guidancePitchHz`, `guidancePan`, `guidanceRateHz` — reine Funktionen
  - `ArrivalState` — bis 25 m rein, ab 35 m raus
- `src/application/guidanceService.ts` — haelt das Ziel, rechnet den Schnappschuss
  - `GuidanceService` — `setTarget`, `update`, `holdStale`, `reset`
  - `GuidanceSnapshot` — `{ target, entry, tone }`
- `src/adapters/audioContext.ts` — `sharedAudioContext()`, `unlockAudio()`
- `src/adapters/guidanceTone.ts` — `WebAudioGuidance`, `silentGuidance`
- `src/ui/targetView.ts` — Zielrad, Peilzeile, Hinweiszeile, Moduswechsel, Tonknopf
- `src/ui/dial.ts` — das Kreisbild, mit `dialPoint()` als pruefbarer reiner Funktion

**Dateibaum der Aenderungen:**

- `src/domain`
  - `guidance.ts` — **neu**, die Tonabbildungen
    - `guidancePitchHz` / `guidancePan` / `guidanceRateHz` - reine Abbildungen
    - `ArrivalState` - Hysterese der Ankunft
  - `guidance.test.ts` — **neu**
- `src/application`
  - `guidanceService.ts` — **neu**
    - `GuidanceService` - haelt das Ziel, rechnet den Schnappschuss
  - `guidanceService.test.ts` — **neu**
  - `navigationService.ts` — `measure()` wird zu exportiertem `measureLocation()`
  - `ports.ts` — `GuidancePort` ergaenzt
  - `settings.ts` — `AppSettings.targetId`, `AppSettings.guidanceTone`
- `src/adapters`
  - `audioContext.ts` — **neu**, geteilter Context
  - `guidanceTone.ts` — **neu**, `WebAudioGuidance`
  - `cues.ts` — bezieht den Context aus `audioContext.ts`; `dispose()` schliesst ihn nicht mehr
  - `storedSettings.ts` — liest die zwei neuen Felder fehlertolerant
  - `storedSettings.test.ts` — **neu**
- `src/ui`
  - `targetView.ts` — **neu**
    - `TargetView` - Zielrad, Peilzeile, Kreisbild, zwei schwebende Knoepfe
  - `dial.ts` — **neu**
    - `dialPoint` - reine Funktion, Punkt auf dem Ring
    - `Dial` - Ring, Marken, Pfeil, Zielpunkt
  - `dial.test.ts` — **neu**
  - `navigationView.ts` — Betriebsarten, `h2` traegt den Modus, `modeFreeze`
    - `setMode` - schaltet Bloecke, setzt den Fokus auf die Ueberschrift
    - `markRunning` / `markStopped` - modusabhaengige Sichtbarkeit der Schalter
    - `statusText` - modusabhaengige Rangfolge
  - `dom.ts` — `ICON_ARROW`, `ICON_TARGET`, `ICON_LIST`, `ICON_SPEAKER_ON/OFF`
  - `format.ts` — `formatDirection()` gerundet, `formatBearingLabel()` neu
  - `format.test.ts` — fuenf Assertions angepasst, Faelle ergaenzt
  - `styles.css` — `.floating*`, `.dial`, `.target-*`
- `src/main.ts` — Verdrahtung, Betriebsart, Ton, Persistenz der Zielwahl,
  gemeinsamer `renderLocations()`
- `docs/design.md` — §4.6 ergaenzt, §4.7 neu, §5 ergaenzt, §10 Nicht-Ziel aufgehoben,
  §11 M4/M5, Entscheidungen 38–44
- `docs/notes.txt` — Stand der Umsetzung

---

## Logging & Observability

Die App hat kein Log. Beobachtbar ist sie ueber die **Statuszeile** und die **Ansagen** —
und das ist bewusst so: Was der Nutzer nicht hoert, existiert fuer ihn nicht.

Die Rangfolge der Statuszeile aus §4.6 bleibt, bekommt aber modusabhaengige Wortlaute.
Weil §4.6 diese Rangfolge woertlich festhaelt, wird sie dort mitgeaendert:

```
  Rang  Bedingung             Orientierung                    Ziel
  ────  ────────────────────  ──────────────────────────────  ─────────────────────────
   1    gemeldete Stoerung    <Text des Fehlers>              <Text des Fehlers>
   2    Standort veraltet     "Standort veraltet. Die Liste   "Standort veraltet. Der
                               ist angehalten."                Ton schweigt."
   3    Liste angehalten      "Liste angehalten."             — entfaellt
   4    sonst                 "Navigation laeuft."            "Navigation laeuft."
```

Angesagt wird weiterhin **nur der Wechsel**, nie der Dauerzustand:

```
  Eintritt "veraltet", Ziel:  "Standort veraltet. Die Entfernung stammt von der
                               letzten Messung und der Ton schweigt."
  Austritt "veraltet", Ziel:  "Standort wieder da. Der Ton laeuft."
  Moduswechsel:               keine Ansage - der Fokus springt auf die h2, und
                              "Ziel, Ueberschrift" ist die Bestaetigung.
  Tonknopf:                   keine Ansage - der Knopf liest seinen neuen Namen
                              selbst vor (§6.5).
```

Ohne gewaehltes Ziel steht statt der Peilzeile der Grund — nicht Stille:

```
  keine Orte gespeichert:  "Noch keine Orte gespeichert."   (Rad entfaellt)
  Orte, aber kein Ziel:    "Noch kein Ziel gewaehlt."       (Rad bleibt)
```

---

## Implementation

### Phase 1: Betriebsarten und die Zielseite

Dependencies: None

Nach dieser Phase ist die Zielseite fuer den Primaernutzer **vollstaendig bedienbar** —
ohne Ton, aber mit vollstaendiger Auskunft. Der Moduswechsel steht, das Ziel wird
gewaehlt und gespeichert, die Peilzeile sagt Richtung und Entfernung, und der Kegel
schweigt in „Ziel".

**Tasks**:

- [ ] `src/application/settings.ts`: `AppSettings` um `targetId: string | null` und
      `guidanceTone: boolean` ergaenzen, beide in `DEFAULT_SETTINGS` (`null` / `false`).
      Kommentar: Das Ziel ist eine Absicht, kein Laufzustand — deshalb liegt es hier und
      nicht im Lauf. `guidanceTone` wird in dieser Phase nur mitgeschrieben; sein
      Schalter kommt in Phase 2. **Kein** Feld fuer die Betriebsart (Entscheidung 2).
- [ ] `src/adapters/storedSettings.ts`: beide Felder fehlertolerant lesen —
      `targetId` nur als `string`, sonst `null`; `guidanceTone` ueber den vorhandenen
      `boolean()`-Helfer (`storedSettings.ts:64`). Eine gespeicherte Kennung wird
      **nicht** gegen die Orte geprueft: Das ist Sache der Anwendungsschicht, und ein
      Speicher, der Orte kennt, waere ein Aggregat zu viel.
- [ ] `src/adapters/storedSettings.test.ts` anlegen (existiert heute nicht): Ein Stand
      **ohne** die neuen Felder liest sich als `targetId: null` / `guidanceTone: false`;
      ein `targetId` mit falschem Typ faellt auf `null`; ein vollstaendiger Stand geht
      durch `saveSettings`/`loadSettings` unveraendert hindurch.
- [ ] `src/ui/format.ts`: `formatDirection()` auf 5 Grad runden. Kommentar: Die Rundung
      ist Ehrlichkeit — dieselbe App nennt ihre Richtung „ungenau", sobald der Fehler den
      halben Kegel uebersteigt (§4.5).
      ```ts
      export function formatDirection(offsetDeg: number): string {
        const rounded = Math.round(offsetDeg / 5) * 5;
        if (rounded === 0) return 'geradeaus';
        // >= 175, nicht === 180: Rechts und links sind hier nicht mehr
        // handlungsleitend, und die Schwelle wird so fuer beide Vorzeichen
        // gleich erreicht - Math.round rundet .5 stets nach oben.
        if (Math.abs(rounded) >= 175) return 'genau hinter dir';
        return `${Math.abs(rounded)} Grad ${rounded > 0 ? 'rechts' : 'links'}`;
      }
      ```
- [ ] `src/ui/format.ts`: `STRAIGHT_AHEAD_TOLERANCE_DEG` entfernen — nur in `format.ts`
      selbst benutzt, die Toleranz von 2,5 Grad folgt jetzt aus der Rundung.
- [ ] `src/ui/format.ts`: `formatBearingLabel(offsetDeg, displayMetres)` ergaenzen —
      „30 Grad rechts, 1,2 Kilometer". Richtung zuerst, kein Name: Der steht eine
      Station darueber im Rad.
- [ ] `src/ui/format.test.ts`: **fuenf** Assertions in drei `it`-Bloecken anpassen —
      `formatDirection(3)` → „5 Grad rechts", `(-3)` → „5 Grad links", `(28)` →
      „30 Grad rechts", `(-12)` → „10 Grad links", `(28.4)` → „30 Grad rechts". Den Block
      `it('rundet auf ganze Grad')` in „rundet auf fuenf Grad" umbenennen. Faelle
      ergaenzen fuer 2 („geradeaus"), 175 und −175 („genau hinter dir") sowie
      `formatBearingLabel`.
- [ ] `src/application/navigationService.ts`: `measure()` (`:191-205`) als freie,
      exportierte Funktion `measureLocation(position, headingDeg, location):
      NavigationEntry` herausziehen; die Methode delegiert. Kein Verhalten aendert sich —
      die Zielseite soll die Peilung nicht ein zweites Mal rechnen.
- [ ] `src/application/guidanceService.ts` anlegen: haelt `targetId`, loest gegen die
      uebergebene Ortsliste auf und liefert `GuidanceSnapshot`. Eine Kennung ohne Ort
      faellt still weg — dieselbe Regel wie bei verwaisten Gruppenmitgliedern (§6.6).
      `holdStale()` reicht den letzten Eintrag unveraendert weiter, wie
      `NavigationService.holdStale()`. Das Tonfeld bleibt in dieser Phase `null`.
      ```ts
      export interface GuidanceSnapshot {
        readonly target: Location | null;
        readonly entry: NavigationEntry | null;
        readonly tone: GuidanceTone | null;   // Phase 2
      }
      ```
- [ ] `src/application/guidanceService.test.ts`: Ziel aufloesen, geloeschtes Ziel faellt
      auf `null`, `holdStale()` haelt den letzten Eintrag, `reset()` vergisst ihn.
- [ ] `src/ui/dom.ts`: `ICON_TARGET` (Fadenkreuz, „zum Ziel") und `ICON_LIST` („zur
      Orientierung") von Hand ergaenzen — Entscheidung 25.
- [ ] `src/ui/targetView.ts` anlegen: Element mit Zielrad (`label` + `select` +
      Vorgabeoption „Ziel waehlen"), Hinweiszeile, Peilzeile als `button.entry`,
      Moduswechsel-Knopf. `render(snapshot)` schreibt nur Inhalte bestehender Knoten;
      die Peilzeile wird **nicht** neu beschriftet, solange `document.activeElement`
      auf ihr steht — dieselbe Regel und derselbe Kommentar wie in
      `navigationView.upsert()` (`:380-418`).
- [ ] `src/ui/targetView.ts`: `renderTargets(locations, selectedId)` tauscht nur die
      Optionen des bestehenden `select`, nie den Knoten — der Fokus steht nach der Wahl
      darauf (`groupsView.ts:227-229`). Ohne gespeicherte Orte entfaellt das Rad und an
      seiner Stelle steht „Noch keine Orte gespeichert.", genau wie in
      `groupsView.renderPicker()` (`:563-568`).
- [ ] `src/ui/navigationView.ts`: `mode: 'orientation' | 'target'` einfuehren; `h2`
      traegt den Modusnamen und bekommt `tabindex="-1"`; `setMode()` schaltet die
      Sichtbarkeit beider Bloecke, setzt den Fokus auf die `h2` und meldet den Wechsel
      per Callback nach aussen.
- [ ] `src/ui/navigationView.ts`: zweiten Moduswechsel-Knopf fuer die Orientierungsseite
      anlegen (nach dem Anhalten-Knopf, vor der Liste), `TargetView` als Kind einhaengen.
      Kommentar: zwei Knoten fuer einen Wechsel, weil ein einzelner nur an einer der
      beiden richtigen Stellen im Wischweg stehen koennte.
- [ ] `src/ui/navigationView.ts`: `markRunning()` (`:209-218`) und `markStopped()`
      modusabhaengig machen — der Anhalten-Knopf erscheint nur in „Orientierung", der
      Lautsprecher nur in „Ziel", die Kegel-Liste nur in „Orientierung", die Peilzeile
      und das Kreisbild nur in „Ziel". Ohne das steht in „Ziel" ein funktionsloser
      Anhalten-Knopf unten rechts. Dieselbe Zuordnung greift beim Moduswechsel im
      laufenden Betrieb; das Zielrad **bleibt** immer sichtbar, damit vor dem Start
      gewaehlt werden kann.
- [ ] `src/ui/navigationView.ts`: `modeFreeze` neben `tabFreeze` — in „Ziel" haelt die
      Liste an, aus demselben Grund wie beim Bereichswechsel (Entscheidung 27).
      `syncFreeze()` oder-verknuepft alle drei Flaggen, `resetFreeze()` setzt weiterhin
      nur `manualFreeze` zurueck. `statusText()` bekommt den Modus und laesst in „Ziel"
      den Rang „Liste angehalten" aus.
- [ ] `src/ui/styles.css`: `.freeze` zu `.floating` + `.floating-right` verallgemeinern
      und `.floating-left` mit `left: calc(16px + env(safe-area-inset-left))` ergaenzen —
      dieselben Masse, dieselbe Hoehe ueber der Fussleiste. Die Klasse an ihrem einzigen
      Verwendungsort mitziehen (`navigationView.ts:131`, `class: 'icon-button freeze'`).
      Klassen fuer Zielrad und Peilzeile ergaenzen.
- [ ] `src/main.ts`: gemeinsamen Helfer `renderLocations()` einfuehren, der
      `locationsView.render(locationService.all())` **und**
      `targetView.renderTargets(...)` zusammen ausfuehrt, und die acht bestehenden
      Aufrufstellen darauf umstellen (Speichern, Umbenennen, Loeschen, Ausblenden,
      Gruppen-Birne, Import, Fehlerpfad der Gruppen-Birne, Erstaufbau). Ohne das bleibt
      das Rad leer oder veraltet — `navigationView.render()` kehrt bei stehendem Lauf
      sofort zurueck (`navigationView.ts:304-306`) und fuellt es nie.
- [ ] `src/main.ts`: `mode` verdrahten. In „Ziel" liefert `cuePort()` `silentCue`,
      `navigationService.update()` laeuft weiter, `guidanceService.update()` kommt dazu;
      `navigationView.render()` bleibt in beiden Modi zustaendig fuer Status, Ansage und
      Kompassguete.
- [ ] `src/main.ts`: im Stale-Zweig von `renderNavigation()` (`:534-537`) neben
      `navigationService.holdStale()` auch `guidanceService.holdStale()` aufrufen und an
      `targetView` reichen — sonst zeigt die Peilzeile bei ausgefallenem GPS gar nichts,
      statt ihren letzten Stand zu halten.
- [ ] `src/main.ts`: Zielwahl speichern — `settings = { ...settings, targetId }`,
      `saveSettings` in `guardStorage()`, **und** `settingsView.setSettings(settings)`
      nachziehen. Ohne das haelt die Einstellungsansicht eine veraltete Kopie und
      ueberschreibt die Zielwahl beim naechsten Kegelwinkel.
- [ ] `src/main.ts`: beim Start `guidanceService.setTarget(settings.targetId)`.
- [ ] `docs/design.md`: §4.7 „Zielmodus" anlegen (Betriebsarten und ihre Namen, warum
      der Modus **nicht** gespeichert wird, Zielrad, Peilzeile, Schweigen des Kegels);
      §4.6 um die modusabhaengige Rangfolge der Statuszeile ergaenzen; §5 um die zwei
      Betriebsarten ergaenzen; Entscheidungen 38–41 eintragen.
- [ ] `docs/notes.txt`: die erledigten Teilpunkte des Items nach DONE ziehen.

**Automated Verification**:

- [ ] `npm test` laeuft gruen
- [ ] `npm run build` laeuft durch (fuehrt `tsc --noEmit` mit aus)
- [ ] `formatDirection(28)` ergibt „30 Grad rechts", `(2)` „geradeaus", `(175)` und
      `(-175)` beide „genau hinter dir", `(-12)` „10 Grad links"
- [ ] `formatBearingLabel(28, 1200)` ergibt „30 Grad rechts, 1,2 Kilometer"
- [ ] `GuidanceService.update()` mit einer Kennung ohne passenden Ort liefert
      `target: null` und `entry: null`, ohne zu werfen
- [ ] `GuidanceService.holdStale()` liefert den zuletzt gerechneten Eintrag unveraendert
- [ ] `measureLocation()` liefert dieselben Werte wie bisher — die bestehende
      `navigationService.test.ts` bleibt unveraendert gruen
- [ ] `loadSettings()` liest einen Stand ohne die neuen Felder als `targetId: null` und
      `guidanceTone: false`, einen mit falschem Typ in `targetId` ebenfalls als `null`

**Manual Verification**:

- [ ] Am Geraet mit VoiceOver: Der Knopf unten links wechselt, der Fokus landet auf der
      Ueberschrift, und sie nennt die Betriebsart („Ziel, Ueberschrift")
- [ ] Ein Ziel im Rad waehlen; die Peilzeile liest „30 Grad rechts, 1,2 Kilometer" und
      **behaelt** ihren Wortlaut, solange der Finger darauf liegt
- [ ] Ein **ausgeblendeter** Ort steht im Rad und laesst sich waehlen
- [ ] In „Ziel" liegt unten rechts **kein** Anhalten-Knopf mehr im Wischweg
- [ ] In „Ziel" klingt kein Ein-/Austritts-Earcon mehr; beim Zurueckwechseln nach
      „Orientierung" folgt **kein** Schwall von Eintritts-Toenen
- [ ] App beenden und neu starten: Das Ziel steht wieder da, die Betriebsart ist
      „Orientierung"
- [ ] Einen neuen Ort anlegen, waehrend „Ziel" offen ist: Er steht sofort im Rad
- [ ] Das gewaehlte Ziel auf der Orte-Seite loeschen: Die Zielseite meldet „Noch kein
      Ziel gewaehlt.", ohne Fehler

---

### Phase 2: Der Zielton

Dependencies: Phase 1

Der eigentliche Zweck der Seite: eine Auskunft, die laeuft, ohne dass man sie anfasst.

**Tasks**:

- [ ] `src/domain/guidance.ts` anlegen: `GuidanceTone`, die drei Abbildungen und die
      Konstanten. Jede mit dem Grund im Kommentar, nicht nur mit dem Wert.
      ```ts
      export const GUIDANCE_LOW_HZ = 220;    // A3, hinter mir
      export const GUIDANCE_HIGH_HZ = 880;   // A5, vor mir
      export const GUIDANCE_FAST_HZ = 6;
      export const GUIDANCE_SLOW_HZ = 0.5;
      export const ARRIVAL_ENTER_METRES = 25;
      export const ARRIVAL_EXIT_METRES = 35;
      export const GUIDANCE_TONE_SECONDS = 0.12;

      // Zwei Oktaven, exponentiell: Das Gehoer hoert Tonhoehe logarithmisch.
      // Linear laege "neben mir" schon fast bei "vor mir".
      export function guidancePitchHz(offsetDeg: number): number {
        const magnitude = Math.min(180, Math.abs(offsetDeg));
        return GUIDANCE_LOW_HZ * 4 ** ((180 - magnitude) / 180);
      }

      // Rein additiv: Auf Mono faellt man auf das Drehen zurueck.
      export function guidancePan(offsetDeg: number): number {
        return Math.sin(toRadians(offsetDeg));
      }

      // Jede Verdopplung der Entfernung nimmt ein Drittel vom Takt.
      // Die untere Kappung greift bei rund 1748 Metern.
      export function guidanceRateHz(distanceMetres: number): number { /* … */ }

      // Nie mehr als die halbe Periode: Bei 6 Hz blieben von 167 ms sonst
      // 47 ms Pause, und das Ticken klaenge wie der Dauerton, den es
      // ankuendigen soll.
      export function guidanceToneSeconds(rateHz: number): number {
        return Math.min(GUIDANCE_TONE_SECONDS, 0.5 / rateHz);
      }
      ```
- [ ] `src/domain/guidance.ts`: `ArrivalState` — gebaut wie `ViewCone`, mit `update()`
      und `reset()`. Die Grenzen sind **einschliessend**: `distance <= 25` schaltet den
      Dauerton ein, `distance >= 35` wieder aus. Kommentar: Ohne Hysterese kippt der Ton
      im Takt der GPS-Streuung zwischen Ticken und Dauerton.
- [ ] `src/domain/guidance.test.ts`: Anker 0/90/180 Grad ergeben exakt 880/440/220 Hz;
      `guidancePitchHz(-90) === guidancePitchHz(90)`; Panorama ist vorzeichenrichtig, bei
      0 null und bei ±180 praktisch null; `guidanceRateHz(25) === 6`,
      `guidanceRateHz(1800) === 0.5`, `guidanceRateHz(200) / guidanceRateHz(100)` liegt
      bei 2/3; `guidanceToneSeconds(0.5) === 0.12` und `guidanceToneSeconds(6)` liegt bei
      0,083; `ArrivalState` schaltet bei genau 25 ein, bei 30 nicht aus, bei genau 35 aus.
- [ ] `src/application/ports.ts`: `GuidancePort` mit `play(tone)` und `silence()`
      ergaenzen. Kommentar in der Linie von `CuePort` (`:71-82`): Der Kanal ist ein Port,
      damit die offene Messfrage M4 die Logik nicht beruehrt.
- [ ] `src/application/guidanceService.ts`: das Tonfeld aus Phase 1 fuellen — Hoehe,
      Panorama, Takt und `continuous` aus `ArrivalState`. `reset()` setzt die Ankunft
      zurueck; ein Zielwechsel ebenso.
- [ ] `src/application/guidanceService.test.ts`: Ton ist `null` ohne Ziel; die Ankunft
      ueberlebt einen Zielwechsel **nicht**; `holdStale()` liefert weiterhin `tone: null`.
- [ ] `src/adapters/audioContext.ts` anlegen: `sharedAudioContext()` erzeugt den Context
      genau einmal, `unlockAudio()` nimmt ihn aus `suspended`. Kommentar: zwei Contexts
      auf iOS sind Verschwendung, und die Entsperrung muss aus einer echten Beruehrung
      kommen (`main.ts:427`).
- [ ] `src/adapters/cues.ts`: `WebAudioCue` bezieht den Context aus `audioContext.ts`
      statt ihn selbst zu erzeugen; `unlock()` delegiert. `dispose()` (`:40-43`) darf den
      Context **nicht** mehr schliessen — das raeumte sonst den Zielton mit ab. Die
      Methode hat heute keinen Aufrufer; entweder entfernen oder auf „nur die eigene
      Referenz loesen" umbauen.
- [ ] `src/adapters/guidanceTone.ts` anlegen: `WebAudioGuidance implements GuidancePort`.
      - `play(tone)` merkt sich den zuletzt gemeldeten Ton und ist **idempotent** — es
        wird pro Bild gerufen und darf den laufenden Ton nicht neu starten.
      - Ticken: ein `setTimeout`-Zeitgeber; je Schlag ein Oszillator mit Huellkurve ueber
        `guidanceToneSeconds(rateHz)`, danach der naechste Schlag nach `1 / rateHz`. Die
        Werte werden **beim Schlag** gelesen, damit eine Aenderung binnen eines Schlages
        wirkt.
      - Dauerton: ein stehender Oszillator; Frequenz und Panorama gleiten per
        `setTargetAtTime`, damit es beim Drehen nicht knackt.
      - `silence()` bricht den Zeitgeber ab und faehrt den Pegel herunter.
      - `silentGuidance` als Gegenstueck zu `silentCue`.
- [ ] `src/ui/dom.ts`: `ICON_SPEAKER_OFF` und `ICON_SPEAKER_ON` ergaenzen — dieselbe
      Silhouette plus Schallwellen, zusammengesetzt wie `ICON_BULB_ON` (`dom.ts:89-98`),
      damit der Wechsel als Zustand gelesen wird.
- [ ] `src/ui/targetView.ts`: Lautsprecher-Knopf als `.floating .floating-right`, nach
      dem Moduswechsel im DOM. Beschriftung sagt, was der Tipp **bewirkt** („Ton
      einschalten" / „Ton ausschalten"), kein `aria-pressed`, **keine** zusaetzliche
      Ansage — der Knopf liest seinen neuen Namen selbst vor (§6.5).
- [ ] `src/main.ts`: `WebAudioGuidance` verdrahten. Der Ton klingt nur, wenn **alles**
      zutrifft: Lauf laeuft, Betriebsart „Ziel", Schalter an, Ziel gewaehlt, Standort
      nicht veraltet. Sonst `silence()`.
- [ ] `src/main.ts`: Tonschalter speichern wie die Zielwahl — `saveSettings` in
      `guardStorage()` **und** `settingsView.setSettings()` nachziehen.
- [ ] `src/main.ts`: `stopNavigation()` und der Wechsel nach „Orientierung" rufen
      `silence()` und `guidanceService.reset()`. Ohne das laeuft der Ton nach dem
      Beenden weiter — der Fehlermodus, den §4.3 beim Freeze schon einmal gekostet hat.
- [ ] `src/ui/navigationView.ts`: die Wortlaute fuer „veraltet" im Zielmodus
      („…und der Ton schweigt." / „Standort wieder da. Der Ton laeuft.").
- [ ] `docs/design.md`: §4.7 um den Ton ergaenzen (Abbildungen mit Werten und
      Begruendung, Schweigeregeln); **§10 anpassen** — die Zeile „Entfernung als
      Tonhoehe/Klickrate kodiert" wird gestrichen und durch einen Verweis auf §4.7
      ersetzt, mit der Begruendung, dass die dort gesetzte Bedingung („erst nach
      Praxiserfahrung") eingetreten ist; Entscheidungen 42–44; §11 auf **fuenf** Fragen
      erweitern (Einleitungssatz „Drei Fragen" mitziehen) mit **M4** (Panorama unter
      VoiceOver) und **M5** (daempft VoiceOver Web Audio, waehrend es spricht?).
- [ ] `docs/notes.txt`: Item abschliessen, M4 und M5 als offene Praxistests eintragen.

**Automated Verification**:

- [ ] `npm test` laeuft gruen
- [ ] `npm run build` laeuft durch
- [ ] `guidancePitchHz(0) === 880`, `(90) === 440`, `(180) === 220`,
      `(-90) === guidancePitchHz(90)`
- [ ] `guidancePan(0) === 0`, `(90) === 1`, `(-90) === -1`, `(180)` liegt bei 0
- [ ] `guidanceRateHz(25) === 6`, `(1800) === 0.5`, `(200) / (100)` liegt bei 2/3
- [ ] `guidanceToneSeconds(0.5) === 0.12`, `guidanceToneSeconds(6)` liegt bei 0,083
- [ ] `ArrivalState`: 25 m schaltet ein, 30 m bleibt eingeschaltet, 35 m schaltet aus
- [ ] `GuidanceService` liefert `tone: null` ohne Ziel und nach `holdStale()`

**Manual Verification**:

- [ ] Am Geraet mit Kopfhoerern: Beim Drehen steigt der Ton zum Ziel hin und faellt
      dahinter wieder ab — der Scheitel ist ohne Zahlen zu treffen
- [ ] **M4:** Liegt das Ziel rechts, kommt der Ton hoerbar von rechts — oder legt iOS
      unter VoiceOver auf Mono? Ergebnis in `design.md` §11 eintragen
- [ ] **M5:** Spricht VoiceOver, waehrend der Ton laeuft — daempft iOS ihn, unterbricht
      er die Ansage, oder liegen beide nebeneinander? Ergebnis in `design.md` §11
- [ ] Im Gehen auf ein Ziel zu: Der Takt wird hoerbar schneller; unter 25 m geht er in
      den Dauerton ueber, der Uebergang ist **hoerbar** (die Pause faellt weg), und beim
      Stehen kippt er nicht zwischen beiden hin und her
- [ ] Standort abschalten oder abschatten: Nach 12 s verstummt der Ton, die Ansage nennt
      den Grund, und beim naechsten Fix setzt er wieder ein
- [ ] Kompassguete auf „ungenau": Der Ton laeuft weiter
- [ ] Navigation beenden, waehrend der Ton laeuft: Er hoert sofort auf
- [ ] Auf „Orientierung" wechseln, waehrend der Ton laeuft: Er hoert auf, und die
      Kegel-Earcons klingen wieder
- [ ] Lautlos-Schalter gestellt: Der Ton bleibt stumm (M2, erwartet) — die Peilzeile
      traegt die Auskunft weiterhin

---

### Phase 3: Das Kreisbild

Dependencies: Phase 1

Die visuelle Schicht. Sie traegt fuer VoiceOver nichts und ist fuer Mitschauende da —
entsprechend `aria-hidden`, wie jedes Symbol dieser App. Sie haengt an nichts, und nichts
haengt an ihr; deshalb steht sie zuletzt.

**Tasks**:

- [ ] `src/ui/dom.ts`: `ICON_ARROW` ergaenzen — die vier Punkte des App-Symbols aus
      `tools/make-icons.mjs:24-29`, aufs 24er-Raster gerechnet:
      `'M12 5.34 18.3 18.66 12 14.88 5.7 18.66Z'`. Kommentar mit dem Verweis auf den
      Generator, damit beide beim naechsten Mal zusammen geaendert werden.
- [ ] `src/ui/dial.ts` anlegen: `dialPoint(offsetDeg)` als **reine, exportierte
      Funktion** — sie ist der einzige rechnende Teil des Bildes und gehoert damit unter
      Test.
      ```ts
      export function dialPoint(offsetDeg: number): { x: number; y: number } {
        const rad = toRadians(offsetDeg);
        return { x: 100 + 80 * Math.sin(rad), y: 100 - 80 * Math.cos(rad) };
      }
      ```
- [ ] `src/ui/dial.test.ts` anlegen: `dialPoint(0)` ergibt (100, 20) — oben;
      `(90)` (180, 100) — rechts; `(180)` (100, 180) — unten; `(-90)` (20, 100) — links.
- [ ] `src/ui/dial.ts`: `Dial` mit `element: SVGSVGElement`, `viewBox="0 0 200 200"`.
      Ring (Mittelpunkt 100/100, r=80), vier Marken und der Pfeil werden **einmal**
      angelegt; `render(offsetDeg | null, name, displayMetres)` bewegt nur den Zielpunkt
      und schreibt die Beschriftung. Die Beschriftung steht rechts vom Punkt, wenn
      `sin(θ) >= 0`, sonst links (`text-anchor`). Pfeil:
      `<g transform="translate(100,100) scale(2.5) translate(-12,-12)">`.
- [ ] `src/ui/dial.ts`: ohne Ziel bleiben Punkt und Beschriftung `hidden` — nur Ring,
      Marken und Pfeil stehen da.
- [ ] `src/ui/targetView.ts`: `Dial` zwischen Peilzeile und Moduswechsel einhaengen,
      `aria-hidden="true"` und `focusable="false"` wie in `icon()` (`dom.ts:52-66`).
- [ ] `src/ui/styles.css`: `.dial` — `display: block`, `width: min(100%, 260px)`,
      `margin: var(--abstand) auto`; Ring und Marken in `var(--line)`, der Zielpunkt in
      `var(--accent)`, die Beschriftung in `var(--fg)`. Unterhalb des Bildes so viel
      Platz lassen, dass die beiden 64-px-Knoepfe bei
      `bottom: calc(var(--foot-height) + 16px)` den Ring nicht ueberdecken.
- [ ] `docs/design.md`: §4.7 um das Kreisbild ergaenzen (rein visuell, `aria-hidden`,
      Pfeil ist die Nase und nicht Norden).

**Automated Verification**:

- [ ] `npm test` laeuft gruen
- [ ] `npm run build` laeuft durch
- [ ] `dialPoint(0)` = (100, 20), `dialPoint(90)` = (180, 100), `dialPoint(180)` =
      (100, 180), `dialPoint(-90)` = (20, 100)

**Manual Verification**:

- [ ] Sehend: Der Pfeil zeigt fest nach oben, der Punkt sitzt bei „30 Grad rechts"
      rechts oben und wandert beim Drehen um den Ring
- [ ] Liegt das Ziel hinter einem, steht der Punkt unten und die Beschriftung darunter,
      ohne aus dem Bild zu laufen
- [ ] Auf dem schmalsten Zielgeraet verdecken die zwei schwebenden Knoepfe den unteren
      Teil des Rings nicht
- [ ] Ohne gewaehltes Ziel steht der leere Ring mit dem Pfeil da
- [ ] Mit VoiceOver ist das Bild **keine** Station — der Wischweg geht von der Peilzeile
      direkt auf den Moduswechsel

---

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

---

## References

- `docs/notes.txt` — Item „Navigationsseite erweitern"
- `docs/design.md` §3 (Barrierefreiheit, `--abstand`), §4.1 (Kegel und Hysterese),
  §4.2 (Anzeige und Rundung), §4.3 (Anhalten, Fokusregel), §4.4 (Earcons),
  §4.5 (Kompassguete), §4.6 (veralteter Standort, Rangfolge der Statuszeile, Zeile
  284-285), §5 (Interaktionsmodell, „startet immer auf Navigation"),
  §6.5 (Ausblenden, „der Knopf sagt, was der Tipp bewirkt"), §6.6 (Gruppen, Auswahlrad),
  §8 (Architektur), §9 (kein Framework, Knotenidentitaet),
  **§10 (Nicht-Ziele — Zeile 751 wird durch diesen Plan aufgehoben)**,
  §11 (Messfragen M1–M3; M3 in Zeile 765 haelt fest, dass der Zahlenwert der
  Kompassgenauigkeit nicht abgelesen wurde)
- `src/application/navigationService.ts:191-205` — `measure()`, die vorhandene Peilung
- `src/application/ports.ts:71-82` — `CuePort`, Vorbild fuer `GuidancePort`
- `src/ui/format.ts:31-37` — `formatDirection()`, fertig und ohne Aufrufer
- `src/ui/navigationView.ts:162-172` — Aufbau des Panels, DOM-Reihenfolge
- `src/ui/navigationView.ts:209-218` — `markRunning()`, heute ohne Modusbegriff
- `src/ui/navigationView.ts:304-306` — `render()` kehrt bei stehendem Lauf sofort zurueck
- `src/ui/navigationView.ts:380-418` — `upsert()`, die Fokusregel fuer Beschriftungen
- `src/ui/groupsView.ts:227-240` — Auswahlrad, Knoten bleibt; `renderPicker()` `563-586`
- `src/adapters/cues.ts:40-43` — `dispose()`, schliesst heute den `AudioContext`
- `src/adapters/storedSettings.ts:64` — `boolean()`-Helfer
- `src/domain/viewCone.ts` — Vorbild fuer `ArrivalState` (Hysterese mit Gedaechtnis)
- `tools/make-icons.mjs:24-29` — der Pfeil des App-Symbols als Polygon
