/**
 * HeadingProvider auf DeviceOrientation.
 *
 * iOS gibt den Kompass erst nach requestPermission() aus einer echten
 * Beruehrung frei. Das ist keine Gestaltungsentscheidung, sondern Apples
 * Sicherheitsmodell - die App kann nicht von selbst loslaufen
 * (docs/design.md 5).
 */

import type { HeadingProvider, HeadingReading, Unsubscribe } from '../application/ports.js';
import { readHeading, type OrientationLike } from './headingReading.js';

interface DeviceOrientationEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export class HeadingPermissionDeniedError extends Error {
  constructor() {
    super(
      'Zugriff auf die Ausrichtung wurde abgelehnt. In den Einstellungen unter Safari ' +
        'bei "Bewegung & Ausrichtung" freigeben.',
    );
    this.name = 'HeadingPermissionDeniedError';
  }
}

/**
 * Muss synchron aus einem Tap heraus aufgerufen werden.
 *
 * Liefert true, wenn gelauscht werden darf. Auf Browsern ohne Apples
 * Berechtigungsdialog gibt es nichts zu fragen.
 */
export async function requestHeadingPermission(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as unknown as DeviceOrientationEventWithPermission;
  if (typeof ctor.requestPermission !== 'function') {
    return true;
  }
  const result = await ctor.requestPermission();
  return result === 'granted';
}

export class DeviceOrientationHeadingProvider implements HeadingProvider {
  constructor(private readonly target: EventTarget = window) {}

  subscribe(
    onReading: (reading: HeadingReading) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const handle = (event: Event): void => {
      try {
        const reading = readHeading(event as unknown as OrientationLike);
        if (reading !== null) {
          onReading(reading);
        }
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    // deviceorientationabsolute fuer Browser, die den Nordbezug nur dort
    // liefern; auf iOS bleibt es stumm und stoert nicht.
    this.target.addEventListener('deviceorientation', handle, true);
    this.target.addEventListener('deviceorientationabsolute', handle, true);

    return () => {
      this.target.removeEventListener('deviceorientation', handle, true);
      this.target.removeEventListener('deviceorientationabsolute', handle, true);
    };
  }
}
