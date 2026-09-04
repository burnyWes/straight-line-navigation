/**
 * Deutschsprachige Formatierung fuer Anzeige und Screenreader.
 *
 * Praesentationsschicht: Die Rundungsstufen sind Domaenenregel (siehe
 * domain/distance.ts), die Sprache gehoert hierher.
 *
 * Die Texte sind bewusst so geschrieben, dass VoiceOver sie sauber spricht -
 * ausgeschriebene Einheiten statt "m" und "km", weil Screenreader
 * Einheitenkuerzel je nach Kontext unterschiedlich vorlesen.
 */

const KILOMETRE_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Ab dieser Abweichung gilt eine Richtung nicht mehr als "geradeaus". */
export const STRAIGHT_AHEAD_TOLERANCE_DEG = 3;

/** Erwartet die bereits gerundete Entfernung aus der Domaene. */
export function formatDistance(displayMetres: number): string {
  if (displayMetres < 1000) {
    return `${Math.round(displayMetres)} Meter`;
  }
  return `${KILOMETRE_FORMAT.format(displayMetres / 1000)} Kilometer`;
}

/** Vorzeichenbehaftete Abweichung von der Blickrichtung; positiv = rechts. */
export function formatDirection(offsetDeg: number): string {
  const rounded = Math.round(offsetDeg);
  if (Math.abs(rounded) <= STRAIGHT_AHEAD_TOLERANCE_DEG) {
    return 'geradeaus';
  }
  return `${Math.abs(rounded)} Grad ${rounded > 0 ? 'rechts' : 'links'}`;
}

/** Beschriftung einer Listenzeile: "Bahnhof, 1,2 Kilometer". */
export function formatEntryLabel(name: string, displayMetres: number): string {
  return `${name}, ${formatDistance(displayMetres)}`;
}

/** Rueckmeldung nach dem Speichern per GPS. */
export function formatSaveConfirmation(name: string, accuracyMetres: number | null): string {
  if (accuracyMetres === null) {
    return `${name} gespeichert.`;
  }
  return `${name} gespeichert, Genauigkeit ${Math.round(accuracyMetres)} Meter.`;
}
