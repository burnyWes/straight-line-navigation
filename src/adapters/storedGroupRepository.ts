/**
 * GroupRepository auf einem Schluessel-Wert-Speicher.
 *
 * Zwilling von storedLocationRepository.ts, mit eigenem Schluessel: Zwei
 * Aggregate, zwei Repositories (docs/design.md 6.6). Halb geschriebene Staende
 * - Ort geloescht, Gruppe noch nicht aufgeraeumt - sind dadurch moeglich und
 * bleiben unschaedlich, weil GroupService.membersOf() immer gegen die
 * existierenden Orte filtert.
 */

import type { GroupRepository } from '../application/ports.js';
import type { Group } from '../domain/group.js';
import { deserializeGroups, serializeGroups } from './groupSerialization.js';
import type { KeyValueStore } from './storedLocationRepository.js';

export const GROUP_STORAGE_KEY = 'straight-line-navigation.groups';

export class StoredGroupRepository implements GroupRepository {
  private cache: readonly Group[] | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly key: string = GROUP_STORAGE_KEY,
  ) {}

  all(): readonly Group[] {
    if (this.cache === null) {
      this.cache = deserializeGroups(this.readRaw()).groups;
    }
    return this.cache;
  }

  /** Zahl der beim letzten Lesen uebersprungenen, unlesbaren Eintraege. */
  skippedOnLoad(): number {
    return deserializeGroups(this.readRaw()).skipped;
  }

  save(group: Group): void {
    const existing = this.all();
    const index = existing.findIndex((candidate) => candidate.id === group.id);
    const next = [...existing];

    if (index === -1) {
      next.push(group);
    } else {
      next[index] = group;
    }

    this.write(next);
  }

  remove(id: string): void {
    this.write(this.all().filter((group) => group.id !== id));
  }

  replaceAll(groups: readonly Group[]): void {
    this.write([...groups]);
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

  private write(groups: readonly Group[]): void {
    // Erst schreiben, dann den Cache uebernehmen. Schlaegt das Schreiben fehl
    // (Speicher voll, blockierte Website-Daten), soll der Fehler nach oben
    // durchschlagen - und der Cache nicht behaupten, es haette geklappt.
    this.store.setItem(this.key, serializeGroups(groups));
    this.cache = groups;
  }
}
