import { beforeEach, describe, expect, it } from 'vitest';
import {
  ArrivalState,
  GUIDANCE_FAST_HZ,
  GUIDANCE_SLOW_HZ,
  OnTargetState,
  guidanceChordHz,
  guidancePan,
  guidancePitchHz,
  guidanceRateHz,
  guidanceToneSeconds,
} from './guidance.js';
import { viewConeConfig } from './viewCone.js';

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

describe('guidanceChordHz', () => {
  it('setzt Terz und Quinte rein ueber den Grundton', () => {
    // A5 mit Cis6 und E6 - reine Verhaeltnisse, nicht temperiert.
    const [root, third, fifth] = guidanceChordHz(880);

    expect(root).toBeCloseTo(880, 6);
    expect(third).toBeCloseTo(1100, 6);
    expect(fifth).toBeCloseTo(1320, 6);
  });

  it('gleitet mit dem Grundton mit', () => {
    // Innerhalb des Kegels laesst sich weiter nachjustieren: Der Akkord
    // wandert mit der Tonhoehe, statt sie zu ersetzen.
    const lower = guidanceChordHz(guidancePitchHz(15));
    const straight = guidanceChordHz(guidancePitchHz(0));

    lower.forEach((frequency, index) => {
      expect(frequency).toBeLessThan(straight[index] ?? 0);
    });
  });
});

describe('OnTargetState', () => {
  let onTarget: OnTargetState;

  beforeEach(() => {
    onTarget = new OnTargetState(viewConeConfig(20, 25));
  });

  it('schaltet bei genau 20 Grad ein', () => {
    expect(onTarget.update(21)).toBe(false);
    expect(onTarget.update(20)).toBe(true);
  });

  it('zaehlt nur den Betrag der Abweichung', () => {
    // Die Seite traegt das Panorama; "geradeaus" ist links wie rechts dasselbe.
    expect(onTarget.update(-20)).toBe(true);
  });

  it('bleibt zwischen den Schwellen eingeschaltet', () => {
    onTarget.update(0);
    // Ohne Hysterese flackerte der Akkord im Takt des Handzitterns.
    expect(onTarget.update(23)).toBe(true);
    expect(onTarget.update(25)).toBe(true);
  });

  it('schaltet erst jenseits des Austrittswinkels aus', () => {
    onTarget.update(0);
    expect(onTarget.update(26)).toBe(false);
  });

  it('bleibt unter 25 Grad aus, solange nie eingetreten wurde', () => {
    expect(onTarget.update(24)).toBe(false);
    expect(onTarget.update(21)).toBe(false);
  });

  it('waechst mit dem eingestellten Kegel mit', () => {
    onTarget.setConfig(viewConeConfig(45));

    expect(onTarget.update(40)).toBe(true);
  });

  it('verschiebt beim Wechsel des Kegels nur die Schwellen', () => {
    onTarget.update(0);
    onTarget.setConfig(viewConeConfig(10));

    // Wie ViewCone.setConfig: Der Zustand wird hier nicht angefasst - das
    // Vergessen gehoert dem, der die Einstellung aendert (GuidanceService).
    expect(onTarget.isOnTarget).toBe(true);
    expect(onTarget.update(16)).toBe(false);
  });

  it('vergisst den Zustand bei reset()', () => {
    onTarget.update(0);
    onTarget.reset();

    expect(onTarget.isOnTarget).toBe(false);
    expect(onTarget.update(23)).toBe(false);
  });
});
