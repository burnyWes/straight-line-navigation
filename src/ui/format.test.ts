import { describe, expect, it } from 'vitest';
import {
  formatDirection,
  formatDistance,
  formatEntryLabel,
  formatLocationDetails,
  formatSaveConfirmation,
} from './format.js';

describe('formatDistance', () => {
  it('spricht Meter unter einem Kilometer', () => {
    expect(formatDistance(0)).toBe('0 Meter');
    expect(formatDistance(500)).toBe('500 Meter');
    expect(formatDistance(990)).toBe('990 Meter');
  });

  it('spricht Kilometer mit deutschem Dezimalkomma', () => {
    expect(formatDistance(1000)).toBe('1,0 Kilometer');
    expect(formatDistance(1200)).toBe('1,2 Kilometer');
    expect(formatDistance(47_700)).toBe('47,7 Kilometer');
  });

  it('schreibt Einheiten aus', () => {
    // Screenreader lesen "m" und "km" je nach Kontext unterschiedlich vor.
    expect(formatDistance(500)).not.toContain(' m');
    expect(formatDistance(1200)).not.toContain(' km');
  });
});

describe('formatDirection', () => {
  it('nennt kleine Abweichungen geradeaus', () => {
    expect(formatDirection(0)).toBe('geradeaus');
    expect(formatDirection(3)).toBe('geradeaus');
    expect(formatDirection(-3)).toBe('geradeaus');
  });

  it('unterscheidet rechts und links', () => {
    expect(formatDirection(28)).toBe('28 Grad rechts');
    expect(formatDirection(-12)).toBe('12 Grad links');
  });

  it('rundet auf ganze Grad', () => {
    expect(formatDirection(28.4)).toBe('28 Grad rechts');
  });
});

describe('formatEntryLabel', () => {
  it('setzt Name und Entfernung zusammen', () => {
    expect(formatEntryLabel('Bahnhof', 1200)).toBe('Bahnhof, 1,2 Kilometer');
    expect(formatEntryLabel('Zuhause', 500)).toBe('Zuhause, 500 Meter');
  });
});

describe('formatSaveConfirmation', () => {
  it('nennt die Messgenauigkeit', () => {
    expect(formatSaveConfirmation('Bahnhof', 12)).toBe(
      'Bahnhof gespeichert, Genauigkeit 12 Meter.',
    );
  });

  it('laesst sie bei eingegebenen Koordinaten weg', () => {
    expect(formatSaveConfirmation('Bahnhof', null)).toBe('Bahnhof gespeichert.');
  });
});

describe('formatLocationDetails', () => {
  // Mittags in UTC, damit der Kalendertag in keiner Zeitzone kippt.
  const CREATED_AT = '2026-09-04T12:00:00.000Z';

  it('nennt Anlagedatum und Genauigkeit', () => {
    expect(formatLocationDetails({ createdAt: CREATED_AT, accuracyMetres: 12 })).toBe(
      'Angelegt am 4. September 2026, Genauigkeit 12 Meter.',
    );
  });

  it('laesst die Genauigkeit bei eingegebenen Koordinaten weg', () => {
    expect(formatLocationDetails({ createdAt: CREATED_AT, accuracyMetres: null })).toBe(
      'Angelegt am 4. September 2026.',
    );
  });

  it('erfindet bei unlesbarem Datum keine Angabe', () => {
    // Kommt aus einer fremden oder beschaedigten Sicherung.
    expect(formatLocationDetails({ createdAt: 'gestern', accuracyMetres: null })).toBe(
      'Anlagedatum unbekannt.',
    );
    expect(formatLocationDetails({ createdAt: 'gestern', accuracyMetres: 12 })).toBe(
      'Anlagedatum unbekannt, Genauigkeit 12 Meter.',
    );
  });
});
