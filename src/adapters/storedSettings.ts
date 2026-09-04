/**
 * Einstellungen im Geraetespeicher.
 *
 * Fehlertolerant wie die Orte: Unbekannte oder kaputte Felder fallen auf den
 * Standard zurueck, statt die App beim Start scheitern zu lassen.
 */

import { DEFAULT_SETTINGS, type AppSettings } from '../application/settings.js';
import type { KeyValueStore } from './storedLocationRepository.js';

export const SETTINGS_KEY = 'straight-line-navigation.settings';

export function loadSettings(store: KeyValueStore, key = SETTINGS_KEY): AppSettings {
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (raw === null) {
    return DEFAULT_SETTINGS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_SETTINGS;
  }

  const record = parsed as Record<string, unknown>;
  const cues = record['cues'];
  const cueRecord = typeof cues === 'object' && cues !== null ? (cues as Record<string, unknown>) : {};

  return {
    coneHalfAngleDeg: positiveNumber(record['coneHalfAngleDeg'], DEFAULT_SETTINGS.coneHalfAngleDeg),
    maxDistanceMetres: nullableNumber(record['maxDistanceMetres']),
    cues: {
      earcon: boolean(cueRecord['earcon'], DEFAULT_SETTINGS.cues.earcon),
    },
    lastBackupAt: typeof record['lastBackupAt'] === 'string' ? record['lastBackupAt'] : null,
  };
}

export function saveSettings(
  store: KeyValueStore,
  settings: AppSettings,
  key = SETTINGS_KEY,
): void {
  store.setItem(key, JSON.stringify(settings));
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
