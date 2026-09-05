/**
 * Anwendungsfaelle rund um gespeicherte Orte.
 *
 * Das Zusammenfuehren beim Import steht hier und nicht im Repository: Es ist
 * eine fachliche Entscheidung ("ergaenzen, nie ersetzen"), kein Speicherdetail.
 */

import { isSameCoordinate } from '../domain/coordinate.js';
import { createLocation, type Location } from '../domain/location.js';
import { parseCoordinate, type CoordinateParseFailure } from '../domain/coordinateParser.js';
import type { Clock, LocationRepository, PositionFix } from './ports.js';

export type SaveResult =
  | { readonly ok: true; readonly location: Location }
  | { readonly ok: false; readonly reason: CoordinateParseFailure | 'name-required' };

export interface MergeResult {
  readonly added: number;
  readonly duplicates: number;
  /**
   * Eingelesene Kennung -> Kennung, unter der der Ort jetzt lokal steht.
   *
   * Eine Dublette behaelt die lokale Kennung; ohne diese Abbildung zeigte
   * eine eingelesene Gruppe danach auf einen Ort, den es lokal nicht gibt
   * (docs/design.md 7).
   */
  readonly idMapping: ReadonlyMap<string, string>;
}

const NAME_SUGGESTION_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export class LocationService {
  constructor(
    private readonly repository: LocationRepository,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  all(): readonly Location[] {
    return [...this.repository.all()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /**
   * Was navigiert wird.
   *
   * Ausgeblendete Orte bleiben gespeichert, erreichen den Kegel aber gar nicht
   * erst (docs/design.md 6.5). Die Regel liegt bewusst hier und nicht im
   * NavigationService: Der beantwortet Geometrie - welche dieser Orte liegen
   * wo -, waehrend "wer darf ueberhaupt mitspielen" zur Verwaltung gehoert.
   */
  visible(): readonly Location[] {
    return this.all().filter((location) => !location.hidden);
  }

  /**
   * Vorschlag, damit im Stehen nichts getippt werden muss.
   *
   * Ein Name ist Pflicht, aber er muss nicht sofort gut sein - umbenennen geht
   * spaeter in Ruhe.
   */
  suggestName(): string {
    return `Ort ${NAME_SUGGESTION_FORMAT.format(this.clock.now())}`;
  }

  saveCurrentPosition(name: string, fix: PositionFix): SaveResult {
    return this.store(name, () => ({
      coordinate: fix.coordinate,
      accuracyMetres: fix.accuracyMetres,
    }));
  }

  saveFromText(name: string, text: string): SaveResult {
    const parsed = parseCoordinate(text);
    if (!parsed.ok) {
      return { ok: false, reason: parsed.reason };
    }
    return this.store(name, () => ({
      coordinate: parsed.coordinate,
      accuracyMetres: null,
    }));
  }

  rename(id: string, name: string): SaveResult {
    const existing = this.repository.all().find((location) => location.id === id);
    if (existing === undefined) {
      return { ok: false, reason: 'name-required' };
    }
    if (name.trim().length === 0) {
      return { ok: false, reason: 'name-required' };
    }
    const renamed = createLocation({ ...existing, name });
    this.repository.save(renamed);
    return { ok: true, location: renamed };
  }

  /**
   * Blendet einen Ort aus oder wieder ein.
   *
   * Gibt den neuen Stand zurueck, damit die Ansicht genau eine Zeile
   * nachziehen kann, statt die Liste neu zu bauen - der Fokus steht beim
   * Umschalten auf dem Knopf, und ein neu gebauter Knopf nimmt ihn mit
   * (docs/design.md 9).
   */
  setHidden(id: string, hidden: boolean): Location | null {
    const existing = this.repository.all().find((location) => location.id === id);
    if (existing === undefined) {
      return null;
    }
    const next = createLocation({ ...existing, hidden });
    this.repository.save(next);
    return next;
  }

  remove(id: string): void {
    this.repository.remove(id);
  }

  /**
   * Import ergaenzt, er ersetzt nicht.
   *
   * Dubletten werden ueber die Koordinate erkannt, nicht ueber die Kennung -
   * ein Export von einem anderen Geraet hat andere Kennungen fuer denselben Ort.
   */
  merge(incoming: readonly Location[]): MergeResult {
    const existing = [...this.repository.all()];
    const idMapping = new Map<string, string>();
    let added = 0;
    let duplicates = 0;

    for (const candidate of incoming) {
      const known = existing.find(
        (other) =>
          other.id === candidate.id ||
          isSameCoordinate(other.coordinate, candidate.coordinate),
      );
      if (known !== undefined) {
        duplicates += 1;
        // Auf die lokale Kennung zeigen, nicht auf die eingelesene: Genau hier
        // wuerde eine eingelesene Mitgliedschaft sonst ins Leere laufen.
        idMapping.set(candidate.id, known.id);
      } else {
        existing.push(candidate);
        idMapping.set(candidate.id, candidate.id);
        added += 1;
      }
    }

    if (added > 0) {
      this.repository.replaceAll(existing);
    }
    return { added, duplicates, idMapping };
  }

  private store(
    name: string,
    make: () => { coordinate: Location['coordinate']; accuracyMetres: number | null },
  ): SaveResult {
    if (name.trim().length === 0) {
      return { ok: false, reason: 'name-required' };
    }
    const { coordinate, accuracyMetres } = make();
    const location = createLocation({
      id: this.newId(),
      name,
      coordinate,
      accuracyMetres,
      createdAt: this.clock.now().toISOString(),
    });
    this.repository.save(location);
    return { ok: true, location };
  }
}
