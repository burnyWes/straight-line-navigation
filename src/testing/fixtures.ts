/**
 * Testdaten.
 *
 * Ausschliesslich oeffentliche Wahrzeichen und rechnerische Punkte - niemals
 * echte private Koordinaten. Das Repository ist oeffentlich und seine Historie
 * bleibt ueber den Commit-Hash dauerhaft abrufbar (docs/design.md 9.1).
 */

import { coordinate, type Coordinate } from '../domain/coordinate.js';
import { createLocation, type Location } from '../domain/location.js';

export const BRANDENBURGER_TOR = coordinate(52.516275, 13.377704);
export const KOELNER_DOM = coordinate(50.941357, 6.958307);
export const NULLPUNKT = coordinate(0, 0);

let counter = 0;

export function testLocation(
  name: string,
  point: Coordinate,
  accuracyMetres: number | null = null,
): Location {
  counter += 1;
  return createLocation({
    id: `test-${counter}`,
    name,
    coordinate: point,
    accuracyMetres,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
}

/**
 * Punkt in `distanceMetres` Entfernung unter der Peilung `bearingDeg`.
 *
 * Erlaubt Tests der Art "ein Ziel genau 22 Grad rechts von mir", ohne
 * Koordinaten von Hand auszurechnen.
 */
export function pointAt(
  from: Coordinate,
  bearingDeg: number,
  distanceMetres: number,
): Coordinate {
  const R = 6_371_008.8;
  const angular = distanceMetres / R;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (from.latitudeDeg * Math.PI) / 180;
  const lon1 = (from.longitudeDeg * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return coordinate((lat2 * 180) / Math.PI, (((lon2 * 180) / Math.PI + 540) % 360) - 180);
}
