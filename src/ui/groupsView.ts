/**
 * Gruppen-Bereich: anlegen, umbenennen, loeschen.
 *
 * Aufbau wie die Orte-Seite (docs/design.md 6.4): Kopf, Meldungszeile, Liste;
 * Anlegen hinter dem Plus im Kopf, Bearbeiten und Loeschen hinter dem
 * Listeneintrag. Solange ein Dialog offen ist, gehoert jede Meldung in den
 * Dialog - die Zeile des Panels waere hinter dem Hintergrund weder zu sehen
 * noch zu erswipen.
 */

import {
  el,
  setText,
  icon,
  setButtonLabel,
  ICON_PLUS,
  ICON_TRASH,
  ICON_BULB_ON,
  ICON_BULB_OFF,
} from './dom.js';
import { ModalDialog } from './dialog.js';
import type { Announcer } from './announcer.js';
import type { Group } from '../domain/group.js';
import type { Location } from '../domain/location.js';
import { formatDeleteGroupWarning, formatGroupEntryLabel } from './format.js';

/** Gruende, aus denen eine Gruppe nicht angelegt oder umbenannt werden kann. */
export type GroupFailure = 'name-required' | 'name-taken';

const GROUP_ERROR: Record<GroupFailure, string> = {
  'name-required': 'Bitte einen Namen eingeben.',
  'name-taken': 'Eine Gruppe mit diesem Namen gibt es schon.',
};

export interface GroupsViewCallbacks {
  onCreate(name: string): void;
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  onAddMember(groupId: string, locationId: string): void;
  onRemoveMember(groupId: string, locationId: string): void;
  /**
   * Schaltet alle Mitglieder auf einmal.
   *
   * Die Gruppe hat keinen eigenen Sichtbarkeitszustand - die Birne ist ein
   * Reihenschalter und schreibt `hidden` auf die Orte (docs/design.md 6.6).
   */
  onToggleGroupHidden(groupId: string, hidden: boolean): void;
  /**
   * Loest die Mitglieder auf.
   *
   * Als Rueckruf und nicht als Filter in der Ansicht: Die Regel "immer gegen
   * die existierenden Orte" ist fachlich und steht im GroupService
   * (docs/design.md 6.6). Sie hier ein zweites Mal zu schreiben hiesse, sie an
   * zwei Stellen richtig halten zu muessen.
   */
  membersOf(group: Group): readonly Location[];
}

/**
 * Eine Zeile der Liste.
 *
 * Beide Knoepfe werden festgehalten, nicht nur der Eintragsknopf: Das
 * Umschalten aendert genau eine Zeile, statt die Liste neu zu bauen. Ein neu
 * gebauter Knopf naehme den Fokus mit, und der steht beim Umschalten genau
 * darauf (docs/design.md 9).
 *
 * Leere Gruppen haben keine Birne - kein toter Knopf im Wischweg.
 */
interface Row {
  readonly entry: HTMLButtonElement;
  readonly toggle: HTMLButtonElement | null;
  group: Group;
  /** Stand beim letzten Zeichnen: Zahl der Mitglieder und wie viele davon dunkel. */
  members: readonly Location[];
}

export class GroupsView {
  readonly panel: HTMLElement;

  private readonly feedback: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly emptyLine: HTMLElement;
  /** Zeile je Gruppe, damit der Fokus nach dem Rendern gezielt landen kann. */
  private readonly rows = new Map<string, Row>();

  private readonly addButton: HTMLButtonElement;
  private readonly createDialog: ModalDialog;
  private readonly createName: HTMLInputElement;
  private readonly createFeedback: HTMLElement;

  private readonly editDialog: ModalDialog;
  private readonly editName: HTMLInputElement;
  private readonly editFeedback: HTMLElement;
  private readonly deleteButton: HTMLButtonElement;
  private readonly cancelEdit: HTMLButtonElement;

  private readonly pickerLabel: HTMLLabelElement;
  private readonly picker: HTMLSelectElement;
  private readonly pickerHint: HTMLElement;
  private readonly membersHeading: HTMLElement;
  private readonly membersList: HTMLUListElement;
  /** Muelleimer je Mitglied, in Anzeigereihenfolge - der Fokus rueckt darin nach. */
  private memberButtons: HTMLButtonElement[] = [];

