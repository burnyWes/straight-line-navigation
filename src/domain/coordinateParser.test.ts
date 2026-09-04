import { describe, expect, it } from 'vitest';
import { parseCoordinate, type CoordinateParseResult } from './coordinateParser.js';

function expectCoordinate(result: CoordinateParseResult, lat: number, lon: number): void {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.coordinate.latitudeDeg).toBeCloseTo(lat, 4);
  expect(result.coordinate.longitudeDeg).toBeCloseTo(lon, 4);
}

describe('parseCoordinate', () => {
  describe('Dezimalgrad', () => {
    it('liest Komma-getrennte Werte', () => {
      expectCoordinate(parseCoordinate('52.516275, 13.377704'), 52.516275, 13.377704);
    });

    it('liest Werte ohne Leerzeichen', () => {
      expectCoordinate(parseCoordinate('52.516275,13.377704'), 52.516275, 13.377704);
    });

    it('liest Leerzeichen-getrennte Werte', () => {
      expectCoordinate(parseCoordinate('52.516275 13.377704'), 52.516275, 13.377704);
    });

    it('liest Semikolon-getrennte Werte', () => {
      expectCoordinate(parseCoordinate('52.516275; 13.377704'), 52.516275, 13.377704);
    });

    it('liest negative Werte', () => {
      expectCoordinate(parseCoordinate('-33.856784, 151.215297'), -33.856784, 151.215297);
    });

    it('liest deutsche Dezimalkommas', () => {
      expectCoordinate(parseCoordinate('52,516275, 13,377704'), 52.516275, 13.377704);
    });

    it('ignoriert umgebende Leerzeichen', () => {
      expectCoordinate(parseCoordinate('  52.516275, 13.377704  '), 52.516275, 13.377704);
    });
  });

  describe('Grad, Minuten, Sekunden', () => {
    it('liest die Himmelsrichtung hinter den Zahlen', () => {
      expectCoordinate(
        parseCoordinate('52°30\'58.6"N 13°22\'39.7"E'),
        52.516278,
        13.377694,
      );
    });

    it('liest die Himmelsrichtung vor den Zahlen', () => {
      expectCoordinate(parseCoordinate('N 52 30.977 E 13 22.662'), 52.516283, 13.3777);
    });

    it('liest Sued und West als negativ', () => {
      expectCoordinate(parseCoordinate('33°51\'24.4"S 151°12\'55.1"E'), -33.856778, 151.215306);
    });

    it('kommt ohne Sekunden aus', () => {
      expectCoordinate(parseCoordinate('52° 30\' N 13° 22\' E'), 52.5, 13.366667);
    });
  });

  describe('URIs und Links', () => {
    it('liest ein geo-URI', () => {
      expectCoordinate(parseCoordinate('geo:52.516275,13.377704'), 52.516275, 13.377704);
    });

    it('liest ein geo-URI mit Genauigkeitsangabe', () => {
      expectCoordinate(parseCoordinate('geo:52.516275,13.377704;u=35'), 52.516275, 13.377704);
    });

    it('liest die Kartenmitte aus einem Google-Maps-Link', () => {
      expectCoordinate(
        parseCoordinate('https://www.google.com/maps/@52.516275,13.377704,15z'),
        52.516275,
        13.377704,
      );
    });

    it('liest den q-Parameter aus einem Google-Maps-Link', () => {
      expectCoordinate(
        parseCoordinate('https://www.google.com/maps?q=52.516275,13.377704'),
        52.516275,
        13.377704,
      );
    });

    it('liest den ll-Parameter aus einem Apple-Maps-Link', () => {
      expectCoordinate(
        parseCoordinate('https://maps.apple.com/?ll=52.516275,13.377704&q=Tor'),
        52.516275,
        13.377704,
      );
    });

    it('liest einen OpenStreetMap-Link', () => {
      expectCoordinate(
        parseCoordinate('https://www.openstreetmap.org/#map=17/52.516275/13.377704'),
        52.516275,
        13.377704,
      );
    });
  });

  describe('Fehlerfaelle', () => {
    it('meldet leere Eingaben', () => {
      expect(parseCoordinate('')).toEqual({ ok: false, reason: 'empty' });
      expect(parseCoordinate('   ')).toEqual({ ok: false, reason: 'empty' });
    });

    it('meldet Kurzlinks als nicht aufloesbar', () => {
      // Ohne Netz nicht aufloesbar - der Nutzer muss den Link vorher oeffnen.
      expect(parseCoordinate('https://maps.app.goo.gl/AbCdEf123')).toEqual({
        ok: false,
        reason: 'shortlink-unresolvable',
      });
      expect(parseCoordinate('https://goo.gl/maps/AbCdEf123')).toEqual({
        ok: false,
        reason: 'shortlink-unresolvable',
      });
    });

    it('meldet Text ohne Koordinate', () => {
      expect(parseCoordinate('Hauptbahnhof')).toEqual({
        ok: false,
        reason: 'no-coordinate-found',
      });
    });

    it('meldet Werte ausserhalb des gueltigen Bereichs', () => {
      expect(parseCoordinate('91.0, 13.0')).toEqual({ ok: false, reason: 'out-of-range' });
      expect(parseCoordinate('52.0, 181.0')).toEqual({ ok: false, reason: 'out-of-range' });
    });
  });
});
