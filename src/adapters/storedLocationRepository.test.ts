import { beforeEach, describe, expect, it } from 'vitest';
import { StoredLocationRepository, type KeyValueStore } from './storedLocationRepository.js';
import { serializeLocations, deserializeLocations } from './locationSerialization.js';
import { coordinate } from '../domain/coordinate.js';
import { testLocation } from '../testing/fixtures.js';

class FakeStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  raw(key: string): string | undefined {
    return this.data.get(key);
  }

  seed(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** Speicher, der jedes Schreiben ablehnt - privater Modus, voller Speicher. */
class BlockedStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('blockiert');
  }

  setItem(): void {
    throw new Error('blockiert');
  }
}

const KEY = 'test.locations';

describe('locationSerialization', () => {
  it('ueberlebt eine Runde durch den Speicher', () => {
    const locations = [
      testLocation('Bahnhof', coordinate(52.5, 13.4), 12),
      testLocation('Dom', coordinate(50.94, 6.96)),
    ];
    const result = deserializeLocations(serializeLocations(locations));

    expect(result.skipped).toBe(0);
    expect(result.locations.map((l) => l.name)).toEqual(['Bahnhof', 'Dom']);
    expect(result.locations[0]?.accuracyMetres).toBe(12);
    expect(result.locations[1]?.accuracyMetres).toBeNull();
  });

  it('liefert bei fehlendem Inhalt eine leere Liste', () => {
    expect(deserializeLocations(null).locations).toEqual([]);
    expect(deserializeLocations('').locations).toEqual([]);
  });

  it('stuerzt bei kaputtem JSON nicht ab', () => {
    expect(deserializeLocations('{nicht json').locations).toEqual([]);
  });

  it('rettet die lesbaren Eintraege und zaehlt die kaputten', () => {
    // Der Geraetespeicher ist die einzige Kopie - ein beschaedigter Eintrag
    // darf nicht alle anderen mitnehmen.
    const raw = JSON.stringify({
      version: 1,
      locations: [
        { id: 'a', name: 'Gut', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: 'Ohne Koordinate', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'c', name: '', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'd', name: 'Unmoeglich', lat: 999, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
        null,
      ],
    });

    const result = deserializeLocations(raw);
    expect(result.locations.map((l) => l.name)).toEqual(['Gut']);
    expect(result.skipped).toBe(4);
  });

  it('liest auch ein blankes Array', () => {
    const raw = JSON.stringify([
      { id: 'a', name: 'Gut', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(deserializeLocations(raw).locations).toHaveLength(1);
  });
});

describe('StoredLocationRepository', () => {
  let store: FakeStore;
  let repository: StoredLocationRepository;

  beforeEach(() => {
    store = new FakeStore();
    repository = new StoredLocationRepository(store, KEY);
  });

  it('startet leer', () => {
    expect(repository.all()).toEqual([]);
  });

  it('speichert und liest zurueck', () => {
    const bahnhof = testLocation('Bahnhof', coordinate(52.5, 13.4));
    repository.save(bahnhof);

    const fresh = new StoredLocationRepository(store, KEY);
    expect(fresh.all().map((l) => l.name)).toEqual(['Bahnhof']);
  });

  it('aktualisiert einen bestehenden Eintrag statt ihn zu doppeln', () => {
    const bahnhof = testLocation('Bahnhof', coordinate(52.5, 13.4));
    repository.save(bahnhof);
    repository.save({ ...bahnhof, name: 'Hauptbahnhof' });

    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]?.name).toBe('Hauptbahnhof');
  });

  it('loescht einen Eintrag', () => {
    const bahnhof = testLocation('Bahnhof', coordinate(52.5, 13.4));
    repository.save(bahnhof);
    repository.remove(bahnhof.id);
    expect(repository.all()).toEqual([]);
  });

  describe('merge', () => {
    it('ergaenzt neue Orte', () => {
      repository.save(testLocation('Bahnhof', coordinate(52.5, 13.4)));
      const result = repository.merge([testLocation('Dom', coordinate(50.94, 6.96))]);

      expect(result).toEqual({ added: 1, duplicates: 0 });
      expect(repository.all()).toHaveLength(2);
    });

    it('erkennt Dubletten ueber die Koordinate, nicht ueber die Kennung', () => {
      // Ein Export von einem anderen Geraet hat andere Kennungen fuer
      // denselben Ort.
      repository.save(testLocation('Bahnhof', coordinate(52.5, 13.4)));
      const result = repository.merge([testLocation('Bahnhof (Kopie)', coordinate(52.5, 13.4))]);

      expect(result).toEqual({ added: 0, duplicates: 1 });
      expect(repository.all()).toHaveLength(1);
    });

    it('loescht nichts Bestehendes', () => {
      // "Ersetzen" waere der Klick, der im falschen Moment alles kostet.
      repository.save(testLocation('Bahnhof', coordinate(52.5, 13.4)));
      repository.merge([]);
      expect(repository.all()).toHaveLength(1);
    });
  });

  it('startet leer, wenn der Speicher blockiert ist', () => {
    // Privater Modus oder blockierte Website-Daten duerfen nicht zum Absturz
    // beim Laden fuehren.
    const blocked = new StoredLocationRepository(new BlockedStore(), KEY);
    expect(blocked.all()).toEqual([]);
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang, statt ihn zu verschlucken', () => {
    const blocked = new StoredLocationRepository(new BlockedStore(), KEY);
    expect(() => blocked.save(testLocation('Bahnhof', coordinate(52.5, 13.4)))).toThrow();
  });

  it('schreibt versioniert', () => {
    repository.save(testLocation('Bahnhof', coordinate(52.5, 13.4)));
    const raw = store.raw(KEY) ?? '';
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });
  });

  it('zaehlt uebersprungene Eintraege beim Laden', () => {
    store.seed(
      KEY,
      JSON.stringify({ version: 1, locations: [{ id: 'x', name: 'Kaputt' }] }),
    );
    const fresh = new StoredLocationRepository(store, KEY);
    expect(fresh.all()).toEqual([]);
    expect(fresh.skippedOnLoad()).toBe(1);
  });
});