  private readonly deleteDialog: ModalDialog;
  private readonly deleteCancel: HTMLButtonElement;
  private readonly deleteHint: HTMLElement;
  private readonly deleteFeedback: HTMLElement;

  /** Gruppe, die gerade im Bearbeiten-Dialog steht. */
  private editing: Group | null = null;
  /** Alle gespeicherten Orte - Grundlage fuer Zahlen und Auswahlrad. */
  private locations: readonly Location[] = [];
  /** Position des zuletzt entfernten Mitglieds, damit der Fokus nachruecken kann. */
  private removedIndex = 0;

  constructor(
    private readonly announcer: Announcer,
    private readonly callbacks: GroupsViewCallbacks,
  ) {
    // --- Anlegen-Dialog ------------------------------------------------------

    // Kein Namensvorschlag: Eine Gruppe wird im Sitzen angelegt und traegt
    // einen selbst gewaehlten Namen. "Gruppe 5. September" waere hier so
    // wertlos wie "Unbenannt 3" bei einem Ort - nur ohne den Grund, aus dem der
    // Ortsvorschlag existiert (im Stehen soll nichts getippt werden muessen).
    this.createName = el('input', {
      type: 'text',
      id: 'gruppe-name',
      autocomplete: 'off',
      enterkeyhint: 'done',
    }) as HTMLInputElement;

    const create = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Anlegen',
    }) as HTMLButtonElement;
    create.addEventListener('click', () => {
      this.callbacks.onCreate(this.createName.value);
    });

    const cancelCreate = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Abbrechen',
    }) as HTMLButtonElement;
    cancelCreate.addEventListener('click', () => {
      this.createDialog.close();
    });

    this.createFeedback = el('p', { class: 'status', role: 'status' });

    this.createDialog = new ModalDialog('gruppe-neu', 'Neue Gruppe anlegen', [
      el('label', { for: 'gruppe-name', text: 'Name' }),
      this.createName,
      create,
      cancelCreate,
      this.createFeedback,
    ]);

    this.addButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button primary',
        'aria-label': 'Neue Gruppe anlegen',
        title: 'Neue Gruppe anlegen',
      },
      [icon(ICON_PLUS)],
    ) as HTMLButtonElement;
    this.addButton.addEventListener('click', () => {
      this.openCreate();
    });

    this.feedback = el('p', { class: 'status', role: 'status' });
    this.list = el('ul', { class: 'entries', 'aria-label': 'Gruppen' }) as HTMLUListElement;
    this.emptyLine = el('p', { class: 'status', text: 'Noch keine Gruppen angelegt.' });

    // --- Bearbeiten-Dialog ---------------------------------------------------

    this.editName = el('input', {
      type: 'text',
      id: 'gruppe-bearbeiten-name',
      autocomplete: 'off',
      enterkeyhint: 'done',
    }) as HTMLInputElement;

    const saveName = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Namen speichern',
    }) as HTMLButtonElement;
    saveName.addEventListener('click', () => {
      const editing = this.editing;
      if (editing !== null) {
        this.callbacks.onRename(editing.id, this.editName.value);
      }
    });

    this.deleteButton = el('button', {
      type: 'button',
      class: 'danger',
      text: 'Loeschen',
    }) as HTMLButtonElement;
    this.deleteButton.addEventListener('click', () => {
      this.openDelete();
    });

    this.cancelEdit = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Abbrechen',
    }) as HTMLButtonElement;
    // Der Weg ohne Tastatur: Escape leistet dasselbe, aber am iPhone ist keine da.
    this.cancelEdit.addEventListener('click', () => {
      this.editDialog.close();
    });

    // --- Mitgliederpflege ----------------------------------------------------

    this.pickerLabel = el('label', {
      for: 'gruppe-ort-waehlen',
      text: 'Ort hinzufuegen',
    }) as HTMLLabelElement;

    // Der Knoten wird einmal angelegt; getauscht werden nur seine Optionen.
    // Der Fokus steht nach dem Hinzufuegen weiter auf dem Rad, und ein neu
    // gebautes Rad naehme ihn mit (docs/design.md 9).
    this.picker = el('select', { id: 'gruppe-ort-waehlen' }) as HTMLSelectElement;
    this.picker.addEventListener('change', () => {
      const editing = this.editing;
      const locationId = this.picker.value;
      if (editing === null || locationId.length === 0) {
        return;
      }
      // Wirkt sofort, ohne zweiten Knopf: Auf iOS wird das Rad mit "Fertig"
      // bestaetigt - die Auswahl ist dort ohnehin schon ein bewusster
      // Abschluss (docs/design.md 6.6).
      this.callbacks.onAddMember(editing.id, locationId);
    });

    this.pickerHint = el('p', { class: 'hint' });
    this.membersHeading = el('p', { class: 'hint' });
    this.membersList = el('ul', {
      class: 'entries',
      'aria-label': 'Orte in dieser Gruppe',
    }) as HTMLUListElement;

    this.editFeedback = el('p', { class: 'status', role: 'status' });

    this.editDialog = new ModalDialog('gruppe-bearbeiten', 'Gruppe bearbeiten', [
      el('label', { for: 'gruppe-bearbeiten-name', text: 'Name' }),
      this.editName,
      saveName,
      this.pickerLabel,
      this.picker,
      this.pickerHint,
      this.membersHeading,
      this.membersList,
      this.deleteButton,
      this.cancelEdit,
      this.editFeedback,
    ]);

    // --- Bestaetigung vor dem Loeschen ---------------------------------------

    this.deleteHint = el('p', { class: 'hint' });

    const confirmDelete = el('button', {
      type: 'button',
      class: 'danger',
      text: 'Loeschen',
    }) as HTMLButtonElement;
    confirmDelete.addEventListener('click', () => {
      const editing = this.editing;
      if (editing !== null) {
        this.callbacks.onRemove(editing.id);
      }
    });

    this.deleteCancel = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Abbrechen',
    }) as HTMLButtonElement;
    this.deleteCancel.addEventListener('click', () => {
      this.deleteDialog.close();
    });

    this.deleteFeedback = el('p', { class: 'status', role: 'status' });

    this.deleteDialog = new ModalDialog('gruppe-loeschen', 'Gruppe loeschen?', [
      this.deleteHint,
      confirmDelete,
      this.deleteCancel,
      this.deleteFeedback,
    ]);

    // Die Dialoge haengen im Panel. Unkritisch, weil ein modaler Dialog den
    // Bereichswechsel blockiert: Es kann nie einer offen sein, waehrend das
    // Panel ueber hidden aus dem Baum genommen wird.
    this.panel = el('section', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', { text: 'Gruppen' }), this.addButton]),
      this.feedback,
      this.emptyLine,
      this.list,
      this.createDialog.element,
      this.editDialog.element,
      this.deleteDialog.element,
    ]);
  }

  /**
   * Baut die Liste neu.
   *
   * Braucht die Orte, weil der Eintragsknopf ihren Umfang nennt: "Kiez, 4
   * Orte, 1 ausgeblendet".
   */
  render(groups: readonly Group[], locations: readonly Location[]): void {
    this.locations = locations;
    this.list.textContent = '';
    this.rows.clear();
    this.emptyLine.hidden = groups.length > 0;

    for (const group of groups) {
      this.list.append(this.buildRow(group));
    }
    // Der Bestand im offenen Dialog wird hier bewusst **nicht** mitgezogen:
    // Ein Dialog ist modal, die Orte koennen sich also nur durch eine Handlung
    // in ihm aendern - und die zieht ihn ueber reportMemberAdded() bzw.
    // reportMemberRemoved() genau einmal nach, mitsamt Fokus.
  }

  /**
   * Nach dem Hinzufuegen: Rad zurueck auf "Ort waehlen", Bestand nachziehen.
   *
   * Die Meldung geht in die Statuszeile des Dialogs und **nicht** zusaetzlich
   * ueber den Announcer: Sonst stuende dieselbe Information zweimal im Ohr.
   * Anders als bei der Gluehbirne liest sich hier kein Knopf selbst neu vor -
   * deshalb ueberhaupt eine Meldung (docs/design.md 6.6).
   */
  reportMemberAdded(group: Group, location: Location): void {
    this.editing = group;
    this.renderMembers();
    setText(this.editFeedback, `${location.name} hinzugefuegt.`);

    if (!this.picker.hidden) {
      this.picker.focus();
      return;
    }
    // Alle Orte sind jetzt Mitglied, das Rad ist weg: Der Fokus landet auf dem
    // Muelleimer des eben aufgenommenen Ortes.
    const index = this.callbacks
      .membersOf(group)
      .findIndex((member) => member.id === location.id);
    (this.memberButtons[index] ?? this.cancelEdit).focus();
  }

  /**
   * Nach dem Entfernen: Fokus auf den Muelleimer des nachgerueckten Ortes.
   *
   * Aufraeumen ist eine Reihenhandlung - dasselbe Argument, mit dem die
   * Gluehbirne in der Zeile steht und nicht im Dialog (docs/design.md 6.5).
   * War es das letzte Mitglied, bleibt das Auswahlrad; fehlt auch das, ist
   * "Abbrechen" der letzte sichere Halt.
   */
  reportMemberRemoved(group: Group, location: Location): void {
    this.editing = group;
    this.renderMembers();
    setText(this.editFeedback, `${location.name} entfernt.`);

    const next =
      this.memberButtons[Math.min(this.removedIndex, this.memberButtons.length - 1)];
    if (next !== undefined) {
      next.focus();
    } else if (!this.picker.hidden) {
      this.picker.focus();
    } else {
      this.cancelEdit.focus();
    }
  }

  /** Nach dem Anlegen: Dialog zu, Bestaetigung ins Panel, Fokus auf die Gruppe. */
  reportCreated(group: Group): void {
    this.closeDialogs();
    this.reportInPanel(`${group.name} angelegt.`);
    this.focusEntry(group.id);
  }

  reportRenamed(group: Group): void {
    this.closeDialogs();
    this.reportInPanel(`Gruppe heisst jetzt ${group.name}.`);
    this.focusEntry(group.id);
  }

  /**
   * Nach dem Loeschen: beide Dialoge zu, Bestaetigung ins Panel.
   *
   * Der Fokus kann nicht zurueck zum Oeffner - der Listeneintrag, von dem der
   * Weg ausging, existiert nicht mehr. Das Plus ist die naechste sinnvolle
   * Handlung und steht direkt neben der Ueberschrift.
   */
  reportRemoved(): void {
    const name = this.editing?.name ?? 'Die Gruppe';
    this.closeDialogs();
    this.reportInPanel(`${name} geloescht.`);
    this.addButton.focus();
  }

  reportFailure(reason: GroupFailure): void {
    this.report(GROUP_ERROR[reason]);
  }

  /**
   * Zieht genau eine Zeile nach, nachdem eine Gruppe umgeschaltet wurde.
   *
   * Kein render(), keine Ansage: Der Fokus steht auf der Gluehbirne, und die
   * traegt ihren neuen Namen selbst vor - ein zweiter Ruf ueber den Announcer
   * waere dieselbe Information ein zweites Mal (docs/design.md 6.5).
   *
   * Nachgezogen wird die Birne **und** der Eintragsknopf: Dessen Zahlen aendern
   * sich mit, und ein Rueckwaertswisch darauf muss die Wahrheit finden.
   */
  applyGroupHidden(group: Group): void {
    const row = this.rows.get(group.id);
    if (row === undefined) {
      return;
    }
    row.group = group;

    // **Alle** Zeilen, nicht nur die geschaltete: Ein Ort darf in mehreren
    // Gruppen stehen, und sein hidden aendert die Zahlen ueberall dort mit.
    // Nachgezogen wird dabei nur der Inhalt bestehender Knoten - kein Knoten
    // wird ersetzt, der Fokus bleibt also auf der Birne stehen
    // (docs/design.md 9).
    for (const other of this.rows.values()) {
      other.members = this.callbacks.membersOf(other.group);
      this.dressRow(other);
    }
  }

  /** Kein Schreibfehler wird geschluckt - ohne Backend gibt es keine zweite Kopie. */
  reportStorageError(message: string): void {
    this.report(message);
  }

  private buildRow(group: Group): HTMLLIElement {
    const entry = el('button', { type: 'button', class: 'entry' }) as HTMLButtonElement;
    entry.addEventListener('click', () => {
      // Der Stand kommt aus der Zeile, nicht aus dieser Schliessung: Nach dem
      // Umbenennen haelt die Zeile den neuen Namen.
      const current = this.rows.get(group.id);
      this.openEdit(current?.group ?? group, entry);
    });

    const members = this.callbacks.membersOf(group);
    // Eine leere Gruppe bekommt keine Birne: Es gibt nichts zu schalten, und
    // ein toter Knopf im Wischweg kostet eine Station fuer nichts.
    const toggle =
      members.length === 0
        ? null
        : (el('button', { type: 'button', class: 'icon-button' }) as HTMLButtonElement);
    toggle?.addEventListener('click', () => {
      // Der Zustand kommt aus der Zeile, nicht aus dieser Schliessung: Nach dem
      // ersten Umschalten haelt die Zeile den neuen Stand, die Schliessung den
      // alten - der Knopf klemmte sonst nach dem zweiten Tippen fest.
      const current = this.rows.get(group.id);
      if (current !== undefined) {
        this.callbacks.onToggleGroupHidden(group.id, anyVisible(current.members));
      }
    });

    const row: Row = { entry, toggle, group, members };
    this.dressRow(row);
    this.rows.set(group.id, row);

    // Name links, Gluehbirne rechts - im DOM in dieser Reihenfolge, damit der
    // Wischweg erst die Gruppe nennt und dann, was mit ihr zu tun ist.
    return el('li', {}, [
      el('div', { class: 'entry-row' }, toggle === null ? [entry] : [entry, toggle]),
    ]) as HTMLLIElement;
  }

  /**
   * Beschriftet Eintragsknopf und Birne aus dem Stand der Zeile.
   *
   * Die Birne leuchtet, sobald **mindestens ein** Mitglied sichtbar ist - dann
   * bewirkt ein Tipp das Ausblenden. Sind alle dunkel, ist sie dunkel und
   * blendet ein. Wie beim einzelnen Ort sagt der Knopf, was der Tipp bewirkt,
   * nicht in welchem Zustand er ist (docs/design.md 6.5).
   */
  private dressRow(row: Row): void {
    setText(
      row.entry,
      formatGroupEntryLabel(
        row.group.name,
        row.members.length,
        row.members.filter((member) => member.hidden).length,
      ),
    );

    if (row.toggle === null) {
      return;
    }
    const visible = anyVisible(row.members);
    setButtonLabel(
      row.toggle,
      `${row.group.name} ${visible ? 'ausblenden' : 'einblenden'}`,
      visible ? ICON_BULB_ON : ICON_BULB_OFF,
    );
    row.toggle.classList.toggle('bulb-off', !visible);
  }

  private openCreate(): void {
    this.createName.value = '';
    setText(this.createFeedback, '');
    this.createDialog.open(this.addButton, this.createName);
  }

  private openEdit(group: Group, opener: HTMLElement): void {
    this.editing = group;
    this.editDialog.setTitle(group.name);
    this.editName.value = group.name;
    setText(this.editFeedback, '');
    this.renderMembers();
    this.editDialog.open(opener, this.editName);
  }

  /**
   * Baut Auswahlrad und Bestandsliste des Bearbeiten-Dialogs neu.
   *
   * Rad zum Hinzufuegen, Liste zum Entfernen: Hinzufuegen waehlt aus vielen
   * aus - dafuer ist das Rad da; Entfernen zielt auf einen bestimmten Eintrag,
   * und dafuer braucht es ihn in der Liste (docs/design.md 6.6).
   */
  private renderMembers(): void {
    const group = this.editing;
    if (group === null) {
      return;
    }

    const members = this.callbacks.membersOf(group);
    const memberIds = new Set(members.map((member) => member.id));
    const candidates = this.locations.filter((location) => !memberIds.has(location.id));

    this.renderPicker(candidates);

    setText(
      this.membersHeading,
      members.length === 0
        ? 'Noch kein Ort in dieser Gruppe.'
        : `${members.length} ${members.length === 1 ? 'Ort' : 'Orte'} in dieser Gruppe:`,
    );

    this.membersList.textContent = '';
    this.memberButtons = [];
    for (const member of members) {
      this.membersList.append(this.buildMemberRow(group, member));
    }
  }

  private renderPicker(candidates: readonly Location[]): void {
    // Gibt es nichts auszuwaehlen, faellt das Rad weg statt leer im Wischweg
    // zu liegen - ein Rad ohne Auswahl ist ein toter Knopf.
    const empty = candidates.length === 0;
    this.pickerLabel.hidden = empty;
    this.picker.hidden = empty;
    this.pickerHint.hidden = !empty;

    setText(
      this.pickerHint,
      this.locations.length === 0
        ? 'Noch keine Orte gespeichert.'
        : 'Alle gespeicherten Orte sind schon in dieser Gruppe.',
    );

    this.picker.replaceChildren(
      // Die Vorgabeoption traegt keinen Ort: Ohne sie waere der erste Ort der
      // Liste schon ausgewaehlt, und ein Tipp auf "Fertig" fuegte ihn ein,
      // ohne dass jemand ihn gewaehlt haette.
      el('option', { value: '', text: 'Ort waehlen' }),
      ...candidates.map((location) => el('option', { value: location.id, text: location.name })),
    );
    this.picker.value = '';
  }

  private buildMemberRow(group: Group, member: Location): HTMLLIElement {
    const name = el('span', { class: 'entry-name', text: member.name });

    const remove = el('button', { type: 'button', class: 'icon-button' }) as HTMLButtonElement;
    // Nennt Ort **und** Gruppe: Der Knopf steht in einem Dialog, dessen Titel
    // beim Wischen laengst vorbei ist.
    setButtonLabel(remove, `${member.name} aus ${group.name} entfernen`, ICON_TRASH);
    remove.addEventListener('click', () => {
      // Die Position vor dem Neuaufbau merken - danach ist die Zeile weg, und
      // der Fokus soll auf dem nachgerueckten Ort landen.
      this.removedIndex = this.memberButtons.indexOf(remove);
      this.callbacks.onRemoveMember(group.id, member.id);
    });

    this.memberButtons.push(remove);

    return el('li', {}, [el('div', { class: 'entry-row' }, [name, remove])]) as HTMLLIElement;
  }

  private openDelete(): void {
    const editing = this.editing;
    if (editing === null) {
      return;
    }
    const members = this.callbacks.membersOf(editing);
    this.deleteDialog.setTitle(`${editing.name} loeschen?`);
    setText(
      this.deleteHint,
      formatDeleteGroupWarning(
        members.length,
        members.filter((member) => member.hidden).length,
      ),
    );
    setText(this.deleteFeedback, '');
    // Fokus auf "Abbrechen": Ohne Backend ist ein Fehlgriff endgueltig
    // (docs/design.md 7), also ist der sichere Weg der voreingestellte.
    this.deleteDialog.open(this.deleteButton, this.deleteCancel);
  }

  /**
   * Meldet in die Zeile des obersten offenen Dialogs, sonst in die des Panels.
   *
   * Der Loeschen-Dialog liegt ueber dem Bearbeiten-Dialog; darunter waere die
   * Meldung verdeckt.
   */
  private report(text: string): void {
    let line = this.feedback;
    if (this.createDialog.isOpen) {
      line = this.createFeedback;
    }
    if (this.editDialog.isOpen) {
      line = this.editFeedback;
    }
    if (this.deleteDialog.isOpen) {
      line = this.deleteFeedback;
    }
    setText(line, text);
    this.announcer.announce(text);
  }

  private reportInPanel(text: string): void {
    setText(this.feedback, text);
    this.announcer.announce(text);
  }

  /** Schliesst ohne Fokusrueckgabe - der Aufrufer setzt den Fokus selbst. */
  private closeDialogs(): void {
    this.editing = null;
    this.deleteDialog.closeKeepingFocus();
    this.editDialog.closeKeepingFocus();
    this.createDialog.closeKeepingFocus();
  }

  private focusEntry(id: string): void {
    this.rows.get(id)?.entry.focus();
  }
}

/** Mindestens ein Mitglied ist sichtbar - dann blendet ein Tipp aus. */
function anyVisible(members: readonly Location[]): boolean {
  return members.some((member) => !member.hidden);
}
