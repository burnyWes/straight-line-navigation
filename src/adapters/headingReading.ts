/**
 * Auswertung eines DeviceOrientation-Ereignisses.
 *
 * Bewusst als reine Funktion herausgezogen: Die Umrechnung ist die einzige
 * Stelle des Adapters mit Fachlogik und damit die einzige, die es wert ist,
 * ohne Geraet getestet zu werden.
 */

import type { HeadingReading } from '../application/ports.js';

/** Die Felder, die iOS zusaetzlich zum Standard liefert. */
export interface OrientationLike {
  readonly webkitCompassHeading?: number | undefined;
  readonly webkitCompassAccuracy?: number | undefined;
  readonly alpha?: number | null | undefined;
  readonly absolute?: boolean | undefined;
}

export function readHeading(event: OrientationLike): HeadingReading | null {
  const { webkitCompassHeading, webkitCompassAccuracy } = event;

  if (typeof webkitCompassHeading === 'number' && Number.isFinite(webkitCompassHeading)) {
    // iOS liefert bereits Grad im Uhrzeigersinn gegen geografisch Nord.
    // Deshalb entfaellt jede Deklinationskorrektur.
    return {
      headingDeg: normalize(webkitCompassHeading),
      accuracyDeg:
        typeof webkitCompassAccuracy === 'number' && Number.isFinite(webkitCompassAccuracy)
          ? webkitCompassAccuracy
          : null,
    };
  }

  // Fallback fuer Browser ohne Apples Erweiterung: alpha zaehlt gegen den
  // Uhrzeigersinn und ist nur bei absolute === true auf Nord bezogen.
  const { alpha, absolute } = event;
  if (absolute === true && typeof alpha === 'number' && Number.isFinite(alpha)) {
    return {
      headingDeg: normalize(360 - alpha),
      accuracyDeg: null,
    };
  }

  return null;
}

function normalize(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}
