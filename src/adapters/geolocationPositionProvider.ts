/**
 * PositionProvider auf der Geolocation-API.
 */

import { coordinate } from '../domain/coordinate.js';
import type { PositionFix, PositionProvider, Unsubscribe } from '../application/ports.js';

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // Kein zwischengespeicherter Fix: Beim Peilen zaehlt der aktuelle Standort.
  maximumAge: 0,
  timeout: 20_000,
};

export class GeolocationPositionProvider implements PositionProvider {
  constructor(private readonly geolocation: Geolocation = navigator.geolocation) {}

  subscribe(
    onFix: (fix: PositionFix) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const watchId = this.geolocation.watchPosition(
      (position) => {
        try {
          onFix(toFix(position));
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      },
      (error) => {
        onError(new Error(describe(error)));
      },
      OPTIONS,
    );

    return () => {
      this.geolocation.clearWatch(watchId);
    };
  }
}

function toFix(position: GeolocationPosition): PositionFix {
  return {
    coordinate: coordinate(position.coords.latitude, position.coords.longitude),
    accuracyMetres: position.coords.accuracy,
    timestamp: position.timestamp,
  };
}

function describe(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Standortzugriff wurde abgelehnt. In den Einstellungen unter Safari freigeben.';
    case error.POSITION_UNAVAILABLE:
      return 'Kein Standort verfuegbar.';
    case error.TIMEOUT:
      return 'Der Standort konnte nicht rechtzeitig ermittelt werden.';
    default:
      return error.message;
  }
}
