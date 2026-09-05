/**
 * Ein gespeicherter Ort.
 */

import type { Coordinate } from './coordinate.js';

export interface Location {
  readonly id: string;
  readonly name: string;
  readonly coordinate: Coordinate;
  /** Messgenauigkeit in Metern beim Speichern per GPS; null bei eingegebenen Koordinaten. */
  readonly accuracyMetres: number | null;
  /** ISO-8601, UTC. */
  readonly createdAt: string;
  /**
   * Ausgeblendet: bleibt gespeichert, nimmt aber nicht an der Navigation teil.
   *
   * Das Gegenstueck zum Loeschen fuer den Fall "heute brauche ich nur drei
   * meiner dreissig Orte": Ohne diesen Schalter bliebe nur das Loeschen, und
   * das ist ohne Backend endgueltig (docs/design.md 6.5, 7).
   */
  readonly hidden: boolean;
}

export class InvalidLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLocationError';
  }
}

/**
 * Ein Name ist Pflicht.
 *
 * In einer Audio-App ist "Unbenannt 3, 1,2 Kilometer" wertlos - der Name ist
 * die einzige Information, die den Eintrag unterscheidbar macht. Die Erfassung
 * schlaegt beim Speichern per GPS automatisch etwas vor, damit im Stehen nichts
 * getippt werden muss; leer bleiben darf er trotzdem nicht.
 */
export function createLocation(input: {
  id: string;
  name: string;
  coordinate: Coordinate;
  accuracyMetres?: number | null;
  createdAt: string;
  hidden?: boolean;
}): Location {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new InvalidLocationError('Ein Ort braucht einen Namen.');
  }
  if (input.id.trim().length === 0) {
    throw new InvalidLocationError('Ein Ort braucht eine Kennung.');
  }
  return {
    id: input.id,
    name,
    coordinate: input.coordinate,
    accuracyMetres: input.accuracyMetres ?? null,
    createdAt: input.createdAt,
    // Ohne Angabe sichtbar: Eine bestehende Sicherung kennt das Feld nicht, und
    // ein Ort, der nach dem Einlesen stumm fehlte, waere der schlechteste
    // Ausgang (docs/design.md 7).
    hidden: input.hidden ?? false,
  };
}
