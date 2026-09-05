import { beforeEach, describe, expect, it } from 'vitest';
import { LocationService } from './locationService.js';
import type { Clock, LocationRepository, PositionFix } from './ports.js';
import { coordinate } from '../domain/coordinate.js';
import type { Location } from '../domain/location.js';
import { testLocation } from '../testing/fixtures.js';

class InMemoryRepository implements LocationRepository {
  private locations: Location[] = [];

  all(): readonly Location[] {
    return this.locations;
  }

  save(location: Location): void {
    const index = this.locations.findIndex((candidate) => candidate.id === location.id);
    if (index === -1) {
      this.locations.push(location);
    } else {
      this.locations[index] = location;
    }
  }

  remove(id: string): void {
    this.locations = this.locations.filter((location) => location.id !== id);
  }

  replaceAll(locations: readonly Location[]): void {
    this.locations = [...locations];
  }
}

const clock: Clock = { now: () => new Date('2026-09-04T14:32:00.000Z') };

function fix(lat: number, lon: number, accuracyMetres = 12): PositionFix {
  return { coordinate: coordinate(lat, lon), accuracyMetres, timestamp: 0 };
}

describe('LocationService', () => {
  let repository: InMemoryRepository;
  let service: LocationService;
  let nextId: number;

  beforeEach(() => {
    repository = new InMemoryRepository();
    nextId = 0;
    service = new LocationService(repository, clock, () => {
      nextId += 1;
      return `id-${nextId}`;
    });
  });

  describe('Speichern per GPS', () => {
    it('legt einen Ort mit Genauigkeit an', () => {
      const result = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4, 9));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.location.name).toBe('Bahnhof');
      expect(result.location.accuracyMetres).toBe(9);
      expect(repository.all()).toHaveLength(1);
    });

    it('besteht auf einem Namen', () => {
      expect(service.saveCurrentPosition('   ', fix(52.5, 13.4))).toEqual({
        ok: false,
        reason: 'name-required',
      });
      expect(repository.all()).toHaveLength(0);
    });

    it('schlaegt einen Namen vor, damit im Stehen nichts getippt werden muss', () => {
      expect(service.suggestName()).toMatch(/^Ort 4\. September/);
    });
  });

  describe('Speichern aus Text', () => {
    it('liest eingefuegte Koordinaten', () => {
      const result = service.saveFromText('Bahnhof', '52.516275, 13.377704');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.location.coordinate.latitudeDeg).toBeCloseTo(52.516275, 5);
      // Eingegebene Koordinaten haben keine Messgenauigkeit.
      expect(result.location.accuracyMetres).toBeNull();
    });

    it('reicht den Grund einer misslungenen Erkennung durch', () => {
      expect(service.saveFromText('Bahnhof', 'https://maps.app.goo.gl/xyz')).toEqual({
        ok: false,
        reason: 'shortlink-unresolvable',
      });
      expect(service.saveFromText('Bahnhof', 'Hauptbahnhof')).toEqual({
        ok: false,
        reason: 'no-coordinate-found',
      });
    });

    it('speichert nichts, wenn die Koordinate unlesbar ist', () => {
      service.saveFromText('Bahnhof', 'Unsinn');
      expect(repository.all()).toHaveLength(0);
    });
  });

  describe('Umbenennen und Loeschen', () => {
    it('benennt um', () => {
      const created = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const renamed = service.rename(created.location.id, 'Hauptbahnhof');
      expect(renamed.ok).toBe(true);
      expect(repository.all()[0]?.name).toBe('Hauptbahnhof');
    });

    it('lehnt einen leeren Namen ab', () => {
      const created = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      if (!created.ok) return;

      expect(service.rename(created.location.id, '  ')).toEqual({
        ok: false,
        reason: 'name-required',
      });
      expect(repository.all()[0]?.name).toBe('Bahnhof');
    });

    it('loescht', () => {
      const created = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      if (!created.ok) return;

      service.remove(created.location.id);
      expect(repository.all()).toHaveLength(0);
    });
  });

  describe('Ausblenden', () => {
    it('legt neue Orte sichtbar an', () => {
      const gps = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      const text = service.saveFromText('Dom', '50.94, 6.96');
      expect(gps.ok && gps.location.hidden).toBe(false);
      expect(text.ok && text.location.hidden).toBe(false);
    });

    it('blendet aus und wieder ein', () => {
      const created = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      if (!created.ok) return;

      expect(service.setHidden(created.location.id, true)?.hidden).toBe(true);
      expect(repository.all()[0]?.hidden).toBe(true);

      expect(service.setHidden(created.location.id, false)?.hidden).toBe(false);
      expect(repository.all()[0]?.hidden).toBe(false);
    });

    it('laesst den Rest des Ortes unberuehrt', () => {
      const created = service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4, 9));
      if (!created.ok) return;

      const hiddenNow = service.setHidden(created.location.id, true);
      expect(hiddenNow).toMatchObject({
        id: created.location.id,
        name: 'Bahnhof',
        accuracyMetres: 9,
        createdAt: created.location.createdAt,
      });
    });

    it('meldet eine unbekannte Kennung, statt etwas zu schreiben', () => {
      service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      expect(service.setHidden('gibt-es-nicht', true)).toBeNull();
      expect(repository.all()[0]?.hidden).toBe(false);
    });

    it('laesst ausgeblendete Orte aus der Navigation heraus', () => {
      service.saveCurrentPosition('Zuhause', fix(52.5, 13.4));
      const arbeit = service.saveCurrentPosition('Arbeit', fix(52.6, 13.5));
      if (!arbeit.ok) return;
      service.setHidden(arbeit.location.id, true);

      // Verwalten zeigt alles, navigiert wird nur der Rest.
      expect(service.all().map((l) => l.name)).toEqual(['Arbeit', 'Zuhause']);
      expect(service.visible().map((l) => l.name)).toEqual(['Zuhause']);
    });

    it('behaelt beim Import den eingelesenen Zustand', () => {
      service.merge([
        testLocation('Dom', coordinate(50.94, 6.96), null, true),
        testLocation('Tor', coordinate(52.51, 13.37)),
      ]);
      expect(service.all().map((l) => l.hidden)).toEqual([true, false]);
      expect(service.visible().map((l) => l.name)).toEqual(['Tor']);
    });
  });

  it('sortiert die Verwaltungsliste alphabetisch', () => {
    service.saveCurrentPosition('Zuhause', fix(52.5, 13.4));
    service.saveCurrentPosition('Arbeit', fix(52.6, 13.5));
    expect(service.all().map((l) => l.name)).toEqual(['Arbeit', 'Zuhause']);
  });

  describe('Import', () => {
    it('ergaenzt neue Orte', () => {
      service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      const result = service.merge([testLocation('Dom', coordinate(50.94, 6.96))]);

      expect(result).toEqual({ added: 1, duplicates: 0 });
      expect(repository.all()).toHaveLength(2);
    });

    it('erkennt Dubletten ueber die Koordinate, nicht ueber die Kennung', () => {
      // Ein Export von einem anderen Geraet hat andere Kennungen fuer
      // denselben Ort.
      service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      const result = service.merge([testLocation('Bahnhof (Kopie)', coordinate(52.5, 13.4))]);

      expect(result).toEqual({ added: 0, duplicates: 1 });
      expect(repository.all()).toHaveLength(1);
    });

    it('loescht nichts Bestehendes', () => {
      // "Ersetzen" waere der Klick, der im falschen Moment alles kostet.
      service.saveCurrentPosition('Bahnhof', fix(52.5, 13.4));
      service.merge([]);
      expect(repository.all()).toHaveLength(1);
    });
  });
});
