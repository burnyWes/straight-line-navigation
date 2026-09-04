/**
 * Rundung der Entfernung auf Anzeigestufen.
 *
 * Fachliche Regel aus docs/design.md 4.2: unter 1 km in 10-m-Schritten,
 * darueber in 100-m-Schritten. Grund ist nicht Aesthetik, sondern VoiceOver -
 * ein metergenaues Label aendert sich mehrmals pro Sekunde und laesst den
 * Screenreader mitten im Satz neu ansetzen.
 *
 * Die Sprache der Ausgabe gehoert nicht hierher, sondern in die Praesentation.
 */

export const DISTANCE_STEP_NEAR_METRES = 10;
export const DISTANCE_STEP_FAR_METRES = 100;
export const DISTANCE_STEP_THRESHOLD_METRES = 1000;

export function roundDisplayDistanceMetres(metres: number): number {
  if (!Number.isFinite(metres) || metres < 0) {
    throw new RangeError(`Entfernung muss eine nicht-negative Zahl sein, war: ${metres}`);
  }
  const step =
    metres < DISTANCE_STEP_THRESHOLD_METRES
      ? DISTANCE_STEP_NEAR_METRES
      : DISTANCE_STEP_FAR_METRES;

  return Math.round(metres / step) * step;
}
