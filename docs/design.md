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
- **20 px zwischen zwei Bedienpunkten**, gehalten von einem Token
  (`--abstand` in `styles.css`) und damit an einer Stelle nachjustierbar. Der
  Grund ist der Finger, nicht das Auge: Bei den vorherigen 8 px — rund 1,3 mm
  auf dem Gerät — überquert der erkundende Finger die Grenze ohne Pause und
  landet auf dem Nachbarn. **Die Tab-Leiste ist davon ausgenommen**: eine
  geschlossene Reihe ohne Zwischenraum, in der Danebenlanden „ein Tab weiter"
  heißt und nicht „falsche Handlung ausgelöst" — dort kostet Abstand nur
  Breite, die „Einstellungen" schon heute fehlt. Trefferflächen bleiben
  unverändert (Knopf mindestens 52 px hoch, Symbolknopf 52 × 52), und die
  Listendichte auch: Ihre 22 px hängen jetzt am Listeneintrag statt am Knopf
  darin, sonst zählte der Abstand doppelt.

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
- **Ausgeblendete Orte erreichen den Kegel gar nicht erst** (§6.5). Sie werden vor der
  Messung aussortiert und lösen deshalb auch keine Ein- und Austritts-Signale aus.
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

### 4.3 Anhalten der Liste

Die Liste hält **nur auf ausdrückliche Anweisung** an: über den Anhalten-Knopf unten
rechts. Ansonsten läuft sie live weiter — auch dann, wenn der VoiceOver-Cursor auf
einem Eintrag steht.

**Der Fokus friert die Liste nicht mehr ein.** *(Nutzerentscheidung nach dem
Praxistest; ursprünglich hielt jedes `focusin` in der Liste sie an.)* Gedacht war es
als Schutz gegen die Umsortierung unter dem Finger, im Gebrauch war es die größere
Störung: Beim Durchwischen hielt die Liste bei jedem Eintritt an und lief bei jedem
Austritt wieder los, dazu sagte sie abwechselnd „angehalten" und „aktualisiert". Wer
eine stehende Liste will, sagt das jetzt selbst.

**Ein anderer Bereich hält die Liste weiterhin an.** Wer in „Orte" oder
„Einstellungen" wechselt, liest die Liste gerade nicht; liefe sie dort weiter, stünde
sie beim Zurückkommen in völlig anderer Reihenfolge. Der Navigationslauf selbst geht
weiter — Sensoren bleiben angemeldet, der Bildschirm wach, die Ein-/Austritts-Signale
klingen —, denn „Hier speichern" im Bereich Orte braucht einen frischen Fix. Dieses
Anhalten wird **nicht angesagt**: Gemeldet wird ein Freeze nur dort, wo er die gerade
gelesene Liste betrifft.

Das Drücken des Knopfes wird angesagt („angehalten" / „aktualisiert"), sonst ist
nicht unterscheidbar, ob Zahlen aktuell oder eingefroren sind.

**Der Fokus überlebt die Umsortierung.** Wird die fokussierte Zeile verschoben, nimmt
der Browser sie kurz aus dem Dokument und der Fokus fällt auf den Rumpf. Seit die Liste
unter dem Fokus weiterläuft, ist das der Normalfall; der Render setzt den Fokus deshalb
nach jeder Umsortierung auf dieselbe Zeile zurück. Ohne das stünde der VoiceOver-Cursor
sekündlich wieder am Seitenanfang.

**Präzisierung aus der Umsetzung:** Die Entfernungen aller Zeilen aktualisieren sich
laufend, **außer bei der gerade fokussierten**. Ändert sich der zugängliche Name eines
fokussierten Elements, setzt VoiceOver mitten im Satz neu an — genau der Effekt, den das
Einfrieren verhindern soll. Die Zeile unter dem Finger behält ihre Beschriftung, bis der
Fokus sie verlässt. Diese Regel hängt **nicht** am Anhalten-Zustand: Sie gilt auch in der
laufenden Liste — sonst liest VoiceOver den Eintrag unter dem Finger sekündlich neu vor.

