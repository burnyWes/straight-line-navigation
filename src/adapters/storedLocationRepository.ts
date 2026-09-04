/**
 * LocationRepository auf einem Schluessel-Wert-Speicher.
 *
 * Nimmt bewusst nicht localStorage direkt entgegen, sondern das kleinste
 * Interface, das gebraucht wird: So laesst sich das Verhalten ohne Browser
 * testen, und ein spaeterer Wechsel auf IndexedDB bleibt ein Adaptertausch
 * (docs/design.md 7).
 */

import type { LocationRepository } from '../application/ports.js';
import type { Location } from '../domain/location.js';
import { isSameCoordinate } from '../domain/coordinate.js';
import { deserializeLocations, serializeLocations } from './locationSerialization.js';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEY = 'straight-line-navigation.locations';

export class StoredLocationRepository implements LocationRepository {
  private cache: readonly Location[] | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = STORAGE_KEY,
  ) {}

  all(): readonly Location[] {
    if (this.cache === null) {
      this.cache = deserializeLocations(this.readRaw()).locations;
    }
    return this.cache;
  }

  /** Zahl der beim letzten Lesen uebersprungenen, unlesbaren Eintraege. */
  skippedOnLoad(): number {
    return deserializeLocations(this.readRaw()).skipped;
  }

  save(location: Location): void {
    const existing = this.all();
    const index = existing.findIndex((candidate) => candidate.id === location.id);
    const next = [...existing];

    if (index === -1) {
      next.push(location);
    } else {
      next[index] = location;
    }

    this.write(next);
  }

  remove(id: string): void {
    this.write(this.all().filter((location) => location.id !== id));
  }

  replaceAll(locations: readonly Location[]): void {
    this.write([...locations]);
  }

  /**
   * Import ergaenzt, er ersetzt nicht.
   *
   * "Ersetzen" waere der Klick, der im falschen Moment alles kostet
   * (docs/design.md 7). Dubletten werden ueber die Koordinate erkannt, nicht
   * ueber die Kennung - ein Export von einem anderen Geraet hat andere
   * Kennungen fuer denselben Ort.
   */
  merge(incoming: readonly Location[]): { added: number; duplicates: number } {
    const existing = [...this.all()];
    let added = 0;
    let duplicates = 0;

    for (const candidate of incoming) {
      const isDuplicate = existing.some(
        (known) =>
          known.id === candidate.id ||
          isSameCoordinate(known.coordinate, candidate.coordinate),
      );
      if (isDuplicate) {
        duplicates += 1;
      } else {
        existing.push(candidate);
        added += 1;
      }
    }

    this.write(existing);
    return { added, duplicates };
  }

  private readRaw(): string | null {
    try {
      return this.store.getItem(this.key);
    } catch {
      // Privater Modus oder blockierte Website-Daten: lieber leer starten als
      // beim Laden abstuerzen.
      return null;
    }
  }

  private write(locations: readonly Location[]): void {
    // Erst schreiben, dann den Cache uebernehmen. Schlaegt das Schreiben fehl
    // (Speicher voll, blockierte Website-Daten), soll der Fehler nach oben
    // durchschlagen - und der Cache nicht behaupten, es haette geklappt.
    this.store.setItem(this.key, serializeLocations(locations));
    this.cache = locations;
  }
}
