import { describe, expect, it } from 'vitest';
import { readHeading } from './headingReading.js';

describe('readHeading', () => {
  it('nimmt Apples Kompasswert unveraendert', () => {
    // webkitCompassHeading ist bereits im Uhrzeigersinn gegen geografisch
    // Nord - deshalb entfaellt jede Deklinationskorrektur.
    expect(readHeading({ webkitCompassHeading: 42.5, webkitCompassAccuracy: 8 })).toEqual({
      headingDeg: 42.5,
      accuracyDeg: 8,
    });
  });

  it('reicht eine negative Genauigkeit durch', () => {
    // Negativ heisst unkalibriert. Die Bewertung gehoert in die Domaene, der
    // Adapter darf sie nicht verschlucken.
    expect(readHeading({ webkitCompassHeading: 10, webkitCompassAccuracy: -1 })).toEqual({
      headingDeg: 10,
      accuracyDeg: -1,
    });
  });

  it('meldet eine fehlende Genauigkeit als null', () => {
    expect(readHeading({ webkitCompassHeading: 10 })).toEqual({
      headingDeg: 10,
      accuracyDeg: null,
    });
  });

  it('faltet Werte ausserhalb von 0 bis 360', () => {
    expect(readHeading({ webkitCompassHeading: 370 })?.headingDeg).toBe(10);
    expect(readHeading({ webkitCompassHeading: -10 })?.headingDeg).toBe(350);
  });

  it('rechnet den Android-Fallback aus alpha um', () => {
    // alpha zaehlt gegen den Uhrzeigersinn, der Kompass im Uhrzeigersinn.
    expect(readHeading({ alpha: 90, absolute: true })).toEqual({
      headingDeg: 270,
      accuracyDeg: null,
    });
  });

  it('ignoriert alpha ohne Nordbezug', () => {
    // Ohne absolute === true ist alpha auf eine beliebige Startlage bezogen
    // und als Kompassrichtung wertlos.
    expect(readHeading({ alpha: 90, absolute: false })).toBeNull();
    expect(readHeading({ alpha: 90 })).toBeNull();
  });

  it('bevorzugt Apples Wert gegenueber alpha', () => {
    expect(
      readHeading({ webkitCompassHeading: 42, alpha: 90, absolute: true })?.headingDeg,
    ).toBe(42);
  });

  it('meldet ein leeres Ereignis als null', () => {
    expect(readHeading({})).toBeNull();
    expect(readHeading({ alpha: null })).toBeNull();
    expect(readHeading({ webkitCompassHeading: Number.NaN })).toBeNull();
  });
});
