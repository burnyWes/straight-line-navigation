import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, SETTINGS_KEY } from './storedSettings.js';
import { DEFAULT_SETTINGS, type AppSettings } from '../application/settings.js';
import type { KeyValueStore } from './storedLocationRepository.js';

class FakeStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  seed(value: unknown): void {
    this.data.set(SETTINGS_KEY, JSON.stringify(value));
  }
}

describe('loadSettings', () => {
  it('liest einen leeren Speicher als Standard', () => {
    expect(loadSettings(new FakeStore())).toEqual(DEFAULT_SETTINGS);
  });

  it('liest einen Stand ohne die neuen Felder als "kein Ziel, kein Ton"', () => {
    // Ein Stand aus einer Fassung vor dem Zielmodus - er darf die App nicht
    // scheitern lassen, sondern faellt auf den Standard zurueck.
    const store = new FakeStore();
    store.seed({
      coneHalfAngleDeg: 30,
      maxDistanceMetres: 2000,
      cues: { earcon: true },
      lastBackupAt: null,
    });

    const settings = loadSettings(store);
    expect(settings.coneHalfAngleDeg).toBe(30);
    expect(settings.targetId).toBeNull();
    expect(settings.guidanceTone).toBe(false);
  });

  it('faellt bei falschem Typ in targetId auf null zurueck', () => {
    const store = new FakeStore();
    store.seed({ ...DEFAULT_SETTINGS, targetId: 42 });

    expect(loadSettings(store).targetId).toBeNull();
  });

  it('faellt bei falschem Typ in guidanceTone auf den Standard zurueck', () => {
    const store = new FakeStore();
    store.seed({ ...DEFAULT_SETTINGS, guidanceTone: 'ja' });

    expect(loadSettings(store).guidanceTone).toBe(false);
  });

  it('laesst einen vollstaendigen Stand unveraendert hindurch', () => {
    const store = new FakeStore();
    const settings: AppSettings = {
      coneHalfAngleDeg: 15,
      maxDistanceMetres: 5000,
      cues: { earcon: false },
      lastBackupAt: '2026-09-04T12:00:00.000Z',
      targetId: 'ort-1',
      guidanceTone: true,
    };

    saveSettings(store, settings);
    expect(loadSettings(store)).toEqual(settings);
  });
});
