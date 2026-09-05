import { beforeEach, describe, expect, it } from 'vitest';
import { GroupService } from './groupService.js';
import type { GroupRepository } from './ports.js';
import { createGroup, type Group } from '../domain/group.js';
import { coordinate } from '../domain/coordinate.js';
import { testLocation } from '../testing/fixtures.js';

class InMemoryGroupRepository implements GroupRepository {
  private groups: Group[] = [];

  all(): readonly Group[] {
    return this.groups;
  }

  save(group: Group): void {
    const index = this.groups.findIndex((candidate) => candidate.id === group.id);
    if (index === -1) {
      this.groups.push(group);
    } else {
      this.groups[index] = group;
    }
  }

  remove(id: string): void {
    this.groups = this.groups.filter((group) => group.id !== id);
  }

  replaceAll(groups: readonly Group[]): void {
    this.groups = [...groups];
  }
}

describe('GroupService', () => {
  let repository: InMemoryGroupRepository;
  let service: GroupService;
  let nextId: number;

  beforeEach(() => {
    repository = new InMemoryGroupRepository();
    nextId = 0;
    service = new GroupService(repository, () => {
      nextId += 1;
      return `g-${nextId}`;
    });
  });

  describe('Anlegen', () => {
    it('legt eine Gruppe ohne Mitglieder an', () => {
      const result = service.create('Kiez');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.group.name).toBe('Kiez');
      expect(result.group.memberIds).toEqual([]);
      expect(repository.all()).toHaveLength(1);
    });

    it('besteht auf einem Namen', () => {
      expect(service.create('   ')).toEqual({ ok: false, reason: 'name-required' });
      expect(repository.all()).toHaveLength(0);
    });

    it('lehnt einen vorhandenen Namen ab, auch anders geschrieben', () => {
      // "kiez" und "Kiez" sind mit VoiceOver nicht auseinanderzuhalten.
      service.create('Kiez');
      expect(service.create('kiez')).toEqual({ ok: false, reason: 'name-taken' });
      expect(service.create('  KIEZ ')).toEqual({ ok: false, reason: 'name-taken' });
      expect(repository.all()).toHaveLength(1);
    });
  });

  describe('Umbenennen', () => {
    it('benennt um', () => {
      const created = service.create('Kiez');
      if (!created.ok) return;

      const renamed = service.rename(created.group.id, 'Nachbarschaft');
      expect(renamed.ok).toBe(true);
      expect(repository.all()[0]?.name).toBe('Nachbarschaft');
    });

    it('behaelt die Mitglieder', () => {
      const created = service.create('Kiez');
      if (!created.ok) return;
      repository.save({ ...created.group, memberIds: ['a', 'b'] });

      const renamed = service.rename(created.group.id, 'Nachbarschaft');
      expect(renamed.ok && renamed.group.memberIds).toEqual(['a', 'b']);
    });

    it('lehnt einen leeren Namen ab', () => {
      const created = service.create('Kiez');
      if (!created.ok) return;

      expect(service.rename(created.group.id, ' ')).toEqual({
        ok: false,
        reason: 'name-required',
      });
      expect(repository.all()[0]?.name).toBe('Kiez');
    });

    it('lehnt den Namen einer anderen Gruppe ab', () => {
      service.create('Kiez');
      const arbeit = service.create('Arbeit');
      if (!arbeit.ok) return;

      expect(service.rename(arbeit.group.id, 'kiez')).toEqual({
        ok: false,
        reason: 'name-taken',
      });
    });

    it('erlaubt den eigenen Namen', () => {
      // Sonst liesse sich die Gross-Schreibung nie korrigieren.
      const created = service.create('Kiez');
      if (!created.ok) return;

      expect(service.rename(created.group.id, 'Kiez').ok).toBe(true);
      expect(service.rename(created.group.id, 'KIEZ').ok).toBe(true);
      expect(repository.all()[0]?.name).toBe('KIEZ');
    });

    it('meldet eine unbekannte Kennung, statt etwas zu schreiben', () => {
      expect(service.rename('gibt-es-nicht', 'Kiez').ok).toBe(false);
      expect(repository.all()).toHaveLength(0);
    });
  });

  it('sortiert alphabetisch, Umlaute einsortiert', () => {
    service.create('Zuhause');
    service.create('Arbeit');
    service.create('Übungsplatz');
    service.create('Uferweg');

    expect(service.all().map((g) => g.name)).toEqual([
      'Arbeit',
      'Übungsplatz',
      'Uferweg',
      'Zuhause',
    ]);
  });

  it('findet eine Gruppe ueber ihre Kennung', () => {
    const created = service.create('Kiez');
    if (!created.ok) return;

    expect(service.byId(created.group.id)?.name).toBe('Kiez');
    expect(service.byId('gibt-es-nicht')).toBeNull();
  });

  it('loescht eine Gruppe', () => {
    const created = service.create('Kiez');
    if (!created.ok) return;

    service.remove(created.group.id);
    expect(repository.all()).toEqual([]);
  });

  describe('Mitglieder', () => {
    /** Legt eine Gruppe an und gibt ihre Kennung zurueck. */
    function group(name: string): string {
      const result = service.create(name);
      if (!result.ok) throw new Error('Gruppe liess sich nicht anlegen.');
      return result.group.id;
    }

    it('nimmt einen Ort auf', () => {
      const kiez = group('Kiez');
      expect(service.addMember(kiez, 'a')?.memberIds).toEqual(['a']);
      expect(service.byId(kiez)?.memberIds).toEqual(['a']);
    });

    it('aendert bei doppeltem Hinzufuegen nichts', () => {
      const kiez = group('Kiez');
      service.addMember(kiez, 'a');
      service.addMember(kiez, 'a');
      expect(service.byId(kiez)?.memberIds).toEqual(['a']);
    });

    it('entfernt einen Ort', () => {
      const kiez = group('Kiez');
      service.addMember(kiez, 'a');
      service.addMember(kiez, 'b');

      expect(service.removeMember(kiez, 'a')?.memberIds).toEqual(['b']);
      expect(service.byId(kiez)?.memberIds).toEqual(['b']);
    });

    it('laesst das Entfernen eines Nichtmitglieds folgenlos', () => {
      const kiez = group('Kiez');
      service.addMember(kiez, 'a');

      expect(service.removeMember(kiez, 'gibt-es-nicht')?.memberIds).toEqual(['a']);
    });

    it('meldet eine unbekannte Gruppe, statt etwas zu schreiben', () => {
      expect(service.addMember('gibt-es-nicht', 'a')).toBeNull();
      expect(service.removeMember('gibt-es-nicht', 'a')).toBeNull();
    });

    it('laesst einen Ort in mehreren Gruppen stehen', () => {
      const kiez = group('Kiez');
      const arbeit = group('Arbeit');
      service.addMember(kiez, 'a');
      service.addMember(arbeit, 'a');

      expect(service.byId(kiez)?.memberIds).toEqual(['a']);
      expect(service.byId(arbeit)?.memberIds).toEqual(['a']);
    });

    it('raeumt einen geloeschten Ort aus allen Gruppen', () => {
      const kiez = group('Kiez');
      const arbeit = group('Arbeit');
      service.addMember(kiez, 'a');
      service.addMember(kiez, 'b');
      service.addMember(arbeit, 'a');

      service.removeLocationEverywhere('a');

      expect(service.byId(kiez)?.memberIds).toEqual(['b']);
      expect(service.byId(arbeit)?.memberIds).toEqual([]);
    });
  });

  describe('membersOf', () => {
    const bahnhof = testLocation('Bahnhof', coordinate(52.5, 13.4));
    const baecker = testLocation('Baecker', coordinate(52.6, 13.5));
    const zuhause = testLocation('Zuhause', coordinate(52.7, 13.6));
    const alle = [bahnhof, baecker, zuhause];

    /** Legt eine Gruppe mit den genannten Mitgliedern an. */
    function group(name: string, memberIds: readonly string[]): Group {
      const result = service.create(name);
      if (!result.ok) throw new Error('Gruppe liess sich nicht anlegen.');
      for (const id of memberIds) {
        service.addMember(result.group.id, id);
      }
      const stored = service.byId(result.group.id);
      if (stored === null) throw new Error('Gruppe verschwunden.');
      return stored;
    }

    it('loest die Mitglieder auf und sortiert alphabetisch', () => {
      const kiez = group('Kiez', [zuhause.id, bahnhof.id, baecker.id]);
      expect(service.membersOf(kiez, alle).map((l) => l.name)).toEqual([
        'Baecker',
        'Bahnhof',
        'Zuhause',
      ]);
    });

    it('faellt bei einer verwaisten Kennung still weg', () => {
      // Geloeschter Ort oder halb geschriebener Speicher: Die Gruppe zeigt
      // einen Ort weniger, statt zu brechen.
      const kiez = group('Kiez', [bahnhof.id, 'gibt-es-nicht']);
      expect(service.membersOf(kiez, alle).map((l) => l.name)).toEqual(['Bahnhof']);
    });

    it('gibt fuer eine leere Gruppe nichts zurueck', () => {
      expect(service.membersOf(group('Wochenende', []), alle)).toEqual([]);
    });

    it('nimmt ausgeblendete Mitglieder mit', () => {
      // Sichtbarkeit ist Sache des Ortes; membersOf beantwortet nur, wer
      // dazugehoert.
      const dunkel = testLocation('Dunkel', coordinate(51, 12), null, true);
      const kiez = group('Kiez', [dunkel.id]);
      expect(service.membersOf(kiez, [...alle, dunkel]).map((l) => l.name)).toEqual(['Dunkel']);
    });

    it('bleibt vollzaehlig, wenn alle Mitglieder ausgeblendet sind', () => {
      // Der Reihenschalter braucht das: Die Gluehbirne an der Gruppe schreibt
      // hidden auf genau diese Liste. Filterte membersOf ausgeblendete Orte
      // weg, liesse sich eine ausgeblendete Gruppe nie wieder einblenden
      // (docs/design.md 6.6).
      const eins = testLocation('Eins', coordinate(51, 12), null, true);
      const zwei = testLocation('Zwei', coordinate(51.1, 12.1), null, true);
      const kiez = group('Kiez', [eins.id, zwei.id]);

      expect(service.membersOf(kiez, [eins, zwei]).map((l) => l.name)).toEqual(['Eins', 'Zwei']);
    });
  });

  describe('Import', () => {
    /** Sicherung von einem anderen Geraet: fremde Kennungen, eigene Abbildung. */
    function incoming(name: string, memberIds: readonly string[]): Group {
      return createGroup({ id: `fremd-${name}`, name, memberIds });
    }

    it('ergaenzt eine unbekannte Gruppe', () => {
      const result = service.merge([incoming('Kiez', ['fremd-a'])], new Map([['fremd-a', 'a']]));

      expect(result).toEqual({ added: 1, extended: 0 });
      expect(service.all().map((g) => g.name)).toEqual(['Kiez']);
      expect(service.all()[0]?.memberIds).toEqual(['a']);
    });

    it('gibt der ergaenzten Gruppe eine lokale Kennung', () => {
      // Kennungen unterscheiden sich zwischen Geraeten; lokal zaehlt die
      // eigene.
      service.merge([incoming('Kiez', [])], new Map());
      expect(service.all()[0]?.id).toBe('g-1');
    });

    it('vereinigt eine gleichnamige Gruppe, statt sie zu ersetzen', () => {
      const kiez = service.create('Kiez');
      if (!kiez.ok) return;
      service.addMember(kiez.group.id, 'a');

      const result = service.merge(
        [incoming('Kiez', ['fremd-b'])],
        new Map([['fremd-b', 'b']]),
      );

      expect(result).toEqual({ added: 0, extended: 1 });
      expect(service.all()).toHaveLength(1);
      expect(service.byId(kiez.group.id)?.memberIds).toEqual(['a', 'b']);
    });

    it('vereinigt auch bei anderer Gross- und Kleinschreibung', () => {
      // Sonst entstuenden zwei "Kiez", die mit VoiceOver nicht
      // auseinanderzuhalten sind.
      const kiez = service.create('Kiez');
      if (!kiez.ok) return;

      service.merge([incoming('KIEZ', ['fremd-b'])], new Map([['fremd-b', 'b']]));

      expect(service.all()).toHaveLength(1);
      expect(service.all()[0]?.name).toBe('Kiez');
    });

    it('schreibt die Mitgliedskennungen ueber die Abbildung um', () => {
      // Eine Dublette behaelt die lokale Kennung - ohne das Umschreiben zeigte
      // die eingelesene Gruppe auf einen Ort, den es lokal nicht gibt.
      service.merge(
        [incoming('Kiez', ['fremd-a', 'fremd-b'])],
        new Map([
          ['fremd-a', 'lokal-a'],
          ['fremd-b', 'lokal-b'],
        ]),
      );

      expect(service.all()[0]?.memberIds).toEqual(['lokal-a', 'lokal-b']);
    });

    it('laesst eine Kennung ohne Abbildung weg', () => {
      service.merge([incoming('Kiez', ['fremd-a', 'unbekannt'])], new Map([['fremd-a', 'a']]));
      expect(service.all()[0]?.memberIds).toEqual(['a']);
    });

    it('aendert beim zweiten Einlesen derselben Sicherung nichts', () => {
      const sicherung = [incoming('Kiez', ['fremd-a'])];
      const mapping = new Map([['fremd-a', 'a']]);

      service.merge(sicherung, mapping);
      const zweitesMal = service.merge(sicherung, mapping);

      expect(zweitesMal).toEqual({ added: 0, extended: 0 });
      expect(service.all()).toHaveLength(1);
      expect(service.all()[0]?.memberIds).toEqual(['a']);
    });

    it('zaehlt nur Gruppen als erweitert, bei denen wirklich etwas dazukam', () => {
      const kiez = service.create('Kiez');
      const arbeit = service.create('Arbeit');
      if (!kiez.ok || !arbeit.ok) return;
      service.addMember(kiez.group.id, 'a');

      const result = service.merge(
        [incoming('Kiez', ['fremd-a']), incoming('Arbeit', ['fremd-b'])],
        new Map([
          ['fremd-a', 'a'],
          ['fremd-b', 'b'],
        ]),
      );

      expect(result).toEqual({ added: 0, extended: 1 });
    });

    it('loescht nichts Bestehendes', () => {
      service.create('Kiez');
      service.merge([], new Map());
      expect(service.all()).toHaveLength(1);
    });
  });
});