**Ein Freeze, der hängen bleibt, ist schlimmer als gar keiner.** Die Liste steht still,
die Ein- und Austritts-Signale klingen weiter — und nichts widerspricht. Seit nur noch
der Knopf einfriert, bleibt eine Sicherung nötig:

- **Der Freeze-Zustand gehört dem Lauf.** Start und Ende setzen ihn zurück. Sonst friert
  eine Flagge aus dem vorigen Lauf die noch leere Liste des nächsten ein, und der Lauf
  zeigt nie wieder etwas an.

**Technische Voraussetzung:** Jede Listenzeile ist ein `<button>`. Nur fokussierbare
Elemente nimmt der VoiceOver-Cursor als eigene Station, und nur an ihnen hängt die
Regel, dass die gerade gelesene Zeile ihre Beschriftung behält.

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
Störung, veralteter Standort, angehaltene Liste, laufende Navigation. **Sie steht
zusammen mit der Kompassgüte am unteren Bildrand und bleibt beim Scrollen dort
stehen** (`position: fixed`) — Gegenstück zur angehefteten Tab-Leiste oben
*(Nutzerentscheidung)*. Im DOM steht sie **hinter** der Liste: VoiceOver wischt in
DOM-Reihenfolge, und wer navigiert, will die Orte hören und nicht bei jedem Anlauf zwei
Zeilen Zustand davor. Was wirklich neu ist, wird ohnehin angesagt; die Zeilen sind zum
Nachschlagen da.

**Ihre Höhe wandert per `--foot-height` zurück ins Layout.** Angeheftet liegt die Leiste
außerhalb des Flusses und schiebt nichts mehr weg; der letzte Listeneintrag und der
schwebende Anhalten-Knopf darüber brauchen aber genau so viel Platz, wie sie einnimmt.
Ein fester Wert reicht nicht — eine gemeldete Störung läuft über mehrere Zeilen, und die
Schriftgröße folgt der Systemeinstellung. Ein `ResizeObserver` misst nach; der
Rücksprungwert im Stylesheet gilt nur bis zur ersten Messung und ist bewusst reichlich:
Zu viel Platz kostet Leere unter dem letzten Eintrag, zu wenig verdeckt ihn. *(Vorher
schrieb der Render unbedingt „Navigation läuft." und wischte damit jede
Fehlermeldung im nächsten Bild wieder weg — der Fehler, der zu diesem Abschnitt
geführt hat.)*

---

## 5. Interaktionsmodell

**Vier Tabs, Tab-Leiste oben** (nicht unten): VoiceOver läuft in DOM-Reihenfolge; oben
ist die Leiste mit einem Wisch vom Seitenanfang erreichbar. Die iOS-Konvention „Tabs
unten" ist Daumen-Ergonomie für Sehende und hier ein Umweg. **Die Leiste bleibt beim
Scrollen am oberen Rand stehen** (`position: sticky`): Der Bereichswechsel darf nicht
davon abhängen, wie weit die Ortsliste gescrollt ist. Die Überschrift scrollt weg.

| Tab | Inhalt |
|---|---|
| **Navigation** | Start/Stopp als Symbol im Kopf, Kegel-Liste, schwebender Anhalten-Schalter |
| **Orte** | Liste aller gespeicherten Locations, nur Namen; Anlegen über ein Plus im Kopf, Bearbeiten und Löschen über Dialoge |
| **Gruppen** | Liste der Gruppen; Anlegen über ein Plus im Kopf, Mitglieder und Löschen über Dialoge (§6.6) |
| **Einstellungen** | Kegelwinkel, max. Entfernung, Signalkanal, Datum der letzten Sicherung; Sichern und Einlesen hinter dem Dialog „Daten speichern / laden" (§7) |

- Die App startet **immer** auf „Navigation". *(Der vierte Tab kam mit den Gruppen
  dazu — statt zweier Knöpfe unter der Leiste im Orte-Panel: Ein Umschaltmechanismus
  statt zwei, und die Knöpfe lägen sonst bei **jedem** Besuch der Orte-Seite vor der
  Liste. Der vierte Tab kostet eine Station, aber nur einmal, und liegt dort, wo der
  Bereichswechsel ohnehin stattfindet.)*
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

