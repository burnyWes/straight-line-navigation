# Straight-Line-Navigation — Entwurf und Entscheidungen

Stand: 2026-09-04

Dieses Dokument hält fest, **was** gebaut wird, **warum** so, und **was noch offen ist**.
Es ist die Grundlage für die Implementierung; Entscheidungen werden hier geändert, nicht
im Code umgangen.

---

## 1. Zweck

Eine App, die zu selbst gespeicherten Orten **Luftlinie und Richtung** anzeigt — bewusst
**ohne Karte und ohne Routing**. Sie beantwortet „wie weit und in welche Richtung", nicht
„wie komme ich hin".

**Einsatzszenarien**

- Primär **urban**: Bahnhof, Treffpunkt, geparktes Auto, bekannte Anlaufpunkte.
- Sekundär **Gelände**: weglose Peilung, zurück zum Ausgangspunkt.
- Typische Distanzen 50 m bis 5 km, die Obergrenze ist aber **einstellbar** und darf
  aufgehoben werden — auch Ziele in 50 km sollen anzeigbar sein.

**Primärer Nutzer ist blind und bedient die App mit VoiceOver.** Das ist keine
Zusatzanforderung, sondern die Leitplanke für jede Gestaltungsentscheidung: Wo visuelle
und auditive Bedienbarkeit kollidieren, gewinnt die auditive.

---

## 2. Plattform: installierbare PWA

**Entscheidung:** Web-App (PWA), die über Safari zum Home-Bildschirm hinzugefügt wird.
Kein Xcode, kein Mac, **kein Apple-Developer-Account**.

**Warum nicht nativ:** Ohne bezahlten Developer-Account ($99/Jahr) gibt es kein
Ad-hoc-Provisioning. Der verbleibende native Weg wäre ein unsignierter Build über einen
macOS-Runner in GitHub Actions plus Sideloading über AltStore/SideStore mit freier
Apple-ID — mit **erzwungener Neusignierung alle 7 Tage**. Für eine privat genutzte App
ein dauerhafter Betriebsaufwand ohne Gegenwert.

**Verifiziert am 2026-09-04** durch einen Spike auf dem Zielgerät (`spike/index.html`):
Kompass und GPS funktionieren in Safari **auch im Standalone-Modus vom Home-Bildschirm**.
Damit ist das Hauptrisiko dieses Weges ausgeräumt.

### 2.1 Bekannte Grenzen dieses Weges

Diese Einschränkungen sind **akzeptiert**, nicht übersehen:

| Grenze | Auswirkung | Umgang |
|---|---|---|
| Kein Hintergrundbetrieb | Bei gesperrtem Bildschirm friert die Seite ein — kein Kompass, keine Töne | Wake Lock hält den Bildschirm wach; „Handy in der Tasche" ist **kein** unterstützter Anwendungsfall (bewusst verworfen) |
| Keine Web Share Target API | Kein „Teilen → diese App" aus Apple/Google Maps | Koordinaten werden über die Zwischenablage eingefügt |
| **Keine Haptik, gemessen** | Kein Vibrationssignal bei Ein-/Austritt | Akzeptiert. Weder `navigator.vibrate` noch der `switch`-Umweg funktionieren (M1, gemessen 2026-09-04) |
| **Lautlos-Schalter schaltet Web Audio stumm, gemessen** | Earcons bei Lautlos unhörbar — und seit dem Wegfall der Ansage (§4.4) gibt es dann gar kein Ein-/Austritts-Signal | Akzeptiert — Nutzerentscheidung. Wer das Signal braucht, schaltet den Lautlos-Schalter aus |


### 2.2 Installation und Offline-Start

Die App wird über Safari zum Home-Bildschirm hinzugefügt und startet von dort im
Standalone-Modus. Zwei Dinge tragen das:

**Manifest** (`public/manifest.webmanifest`): Name „Luftlinie", `display: standalone`,
`start_url` und `scope` relativ — die App liegt unter einem Unterpfad, absolute Pfade
wären hier die klassische Falle. Symbole liegen als PNG in 180, 192 und 512 px vor.
iOS nimmt für den Home-Bildschirm das `apple-touch-icon` aus dem HTML, nicht das aus dem
Manifest; beide sind gesetzt.

