import { describe, expect, it } from 'vitest';
import { deserializeGroups, serializeGroups } from './groupSerialization.js';
import { createGroup } from '../domain/group.js';

describe('groupSerialization', () => {
  it('ueberlebt eine Runde durch den Speicher', () => {
    const groups = [
      createGroup({ id: 'g1', name: 'Kiez', memberIds: ['a', 'b'] }),
      createGroup({ id: 'g2', name: 'Arbeit' }),
    ];
    const result = deserializeGroups(serializeGroups(groups));

    expect(result.skipped).toBe(0);
    expect(result.groups.map((g) => g.name)).toEqual(['Kiez', 'Arbeit']);
    expect(result.groups[0]?.memberIds).toEqual(['a', 'b']);
    expect(result.groups[1]?.memberIds).toEqual([]);
  });

  it('liefert bei fehlendem Inhalt eine leere Liste', () => {
    expect(deserializeGroups(null).groups).toEqual([]);
    expect(deserializeGroups('').groups).toEqual([]);
  });

  it('stuerzt bei kaputtem JSON nicht ab', () => {
    expect(deserializeGroups('{nicht json').groups).toEqual([]);
  });

  it('rettet die lesbaren Eintraege und zaehlt die kaputten', () => {
    // Der Geraetespeicher ist die einzige Kopie - ein beschaedigter Eintrag
    // darf nicht alle anderen mitnehmen.
    const raw = JSON.stringify({
      version: 1,
      groups: [
        { id: 'g1', name: 'Kiez', memberIds: ['a'] },
        { id: 'g2' },
        { id: 'g3', name: '' },
        null,
      ],
    });

    const result = deserializeGroups(raw);
    expect(result.groups.map((g) => g.name)).toEqual(['Kiez']);
    expect(result.skipped).toBe(3);
  });

  it('liest eine Gruppe ohne memberIds als leer', () => {
    const raw = JSON.stringify({ version: 1, groups: [{ id: 'g1', name: 'Wochenende' }] });
    expect(deserializeGroups(raw).groups[0]?.memberIds).toEqual([]);
  });

  it('wirft unbrauchbare Kennungen weg, statt die Gruppe zu kippen', () => {
    const raw = JSON.stringify({
      version: 1,
      groups: [{ id: 'g1', name: 'Kiez', memberIds: ['a', 7, null, 'b'] }],
    });
    const result = deserializeGroups(raw);
    expect(result.skipped).toBe(0);
    expect(result.groups[0]?.memberIds).toEqual(['a', 'b']);
  });

  it('liest auch ein blankes Array', () => {
    const raw = JSON.stringify([{ id: 'g1', name: 'Kiez', memberIds: [] }]);
    expect(deserializeGroups(raw).groups).toHaveLength(1);
  });

  it('findet in einem Ortsdokument keine Gruppen, statt zu werfen', () => {
    // Jede Sicherung von vor dieser Fassung ist so gebaut.
    const raw = JSON.stringify({
      version: 1,
      locations: [{ id: 'a', name: 'Bahnhof', lat: 52.5, lon: 13.4 }],
    });
    expect(deserializeGroups(raw)).toEqual({ groups: [], skipped: 0 });
  });

  it('schreibt versioniert', () => {
    expect(JSON.parse(serializeGroups([]))).toMatchObject({ version: 1 });
  });
});
