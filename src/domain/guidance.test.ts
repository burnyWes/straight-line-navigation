import { beforeEach, describe, expect, it } from 'vitest';
import {
  ArrivalState,
  GUIDANCE_FAST_HZ,
  GUIDANCE_SLOW_HZ,
  guidancePan,
  guidancePitchHz,
  guidanceRateHz,
  guidanceToneSeconds,
} from './guidance.js';

describe('guidancePitchHz', () => {
  it('trifft die drei Anker exakt', () => {
    // Eine Oktave je 90 Grad: A5 vor mir, A4 neben mir, A3 hinter mir.
    expect(guidancePitchHz(0)).toBeCloseTo(880, 6);
    expect(guidancePitchHz(90)).toBeCloseTo(440, 6);
    expect(guidancePitchHz(180)).toBeCloseTo(220, 6);
  });

  it('unterscheidet rechts und links nicht', () => {
    // Die Seite traegt das Panorama, nicht die Tonhoehe.
    expect(guidancePitchHz(-90)).toBe(guidancePitchHz(90));
    expect(guidancePitchHz(-30)).toBe(guidancePitchHz(30));
  });

  it('faellt monoton, je weiter das Ziel hinter einem liegt', () => {
    expect(guidancePitchHz(0)).toBeGreaterThan(guidancePitchHz(45));
    expect(guidancePitchHz(45)).toBeGreaterThan(guidancePitchHz(135));
    expect(guidancePitchHz(135)).toBeGreaterThan(guidancePitchHz(180));
  });

  it('bleibt jenseits von 180 Grad in den Grenzen', () => {
    expect(guidancePitchHz(400)).toBeCloseTo(220, 6);
  });
});

describe('guidancePan', () => {
  it('ist vorzeichenrichtig', () => {
    expect(guidancePan(90)).toBeCloseTo(1, 6);
    expect(guidancePan(-90)).toBeCloseTo(-1, 6);
  });

  it('steht vor und hinter einem in der Mitte', () => {
    // Hinter einem ist die Seite nicht mehr unterscheidbar.
    expect(guidancePan(0)).toBeCloseTo(0, 6);
    expect(guidancePan(180)).toBeCloseTo(0, 6);
  });
});

describe('guidanceRateHz', () => {
  it('tickt an der Ankunftsschwelle am schnellsten', () => {
    expect(guidanceRateHz(25)).toBeCloseTo(GUIDANCE_FAST_HZ, 6);
  });

  it('kappt nach unten bei einer halben Sekunde', () => {
    expect(guidanceRateHz(1800)).toBeCloseTo(GUIDANCE_SLOW_HZ, 6);
    expect(guidanceRateHz(50_000)).toBeCloseTo(GUIDANCE_SLOW_HZ, 6);
  });

  it('nimmt je Verdopplung der Entfernung ein Drittel vom Takt', () => {
    expect(guidanceRateHz(200) / guidanceRateHz(100)).toBeCloseTo(2 / 3, 6);
    expect(guidanceRateHz(100)).toBeCloseTo(8 / 3, 6);
    expect(guidanceRateHz(50)).toBeCloseTo(4, 6);
  });

  it('kappt nach oben, damit die Naehe den Takt nicht sprengt', () => {
    expect(guidanceRateHz(0)).toBeCloseTo(GUIDANCE_FAST_HZ, 6);
    expect(guidanceRateHz(5)).toBeCloseTo(GUIDANCE_FAST_HZ, 6);
  });
});

describe('guidanceToneSeconds', () => {
  it('bleibt beim langsamen Takt bei der Laenge des Earcons', () => {
    expect(guidanceToneSeconds(0.5)).toBeCloseTo(0.12, 6);
  });

  it('schrumpft mit dem Takt, damit die Pause hoerbar bleibt', () => {
    // Bei 6 Hz waeren es sonst 120 ms Ton und 47 ms Pause - das klaenge schon
    // fast wie der Dauerton, den das Ticken ankuendigen soll.
    expect(guidanceToneSeconds(6)).toBeCloseTo(1 / 12, 6);
  });

  it('nimmt nie mehr als die halbe Periode', () => {
    for (const rate of [0.5, 1, 2, 4, 6]) {
      expect(guidanceToneSeconds(rate)).toBeLessThanOrEqual(0.5 / rate + 1e-9);
    }
  });
});

describe('ArrivalState', () => {
  let arrival: ArrivalState;

  beforeEach(() => {
    arrival = new ArrivalState();
  });

  it('schaltet bei genau 25 Metern ein', () => {
    expect(arrival.update(26)).toBe(false);
    expect(arrival.update(25)).toBe(true);
  });

  it('bleibt zwischen den Schwellen eingeschaltet', () => {
    arrival.update(25);
    // Ohne Hysterese kippte der Ton hier im Takt der GPS-Streuung.
    expect(arrival.update(30)).toBe(true);
    expect(arrival.update(34)).toBe(true);
  });

  it('schaltet bei genau 35 Metern aus', () => {
    arrival.update(25);
    expect(arrival.update(35)).toBe(false);
  });

  it('bleibt unter 35 Metern aus, solange nie angekommen wurde', () => {
    expect(arrival.update(34)).toBe(false);
    expect(arrival.update(26)).toBe(false);
  });

  it('vergisst den Zustand bei reset()', () => {
    arrival.update(10);
    arrival.reset();
    expect(arrival.isArrived).toBe(false);
    expect(arrival.update(30)).toBe(false);
  });
});
