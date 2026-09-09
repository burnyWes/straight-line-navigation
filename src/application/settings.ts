/**
 * Einstellungen der App.
 */

import { viewConeConfig, type ViewConeConfig } from '../domain/viewCone.js';
import type { NavigationSettings } from './navigationService.js';
import type { SoloState } from './solo.js';

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
  /**
   * Kennung des gewaehlten Ziels, oder null.
   *
   * Das Ziel ist eine Absicht, kein Laufzustand - deshalb liegt es hier und
   * nicht im Lauf. Es ueberlebt damit den Kaltstart einer PWA; die Betriebsart
   * dagegen wird bewusst **nicht** gespeichert, die App startet immer in
   * "Orientierung" (docs/design.md 4.7).
   */
  readonly targetId: string | null;
  /**
   * Laeuft der Zielton?
   *
   * Anders als das Anhalten der Liste ueberlebt dieser Schalter den Neustart:
   * Ein haengender Freeze war **stumm** und hat einen ganzen Lauf gefressen
   * (4.3), ein haengender Tonschalter ist das Gegenteil von stumm. Sein Knopf
   * steht dort, wo er klingt - deshalb kein Eintrag in den Einstellungen.
   */
  readonly guidanceTone: boolean;
  /**
   * Laeuft ein Solo, und wie war es vorher?
   *
   * Liegt hier und nicht am Ort: Ein Schnappschuss ist keine Aussage ueber
   * die Gegenwart, sondern die Erinnerung an eine vergangene Welt - und
   * damit nichts, was sich aus `hidden` ableiten liesse. Die Sichtbarkeit
   * selbst bleibt allein am Ort (docs/design.md 6.6).
   */
  readonly solo: SoloState | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  coneHalfAngleDeg: 20,
  maxDistanceMetres: null,
  cues: { earcon: true },
  lastBackupAt: null,
  targetId: null,
  guidanceTone: false,
  solo: null,
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
