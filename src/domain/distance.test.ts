import { describe, expect, it } from 'vitest';
import { roundDisplayDistanceMetres } from './distance.js';

describe('roundDisplayDistanceMetres', () => {
  it('rundet unter einem Kilometer auf zehn Meter', () => {
    expect(roundDisplayDistanceMetres(0)).toBe(0);
    expect(roundDisplayDistanceMetres(4)).toBe(0);
    expect(roundDisplayDistanceMetres(5)).toBe(10);
    expect(roundDisplayDistanceMetres(497)).toBe(500);
    expect(roundDisplayDistanceMetres(994)).toBe(990);
  });

  it('rundet ab einem Kilometer auf hundert Meter', () => {
    expect(roundDisplayDistanceMetres(1000)).toBe(1000);
    expect(roundDisplayDistanceMetres(1249)).toBe(1200);
    expect(roundDisplayDistanceMetres(1250)).toBe(1300);
    expect(roundDisplayDistanceMetres(477_123)).toBe(477_100);
  });

  it('haelt die Anzeige beim Gehen ruhig', () => {
    // Der eigentliche Zweck: Ein metergenaues Label aendert sich mehrmals pro
    // Sekunde und laesst VoiceOver mitten im Satz neu ansetzen.
    const werte = [512, 514, 511, 509, 513].map(roundDisplayDistanceMetres);
    expect(new Set(werte).size).toBe(1);
  });

  it('weist unsinnige Eingaben ab', () => {
    expect(() => roundDisplayDistanceMetres(-1)).toThrow(RangeError);
    expect(() => roundDisplayDistanceMetres(Number.NaN)).toThrow(RangeError);
  });
});