**Service Worker** (`public/sw.js`): Die App muss **ohne Netz starten**. Genau dafür ist
sie gedacht — draußen, schlechter Empfang, kein Backend. Eine App, die zum Losgehen erst
ein Netz braucht, wäre in dem Moment unbrauchbar, in dem sie gebraucht wird.

| Anfrage | Strategie | Warum |
|---|---|---|
| Seitenaufruf | Netz zuerst, sonst gespeicherte `index.html` | Eine neue Fassung kommt an, sobald Netz da ist |
| Alles andere | Zwischenspeicher zuerst | Die Dateinamen tragen einen Inhalts-Hash: gleicher Name heißt gleicher Inhalt |

Drei Entscheidungen dazu:

- **Handgeschrieben statt Workbox.** Knapp hundert Zeilen gegen eine Build-Abhängigkeit —
  bei einem Projekt mit drei Entwicklungspaketen (§9) ein schlechter Tausch.
- **Die gehashten Dateinamen kennt der Worker nicht.** Deshalb schreibt Vite eine Bauliste
  (`build.manifest`), die der Worker beim Einbau abfragt. Ohne das wäre die App erst nach
  dem **zweiten** Besuch offline lauffähig — und der zweite Besuch ist womöglich schon der
  ohne Netz.
- **`ignoreVary` beim Nachschlagen.** Der Server schickt `Vary: Origin`; der Worker füllt
  den Speicher mit eigenen Aufrufen ohne `Origin`, die Seite fordert JS und CSS aber mit
  `crossorigin` an, also *mit* `Origin`. Ohne `ignoreVary` findet die Cache-API nichts und
  die App bleibt offline weiß — **gemessen, nicht vermutet** (2026-09-04). Da die
  Dateinamen inhaltsadressiert sind, ist das Ignorieren hier sicher.

**Kein `skipWaiting`.** Eine neue Fassung übernimmt beim nächsten Kaltstart. Assets unter
laufender Navigation auszutauschen bringt nichts und kann einen Lauf zerlegen.

**Verifiziert am 2026-09-04:** Build ausgeliefert, Server gestoppt, Seite neu geladen —
Oberfläche vollständig, alle Ressourcen aus dem Zwischenspeicher.

---

## 3. Barrierefreiheit

**Stufe: „blind benutzbar" (Audio-First)**, nicht nur WCAG-konform.

- Alle Bedienelemente sind echte, fokussierbare Elemente mit Labels.
- Sauberer Überschriften-Baum (`h1` je Bereich, `h2` je Abschnitt), damit der
  VoiceOver-Rotor als zweiter Navigationsweg funktioniert.
- Bereichswechsel setzt den Fokus auf die Überschrift des Zielbereichs.
- Keine eigenen Touch-Gesten — bei aktivem VoiceOver werden sie abgefangen.
- **Kein nachgebauter Bildschirmvorhang.** Das ist VoiceOver-Bordmittel
  (Dreifachtipp mit drei Fingern) und wird nicht dupliziert.
- **Fester heller Farbsatz, kein Dunkelmodus.** Weißer Hintergrund, schwarze
  Schrift, kräftige Ränder; alle Text-Hintergrund-Paare über 7:1 (WCAG AAA),
  Ränder und Fokusring über 3:1. Die App folgt bewusst *nicht* der
  Systemeinstellung — Nutzerentscheidung nach dem Praxistest.

Der maßgebliche Test ist die Bedienung mit VoiceOver auf dem Gerät. Automatisierte
Prüfungen finden fehlende Labels, aber nicht „der Fokus springt beim Drehen".

---

## 4. Fachliche Regeln

### 4.1 Sichtkegel

- **Halber Öffnungswinkel: 20° (Standard), in den Einstellungen änderbar.**
- **Hysterese: Eintritt bei 20°, Austritt erst bei 25°.** Ohne sie flackert die Liste im
  Takt des Handzitterns und die Ein-/Austritts-Signale feuern im Stakkato. Das ist eine
  Funktionsanforderung, kein Feinschliff.
- **Harter Filter:** Was nicht im Kegel liegt, erscheint nicht. Liegt nichts im Kegel,
  bleibt die Liste leer (bewusst so entschieden).
- Die Richtung stammt aus `webkitCompassHeading` — bereits Grad im Uhrzeigersinn gegen
  **geografisch** Nord. Eine Deklinationskorrektur entfällt damit.

