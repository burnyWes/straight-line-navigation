import { describe, expect, it } from 'vitest';
import { coordinate } from './coordinate.js';
import { EARTH_RADIUS_METRES, greatCircleDistance, initialBearing } from './geo.js';
import { angularOffset } from './angle.js';
import { BRANDENBURGER_TOR, KOELNER_DOM, NULLPUNKT, pointAt } from '../testing/fixtures.js';

describe('greatCircleDistance', () => {
  it('ist null fuer denselben Punkt', () => {
    expect(greatCircleDistance(BRANDENBURGER_TOR, BRANDENBURGER_TOR)).toBe(0);
  });

  it('rechnet ein Grad Breite in den Meridianbogen um', () => {
    // Ein Grad auf dem Grosskreis: pi * R / 180.
    const expected = (Math.PI * EARTH_RADIUS_METRES) / 180;
    const measured = greatCircleDistance(NULLPUNKT, coordinate(1, 0));
    expect(measured).toBeCloseTo(expected, 6);
  });

  it('ist symmetrisch', () => {
    const there = greatCircleDistance(BRANDENBURGER_TOR, KOELNER_DOM);
    const back = greatCircleDistance(KOELNER_DOM, BRANDENBURGER_TOR);
    expect(there).toBeCloseTo(back, 6);
  });

  it('trifft eine bekannte Strecke', () => {
    // Brandenburger Tor - Koelner Dom, rund 477 km.
    const metres = greatCircleDistance(BRANDENBURGER_TOR, KOELNER_DOM);
    expect(metres).toBeGreaterThan(470_000);
    expect(metres).toBeLessThan(482_000);
  });

  it('rechnet ueber den Datumsgrenzen-Sprung hinweg richtig', () => {
    const west = coordinate(0, 179.5);
    const east = coordinate(0, -179.5);
    const metres = greatCircleDistance(west, east);
    // Ein Grad am Aequator, nicht 359 Grad.
    expect(metres).toBeCloseTo((Math.PI * EARTH_RADIUS_METRES) / 180, 3);
  });
});

describe('initialBearing', () => {
  it('zeigt nach Norden', () => {
    expect(initialBearing(NULLPUNKT, coordinate(1, 0))).toBeCloseTo(0, 6);
  });

  it('zeigt nach Osten', () => {
    expect(initialBearing(NULLPUNKT, coordinate(0, 1))).toBeCloseTo(90, 6);
  });

  it('zeigt nach Sueden', () => {
    expect(initialBearing(NULLPUNKT, coordinate(-1, 0))).toBeCloseTo(180, 6);
  });

  it('zeigt nach Westen', () => {
    expect(initialBearing(NULLPUNKT, coordinate(0, -1))).toBeCloseTo(270, 6);
  });

  it('liegt immer zwischen 0 und 360', () => {
    for (let bearing = 0; bearing < 360; bearing += 17) {
      const target = pointAt(BRANDENBURGER_TOR, bearing, 2000);
      const measured = initialBearing(BRANDENBURGER_TOR, target);
      expect(measured).toBeGreaterThanOrEqual(0);
      expect(measured).toBeLessThan(360);
    }
  });

  it('gibt die Peilung zurueck, mit der ein Punkt konstruiert wurde', () => {
    for (const bearing of [0, 22, 90, 137, 180, 271, 359]) {
      const target = pointAt(BRANDENBURGER_TOR, bearing, 3000);
      // Ueber den Kreis vergleichen: 0 und 359.9999... sind dieselbe Richtung,
      // ein linearer Vergleich saehe dort faelschlich 360 Grad Abweichung.
      expect(angularOffset(bearing, initialBearing(BRANDENBURGER_TOR, target))).toBeLessThan(
        0.001,
      );
    }
  });
});
