/**
 * Serialisierung der gespeicherten Orte.
 *
 * Bewusst fehlertolerant: Der Geraetespeicher ist die einzige Kopie
 * (docs/design.md 7). Ein einzelner beschaedigter Eintrag darf nicht dazu
 * fuehren, dass alle anderen verloren gehen - lieber ein Ort weniger als eine
 * leere Liste.
 */

import { coordinate } from '../domain/coordinate.js';
import { createLocation, type Location } from '../domain/location.js';

export const STORAGE_FORMAT_VERSION = 1;

interface StoredDocument {
  version: number;
  locations: unknown[];
}

export interface DeserializeResult {
  readonly locations: readonly Location[];
  /** Zahl der uebersprungenen, unlesbaren Eintraege - fuer eine ehrliche Rueckmeldung. */
  readonly skipped: number;
}

export function serializeLocations(locations: readonly Location[]): string {
  const document: StoredDocument = {
    version: STORAGE_FORMAT_VERSION,
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      lat: location.coordinate.latitudeDeg,
      lon: location.coordinate.longitudeDeg,
      accuracyMetres: location.accuracyMetres,
      createdAt: location.createdAt,
      // Immer geschrieben, auch false: In einer Sicherung, die jemand aufmacht
      // und liest, ist ein ausgeschriebener Zustand mehr wert als sechzehn
      // gesparte Zeichen.
      hidden: location.hidden,
    })),
  };
  return JSON.stringify(document);
}

/**
 * Sicherungsdatei.
 *
 * Bewusst dasselbe Format wie der Geraetespeicher, nur eingerueckt und mit
 * Zeitstempel: So kann eine Sicherung ohne Sonderweg wieder eingelesen werden.
 */
export function serializeBackup(locations: readonly Location[], exportedAt: Date): string {
  const parsed = JSON.parse(serializeLocations(locations)) as StoredDocument;
  return JSON.stringify({ ...parsed, exportedAt: exportedAt.toISOString() }, null, 2);
}

export function deserializeLocations(raw: string | null): DeserializeResult {
  if (raw === null || raw.trim().length === 0) {
    return { locations: [], skipped: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { locations: [], skipped: 0 };
  }

  const entries = extractEntries(parsed);
  const locations: Location[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const location = toLocation(entry);
    if (location === null) {
      skipped += 1;
    } else {
      locations.push(location);
    }
  }

  return { locations, skipped };
}

function extractEntries(parsed: unknown): unknown[] {
  // Ein blankes Array wird ebenfalls akzeptiert: So kann ein von Hand
  // geschriebener oder aelterer Export weiterhin eingelesen werden.
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const locations = (parsed as { locations?: unknown }).locations;
    if (Array.isArray(locations)) {
      return locations;
    }
  }
  return [];
}

function toLocation(entry: unknown): Location | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;

  const id = record['id'];
  const name = record['name'];
  const lat = record['lat'];
  const lon = record['lon'];
  const createdAt = record['createdAt'];
  const accuracy = record['accuracyMetres'];
  const hidden = record['hidden'];

  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof lat !== 'number' ||
    typeof lon !== 'number'
  ) {
    return null;
  }

  try {
    return createLocation({
      id,
      name,
      coordinate: coordinate(lat, lon),
      accuracyMetres: typeof accuracy === 'number' ? accuracy : null,
      createdAt: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString(),
      // Fehlt das Feld, ist der Ort sichtbar. Jede Sicherung von vor dieser
      // Fassung kennt es nicht - und ein Ort, der nach dem Einlesen stumm
      // fehlt, waere schlimmer als einer zu viel.
      hidden: typeof hidden === 'boolean' ? hidden : false,
    });
  } catch {
    // Ungueltige Koordinate oder leerer Name: Eintrag ueberspringen, Rest retten.
    return null;
  }
}
