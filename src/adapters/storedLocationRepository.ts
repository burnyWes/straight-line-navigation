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
