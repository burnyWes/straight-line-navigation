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
    let added = 0;
    let duplicates = 0;

    for (const candidate of incoming) {
      const known = existing.some(
        (other) =>
          other.id === candidate.id ||
          isSameCoordinate(other.coordinate, candidate.coordinate),
      );
      if (known) {
        duplicates += 1;
      } else {
        existing.push(candidate);
        added += 1;
      }
    }

    if (added > 0) {
      this.repository.replaceAll(existing);
    }
    return { added, duplicates };
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
