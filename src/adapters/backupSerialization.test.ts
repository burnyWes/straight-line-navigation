import { describe, expect, it } from 'vitest';
import { deserializeBackup, serializeBackup } from './backupSerialization.js';
import { serializeLocations } from './locationSerialization.js';
import { createGroup } from '../domain/group.js';
import { coordinate } from '../domain/coordinate.js';
import { testLocation } from '../testing/fixtures.js';

const EXPORTED_AT = new Date('2026-09-05T12:00:00.000Z');

describe('backupSerialization', () => {
  const bahnhof = testLocation('Bahnhof', coordinate(52.5, 13.4), 12);
  const dom = testLocation('Dom', coordinate(50.94, 6.96));
  const kiez = createGroup({ id: 'g1', name: 'Kiez', memberIds: [bahnhof.id] });

  it('ueberlebt eine Runde mit Orten und Gruppen', () => {
    const result = deserializeBackup(serializeBackup([bahnhof, dom], [kiez], EXPORTED_AT));

    expect(result.locations.map((l) => l.name)).toEqual(['Bahnhof', 'Dom']);
    expect(result.groups.map((g) => g.name)).toEqual(['Kiez']);
    expect(result.groups[0]?.memberIds).toEqual([bahnhof.id]);
    expect(result.skippedLocations).toBe(0);
    expect(result.skippedGroups).toBe(0);
  });

  it('schreibt den Zeitpunkt der Sicherung und bleibt bei version 1', () => {
    // Rein additiv, und kein Leser verhaelt sich je nach Nummer anders.
    const parsed = JSON.parse(serializeBackup([bahnhof], [kiez], EXPORTED_AT));
    expect(parsed).toMatchObject({ version: 1, exportedAt: '2026-09-05T12:00:00.000Z' });
  });

  it('liest eine Sicherung ohne Gruppen ohne Wurf', () => {
    // Jede Sicherung von vor dieser Fassung ist so gebaut.
    const alt = JSON.stringify({
      version: 1,
      locations: [
        { id: 'a', name: 'Bahnhof', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      exportedAt: '2026-09-01T12:00:00.000Z',
    });

    const result = deserializeBackup(alt);
    expect(result.locations.map((l) => l.name)).toEqual(['Bahnhof']);
    expect(result.groups).toEqual([]);
    expect(result.skippedGroups).toBe(0);
  });

  it('liest auch den Geraetespeicher, der keine Gruppen kennt', () => {
    const result = deserializeBackup(serializeLocations([bahnhof]));
    expect(result.locations).toHaveLength(1);
    expect(result.groups).toEqual([]);
  });

  it('macht aus einem blanken Array keine Gruppen', () => {
    // Ein blankes Array ist die alte Kurzform fuer eine reine Ortsliste. Ohne
    // diese Regel wuerde jeder Ort darin als Gruppe gelesen - er hat id und
    // name.
    const raw = JSON.stringify([
      { id: 'a', name: 'Bahnhof', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const result = deserializeBackup(raw);
    expect(result.locations).toHaveLength(1);
    expect(result.groups).toEqual([]);
  });

  it('zaehlt beschaedigte Orte und Gruppen getrennt', () => {
    const raw = JSON.stringify({
      version: 1,
      locations: [
        { id: 'a', name: 'Gut', lat: 52.5, lon: 13.4, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'b', name: 'Ohne Koordinate' },
        null,
      ],
      groups: [{ id: 'g1', name: 'Kiez', memberIds: ['a'] }, { id: 'g2' }],
    });

    const result = deserializeBackup(raw);
    expect(result.locations.map((l) => l.name)).toEqual(['Gut']);
    expect(result.skippedLocations).toBe(2);
    expect(result.groups.map((g) => g.name)).toEqual(['Kiez']);
    expect(result.skippedGroups).toBe(1);
  });

  it('stuerzt bei kaputtem JSON nicht ab', () => {
    const result = deserializeBackup('{nicht json');
    expect(result.locations).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it('nimmt eine leere Gruppe mit durch die Sicherung', () => {
    const leer = createGroup({ id: 'g2', name: 'Wochenende' });
    const result = deserializeBackup(serializeBackup([], [leer], EXPORTED_AT));
    expect(result.groups.map((g) => g.name)).toEqual(['Wochenende']);
    expect(result.groups[0]?.memberIds).toEqual([]);
  });
});
