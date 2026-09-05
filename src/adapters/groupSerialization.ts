/**
 * Serialisierung der gespeicherten Gruppen.
 *
 * Bauart wie locationSerialization.ts und aus demselben Grund fehlertolerant:
 * Der Geraetespeicher ist die einzige Kopie (docs/design.md 7). Ein einzelner
 * beschaedigter Eintrag darf nicht alle anderen mitnehmen - lieber eine Gruppe
 * weniger als eine leere Liste.
 */

import { createGroup, type Group } from '../domain/group.js';

export const GROUP_STORAGE_FORMAT_VERSION = 1;

interface StoredGroupDocument {
  version: number;
  groups: unknown[];
}

export interface DeserializeGroupsResult {
  readonly groups: readonly Group[];
  /** Zahl der uebersprungenen, unlesbaren Eintraege - fuer eine ehrliche Rueckmeldung. */
  readonly skipped: number;
}

export function serializeGroups(groups: readonly Group[]): string {
  const document: StoredGroupDocument = {
    version: GROUP_STORAGE_FORMAT_VERSION,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberIds: [...group.memberIds],
    })),
  };
  return JSON.stringify(document);
}

export function deserializeGroups(raw: string | null): DeserializeGroupsResult {
  if (raw === null || raw.trim().length === 0) {
    return { groups: [], skipped: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { groups: [], skipped: 0 };
  }

  const entries = extractEntries(parsed);
  const groups: Group[] = [];
  let skipped = 0;

  for (const entry of entries) {
    const group = toGroup(entry);
    if (group === null) {
      skipped += 1;
    } else {
      groups.push(group);
    }
  }

  return { groups, skipped };
}

function extractEntries(parsed: unknown): unknown[] {
  // Ein blankes Array wird ebenfalls akzeptiert: So kann ein von Hand
  // geschriebener Export weiterhin eingelesen werden.
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const groups = (parsed as { groups?: unknown }).groups;
    if (Array.isArray(groups)) {
      return groups;
    }
  }
  return [];
}

function toGroup(entry: unknown): Group | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;

  const id = record['id'];
  const name = record['name'];
  const memberIds = record['memberIds'];

  if (typeof id !== 'string' || typeof name !== 'string') {
    return null;
  }

  try {
    return createGroup({
      id,
      name,
      // Fehlt das Feld, ist die Gruppe leer - eine leere Gruppe ist ein
      // gueltiger Zustand, ein Wurf hier naehme alle anderen mit. Einzelne
      // unbrauchbare Kennungen fallen still weg, statt den Eintrag zu kippen.
      memberIds: Array.isArray(memberIds)
        ? memberIds.filter((value): value is string => typeof value === 'string')
        : [],
    });
  } catch {
    // Leerer Name: Eintrag ueberspringen, Rest retten.
    return null;
  }
}
