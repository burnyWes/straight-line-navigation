/**
 * Die Sicherungsdatei: Orte und Gruppen in **einem** Dokument.
 *
 * Liegt bewusst neben den beiden Aggregat-Serialisierern und nicht in einem
 * von ihnen: Die Sicherung ist das einzige, was beide Aggregate kennen muss.
 * Haengte sie am Ortsserialisierer, wuesste der von Gruppen (docs/design.md 7).
 */

import type { Group } from '../domain/group.js';
import type { Location } from '../domain/location.js';
import {
  deserializeLocations,
  serializeLocations,
  STORAGE_FORMAT_VERSION,
} from './locationSerialization.js';
import { deserializeGroups, serializeGroups } from './groupSerialization.js';

export interface BackupResult {
  readonly locations: readonly Location[];
  readonly groups: readonly Group[];
  /** Uebersprungene Orte und Gruppen getrennt - fuer eine ehrliche Rueckmeldung. */
  readonly skippedLocations: number;
  readonly skippedGroups: number;
}

/**
 * Sicherungsdatei.
 *
 * Bewusst dasselbe Format wie der Geraetespeicher, nur eingerueckt, um die
 * Gruppen ergaenzt und mit Zeitstempel: So kann eine Sicherung ohne Sonderweg
 * wieder eingelesen werden.
 *
 * Die Nummer bleibt bei 1: Die Aenderung ist rein additiv, und kein Leser
 * verhaelt sich je nach Nummer anders - dieselbe Begruendung wie beim Feld
 * `hidden`.
 */
export function serializeBackup(
  locations: readonly Location[],
  groups: readonly Group[],
  exportedAt: Date,
): string {
  const document = {
    version: STORAGE_FORMAT_VERSION,
    ...(JSON.parse(serializeLocations(locations)) as { locations: unknown[] }),
    ...(JSON.parse(serializeGroups(groups)) as { groups: unknown[] }),
    exportedAt: exportedAt.toISOString(),
  };
  return JSON.stringify(document, null, 2);
}

/**
 * Liest eine Sicherung.
 *
 * Nutzt die beiden Aggregat-Leser, statt das Lesen ein zweites Mal zu
 * schreiben. Fehlt `groups`, sind es null Gruppen - **kein** Fehler: Jede
 * Sicherung von vor dieser Fassung ist so gebaut.
 */
export function deserializeBackup(text: string): BackupResult {
  const locations = deserializeLocations(text);
  const groups = readGroups(text);

  return {
    locations: locations.locations,
    groups: groups.groups,
    skippedLocations: locations.skipped,
    skippedGroups: groups.skipped,
  };
}

/**
 * Gruppen nur aus einem Dokument mit `groups`, nie aus einem blanken Array.
 *
 * Ein blankes Array ist die alte Kurzform fuer eine reine Ortsliste. Weiter
 * gereicht faende `deserializeGroups()` darin lauter Eintraege mit `id` und
 * `name` - und machte aus jedem Ort eine Gruppe.
 */
function readGroups(text: string): { groups: readonly Group[]; skipped: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { groups: [], skipped: 0 };
  }
  if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
    return { groups: [], skipped: 0 };
  }
  return deserializeGroups(text);
}
