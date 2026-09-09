import { describe, expect, it } from 'vitest';
import { tapSolo, type SoloState } from './solo.js';

const ALL = ['a', 'b', 'c'];

describe('tapSolo', () => {
  it('merkt beim ersten Tipp den aktuellen Stand und blendet alles andere aus', () => {
    const result = tapSolo({
      current: null,
      target: { kind: 'location', id: 'b' },
      allIds: ALL,
      hiddenNow: ['c'],
      keep: ['b'],
    });

    expect(result.hiddenAfter).toEqual(['a', 'c']);
    expect(result.solo).toEqual({ kind: 'location', id: 'b', hiddenBefore: ['c'] });
  });

  it('macht einen Ort hell, der selbst ausgeblendet war', () => {
    const result = tapSolo({
      current: null,
      target: { kind: 'location', id: 'a' },
      allIds: ALL,
      hiddenNow: ['a', 'c'],
      keep: ['a'],
    });

    expect(result.hiddenAfter).toEqual(['b', 'c']);
    expect(result.hiddenAfter).not.toContain('a');
  });

  it('laesst das Solo wandern, ohne den Schnappschuss neu zu schreiben', () => {
    // Sonst merkte sich die App beim Sprung von Kiez zu Arbeit einen
    // Solo-Zustand als Rueckkehrpunkt.
    const current: SoloState = { kind: 'location', id: 'a', hiddenBefore: ['c'] };
    const result = tapSolo({
      current,
      target: { kind: 'location', id: 'b' },
      allIds: ALL,
      hiddenNow: ['b', 'c'],
      keep: ['b'],
    });

    expect(result.hiddenAfter).toEqual(['a', 'c']);
    expect(result.solo).toEqual({ kind: 'location', id: 'b', hiddenBefore: ['c'] });
  });

  it('stellt beim zweiten Tipp auf dieselbe Zeile den gemerkten Stand her', () => {
    const current: SoloState = { kind: 'location', id: 'b', hiddenBefore: ['c'] };
    const result = tapSolo({
      current,
      target: { kind: 'location', id: 'b' },
      allIds: ALL,
      hiddenNow: ['a', 'c'],
      keep: ['b'],
    });

    expect(result.hiddenAfter).toEqual(['c']);
    expect(result.solo).toBeNull();
  });

  it('zaehlt dieselbe Kennung bei anderer Art nicht als dieselbe Zeile', () => {
    const current: SoloState = { kind: 'group', id: 'x', hiddenBefore: ['c'] };
    const result = tapSolo({
      current,
      target: { kind: 'location', id: 'x' },
      allIds: [...ALL, 'x'],
      hiddenNow: ['a', 'b', 'c'],
      keep: ['x'],
    });

    expect(result.solo).toEqual({ kind: 'location', id: 'x', hiddenBefore: ['c'] });
    expect(result.hiddenAfter).toEqual(ALL);
  });

  it('laesst alle Mitglieder einer Gruppe hell', () => {
    const result = tapSolo({
      current: null,
      target: { kind: 'group', id: 'kiez' },
      allIds: ALL,
      // Ein Mitglied war einzeln ausgeblendet - Solo holt es mit.
      hiddenNow: ['b'],
      keep: ['a', 'b'],
    });

    expect(result.hiddenAfter).toEqual(['c']);
    expect(result.solo).toEqual({ kind: 'group', id: 'kiez', hiddenBefore: ['b'] });
  });

  it('aendert bei leerem keep nichts', () => {
    const current: SoloState = { kind: 'location', id: 'a', hiddenBefore: [] };
    const result = tapSolo({
      current,
      target: { kind: 'group', id: 'leer' },
      allIds: ALL,
      hiddenNow: ['b', 'c'],
      keep: [],
    });

    expect(result.hiddenAfter).toEqual(['b', 'c']);
    expect(result.solo).toBe(current);
  });
});