### 4.2 Anzeige

- **Sortierung: weitestes Ziel oben, nächstes unten.** Erswiped wird von oben nach
  unten; das nächste Ziel ist das wichtigste und steht deshalb am Ende des Weges, nicht
  am Anfang. *(Ursprünglich andersherum angenommen, im Praxistest umgedreht —
  Nutzerentscheidung.)* Bei gleicher Entfernung alphabetisch, damit die Reihenfolge
  nicht springt.
- Entfernung als **Großkreisdistanz** (Haversine).
- **Gerundet in Stufen:** unter 1 km in 10-m-Schritten, darüber in 100-m-Schritten.
  Metergenaue Labels ändern sich mehrmals pro Sekunde und lassen VoiceOver mitten im
  Satz neu ansetzen.
- **Maximale Entfernung** ist einstellbar und abschaltbar.

### 4.3 Auto-Freeze

Solange der Fokus **innerhalb** der Kegel-Liste steht, friert sie ein: keine
Umsortierung, kein Entfernen von Einträgen. Verlässt der Fokus die Liste, läuft sie
wieder live. Zusätzlich gibt es einen expliziten **Anhalten-Schalter**.

**Ein anderer Bereich hält die Liste ebenfalls an.** Wer in „Orte" oder
„Einstellungen" wechselt, liest die Liste gerade nicht; liefe sie dort weiter, stünde
sie beim Zurückkommen in völlig anderer Reihenfolge. Der Navigationslauf selbst geht
weiter — Sensoren bleiben angemeldet, der Bildschirm wach, die Ein-/Austritts-Signale
klingen —, denn „Hier speichern" im Bereich Orte braucht einen frischen Fix. Dieses
Anhalten wird **nicht angesagt**: Gemeldet wird ein Freeze nur dort, wo er die gerade
gelesene Liste betrifft.

Ein- und Auftauchen des Freeze wird angesagt („angehalten" / „aktualisiert"), sonst ist
nicht unterscheidbar, ob Zahlen aktuell oder eingefroren sind.

**Bewusst in Kauf genommen:** Während des Durchswipens sind die Daten leicht veraltet
(bei Gehgeschwindigkeit einige Dutzend Meter). Eine stabile Liste mit kleinem Fehler ist
brauchbar; eine exakte Liste, die den Fokus zerstört, nicht.

**Präzisierung aus der Umsetzung:** Im eingefrorenen Zustand aktualisieren sich die
Entfernungen aller Zeilen **außer der gerade fokussierten**. Ändert sich der zugängliche
Name eines fokussierten Elements, setzt VoiceOver mitten im Satz neu an — genau der
Effekt, den das Einfrieren verhindern soll. Die Zeile unter dem Finger behält ihre
Beschriftung, bis der Fokus sie verlässt.

**Technische Voraussetzung:** Jede Listenzeile ist ein `<button>`. Nur bei
fokussierbaren Elementen erzeugt der VoiceOver-Cursor `focus`-Ereignisse, an denen das
Freeze hängt.

### 4.4 Ein- und Austritts-Signale

Wechselt eine Location den Kegel-Zustand, wird das mit einem **Earcon** signalisiert:
aufsteigender Zweiklang bei Eintritt, absteigender bei Austritt. In den Einstellungen
abschaltbar.

**Keine gesprochene Ansage bei Ein- und Austritt.** Ursprünglich sprach die App beim
Eintritt den Namen und beim Austritt „raus" über eine `aria-live`-Region. Der
Praxistest hat das verworfen: Im Gehen wechseln Orte laufend den Zustand, und jede
Ansage unterbricht VoiceOver — das stört mehr, als es trägt. Der Zustand steht in der
Liste und wird erswiped; der Wechsel klingt nur.

Der Preis ist bekannt: Bei gestelltem Lautlos-Schalter bleibt der Ton stumm (M2, §11),
und damit gibt es dann gar kein Ein-/Austritts-Signal.

**Es werden nie die Locations im Kegel automatisch vorgelesen** — nur der
Zustandswechsel wird gemeldet.

### 4.5 Kompassgüte

