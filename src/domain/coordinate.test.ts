import { describe, expect, it } from 'vitest';
import { coordinate, InvalidCoordinateError, isSameCoordinate } from './coordinate.js';

describe('coordinate', () => {
  it('nimmt gueltige Werte an', () => {
    const point = coordinate(52.516275, 13.377704);
    expect(point.latitudeDeg).toBe(52.516275);
    expect(point.longitudeDeg).toBe(13.377704);
  });

  it('nimmt die Grenzwerte an', () => {
    expect(() => coordinate(90, 180)).not.toThrow();
    expect(() => coordinate(-90, -180)).not.toThrow();
  });

  it('weist Breiten ausserhalb von -90..90 ab', () => {
    expect(() => coordinate(90.1, 0)).toThrow(InvalidCoordinateError);
    expect(() => coordinate(-91, 0)).toThrow(InvalidCoordinateError);
  });

  it('weist Laengen ausserhalb von -180..180 ab', () => {
    expect(() => coordinate(0, 180.1)).toThrow(InvalidCoordinateError);
    expect(() => coordinate(0, -181)).toThrow(InvalidCoordinateError);
  });

  it('weist NaN und Unendlich ab', () => {
    expect(() => coordinate(Number.NaN, 0)).toThrow(InvalidCoordinateError);
    expect(() => coordinate(0, Number.POSITIVE_INFINITY)).toThrow(InvalidCoordinateError);
  });
});

describe('isSameCoordinate', () => {
  it('erkennt identische Punkte', () => {
    expect(isSameCoordinate(coordinate(52.5, 13.4), coordinate(52.5, 13.4))).toBe(true);
  });

  it('erkennt Punkte innerhalb der Toleranz als gleich', () => {
    // Dublettenerkennung beim Import: Rundungsunterschiede im Export duerfen
    // nicht zu doppelten Eintraegen fuehren.
    expect(
      isSameCoordinate(coordinate(52.5000001, 13.4), coordinate(52.5, 13.4)),
    ).toBe(true);
  });

  it('unterscheidet klar verschiedene Punkte', () => {
    expect(isSameCoordinate(coordinate(52.5, 13.4), coordinate(52.6, 13.4))).toBe(false);
  });
});
