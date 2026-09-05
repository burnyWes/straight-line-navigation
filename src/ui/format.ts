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

import type { Location } from '../domain/location.js';

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

const CREATED_AT_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Infozeile im Bearbeiten-Dialog: "Angelegt am 4. September 2026, Genauigkeit 12 Meter."
 *
 * Sagt, wie verlaesslich der Punkt ist, ohne dass VoiceOver zwoelf Ziffern
 * mitliest - die Koordinate selbst steht bewusst nicht darin.
 *
 * Ein unlesbares `createdAt` kommt aus einer fremden oder beschaedigten
 * Sicherung. Dann wird das ehrlich gesagt, statt ein Datum zu erfinden.
 */
export function formatLocationDetails(
  location: Pick<Location, 'createdAt' | 'accuracyMetres'>,
): string {
  const created = new Date(location.createdAt);
  const parts = [
    Number.isNaN(created.getTime())
      ? 'Anlagedatum unbekannt'
      : `Angelegt am ${CREATED_AT_FORMAT.format(created)}`,
  ];
  // Bei eingegebenen Koordinaten gibt es keine Messung - dann bleibt die
  // Angabe weg, statt "Genauigkeit unbekannt" zu behaupten.
  if (location.accuracyMetres !== null) {
    parts.push(`Genauigkeit ${Math.round(location.accuracyMetres)} Meter`);
  }
  return `${parts.join(', ')}.`;
}

/**
 * Beschriftung einer Gruppenzeile: "Kiez, 4 Orte, 1 ausgeblendet".
 *
 * Die Zahlen stehen im Knopfnamen und nicht in einer eigenen Zeile: Die
 * Gruppenzeile hat mit der Gluehbirne ohnehin schon zwei Stationen
 * (docs/design.md 6.6), und ein Rueckwaertswisch auf den Knopf ist der Weg
 * zur Zahl, nachdem umgeschaltet wurde.
 *
 * Der Zusatz erscheint nur, wenn ueberhaupt etwas ausgeblendet ist - "0
 * ausgeblendet" waere bei jeder Gruppe ein Wort mehr fuer keine Information.
 */
export function formatGroupEntryLabel(name: string, total: number, hidden: number): string {
  const orte = `${total} ${total === 1 ? 'Ort' : 'Orte'}`;
  if (hidden === 0) {
    return `${name}, ${orte}`;
  }
  return `${name}, ${orte}, ${hidden} ausgeblendet`;
}

/**
 * Zusatz fuer die Hinweiszeile im Ort-Dialog: "In den Gruppen Kiez und Arbeit."
 *
 * Genannt, nicht geaendert: Die Mitgliedschaft wird auf der Gruppen-Seite
 * gepflegt (docs/design.md 6.6). Ohne Gruppe bleibt der Satz leer, statt
 * "In keiner Gruppe." zu sagen - das waere bei den meisten Orten ein Satz ohne
 * Anlass.
 */
export function formatGroupMembership(names: readonly string[]): string {
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return `In der Gruppe ${names[0]}.`;
  }
  // "Arbeit, Kiez und Zuhause": das letzte mit "und", davor Kommas. VoiceOver
  // spricht die Aufzaehlung dann wie ein Mensch.
  const last = names[names.length - 1];
  return `In den Gruppen ${names.slice(0, -1).join(', ')} und ${last}.`;
}

/**
 * Text der Rueckfrage vor dem Loeschen einer Gruppe.
 *
 * Nennt, dass die Orte erhalten bleiben - das ist der Unterschied zum Loeschen
 * eines Ortes, und ohne den Satz muesste man ihn raten. Der zweite Satz kommt
 * nur, wenn ueberhaupt etwas ausgeblendet ist: Sonst waere er eine Warnung vor
 * einem Zustand, den es nicht gibt (docs/design.md 6.6).
 */
export function formatDeleteGroupWarning(total: number, hidden: number): string {
  const bleiben =
    total === 0
      ? 'Die Gruppe wird entfernt. Sie ist leer.'
      : total === 1
        ? 'Die Gruppe wird entfernt, der Ort darin bleibt gespeichert.'
        : `Die Gruppe wird entfernt, die ${total} Orte darin bleiben gespeichert.`;
  if (hidden === 0) {
    return bleiben;
  }
  const dunkel =
    hidden === 1
      ? 'Einer davon ist ausgeblendet und bleibt es'
      : `${hidden} davon sind ausgeblendet und bleiben es`;
  return `${bleiben} ${dunkel} - einblenden geht einzeln auf der Orte-Seite.`;
}
