import { describe, expect, it } from 'vitest';
import { createLocation, InvalidLocationError } from './location.js';
import { coordinate } from './coordinate.js';

const point = coordinate(52.516275, 13.377704);
const base = { id: 'a1', coordinate: point, createdAt: '2026-01-01T00:00:00.000Z' };

describe('createLocation', () => {
  it('erzeugt einen Ort', () => {
    const location = createLocation({ ...base, name: 'Bahnhof', accuracyMetres: 12 });
    expect(location.name).toBe('Bahnhof');
    expect(location.accuracyMetres).toBe(12);
  });

  it('entfernt umgebende Leerzeichen aus dem Namen', () => {
    expect(createLocation({ ...base, name: '  Bahnhof  ' }).name).toBe('Bahnhof');
  });

  it('besteht auf einem Namen', () => {
    // In einer Audio-App ist "Unbenannt 3, 1,2 Kilometer" wertlos - der Name
    // ist die einzige Information, die den Eintrag unterscheidbar macht.
    expect(() => createLocation({ ...base, name: '' })).toThrow(InvalidLocationError);
    expect(() => createLocation({ ...base, name: '   ' })).toThrow(InvalidLocationError);
  });

  it('besteht auf einer Kennung', () => {
    expect(() => createLocation({ ...base, id: '', name: 'Bahnhof' })).toThrow(
      InvalidLocationError,
    );
  });

  it('setzt die Genauigkeit auf null, wenn sie fehlt', () => {
    expect(createLocation({ ...base, name: 'Bahnhof' }).accuracyMetres).toBeNull();
  });

  it('ist ohne Angabe sichtbar', () => {
    // Eine bestehende Sicherung kennt das Feld nicht - sie darf keine Orte
    // stumm verschwinden lassen.
    expect(createLocation({ ...base, name: 'Bahnhof' }).hidden).toBe(false);
  });

  it('uebernimmt ein gesetztes Ausblenden', () => {
    expect(createLocation({ ...base, name: 'Bahnhof', hidden: true }).hidden).toBe(true);
  });
});
