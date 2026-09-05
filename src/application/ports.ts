/**
 * Ports der Anwendungsschicht.
 *
 * Interfaces liegen innen, Implementierungen aussen. Dadurch laesst sich die
 * gesamte Navigationslogik am Rechner testen: Fake-Provider einspeisen - "ich
 * stehe hier, schaue dorthin" - und pruefen, was herauskommt. Ohne diese
 * Trennung muesste man fuer jede Aenderung an der Kegel-Logik rausgehen und
 * sich im Kreis drehen.
 */

import type { Coordinate } from '../domain/coordinate.js';
import type { Group } from '../domain/group.js';
import type { Location } from '../domain/location.js';

export type Unsubscribe = () => void;

export interface PositionFix {
  readonly coordinate: Coordinate;
  /** Genauigkeit in Metern, wie vom Geraet gemeldet. */
  readonly accuracyMetres: number;
  readonly timestamp: number;
}

export interface HeadingReading {
  /** Grad im Uhrzeigersinn gegen geografisch Nord. */
  readonly headingDeg: number;
  /**
   * Vom Geraet gemeldete Genauigkeit in Grad, oder null wenn unbekannt.
   * Negative Werte des Systems bedeuten "unkalibriert" und werden vom Adapter
   * zu null normalisiert.
   */
  readonly accuracyDeg: number | null;
}

export interface PositionProvider {
  subscribe(
    onFix: (fix: PositionFix) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
}

export interface HeadingProvider {
  subscribe(
    onReading: (reading: HeadingReading) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
}

export interface LocationRepository {
  all(): readonly Location[];
  save(location: Location): void;
  remove(id: string): void;
  replaceAll(locations: readonly Location[]): void;
}

/**
 * Zwei Aggregate, zwei Repositories.
 *
 * Bewusst kein gemeinsames Basisstueck mit LocationRepository: Vierzig Zeilen
 * Aehnlichkeit rechtfertigen keine Abstraktion, die beide Aggregate
 * aneinanderbindet - der Ortsspeicher bleibt Zeile fuer Zeile so, wie er ist
 * (docs/design.md 6.6).
 */
export interface GroupRepository {
  all(): readonly Group[];
  save(group: Group): void;
  remove(id: string): void;
  replaceAll(groups: readonly Group[]): void;
}

/**
 * Signalkanal fuer Ein- und Austritt.
 *
 * Bewusst als Port: Solange offen ist, ob der Lautlos-Schalter Web Audio
 * stummschaltet (Messfrage M2 in docs/design.md), darf diese Unsicherheit die
 * Logik nicht beruehren. Faellt der Ton aus, wird die Ansage zum Standard -
 * ohne Aenderung an der Stelle, die entscheidet, wer rein- und rausgefallen ist.
 */
export interface CuePort {
  entered(location: Location): void;
  left(location: Location): void;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
