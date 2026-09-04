import { beforeEach, describe, expect, it } from 'vitest';
import { classifyHeadingAccuracy, HeadingQualityMonitor } from './headingQuality.js';

const CONE = 20;

describe('classifyHeadingAccuracy', () => {
  it('meldet fehlende Werte als unbekannt', () => {
    expect(classifyHeadingAccuracy(null, CONE)).toBe('unbekannt');
    expect(classifyHeadingAccuracy(Number.NaN, CONE)).toBe('unbekannt');
  });

  it('meldet negative Werte als unkalibriert', () => {
    // iOS meldet negative Genauigkeit, solange der Magnetometer nicht
    // kalibriert ist - der Wert ist dann bedeutungslos, nicht nur schlecht.
    expect(classifyHeadingAccuracy(-1, CONE)).toBe('unkalibriert');
  });

  it('meldet kleine Fehler als gut', () => {
    expect(classifyHeadingAccuracy(0, CONE)).toBe('gut');
    expect(classifyHeadingAccuracy(8, CONE)).toBe('gut');
    expect(classifyHeadingAccuracy(20, CONE)).toBe('gut');
  });

  it('meldet Fehler breiter als der Kegel als ungenau', () => {
    // Ist der Messfehler breiter als der halbe Oeffnungswinkel, entscheidet
    // nicht mehr die Blickrichtung, welche Orte erscheinen.
    expect(classifyHeadingAccuracy(21, CONE)).toBe('ungenau');
    expect(classifyHeadingAccuracy(45, CONE)).toBe('ungenau');
  });

  it('bezieht die Schwelle auf den eingestellten Kegel', () => {
    expect(classifyHeadingAccuracy(30, 45)).toBe('gut');
    expect(classifyHeadingAccuracy(30, 20)).toBe('ungenau');
  });
});

describe('HeadingQualityMonitor', () => {
  let monitor: HeadingQualityMonitor;

  beforeEach(() => {
    monitor = new HeadingQualityMonitor(CONE);
  });

  it('meldet den ersten Zustand', () => {
    expect(monitor.update(5)).toBe('gut');
  });

  it('meldet einen unveraenderten Zustand nicht erneut', () => {
    monitor.update(5);
    expect(monitor.update(6)).toBeNull();
    expect(monitor.update(7)).toBeNull();
  });

  it('meldet die Verschlechterung', () => {
    monitor.update(5);
    expect(monitor.update(30)).toBe('ungenau');
  });

  it('meldet den Verlust der Kalibrierung', () => {
    monitor.update(5);
    expect(monitor.update(-1)).toBe('unkalibriert');
  });

  describe('Hysterese', () => {
    it('kehrt erst deutlich unter der Schwelle zu gut zurueck', () => {
      monitor.update(30); // ungenau
      // 18 Grad waere fuer sich genommen "gut", liegt aber ueber der
      // Rueckkehrschwelle von 16 Grad.
      expect(monitor.update(18)).toBeNull();
      expect(monitor.quality).toBe('ungenau');

      expect(monitor.update(12)).toBe('gut');
    });

    it('flattert an der Grenze nicht', () => {
      // Genau der Fall, der die Ansage unbrauchbar machen wuerde: Der Wert
      // pendelt um die 20-Grad-Marke.
      monitor.update(5);
      let meldungen = 0;
      for (const wert of [21, 19, 22, 18, 23, 19, 21]) {
        if (monitor.update(wert) !== null) {
          meldungen += 1;
        }
      }
      // Genau eine Meldung: der Wechsel nach "ungenau".
      expect(meldungen).toBe(1);
      expect(monitor.quality).toBe('ungenau');
    });
  });

  it('uebernimmt einen geaenderten Kegelwinkel', () => {
    monitor.update(30); // bei Kegel 20: ungenau
    monitor.setConeHalfAngle(45);
    expect(monitor.update(30)).toBe('gut');
  });

  it('vergisst den Zustand bei reset', () => {
    monitor.update(5);
    monitor.reset();
    expect(monitor.update(5)).toBe('gut');
  });
});
