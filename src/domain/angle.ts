/**
 * Rechnen mit Kompassrichtungen.
 *
 * Alle Winkel in Grad, im Uhrzeigersinn, 0 = Norden.
 */

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Bringt einen beliebigen Winkel auf 0..360 (360 selbst wird zu 0). */
export function normalizeBearing(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Vorzeichenbehaftete kuerzeste Drehung von `fromDeg` nach `toDeg`, -180..180.
 *
 * Positiv bedeutet: das Ziel liegt rechts von der Blickrichtung. Genau diese
 * Groesse braucht die Anzeige fuer "28 Grad rechts von dir".
 */
export function signedAngularDifference(fromDeg: number, toDeg: number): number {
  const diff = normalizeBearing(toDeg - fromDeg);
  return diff > 180 ? diff - 360 : diff;
}

/** Betrag der kuerzesten Drehung zwischen zwei Richtungen, 0..180. */
export function angularOffset(fromDeg: number, toDeg: number): number {
  return Math.abs(signedAngularDifference(fromDeg, toDeg));
}
