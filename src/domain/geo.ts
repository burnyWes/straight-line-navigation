/**
 * Grosskreis-Geometrie: Luftlinie und Peilung.
 */

import type { Coordinate } from './coordinate.js';
import { normalizeBearing, toDegrees, toRadians } from './angle.js';

/** Mittlerer Erdradius nach IUGG, in Metern. */
export const EARTH_RADIUS_METRES = 6_371_008.8;

/**
 * Luftlinie zwischen zwei Punkten in Metern (Haversine).
 *
 * Kugelmodell statt Ellipsoid: Der Fehler liegt bei rund 0,3 Prozent und damit
 * weit unter der GPS-Ungenauigkeit, mit der die App ohnehin lebt.
 */
export function greatCircleDistance(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.latitudeDeg);
  const lat2 = toRadians(to.latitudeDeg);
  const deltaLat = toRadians(to.latitudeDeg - from.latitudeDeg);
  const deltaLon = toRadians(to.longitudeDeg - from.longitudeDeg);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Anfangspeilung von `from` nach `to`, 0..360 Grad gegen geografisch Nord.
 *
 * "Anfangs"-Peilung, weil sich die Richtung entlang eines Grosskreises aendert.
 * Auf den Distanzen dieser App ist der Unterschied bedeutungslos, aber der
 * Name soll nicht mehr versprechen, als er haelt.
 */
export function initialBearing(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.latitudeDeg);
  const lat2 = toRadians(to.latitudeDeg);
  const deltaLon = toRadians(to.longitudeDeg - from.longitudeDeg);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}
