import { describe, expect, it } from 'vitest';
import { createGroup, InvalidGroupError } from './group.js';

const base = { id: 'g1', name: 'Kiez' };

describe('createGroup', () => {
  it('erzeugt eine Gruppe', () => {
    const group = createGroup({ ...base, memberIds: ['a', 'b'] });
    expect(group.name).toBe('Kiez');
    expect(group.memberIds).toEqual(['a', 'b']);
  });

  it('entfernt umgebende Leerzeichen aus dem Namen', () => {
    expect(createGroup({ ...base, name: '  Kiez  ' }).name).toBe('Kiez');
  });

  it('besteht auf einem Namen', () => {
    // Der Name ist zugleich die Identitaet ueber Geraete hinweg (Import).
    expect(() => createGroup({ ...base, name: '' })).toThrow(InvalidGroupError);
    expect(() => createGroup({ ...base, name: '   ' })).toThrow(InvalidGroupError);
  });

  it('besteht auf einer Kennung', () => {
    expect(() => createGroup({ ...base, id: '' })).toThrow(InvalidGroupError);
    expect(() => createGroup({ ...base, id: '   ' })).toThrow(InvalidGroupError);
  });

  it('ist ohne Angabe leer', () => {
    expect(createGroup(base).memberIds).toEqual([]);
  });

  it('entdoppelt die Mitglieder', () => {
    // Eine doppelt eingelesene Kennung zaehlte sonst doppelt, und der Umfang
    // in der Gruppenzeile stimmte nicht.
    expect(createGroup({ ...base, memberIds: ['a', 'b', 'a'] }).memberIds).toEqual(['a', 'b']);
  });
});
