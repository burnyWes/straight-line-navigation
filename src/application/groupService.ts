/**
 * Anwendungsfaelle rund um Gruppen von Orten.
 *
 * Die Gruppe besitzt keinen Sichtbarkeitszustand. Wer alle Mitglieder
 * ausblendet, schreibt `hidden` auf die Orte - es bleibt genau eine Wahrheit
 * ueber die Sichtbarkeit eines Ortes (docs/design.md 6.6). Deshalb kennt
 * dieser Dienst den LocationService nicht; er reicht nur Orte durch, die er
 * hereingegeben bekommt.
 */

import { createGroup, type Group } from '../domain/group.js';
import type { Location } from '../domain/location.js';
import type { GroupRepository } from './ports.js';

export interface GroupMergeResult {
  readonly added: number;
  /** Nur Gruppen, bei denen tatsaechlich ein Mitglied dazukam. */
  readonly extended: number;
}

export type GroupResult =
  | { readonly ok: true; readonly group: Group }
  | { readonly ok: false; readonly reason: 'name-required' | 'name-taken' };

/**
 * Gleicher Name, ohne Ruecksicht auf Gross- und Kleinschreibung.
 *
 * "kiez" und "Kiez" sind mit VoiceOver nicht auseinanderzuhalten - zwei
 * Eintraege mit demselben gesprochenen Namen waeren unbedienbar.
 */
function isSameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'de', { sensitivity: 'base' }) === 0;
}

export class GroupService {
  constructor(
    private readonly repository: GroupRepository,
    private readonly newId: () => string,
  ) {}

  all(): readonly Group[] {
    return [...this.repository.all()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  byId(id: string): Group | null {
    return this.repository.all().find((group) => group.id === id) ?? null;
  }

  create(name: string): GroupResult {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: 'name-required' };
    }
    if (this.repository.all().some((group) => isSameName(group.name, trimmed))) {
      return { ok: false, reason: 'name-taken' };
    }
    const group = createGroup({ id: this.newId(), name: trimmed });
    this.repository.save(group);
    return { ok: true, group };
  }

  rename(id: string, name: string): GroupResult {
    const existing = this.byId(id);
    if (existing === null) {
      return { ok: false, reason: 'name-required' };
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: 'name-required' };
    }
    // Die eigene Gruppe zaehlt nicht als Kollision: Wer nur die
    // Gross-Schreibung aendert, soll das duerfen.
    const taken = this.repository
      .all()
      .some((group) => group.id !== id && isSameName(group.name, trimmed));
    if (taken) {
      return { ok: false, reason: 'name-taken' };
    }
    const renamed = createGroup({ ...existing, name: trimmed });
    this.repository.save(renamed);
    return { ok: true, group: renamed };
  }

  /**
   * Nimmt einen Ort in die Gruppe auf.
   *
   * Ein Ort darf in mehreren Gruppen stehen; doppeltes Hinzufuegen aendert
   * nichts. Geprueft wird hier nicht, ob es den Ort gibt - das entscheidet
   * membersOf() beim Aufloesen, und zwar zu jedem spaeteren Zeitpunkt neu.
   */
  addMember(groupId: string, locationId: string): Group | null {
    const group = this.byId(groupId);
    if (group === null || group.memberIds.includes(locationId)) {
      return group;
    }
    const next = createGroup({ ...group, memberIds: [...group.memberIds, locationId] });
    this.repository.save(next);
    return next;
  }

  removeMember(groupId: string, locationId: string): Group | null {
    const group = this.byId(groupId);
    if (group === null || !group.memberIds.includes(locationId)) {
      // Kein Mitglied: folgenlos, und vor allem ohne Schreibzugriff - der
      // koennte scheitern und meldete dann einen Fehler fuer ein Nichts.
      return group;
    }
    const next = createGroup({
      ...group,
      memberIds: group.memberIds.filter((id) => id !== locationId),
    });
    this.repository.save(next);
    return next;
  }

  /**
   * Raeumt einen geloeschten Ort aus allen Gruppen.
   *
   * Geschrieben wird nur, wo er wirklich stand: Ein Durchlauf ueber alle
   * Gruppen kostete sonst bei jedem geloeschten Ort einen vollen Schreibzugriff
   * - und jeder kann scheitern.
   */
  removeLocationEverywhere(locationId: string): void {
    for (const group of this.repository.all()) {
      if (group.memberIds.includes(locationId)) {
        this.repository.save(
          createGroup({
            ...group,
            memberIds: group.memberIds.filter((id) => id !== locationId),
          }),
        );
      }
    }
  }

  /**
   * Loest die Mitglieder gegen die existierenden Orte auf.
   *
   * Filtert bewusst: Eine verwaiste Kennung - geloeschter Ort, halb
   * geschriebener Speicher - faellt hier still weg, statt weiter unten
   * als fehlender Ort zu krachen (docs/design.md 6.6).
   *
   * Alphabetisch sortiert, damit die Bestandsliste im Dialog dieselbe Ordnung
   * hat wie die Orte-Seite.
   */
  membersOf(group: Group, locations: readonly Location[]): readonly Location[] {
    return locations
      .filter((location) => group.memberIds.includes(location.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  /**
   * Loescht die Gruppe - und ruehrt die Orte nicht an.
   *
   * Auch nicht ihre Sichtbarkeit: Ausgeblendete Mitglieder bleiben
   * ausgeblendet und sind einzeln auf der Orte-Seite wieder einblendbar. Ein
   * Loeschen, das nebenbei dreissig Orte in den Kegel zurueckholte, waere die
   * Ueberraschung, gegen die docs/design.md 6.5 argumentiert.
   */
  remove(id: string): void {
    this.repository.remove(id);
  }

  /**
   * Fuehrt eingelesene Gruppen mit den vorhandenen zusammen.
   *
   * Vereinigt ueber den **Namen**, nicht ueber die Kennung: Kennungen
   * unterscheiden sich zwischen Geraeten, und ohne diese Regel entstuenden
   * nach einem Import zwei "Kiez", die mit VoiceOver nicht auseinanderzuhalten
   * sind (docs/design.md 6.6).
   *
   * Die Mitgliedskennungen laufen durch die Abbildung aus
   * LocationService.merge(); eine Kennung ohne Eintrag darin gehoert zu keinem
   * lokalen Ort und faellt weg. Wie beim Import von Orten gilt: ergaenzen, nie
   * ersetzen.
   */
  merge(
    incoming: readonly Group[],
    idMapping: ReadonlyMap<string, string>,
  ): GroupMergeResult {
    const existing = [...this.repository.all()];
    let added = 0;
    let extended = 0;

    for (const candidate of incoming) {
      const memberIds = candidate.memberIds
        .map((id) => idMapping.get(id))
        .filter((id): id is string => id !== undefined);

      const index = existing.findIndex((group) => isSameName(group.name, candidate.name));
      if (index === -1) {
        existing.push(createGroup({ id: this.newId(), name: candidate.name, memberIds }));
        added += 1;
        continue;
      }

      const known = existing[index];
      if (known === undefined) {
        continue;
      }
      const fresh = memberIds.filter((id) => !known.memberIds.includes(id));
      if (fresh.length === 0) {
        // Dieselbe Sicherung ein zweites Mal: nichts kam dazu, also wird auch
        // nichts geschrieben und nichts gezaehlt.
        continue;
      }
      existing[index] = createGroup({
        ...known,
        memberIds: [...known.memberIds, ...fresh],
      });
      extended += 1;
    }

    if (added > 0 || extended > 0) {
      this.repository.replaceAll(existing);
    }
    return { added, extended };
  }
}