**Ein Name ist Pflicht.** Bei einer Audio-App ist „Unbenannt 3, 1,2 km" wertlos. Der
Anlegen-Dialog **belegt das Namensfeld beim Öffnen mit einem Vorschlag** (Datum/Uhrzeit),
damit im Stehen nichts getippt werden muss; überschreiben geht sofort, umbenennen später
in Ruhe. *(Ursprünglich ein eigener Knopf „Namen vorschlagen" — ein Knopf für etwas, das
ohnehin immer gewollt ist, ist mit VoiceOver ein Wisch zu viel.)*

Angelegt wird über ein **Plus-Symbol rechts neben der Überschrift** — dasselbe Muster wie
Start und Stopp im Bereich Navigation (§5). Es öffnet einen modalen Dialog mit beiden
Speicherwegen untereinander: kürzester Wischweg, keine zweite Ebene.

### 6.1 Aktuellen Standort speichern

Ein Button. Die **Genauigkeit wird mitgespeichert und angesagt** („gespeichert,
Genauigkeit 12 Meter"), damit erkennbar ist, ob ein zweiter Versuch sinnvoll ist —
direkt nach dem Aufwachen liefert iOS gern ±65 m.

Der Knopf **bleibt im Dialog sichtbar, auch wenn kein Fix vorliegt**, und nennt dann den
Grund („Kein Standort verfügbar. Zuerst die Navigation starten.") statt zu verschwinden.
Ein fehlender Knopf ist mit VoiceOver schwerer zu deuten als einer, der sich erklärt. Der
Dialog bleibt dabei offen — der eingegebene Name geht nicht verloren.

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

### 6.4 Verwalten: Liste und Dialoge

Die Ortsliste zeigt **nur den Namen** — der Eintrag selbst ist ein Button und wird von
VoiceOver als „Bahnhof, Button" angesagt, ohne Zusatz. Rechts daneben steht ein zweiter,
unbeschrifteter Knopf zum Ausblenden (§6.5); alles Weitere liegt hinter dem Eintrag:

- **Ein Tipp auf den Eintrag** öffnet einen modalen Dialog mit Anlagedatum und
  Genauigkeit, dem Namensfeld, „Namen speichern", „Löschen" und „Schließen". Die
  Koordinate steht bewusst **nicht** darin — sie sagt nichts, was im Gehen hilft, und
  VoiceOver läse zwölf Ziffern mit. Datum und Genauigkeit sagen stattdessen, wie
  verlässlich der Punkt ist.
- **„Löschen" fragt in einem zweiten Dialog nach.** Ohne Backend gibt es keine zweite
  Kopie (§7); ein Fehlgriff im Gehen ist endgültig. Der Fokus steht dort auf
  „Abbrechen" — der sichere Weg ist der voreingestellte. „Abbrechen" führt zurück in
  den Bearbeiten-Dialog, ohne etwas zu ändern.
- **Modale Dialoge, nativ** (`<dialog>` mit `showModal()`): Der Browser setzt den
  Hintergrund inert, hält den Fokus im Dialog und behandelt Escape. Ohne Tastatur trägt
  „Schließen" denselben Weg.
- **Der zweite Knopf heißt „Schließen", nicht „Abbrechen".** Jede Handlung im Dialog wirkt sofort und
  ist längst geschrieben, wenn der Knopf wieder erreichbar ist — „Abbrechen" klänge danach,
  als nähme es sie zurück. Nur die Löschen-Rückfrage behält „Abbrechen": Dort wendet der Knopf
  tatsächlich eine schwebende Handlung ab.
- **Solange ein Dialog offen ist, gehört die Meldung in den Dialog.** Die Meldungszeile
  des Panels läge hinter dem modalen Hintergrund — weder zu sehen noch zu erswipen. Erst
  beim Schließen wandert die Bestätigung ins Panel.
- **Nach dem Schließen steht der Fokus dort, wo weitergearbeitet wird:** nach Anlegen und
  Umbenennen auf dem betroffenen Eintrag in der Liste, nach dem Löschen auf dem Plus.

Die Liste ist alphabetisch sortiert (deutsch, Umlaute einsortiert).

### 6.5 Ausblenden

Ein Ort kann **ausgeblendet** werden: Er bleibt gespeichert, nimmt aber nicht mehr an der
Navigation teil. Der Zweck ist nicht Aufräumen, sondern **Ruhe im Kegel**. Wer dreißig
Orte gespeichert hat, heute aber nur drei davon braucht, bekommt sonst bei jeder Drehung
Ein- und Austritts-Töne für Ziele, die gerade nicht interessieren. Die einzige Alternative
wäre Löschen — und das ist ohne Backend endgültig (§7).

**Geschaltet wird in der Liste, nicht im Dialog:** rechts an jeder Zeile ein Knopf mit
Glühbirnen-Symbol, leuchtend für sichtbar, dunkel für ausgeblendet. Der Preis ist bekannt
und bewusst gezahlt: Die Orte-Seite hat damit **zwei VoiceOver-Stationen je Ort** statt
einer. Ausblenden ist eine Reihenhandlung („heute nur die drei im Kiez"); über den
Bearbeiten-Dialog wären das pro Ort zwei Tipps und eine Ebene tiefer. Der Knopf steht im
DOM **hinter** dem Namen — wer tippt statt weiterzuwischen, hört ihn nie.

**Der Knopf sagt, was der Tipp bewirkt**, nicht in welchem Zustand er ist: „Bahnhof
ausblenden" bzw. „Bahnhof einblenden", dazu wechselt das Symbol. Kein `aria-pressed`:
„ausgewählt" müsste gedeutet werden — ausgewählt wofür? Dasselbe Muster fährt der
Anhalten-Knopf im Bereich Navigation. Dass sich damit der Name des gerade fokussierten
Elements ändert, ist hier **kein** Verstoß gegen §4.3: Dort geht es um eine Liste, die
sich von allein im Sekundentakt ändert. Hier ist die Umbenennung die Folge des eigenen
Tippens — das erneute Vorlesen *ist* die Bestätigung. Genau deshalb gibt es **keine**
zusätzliche Ansage; sie wäre dieselbe Information ein zweites Mal.

**Umgeschaltet wird eine Zeile, nicht die Liste.** Der Fokus steht beim Tippen auf dem
Knopf, und ein neu gebauter Knopf nähme ihn mit (§9).

**Eine stille Zeile nennt den Umfang:** „2 von 7 Orten sind ausgeblendet." Sie steht nur
da, wenn überhaupt etwas ausgeblendet ist, und ist **keine** Live-Region — sonst spräche
sie bei jedem Umschalten mit. Sie existiert, weil ein stillschweigend gefiltertes Ziel in
einer Audio-App nicht bemerkbar ist; dieselbe Sorge lässt die Maximalentfernung
standardmäßig unbegrenzt (§4.2). In die Statuszeile der Navigation gehört das **nicht**:
Die hat eine feste Rangfolge und meldet nur, was gerade passiert (§4.6).

**Für „heute nur die drei im Kiez" gibt es den Weg über eine Gruppe** (§6.6): Dieselbe
Glühbirne sitzt dort an der Gruppenzeile und schaltet alle ihre Orte auf einen Schlag.
Sie schreibt dabei genau dieses Feld `hidden` — die Gruppe besitzt keinen eigenen
Sichtbarkeitszustand.

**Während eines Laufs klingt Ausblenden wie Löschen.** Lag der Ort gerade im Kegel, folgt
der absteigende Zweiklang, beim Einblenden der aufsteigende. Das ist kein falsches Signal
im Sinne von §4.6: Es behauptet nichts über die Welt, sondern meldet eine Änderung, die
der Nutzer selbst ausgelöst hat — und für gelöschte Ziele gilt dasselbe schon heute.

**Gespeichert wird der Zustand mit dem Ort** (Feld `hidden`) und er ist Teil jeder
Sicherung. Eine Sicherung ohne das Feld — jede von vor dieser Fassung — wird als
„sichtbar" gelesen; ein Ort, der nach dem Einlesen stumm fehlte, wäre der schlechteste
Ausgang (§7). Das Format bleibt deshalb bei `version: 1`: Die Änderung ist rein additiv,
und kein Leser verhält sich je nach Nummer anders.

### 6.6 Gruppen

Orte lassen sich zu benannten **Gruppen** zusammenfassen. Der Zweck ist derselbe wie
beim Ausblenden einzelner Orte (§6.5): **Ruhe im Kegel**. Ausblenden ist heute schon
eine Reihenhandlung („heute nur die drei im Kiez") — eine Gruppe macht aus der Reihe
einen einzigen Tipp und hält die Auswahl fest, statt sie jeden Morgen neu
zusammenzusuchen.

**Ein eigener Tab, keine zwei Knöpfe im Orte-Panel** (§5). Die Seite ist gebaut wie die
Orte-Seite: Überschrift und Plus im Kopf, darunter Meldungszeile und Liste; Anlegen
hinter dem Plus, Bearbeiten und Löschen hinter dem Listeneintrag, alles in modalen
Dialogen (§6.4). Die Liste ist alphabetisch sortiert (deutsch, Umlaute einsortiert),
wie die der Orte.

**Die Gruppe hält die Mitglieder, nicht der Ort seine Gruppen.** Ein Ort weiß nichts von
Gruppen; `location.ts` und das Ortsformat bleiben unverändert. Die Mitgliedschaft ist die
Invariante der Gruppe, also gehört sie ins Gruppen-Aggregat. Aufgelöst wird **immer**
gegen die existierenden Orte: Eine verwaiste Kennung — gelöschter Ort, halb geschriebener
Speicher — fällt dabei still weg, statt weiter unten als fehlender Ort zu krachen.

**Eigener Speicherschlüssel, eigenes Repository** (`straight-line-navigation.groups`).
Zwei Aggregate, zwei Repositories; der Ortsspeicher bleibt Zeile für Zeile so, wie er
ist. Halb geschriebene Stände sind damit möglich — Ort gelöscht, Gruppe noch nicht
aufgeräumt, weil der zweite Schreibzugriff scheiterte. Durch die Filter-Regel eben sind
sie unschädlich: Die Gruppe zeigt dann einen Ort weniger, statt zu brechen.

**Kein Namensvorschlag beim Anlegen.** Der Vorschlag bei Orten existiert, weil im Stehen
nichts getippt werden soll (§6); eine Gruppe wird im Sitzen angelegt und trägt einen
selbst gewählten Namen. „Gruppe 5. September" wäre so wertlos wie „Unbenannt 3".

**Gruppennamen sind eindeutig**, verglichen ohne Rücksicht auf Groß- und
Kleinschreibung. „kiez" und „Kiez" sind mit VoiceOver nicht auseinanderzuhalten; zwei
Einträge mit demselben gesprochenen Namen wären unbedienbar. Ein zweiter „Kiez" wird
abgelehnt mit „Eine Gruppe mit diesem Namen gibt es schon." — beim Anlegen wie beim
Umbenennen. Beim Umbenennen zählt die eigene Gruppe nicht als Kollision, sonst ließe sich
die Groß-Schreibung nie korrigieren.

**Nach dem Schließen steht der Fokus dort, wo weitergearbeitet wird:** nach Anlegen und
Umbenennen auf der Gruppe in der Liste, nach dem Löschen auf dem Plus — dieselbe Regel
wie bei den Orten. Das Löschen fragt in einem zweiten Dialog nach, und der Fokus steht
dort auf „Abbrechen".

**Mitglieder: Rad zum Hinzufügen, Liste zum Entfernen.** Hinzufügen wählt aus vielen
aus — dafür ist ein Auswahlrad da; es listet **nur** Orte, die noch nicht Mitglied sind,
alphabetisch. Entfernen zielt auf einen bestimmten Eintrag, und dafür braucht es ihn in
einer Liste: darunter steht der Bestand, je Mitglied eine Zeile mit Namen links und
Mülleimer-Knopf rechts, benannt „Bahnhof aus Kiez entfernen" — Ort **und** Gruppe, weil
der Dialogtitel beim Wischen längst vorbei ist.

**Die Auswahl wirkt sofort**, ohne zweiten „Hinzufügen"-Knopf. Auf iOS wird ein
`<select>` als Rad gezeigt und mit „Fertig" bestätigt — die Auswahl ist dort ohnehin
schon ein bewusster Abschluss; ein zweiter Knopf wäre eine Station und ein Tipp mehr je
Ort. Danach springt das Rad auf „Ort wählen" zurück, und der hinzugefügte Ort verschwindet
aus seiner Liste. Gibt es nichts auszuwählen, entfällt das Rad — ein Rad ohne Auswahl ist
ein toter Knopf — und an seiner Stelle steht der Grund: „Alle gespeicherten Orte sind
schon in dieser Gruppe." bzw. „Noch keine Orte gespeichert."

**Nach dem Entfernen rückt der Fokus auf den Mülleimer des nachgerückten Ortes**, nicht
zurück aufs Rad: Aufräumen ist eine Reihenhandlung — dasselbe Argument, mit dem §6.5 die
Glühbirne in die Zeile statt in den Dialog gelegt hat. War es das letzte Mitglied, bleibt
das Auswahlrad. **Eine Statuszeile im Dialog meldet** „Bahnhof hinzugefügt." bzw. „Bahnhof
entfernt."; sie ist hier `role="status"`, weil der Fokus wandert und kein Knopf sich
selbst neu vorliest — anders als bei der Glühbirne, wo genau das die Bestätigung ist.

**Der Eintragsknopf nennt den Umfang:** „Kiez, 4 Orte", bei ausgeblendeten Mitgliedern
„Kiez, 4 Orte, 1 ausgeblendet". Die Zahlen stehen im Knopfnamen und nicht in einer
eigenen Zeile: Die Gruppenzeile hat mit der Glühbirne ohnehin schon zwei Stationen, und
ein Rückwärtswisch auf den Knopf ist der Weg zur Zahl. Der Zusatz erscheint nur, wenn
mindestens einer ausgeblendet ist.

**Ein Ort darf in mehreren Gruppen stehen**; wird er gelöscht, verschwindet er aus allen.
Aufgeräumt wird **nach** dem Löschen: Schlägt das Aufräumen fehl, bleibt eine verwaiste
Kennung zurück — und die ist durch das Filtern beim Auflösen unschädlich.

**Die Glühbirne an der Gruppe ist ein Reihenschalter, kein Zustand.** Rechts an jeder
**nicht leeren** Gruppenzeile steht eine Birne, gleiches Bild und gleiche Beschriftungsregel
wie bei einem Ort (§6.5): „Kiez ausblenden" bzw. „Kiez einblenden". Ein Tipp schreibt
`hidden` auf **alle** Mitglieder. Die Gruppe hat **keinen** eigenen Sichtbarkeitszustand —
es bleibt genau eine Wahrheit über die Sichtbarkeit eines Ortes. Ein eigener
Gruppenzustand ließe die Orte-Seite „Bahnhof ausblenden" (also: sichtbar) ansagen für
einen Ort, der nicht navigiert wird — genau das stille Filtern, gegen das §6.5
argumentiert. `LocationService.visible()` und der `NavigationService` bleiben davon
unberührt; die Navigation weiß von Gruppen nichts, und ein Ort in zwei Gruppen erzeugt
keinen Konflikt. Der Preis ist bewusst gezahlt: Einblenden über die Gruppe hebt auch eine
einzeln gesetzte Ausblendung auf.

**Die Birne ist zweistufig, obwohl es drei Fälle gäbe.** Sie leuchtet, sobald
**mindestens ein** Mitglied sichtbar ist — dann blendet ein Tipp aus; erst wenn alle dunkel
sind, ist sie dunkel und blendet ein. „Teilweise" als dritter Zustand wäre eine Angabe, die
man deuten müsste, ohne dass sich daraus ein nächster Schritt ergibt. Die Zahl steht
ohnehin im Eintragsknopf derselben Zeile.

**Leere Gruppen haben keine Birne** — kein toter Knopf im Wischweg. **Und es gibt keine
zusätzliche Ansage**, aus demselben Grund wie beim einzelnen Ort: Der Knopf liest seinen
neuen Namen selbst vor. Nachgezogen wird sofort, Birne **und** Eintragsknopf, weil dessen
Zahlen sich mitändern — ein Rückwärtswisch muss die Wahrheit finden, nicht den Stand von
vorhin. Und zwar in **allen** Zeilen, nicht nur der geschalteten: Ein Ort darf in mehreren
Gruppen stehen, sein `hidden` ändert die Zahlen also überall dort mit. Der Fokus bleibt
dabei stehen, weil nur der Inhalt bestehender Knoten neu geschrieben wird und kein Knoten
ersetzt (§9). Läuft gerade ein Weg, klingen Ein- und Austritts-Töne wie beim einzelnen
Ort.

**Schlägt das Schreiben mittendrin fehl**, ist ein Teil der Orte schon geschaltet. Die
Meldung sagt deshalb nur, dass das Speichern fehlschlug, und beide Ansichten werden danach
vollständig neu gezeichnet: Sie zeigen den **tatsächlichen** Stand, nicht den
beabsichtigten.

**Der Ort-Dialog nennt die Gruppen, er ändert sie nicht.** Die vorhandene Hinweiszeile
wird um einen Satz ergänzt: „Angelegt am 3. September 2026, Genauigkeit 12 Meter. In den
Gruppen Kiez und Arbeit." Steht der Ort in keiner Gruppe, bleibt der Zusatz weg — „In
keiner Gruppe." wäre bei den meisten Orten ein Satz ohne Anlass. Geändert wird die
Mitgliedschaft dort **nicht**: Sonst gäbe es zwei Wege zu derselben Sache, und der im
Ort-Dialog wäre der umständlichere von beiden.

**Löschen einer Gruppe rührt die Orte nicht an** — auch nicht ihre Sichtbarkeit.
Ausgeblendete Mitglieder bleiben ausgeblendet und sind einzeln auf der Orte-Seite wieder
einblendbar. Ein Löschen, das nebenbei dreißig Orte in den Kegel zurückholte, wäre genau
die Überraschung, gegen die §6.5 argumentiert. Die Rückfrage sagt das ausdrücklich.

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

**Alle vier Wege liegen hinter einem Dialog** „Daten speichern / laden". In den
Einstellungen stehen unter der Überschrift „Daten" nur noch das Datum der letzten
Sicherung und der Knopf, der ihn öffnet: Der Abschnitt war elf Stationen lang und lag
bei jedem Besuch im Wischweg, auch dann, wenn nur der Kegelwinkel geändert werden
sollte. Beim Öffnen liegt der Fokus auf „Als Datei sichern", das Textfeld ist leer.
Der Dialog **bleibt nach jeder Handlung offen** und meldet in seine eigene Zeile — es
sind vier Werkzeuge, kein Formular; als Datei sichern *und* zusätzlich in die
Zwischenablage ist ein sinnvoller Doppelgriff, und Fehler zwingen ohnehin zum
Offenbleiben (§6.6). Das **Datum bleibt draußen** im Panel: Hinter einem Dialog sähe
es niemand, und genau das ist sein Zweck.

**Import ergänzt, er ersetzt nicht.** Dubletten werden über die Koordinate erkannt.
„Ersetzen" wäre der Klick, der im falschen Moment alles kostet.

**Jede Sicherung enthält die Gruppen** (§6.6) — sonst wäre sie keine vollständige zweite
Kopie mehr. Das Format bleibt bei `version: 1`: Die Änderung ist rein additiv, und kein
Leser verhält sich je nach Nummer anders. Eine Sicherung **ohne** `groups` — jede von vor
dieser Fassung — liest sich als „keine Gruppen", nicht als Fehler.

**Import vereinigt gleichnamige Gruppen** und ergänzt fehlende; verglichen wird ohne
Rücksicht auf Groß- und Kleinschreibung. Der Name ist die Identität über Geräte hinweg,
weil Kennungen es nicht sind. Genau deshalb werden **die Mitgliedskennungen beim
Zusammenführen umgeschrieben**: Eine Dublette behält die lokale Kennung, und ohne diese
Abbildung („eingelesene Kennung → lokale Kennung", aus dem Zusammenführen der Orte) zeigte
eine eingelesene Gruppe danach auf einen Ort, den es lokal nicht gibt. Eine Kennung ohne
Abbildung fällt weg. Zusammengeführt wird **erst** die Ortsliste, dann die Gruppen.

Die Meldung nennt beides und lässt weg, was null ist: „3 Orte ergänzt, 1 waren schon
vorhanden, 1 Gruppe ergänzt, 1 Gruppe erweitert." Beschädigte Einträge werden getrennt
gezählt und immer genannt — sie sind verloren.

Die Sicherungsdatei heißt seitdem `sicherung-<Datum>.json` und nicht mehr `orte-…`: In der
Dateien-App ist der Name das einzige, woran sie zu erkennen ist.

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

**Identität allein genügt nicht — ein Knoten, der bleibt, darf auch nicht bewegt
werden.** `appendChild` verschiebt einen vorhandenen Knoten, nimmt ihn dafür aber aus dem
Dokument und setzt ihn wieder ein. Für VoiceOver ist das eine neue Zeile: Der Eintrag
unter dem liegenden Finger wurde im Sekundentakt erneut vorgelesen. Der Render hängt
deshalb nicht mehr jede Zeile neu an, sondern bewegt nur, was an falscher Stelle steht;
stimmt die Reihenfolge, bleibt das DOM unberührt.

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
| 11 | Hysterese, Rundung, Anhalten-Knopf, Freeze-Ansage | Ohne diese vier ist Modell A mit VoiceOver nicht bedienbar |
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
| 29 | Tab-Leiste bleibt beim Scrollen oben stehen | Der Bereichswechsel darf nicht davon abhängen, wie weit die Ortsliste gescrollt ist |
| 30 | Orte verwalten in modalen Dialogen, Löschen mit eigener Rückfrage | Die Liste bleibt auf den Namen reduziert; ohne Backend ist ein Fehlgriff endgültig (§7) |
| 31 | Anlegen hinter einem Plus-Symbol, Namensvorschlag vorbelegt statt auf Knopfdruck | Das Formular stand vor der Liste und war bei jedem Erswipen im Weg; der Vorschlag ist ohnehin immer gewollt |
| 32 | Freeze ist an drei Stellen lösbar, und der Render bewegt nur, was falsch steht | Ein hängender Freeze und eine im Sekundentakt neu eingehängte Zeile machen die Liste unbrauchbar, ohne dass etwas widerspricht (§4.3, §9) |
| 33 | Orte ausblendbar über einen zweiten Knopf je Zeile; stille Hinweiszeile statt Statusmeldung | Löschen war bisher die einzige Art, Ruhe im Kegel zu bekommen — und ohne Backend endgültig. Der doppelte Wischweg ist der bewusst gezahlte Preis dafür, dass Ausblenden eine Reihenhandlung bleibt (§6.5) |
| 34 | Gruppen als vierter Tab; die Gruppe hält die Mitglieder, eigener Speicherschlüssel, Name als Identität | Ein Umschaltmechanismus statt zwei; der Ort bleibt unverändert und seine Tests unberührt; über Geräte hinweg unterscheiden sich Kennungen, Namen nicht (§6.6) |
| 35 | Der zweite Dialogknopf heißt „Schließen"; nur die Löschen-Rückfrage behält „Abbrechen" | Nutzerentscheidung: Speichern, Umbenennen und Mitgliederpflege wirken sofort — „Abbrechen" danach klingt, als nehme es die letzte Handlung zurück. In der Rückfrage ist noch nichts geschehen, dort ist „Abbrechen" die richtige Bedeutung (§6.4) |
| 36 | Abstand zwischen zwei Bedienpunkten auf 20 px, als ein Token; Tab-Leiste ausgenommen | Nutzerentscheidung nach dem Praxistest: Beim Erkunden mit dem Finger war 8 px keine Grenze, sondern eine Kante — der Finger überquerte sie ohne Pause. Die Leiste ist eine geschlossene Reihe; dort kostet Abstand nur Breite, die „Einstellungen" schon heute fehlt (§3) |
| 37 | Sichern und Einlesen hinter dem Dialog „Daten speichern / laden"; Überschrift „Daten", das Datum bleibt im Panel | Nutzerentscheidung: Der Abschnitt war elf der zwanzig Stationen der Einstellungen und lag bei jedem Besuch im Weg. Der Dialog bleibt nach jeder Handlung offen, damit Erfolg und Fehler an derselben Stelle stehen; das Datum gehört nach draußen, weil es ungefragt gesehen werden soll (§7) |