Die App meldet, wie verlässlich ihre Richtungsangabe gerade ist. Nicht als Reaktion
auf ein Messergebnis, sondern grundsätzlich: Ein sehender Nutzer sieht einen zittrigen
Zeiger und misstraut ihm von selbst. Diese Rückmeldung fehlt hier vollständig, also muss
sie ausgesprochen werden — sonst klingt eine unbrauchbare Peilung genauso souverän wie
eine gute.

Vier Zustände, abgeleitet aus `webkitCompassAccuracy` und dem eingestellten Kegel:

| Zustand | Bedingung | Bedeutung |
|---|---|---|
| `unbekannt` | kein Wert vom Gerät | Güte nicht beurteilbar |
| `unkalibriert` | Wert negativ | Sensor braucht die Achterschleife |
| `ungenau` | Wert größer als der halbe Kegelwinkel | Der Messfehler ist breiter als der Kegel — die Auswahl ist Zufall |
| `gut` | sonst | Verlässlich |

**`ungenau` ist die eigentliche Aussage:** Ist der Fehler größer als ±20°, entscheidet
nicht mehr die Blickrichtung, welche Orte erscheinen. Das muss der Nutzer wissen dürfen.

**Angesagt wird nur der Wechsel**, nie der Dauerzustand, und mit Hysterese gegen
Flattern an der Grenze. Eine App, die alle zwei Sekunden „ungenau" sagt, wird
weggeschaltet und meldet dann gar nichts mehr.

### 4.6 Veralteter Standort

Fällt das GPS aus, während der Kompass weiterläuft, entsteht der gefährlichste
Zustand dieser App: Sie rechnet mit dem letzten bekannten Fix weiter. Die Liste
sortiert sich beim Drehen um, die Entfernungen klingen plausibel — und stimmen
nicht. Ein sehender Nutzer sähe ein eingefrorenes Kartenbild; hier gibt es nichts
zu sehen. **Plausibel, aber falsch ist der schlechteste Ausgang** — dieselbe
Begründung wie bei der Kompassgüte (§4.5) und bei fehlgeschlagenen Schreibzugriffen (§7).

**Ein Fix gilt 12 Sekunden.** Danach wird die zuletzt gezeigte Liste **gehalten**,
nicht neu gerechnet: Die Zahlen bleiben stehen, wo sie zuletzt stimmten, und die
Liste sortiert sich beim Drehen nicht mehr um. Die Grenze folgt aus drei Größen:

- Bei Gehgeschwindigkeit sind 12 s rund 17 m — innerhalb des Fehlers, den die
  eingefrorene Liste ohnehin in Kauf nimmt (§4.3). Gemeldet wird der Ausfall,
  nicht jede Ungenauigkeit.
- Im städtischen Raum, dem Schwerpunkt der App, sind Lücken von wenigen Sekunden
  normal. Eine engere Grenze meldete ständig Fehlalarm — und eine App, die dauernd
  „veraltet" sagt, wird weggeschaltet.
- Die Geolocation-API meldet einen Ausfall erst nach ihrem eigenen Timeout von
  20 s. Bis dahin darf der Nutzer nicht im Unklaren bleiben.

**Keine Ein- und Austritts-Signale aus veralteten Daten.** Ein Earcon, der aus
einem alten Standort folgt, klingt genau wie ein echter. Lieber kein Signal als
ein falsches; beim nächsten gültigen Fix setzt der Kegel mit seiner Hysterese
dort wieder auf, wo er stand.

**Angesagt wird nur der Wechsel** — „veraltet" beim Eintreten, „wieder da" beim
Verlassen. `watchPosition` meldet einen ausgefallenen Standort im Sekundentakt
erneut; jede Wiederholung anzusagen macht die App unbenutzbar.

**„Hier speichern" lehnt einen veralteten Fix ab.** Dort ist er schlimmer als gar
keiner: Der Ort landet dauerhaft in der Liste und sieht danach aus wie jeder andere.

**Die Statuszeile gehört dem Render.** Sie zeigt in dieser Reihenfolge: gemeldete
Störung, veralteter Standort, angehaltene Liste, laufende Navigation. *(Vorher
schrieb der Render unbedingt „Navigation läuft." und wischte damit jede
Fehlermeldung im nächsten Bild wieder weg — der Fehler, der zu diesem Abschnitt
geführt hat.)*

---

## 5. Interaktionsmodell

