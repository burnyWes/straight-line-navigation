import { beforeEach, describe, expect, it } from 'vitest';
import { StoredGroupRepository } from './storedGroupRepository.js';
import type { KeyValueStore } from './storedLocationRepository.js';
import { createGroup } from '../domain/group.js';

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

const KEY = 'test.groups';
const kiez = createGroup({ id: 'g1', name: 'Kiez', memberIds: ['a'] });
const arbeit = createGroup({ id: 'g2', name: 'Arbeit' });

describe('StoredGroupRepository', () => {
  let store: FakeStore;
  let repository: StoredGroupRepository;

  beforeEach(() => {
    store = new FakeStore();
    repository = new StoredGroupRepository(store, KEY);
  });

  it('startet leer', () => {
    expect(repository.all()).toEqual([]);
  });

  it('speichert und liest zurueck', () => {
    repository.save(kiez);

    const fresh = new StoredGroupRepository(store, KEY);
    expect(fresh.all().map((g) => g.name)).toEqual(['Kiez']);
    expect(fresh.all()[0]?.memberIds).toEqual(['a']);
  });

  it('aktualisiert eine bestehende Gruppe statt sie zu doppeln', () => {
    repository.save(kiez);
    repository.save({ ...kiez, name: 'Nachbarschaft' });

    expect(repository.all()).toHaveLength(1);
    expect(repository.all()[0]?.name).toBe('Nachbarschaft');
  });

  it('loescht eine Gruppe', () => {
    repository.save(kiez);
    repository.remove(kiez.id);
    expect(repository.all()).toEqual([]);
  });

  it('ersetzt den gesamten Bestand', () => {
    repository.save(kiez);
    repository.replaceAll([arbeit]);
    expect(repository.all().map((g) => g.name)).toEqual(['Arbeit']);
  });

  it('startet leer, wenn der Speicher blockiert ist', () => {
    const blocked = new StoredGroupRepository(new BlockedStore(), KEY);
    expect(blocked.all()).toEqual([]);
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang und laesst den Cache unberuehrt', () => {
    // Erst schreiben, dann den Cache uebernehmen: Sonst behauptete er, es
    // haette geklappt.
    const blocked = new StoredGroupRepository(new BlockedStore(), KEY);
    expect(() => blocked.save(kiez)).toThrow();
    expect(blocked.all()).toEqual([]);
  });

  it('schreibt versioniert', () => {
    repository.save(kiez);
    expect(JSON.parse(store.raw(KEY) ?? '')).toMatchObject({ version: 1 });
  });

  it('zaehlt uebersprungene Eintraege beim Laden', () => {
    store.seed(KEY, JSON.stringify({ version: 1, groups: [{ id: 'x' }] }));
    const fresh = new StoredGroupRepository(store, KEY);
    expect(fresh.all()).toEqual([]);
    expect(fresh.skippedOnLoad()).toBe(1);
  });
});
