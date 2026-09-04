/**
 * Wann ist ein Standort zu alt, um noch etwas zu behaupten?
 *
 * Faellt das GPS aus, waehrend der Kompass weiterlaeuft, rechnet die App
 * unbemerkt weiter mit dem letzten bekannten Fix: Die Liste sortiert sich beim
 * Drehen um, die Entfernungen klingen plausibel - und stimmen nicht. Fuer eine
 * App, die genau eine Frage beantwortet, ist "plausibel, aber falsch" der
 * schlimmste Ausgang. Ein sehender Nutzer saehe ein eingefrorenes Kartenbild;
 * hier gibt es nichts zu sehen, also muss die Grenze ausgesprochen werden.
 *
 * Frei von DOM und Browser-APIs. Die Uhr gehoert nach aussen: Wer fragt,
 * bringt die aktuelle Zeit mit.
 */

import type { PositionFix } from './ports.js';

/**
 * Obergrenze fuer das Alter eines Fixes: 12 Sekunden.
 *
 * Drei Groessen begrenzen die Wahl:
 * - Bei Gehgeschwindigkeit sind das rund 17 Meter. Das liegt innerhalb des
 *   Fehlers, den die eingefrorene Liste ohnehin in Kauf nimmt (design.md 4.3) -
 *   die Grenze meldet also nicht jede Ungenauigkeit, sondern den Ausfall.
 * - Im staedtischen Raum, dem Schwerpunkt der App, sind Luecken von wenigen
 *   Sekunden normal. Eine Grenze darunter meldete staendig Fehlalarm, und eine
 *   App, die dauernd "veraltet" sagt, wird weggeschaltet.
 * - Die Geolocation-API meldet einen Ausfall erst nach ihrem eigenen Timeout
 *   von 20 Sekunden. Bis dahin darf der Nutzer nicht im Unklaren bleiben.
 */
export const MAX_POSITION_AGE_MS = 12_000;

/** Alter des Fixes in Millisekunden, nie negativ. */
export function positionAgeMs(fix: PositionFix, nowMs: number): number {
  // Eine Uhr, die hinter dem Zeitstempel liegt, macht keinen Fix "frischer als
  // frisch" - sie ist einfach nicht verwertbar.
  return Math.max(0, nowMs - fix.timestamp);
}

export function isPositionStale(fix: PositionFix, nowMs: number): boolean {
  return positionAgeMs(fix, nowMs) > MAX_POSITION_AGE_MS;
}