**Drei Tabs, Tab-Leiste oben** (nicht unten): VoiceOver läuft in DOM-Reihenfolge; oben
ist die Leiste mit einem Wisch vom Seitenanfang erreichbar. Die iOS-Konvention „Tabs
unten" ist Daumen-Ergonomie für Sehende und hier ein Umweg.

| Tab | Inhalt |
|---|---|
| **Navigation** | Start/Stopp als Symbol im Kopf, Kegel-Liste, schwebender Anhalten-Schalter |
| **Orte** | Alle gespeicherten Locations: anlegen, umbenennen, löschen |
| **Einstellungen** | Kegelwinkel, max. Entfernung, Signalkanal, Export/Import, Datum der letzten Sicherung |

- Die App startet **immer** auf „Navigation".
- **Starten und Beenden stehen als Symbol rechts neben der Überschrift** — ein
  Dreieck, während der Navigation ein Quadrat, beide ohne sichtbaren Text und mit
  `aria-label` benannt. Sie werden einmal pro Weg gedrückt; die Liste dagegen wird
  ständig erswiped und soll deshalb früh im Wischweg beginnen. *(Ursprünglich ein
  bildschirmbreiter Knopf unter der Überschrift — Nutzerentscheidung.)* Unverändert
  gilt: iOS gibt den Kompass erst nach `DeviceOrientationEvent.requestPermission()`
  aus einer echten Berührung frei. Die App kann nicht von selbst loslaufen.
- **Der Anhalten-Schalter schwebt als Pausensymbol unten rechts** über dem Inhalt, im
  Gehen mit dem Daumen erreichbar. Im DOM steht er weiterhin **vor** der Liste:
  VoiceOver wischt in DOM-Reihenfolge, dahinter läge er hinter allen Einträgen.
- Während der Navigation hält `navigator.wakeLock` den Bildschirm wach.

---

## 6. Erfassung von Orten

**Ein Name ist Pflicht.** Bei einer Audio-App ist „Unbenannt 3, 1,2 km" wertlos. Beim
Speichern per GPS schlägt die App automatisch etwas vor (Datum/Uhrzeit), damit im Stehen
nichts getippt werden muss; Umbenennen geht später in Ruhe.

### 6.1 Aktuellen Standort speichern

