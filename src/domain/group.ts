/**
 * Eine benannte Gruppe von Orten.
 *
 * Die Gruppe haelt die Mitglieder, nicht der Ort seine Gruppen: Ein Ort weiss
 * nichts von Gruppen, `location.ts` und das Ortsformat bleiben unveraendert.
 * Die Mitgliedschaft ist die Invariante der Gruppe, also gehoert sie hierher
 * (docs/design.md 6.6).
 */

export interface Group {
  readonly id: string;
  readonly name: string;
  /** Kennungen der Mitglieder. Aufgeloest wird immer gegen die existierenden Orte. */
  readonly memberIds: readonly string[];
}

export class InvalidGroupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGroupError';
  }
}

/**
 * Ein Name ist Pflicht - aus demselben Grund wie beim Ort.
 *
 * Der Name ist zugleich die Identitaet ueber Geraete hinweg: Beim Import wird
 * ueber ihn vereinigt, weil Kennungen sich zwischen Geraeten unterscheiden
 * (docs/design.md 6.6). Einen Vorschlag gibt es hier bewusst nicht - eine
 * Gruppe wird im Sitzen angelegt, nicht im Stehen.
 */
export function createGroup(input: {
  id: string;
  name: string;
  memberIds?: readonly string[];
}): Group {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new InvalidGroupError('Eine Gruppe braucht einen Namen.');
  }
  if (input.id.trim().length === 0) {
    throw new InvalidGroupError('Eine Gruppe braucht eine Kennung.');
  }
  return {
    id: input.id,
    name,
    // Dublettenfrei schon beim Erzeugen: Eine doppelt eingelesene Kennung
    // zaehlte sonst doppelt, und der Umfang in der Gruppenzeile stimmte nicht.
    memberIds: [...new Set(input.memberIds ?? [])],
  };
}
