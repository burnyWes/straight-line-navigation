import { describe, expect, it } from 'vitest';
import { angularOffset, normalizeBearing, signedAngularDifference } from './angle.js';

describe('normalizeBearing', () => {
  it('laesst Werte im Bereich unveraendert', () => {
    expect(normalizeBearing(0)).toBe(0);
    expect(normalizeBearing(180)).toBe(180);
    expect(normalizeBearing(359)).toBe(359);
  });

  it('faltet Werte oberhalb von 360', () => {
    expect(normalizeBearing(360)).toBe(0);
    expect(normalizeBearing(370)).toBe(10);
    expect(normalizeBearing(725)).toBe(5);
  });

  it('faltet negative Werte', () => {
    expect(normalizeBearing(-10)).toBe(350);
    expect(normalizeBearing(-370)).toBe(350);
  });
});

describe('signedAngularDifference', () => {
  it('ist positiv, wenn das Ziel rechts liegt', () => {
    expect(signedAngularDifference(0, 30)).toBe(30);
  });

  it('ist negativ, wenn das Ziel links liegt', () => {
    expect(signedAngularDifference(0, 330)).toBe(-30);
  });

  it('nimmt den kuerzeren Weg ueber Norden', () => {
    expect(signedAngularDifference(350, 10)).toBe(20);
    expect(signedAngularDifference(10, 350)).toBe(-20);
  });

  it('liegt immer zwischen -180 und 180', () => {
    for (let from = 0; from < 360; from += 13) {
      for (let to = 0; to < 360; to += 17) {
        const diff = signedAngularDifference(from, to);
        expect(diff).toBeGreaterThan(-181);
        expect(diff).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('angularOffset', () => {
  it('ignoriert die Richtung der Abweichung', () => {
    expect(angularOffset(0, 30)).toBe(30);
    expect(angularOffset(0, 330)).toBe(30);
  });

  it('ist ueber Norden hinweg klein', () => {
    expect(angularOffset(355, 5)).toBe(10);
  });

  it('ist fuer die Gegenrichtung maximal', () => {
    expect(angularOffset(0, 180)).toBe(180);
  });
});