Ein Button. Die **Genauigkeit wird mitgespeichert und angesagt** („gespeichert,
Genauigkeit 12 Meter"), damit erkennbar ist, ob ein zweiter Versuch sinnvoll ist —
direkt nach dem Aufwachen liefert iOS gern ±65 m.

### 6.2 Einfügen aus der Zwischenablage

Ein toleranter Parser, der die üblichen Schreibweisen frisst:

```
52.516275, 13.377704            Dezimalgrad
52°30'58.6"N 13°22'39.7"E       Grad/Minuten/Sekunden
N 52 30.977 E 13 22.662         Grad/Dezimalminuten
geo:52.516275,13.377704         geo-URI
https://maps.app.goo.gl/…       Maps-Link
```

Das ist der Ersatz für eine eigene Adresssuche: Der Ort wird in einer Karten-App
gesucht, die bereits barrierefrei ist, und die Koordinate herüberkopiert. Zwölf Ziffern
mit VoiceOver zu tippen ist keine zumutbare Alternative — ein Vertipper an der dritten
Nachkommastelle verschiebt um hundert Meter.

Der Parser ist reine Domänenlogik (String rein, `Coordinate` oder Fehler raus) und
vollständig ohne iPhone testbar.

### 6.3 Bewusst nicht: Geocoding

Adresssuche über einen Fremddienst wird **vorerst nicht** gebaut. Sie bräuchte Netz,
einen externen Dienst und würde private Ortsangaben an Dritte senden — für einen
Anwendungsfall, den §6.2 zu großen Teilen abdeckt. Nachrüstbar als `GeocodingPort`, ohne
dass der Rest der App es merkt.

---

## 7. Datenhaltung und Sicherung

**Speicher:** `localStorage` mit einem JSON-Dokument, hinter einem
`LocationRepository`-Port. Bei dieser Datenmenge reicht das mit weitem Abstand, ist
synchron und trivial testbar. IndexedDB wäre vorsorgliche Komplexität; der Wechsel bleibt
ein Adapter-Tausch. Zusätzlich `navigator.storage.persist()` — kostet drei Zeilen und
kann nur helfen.

**Risiko:** Ohne Backend gibt es keine zweite Kopie. Das Löschen des Home-Bildschirm-Icons
oder der Websitedaten nimmt alle Orte mit. *(Safaris 7-Tage-Löschung für Skript-Speicher
greift bei installierten Home-Screen-Apps **nicht**; die Daten verfallen nicht durch
Nichtbenutzung.)*

**Sicherung — beide Wege:**

1. **Export als Datei** (JSON, landet in der Dateien-App → iCloud Drive).
2. **Export in die Zwischenablage** — schneller mit VoiceOver, direkt in eine Notiz oder
   Mail einfügbar.

Das **Datum der letzten Sicherung** steht in den Einstellungen. Kein Nörgel-Dialog.

**Einlesen ebenfalls auf beiden Wegen:** Sicherungsdatei auswählen oder den kopierten
Text einfügen. Jeder Export braucht sein Gegenstück — eine Datei, die nur von Hand
geöffnet und kopiert werden kann, ist mit VoiceOver keine Sicherung.

**Import ergänzt, er ersetzt nicht.** Dubletten werden über die Koordinate erkannt.
„Ersetzen" wäre der Klick, der im falschen Moment alles kostet.

---

## 8. Architektur: DDD + Onion

Abhängigkeiten zeigen ausschließlich nach innen. Domäne und Anwendungsschicht sind frei
von DOM, Browser-APIs und Framework.

```
┌─────────────────────────────────────────────┐
│  Adapter (außen)                            │
│   GeolocationPositionProvider               │
│   DeviceOrientationHeadingProvider          │
│   LocalStorageLocationRepository            │
│   WebAudioCue (CuePort)                     │
│   DOM-Views (Navigation / Orte / Settings)  │
│  ┌───────────────────────────────────────┐  │
│  │  Anwendung                            │  │
│  │   NavigationService                   │  │
│  │   LocationService                     │  │
│  │   BackupService                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Domäne (Kern, rein)            │  │  │
│  │  │   Coordinate, Bearing, Distance │  │  │
│  │  │   Location                      │  │  │
│  │  │   greatCircleDistance()         │  │  │
│  │  │   initialBearing()              │  │  │
│  │  │   ViewCone (Hysterese)           │  │  │
│  │  │   CoordinateParser              │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Ports** (Interfaces in der Anwendungsschicht, Implementierung außen):
`PositionProvider`, `HeadingProvider`, `LocationRepository`, `CuePort`, `ClockPort`.

**Der konkrete Gewinn ist nicht akademisch:** Die gesamte Navigationslogik lässt sich am
Windows-Rechner testen, ohne iPhone. Fake-Provider einspeisen — „ich stehe hier, schaue
dorthin" — und prüfen, welche Locations herauskommen. Ohne diese Trennung müsste man für
jede Änderung an der Kegel-Logik rausgehen und sich im Kreis drehen.

`CuePort` ist der Grund, warum die Signalfrage die Architektur nicht blockiert: Die
Ansage konnte nach dem Praxistest ersatzlos entfallen (§4.4), ohne eine Zeile in der
Logik zu ändern, die entscheidet, wer rein- und rausgefallen ist. Ein anderer Kanal
käme genauso hinter denselben Port.

---

## 9. Technischer Stack

| | |
|---|---|
| Sprache | TypeScript, **kein UI-Framework** |
| Build | Vite, `base: '/straight-line-navigation/'` |
| Tests | Vitest (Domäne und Anwendungsschicht) |
| Hosting | GitHub Pages, Deployment über GitHub Actions |

**Warum kein Framework:** VoiceOver-Fokus hängt an der **Identität des DOM-Knotens**.
Ersetzt ein Reconciler beim Neu-Rendern einen Listeneintrag durch ein neues Element statt
es zu aktualisieren, ist der Fokus weg — optisch unsichtbar, mit VoiceOver fatal. Bei
drei Bildschirmen und einer dynamischen Liste greift der Hauptnutzen eines Frameworks
ohnehin nicht; die View ist nur die äußerste Schale und bliebe austauschbar.

**Java ist raus.** Die App braucht **kein Backend** — die Daten sind eigene Koordinaten,
sie gehören aufs Gerät, und ein Server würde die App netzabhängig machen und damit genau
die Eigenschaft zerstören, die sie haben soll.

### 9.1 Repository

Ein einziges Remote: **`github`** → `github.com/burnyWes/straight-line-navigation`
(public, Upstream von `main`, hostet Pages).

**Weil das Repo öffentlich ist:**

- **Niemals echte Koordinaten committen.** Keine Wohnadresse in Testdaten. Die Historie
  bleibt über den Commit-Hash dauerhaft abrufbar, auch nach `git rm` oder Force-Push.
- Keine Secrets im Repo.
- In Workflows **niemals `pull_request_target`** — dieser Trigger gibt fremdem PR-Code
  Schreibrechte und Secrets. Unser Deploy triggert auf `push` auf `main`, wohin nur der
  Eigentümer pushen kann. Actions setzen explizit minimale `permissions:` und gepinnte
  Versionen.

---

## 10. Bewusst nicht gebaut

| Nicht-Ziel | Grund |
|---|---|
| Karte, Kartenkacheln | Widerspricht dem Konzept; offline ein eigenes Projekt |
| Straßennavigation, Routing | Explizit unerwünscht |
| Backend, Konten, Sync | Macht die App netzabhängig, ohne Nutzen |
| Adresssuche/Geocoding | Siehe §6.3 — nachrüstbar |
| Hintergrundbetrieb bei gesperrtem Bildschirm | Auf einer PWA nicht möglich; Anwendungsfall verworfen |
| Nachgebauter Bildschirmvorhang | VoiceOver-Bordmittel |
| Entfernung als Tonhöhe/Klickrate kodiert | Reizvolle Erweiterung, kein Fundament — erst nach Praxiserfahrung |

---

## 11. Offene Messfragen

Drei Fragen, die durch Messen am Gerät zu beantworten sind, nicht durch Nachdenken. Die
Testseite liegt unter `spike/` und ist erreichbar unter
`https://burnywes.github.io/straight-line-navigation/spike/`.

| # | Frage | Ergebnis | Konsequenz |
|---|---|---|---|
| **M1** | Löst `<input type="checkbox" switch>` (iOS 17.4+) bei programmatischem `click()` die Taptic Engine aus? | **Nein** (2026-09-04) | Haptik ist auf diesem Weg nicht erreichbar. Ein-/Austritt wird ausschließlich über den Ton signalisiert. |
| **M2** | Schaltet der Lautlos-Schalter Web Audio stumm? | **Ja** (2026-09-04) | Vom Nutzer akzeptiert; das Verhalten bleibt so. Nach dem Wegfall der Ansage (§4.4) ist der Earcon der einzige Signalkanal — bei Lautlos gibt es kein Ein-/Austritts-Signal. |
| **M3** | Wie verhält sich `webkitCompassAccuracy` **zwischen Häusern**, nicht am Fenster? | **teilweise** (2026-09-04): in Innenräumen zeigt die Nadel korrekt nach Norden; der Zahlenwert wurde nicht abgelesen | Entschärft — siehe §4.5. Die App meldet die Kompassgüte grundsätzlich, unabhängig davon, wie gut sie im Einzelfall ist. |

Kompass- und GPS-Grundfunktion im Standalone-Modus: **bestätigt** (2026-09-04).

**Zur Haptik gibt es keinen weiteren Versuch.** Apple stellt die Taptic Engine dem Web
nicht zur Verfügung: `navigator.vibrate` ist nicht implementiert, die Gamepad-Haptik
setzt ein Gamepad voraus, Web Bluetooth fehlt in Safari, und der `switch`-Umweg wurde
gemessen und trägt nicht. Der einzige verbleibende Kanal wären Web-Push-Benachrichtigungen
— die brauchen einen Server, erzeugen sichtbare Banner und wären als Dauersignal
unbrauchbar. Haptik gäbe es nur nativ (Weg B), mit erzwungener Neusignierung alle 7 Tage;
das steht in keinem Verhältnis.

---

## 12. Entscheidungsprotokoll

| # | Entscheidung | Begründung |
|---|---|---|
| 1 | Kein Apple-Developer-Account | Nutzervorgabe |
| 2 | PWA statt nativ | Ohne Account kein tragfähiger nativer Weg; Kompass-Risiko durch Spike ausgeräumt |
| 3 | GitHub Pages, öffentliches Repo | Dauerhafte HTTPS-URL kostenlos; Actions für Public-Repos unbegrenzt |
| 4 | Szenarien A+C, Schwerpunkt urban | Nutzervorgabe |
| 5 | Kegel ±20°, harter Filter, leere Anzeige zulässig | Nutzerentscheidung gegen den Vorschlag „priorisieren statt filtern" |
| 6 | Zusätzliche Listenansicht zur Verwaltung | Nutzervorgabe |
| 7 | Java raus, TypeScript, kein Backend | Kein Server nötig; Onion-Architektur bleibt vollständig erhalten |
| 8 | Barrierefreiheit Stufe 2 (Audio-First) | Primärnutzer ist blind |
| 9 | Nur Ein-/Austritts-Signal, kein automatisches Vorlesen | Nutzerentscheidung |
| 10 | Manuelles Erswipen (Modell A) statt „Was ist da?"-Button | Nutzerentscheidung gegen den Vorschlag B |
| 11 | Hysterese, Rundung, Auto-Freeze, Freeze-Ansage | Ohne diese vier ist Modell A mit VoiceOver nicht bedienbar |
| 12 | Erfassung per GPS + Zwischenablage-Parser | Kein Share Target auf iOS; Tippen von Koordinaten mit VoiceOver unzumutbar |
| 13 | Name ist Pflicht, Vorschlag beim Speichern | Namenlose Einträge sind in einer Audio-App wertlos |
| 14 | `localStorage` hinter Port; Export als Datei **und** Zwischenablage; Import ergänzt | Einfachster tragfähiger Speicher; Datenverlust ist das reale Risiko |
| 15 | Wake Lock ja, Tasche-Fall verworfen, kein Schwarz-Modus | PWA kann nicht im Hintergrund laufen; Bildschirmvorhang ist Bordmittel |
| 16 | Signalkanal als `CuePort` | Entkoppelt die Architektur von der Frage, welcher Kanal trägt |
| 17 | Drei Tabs, Leiste oben, Start auf „Navigation" | VoiceOver läuft in DOM-Reihenfolge; oben ist ein Wisch statt vieler |
| 18 | Vanilla TypeScript ohne UI-Framework | DOM-Knoten-Identität ist die kritischste Anforderung |
| 19 | Keine Haptik — endgültig | M1 gemessen und negativ; kein weiterer Weg im Web vorhanden (§11) |
| 20 | Stummschaltung bei Lautlos wird akzeptiert | M2 gemessen; Nutzerentscheidung, das Verhalten so zu belassen |
| 21 | Ansage bei Ein- und Austritt ersatzlos entfernt | Praxistest: stört im Gehen mehr, als sie trägt; der Earcon bleibt |
| 22 | Fester heller Farbsatz statt Dunkelmodus | Nutzerentscheidung nach dem Praxistest; weißer Grund, Kontraste über 7:1 |
| 23 | Kegel-Liste: weitestes Ziel oben, nächstes unten | Nutzerentscheidung; beim Durchswipen endet man auf dem wichtigsten Eintrag |
| 24 | Service Worker handgeschrieben, keine Workbox | Hundert Zeilen gegen eine Build-Abhängigkeit; passt zum Stack ohne Framework (§2.2) |
| 25 | Symbole per Skript erzeugt, ohne Bildbibliothek | Drei PNG rechtfertigen keine Abhängigkeit; `tools/make-icons.mjs`, Dateien eingecheckt |
| 26 | Start/Stopp als Symbol im Kopf, Anhalten schwebend unten rechts | Nutzerentscheidung; die Liste soll früh im Wischweg beginnen, der Daumen den Pausenknopf ohne Suchen treffen |
| 27 | Bereichswechsel hält die Liste an, beendet den Lauf aber nicht | Nutzerentscheidung; die Liste soll beim Zurückkommen nicht umsortiert sein, „Hier speichern" braucht weiter einen frischen Fix |
| 28 | Fix gilt 12 s, danach wird die Liste gehalten und der Zustand angesagt | Ein veralteter Standort klingt genauso souverän wie ein gültiger; das Halten macht die Grenze hörbar (§4.6) |
