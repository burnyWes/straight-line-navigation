# Straight-Line-Navigation

Luftlinie und Richtung zu selbst gespeicherten Orten — **ohne Karte, ohne Routing**.
Die App beantwortet „wie weit und in welche Richtung", nicht „wie komme ich hin".

Installierbare PWA für iOS, bedienbar mit VoiceOver. Kein Backend, keine Konten:
alle Daten bleiben auf dem Gerät.

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build      # Produktions-Build nach dist/
```

Domäne und Anwendungsschicht sind frei von DOM und Browser-APIs und laufen ohne
Gerät — die gesamte Navigationslogik ist am Rechner testbar.

## Aufbau

```
src/domain/       Koordinaten, Luftlinie, Peilung, Sichtkegel, Parser  (rein)
src/application/  Ports und NavigationService                          (rein)
src/ui/           Formatierung und Oberfläche                          (Adapter)
src/testing/      Testdaten
spike/            Messseite für Gerätefragen (Kompass, GPS, Ton, Haptik)
```

Abhängigkeiten zeigen ausschließlich nach innen.

## Dokumentation

**[docs/design.md](docs/design.md)** ist die maßgebliche Quelle für Entscheidungen: was gebaut wird,
warum so, was bewusst nicht gebaut wird, und welche Gerätefragen noch offen sind.
Entscheidungen werden dort geändert, nicht im Code umgangen.

**[docs/notes.txt](docs/notes.txt)** hält den Stand der Umsetzung fest — was fertig ist,
was als Nächstes ansteht, was bewusst nicht gebaut wird.

## Hinweis

Das Repository ist öffentlich und seine Historie bleibt dauerhaft abrufbar.
**Niemals echte private Koordinaten committen** — Testdaten verwenden ausschließlich
öffentliche Wahrzeichen und rechnerische Punkte.
