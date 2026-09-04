/**
 * Einstellungen der App.
 */

import { viewConeConfig, type ViewConeConfig } from '../domain/viewCone.js';
import type { NavigationSettings } from './navigationService.js';

export interface CueChannels {
  /** Earcon ueber Web Audio - bei Lautlos stumm (gemessen). */
  readonly earcon: boolean;
}

export interface AppSettings {
  readonly coneHalfAngleDeg: number;
  readonly maxDistanceMetres: number | null;
  readonly cues: CueChannels;
  /** ISO-8601 der letzten Sicherung, oder null. */
  readonly lastBackupAt: string | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  coneHalfAngleDeg: 20,
  maxDistanceMetres: null,
  cues: { earcon: true },
  lastBackupAt: null,
};

/** Auswahl fuer die Einstellungen; null bedeutet unbegrenzt. */
export const DISTANCE_LIMIT_CHOICES: readonly (number | null)[] = [
  500,
  1000,
  2000,
  5000,
  10_000,
  50_000,
  null,
];

export const CONE_ANGLE_CHOICES: readonly number[] = [10, 15, 20, 30, 45, 60];

export function toNavigationSettings(settings: AppSettings): NavigationSettings {
  return {
    cone: coneFor(settings.coneHalfAngleDeg),
    maxDistanceMetres: settings.maxDistanceMetres,
  };
}

/**
 * Die Hysterese waechst mit dem Kegel mit.
 *
 * Ein fester Zuschlag von fuenf Grad waere bei einem 60-Grad-Kegel wirkungslos
 * und bei einem 10-Grad-Kegel zu grob.
 */
export function coneFor(halfAngleDeg: number): ViewConeConfig {
  return viewConeConfig(halfAngleDeg, halfAngleDeg * 1.25);
}
