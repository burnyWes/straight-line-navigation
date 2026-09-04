/**
 * Geografische Koordinate als Value Object.
 *
 * Kern der Domaene: keine Browser-API, kein DOM, keine Abhaengigkeit nach aussen.
 */

export interface Coordinate {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
}

export class InvalidCoordinateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCoordinateError';
  }
}

/**
 * Erzeugt eine Koordinate und weist ungueltige Werte ab.
 *
 * Bewusst streng: Eine Koordinate ausserhalb des gueltigen Bereichs ist immer
 * ein Fehler in der Eingabe, nie ein Sonderfall, den die Navigation behandeln
 * koennte.
 */
export function coordinate(latitudeDeg: number, longitudeDeg: number): Coordinate {
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
    throw new InvalidCoordinateError('Breite und Laenge muessen endliche Zahlen sein.');
  }
  if (latitudeDeg < -90 || latitudeDeg > 90) {
    throw new InvalidCoordinateError(`Breite ${latitudeDeg} liegt ausserhalb von -90..90.`);
  }
  if (longitudeDeg < -180 || longitudeDeg > 180) {
    throw new InvalidCoordinateError(`Laenge ${longitudeDeg} liegt ausserhalb von -180..180.`);
  }
  return { latitudeDeg, longitudeDeg };
}

/** Prueft, ob zwei Koordinaten praktisch derselbe Ort sind (Dublettenerkennung beim Import). */
export function isSameCoordinate(
  a: Coordinate,
  b: Coordinate,
  toleranceDeg = 1e-6,
): boolean {
  return (
    Math.abs(a.latitudeDeg - b.latitudeDeg) <= toleranceDeg &&
    Math.abs(a.longitudeDeg - b.longitudeDeg) <= toleranceDeg
  );
}
