/**
 * Orte-Bereich: anlegen, umbenennen, loeschen.
 *
 * Das Panel besteht nur aus Kopf, Meldungszeile und Liste. Anlegen liegt hinter
 * dem Plus im Kopf, Bearbeiten und Loeschen hinter dem Listeneintrag - alles
 * drei in modalen Dialogen (docs/design.md 6.4). Solange ein Dialog offen ist,
 * gehoert jede Meldung in den Dialog - die Zeile des Panels waere hinter dem
 * Hintergrund weder zu sehen noch zu erswipen.
 */

import {
  el,
  setText,
  icon,
  setButtonLabel,
  ICON_PLUS,
  ICON_BULB_ON,
  ICON_BULB_OFF,
} from './dom.js';
import { ModalDialog } from './dialog.js';
import type { Announcer } from './announcer.js';
import type { Location } from '../domain/location.js';
import type { CoordinateParseFailure } from '../domain/coordinateParser.js';
import { formatLocationDetails, formatSaveConfirmation } from './format.js';

/** Gruende, aus denen ein Ort nicht angelegt werden kann. */
type SaveFailure = CoordinateParseFailure | 'name-required' | 'no-position' | 'position-stale';

const PARSE_ERROR: Record<SaveFailure, string> = {
  empty: 'Bitte eine Koordinate eingeben.',
  'shortlink-unresolvable':
    'Kurzlinks lassen sich nicht auswerten. Den Link zuerst in der Karten-App oeffnen und die Koordinate kopieren.',
  'no-coordinate-found': 'Darin war keine Koordinate zu finden.',
  'out-of-range': 'Diese Koordinate liegt ausserhalb des gueltigen Bereichs.',
  'name-required': 'Bitte einen Namen eingeben.',
  // Eigener Grund statt 'no-coordinate-found': Der Satz dort spricht vom
  // Koordinatenfeld und passt nicht, wenn nur die Navigation nicht laeuft.
  'no-position': 'Kein Standort verfuegbar. Zuerst die Navigation starten.',
  'position-stale':
    'Der Standort ist veraltet. Kurz warten, bis das Geraet wieder misst, dann erneut speichern.',
};

export interface LocationsViewCallbacks {
  onSaveHere(name: string): void;
  onSaveText(name: string, text: string): void;
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  onToggleHidden(id: string, hidden: boolean): void;
  suggestName(): string;
}

/**
 * Eine Zeile der Liste.
 *
 * Beide Knoepfe werden festgehalten, nicht nur der Namensknopf: Das Umschalten
 * aendert genau eine Zeile, statt die Liste neu zu bauen. Ein neu gebauter
 * Knopf naehme den Fokus mit, und der steht beim Umschalten genau darauf
 * (docs/design.md 9).
 */
interface Row {
  readonly entry: HTMLButtonElement;
  readonly toggle: HTMLButtonElement;
  location: Location;
}

export class LocationsView {
  readonly panel: HTMLElement;

  private readonly nameInput: HTMLInputElement;
  private readonly coordinateInput: HTMLInputElement;
  private readonly feedback: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly emptyLine: HTMLElement;
  private readonly hiddenHint: HTMLElement;
  /** Zeile je Ort, damit der Fokus nach dem Rendern gezielt landen kann. */
  private readonly rows = new Map<string, Row>();

  private readonly addButton: HTMLButtonElement;
  private readonly createDialog: ModalDialog;
  private readonly createFeedback: HTMLElement;

  private readonly editDialog: ModalDialog;
  private readonly editDetails: HTMLElement;
  private readonly editName: HTMLInputElement;
  private readonly editFeedback: HTMLElement;
  private readonly deleteButton: HTMLButtonElement;

  private readonly deleteDialog: ModalDialog;
  private readonly deleteCancel: HTMLButtonElement;
  private readonly deleteFeedback: HTMLElement;

  /** Ort, der gerade im Bearbeiten-Dialog steht. */
  private editing: Location | null = null;

  constructor(
    private readonly announcer: Announcer,
    private readonly callbacks: LocationsViewCallbacks,
  ) {
    this.nameInput = el('input', {
      type: 'text',
      id: 'ort-name',
      autocomplete: 'off',
      enterkeyhint: 'done',
    }) as HTMLInputElement;

    this.coordinateInput = el('input', {
      type: 'text',
      id: 'ort-koordinate',
      autocomplete: 'off',
      // Kein Tippen von Ziffern: Der uebliche Weg ist Einfuegen aus der
      // Karten-App (docs/design.md 6.2).
      placeholder: '52.516275, 13.377704',
    }) as HTMLInputElement;

    const saveHere = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Aktuellen Standort speichern',
    }) as HTMLButtonElement;
    saveHere.addEventListener('click', () => {
      this.callbacks.onSaveHere(this.currentName());
    });

    const saveText = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Koordinate speichern',
    }) as HTMLButtonElement;
    saveText.addEventListener('click', () => {
      this.callbacks.onSaveText(this.currentName(), this.coordinateInput.value);
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

    this.createDialog = new ModalDialog('ort-neu', 'Neuen Ort anlegen', [
      el('label', { for: 'ort-name', text: 'Name' }),
      this.nameInput,
      // Bleibt sichtbar, auch wenn kein Fix vorliegt, und nennt dann den Grund:
      // Ein fehlender Knopf ist mit VoiceOver schwerer zu deuten als einer, der
      // sich erklaert.
      saveHere,
      el('label', { for: 'ort-koordinate', text: 'Koordinate einfuegen' }),
      this.coordinateInput,
      saveText,
      this.createFeedback,
      cancelCreate,
    ]);

    this.addButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button primary',
        'aria-label': 'Neuen Ort anlegen',
        title: 'Neuen Ort anlegen',
      },
      [icon(ICON_PLUS)],
    ) as HTMLButtonElement;
    this.addButton.addEventListener('click', () => {
      this.openCreate();
    });

    this.feedback = el('p', { class: 'status', role: 'status' });
    this.list = el('ul', { class: 'entries', 'aria-label': 'Gespeicherte Orte' }) as HTMLUListElement;
    this.emptyLine = el('p', { class: 'status', text: 'Noch keine Orte gespeichert.' });

    // Bewusst **ohne** role="status": Sonst spraeche die Zeile bei jedem
    // Umschalten mit, und der Knopf sagt seinen neuen Namen ohnehin schon.
    // Sie existiert, weil ein stillschweigend gefiltertes Ziel in einer
    // Audio-App nicht bemerkbar ist - dieselbe Sorge, die die Maximalentfernung
    // standardmaessig unbegrenzt laesst (docs/design.md 6.5).
    this.hiddenHint = el('p', { class: 'hint' });
    this.hiddenHint.hidden = true;

    // --- Bearbeiten-Dialog ---------------------------------------------------

    this.editDetails = el('p', { class: 'hint' });

    this.editName = el('input', {
      type: 'text',
      id: 'ort-bearbeiten-name',
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

    const cancelEdit = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Abbrechen',
    }) as HTMLButtonElement;
    // Der Weg ohne Tastatur: Escape leistet dasselbe, aber am iPhone ist keine da.
    cancelEdit.addEventListener('click', () => {
      this.editDialog.close();
    });

    this.editFeedback = el('p', { class: 'status', role: 'status' });

    this.editDialog = new ModalDialog('ort-bearbeiten', 'Ort bearbeiten', [
      this.editDetails,
      el('label', { for: 'ort-bearbeiten-name', text: 'Name' }),
      this.editName,
      saveName,
      this.deleteButton,
      cancelEdit,
      this.editFeedback,
    ]);

    // --- Bestaetigung vor dem Loeschen ---------------------------------------

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

    this.deleteDialog = new ModalDialog('ort-loeschen', 'Ort loeschen?', [
      el('p', {
        class: 'hint',
        text: 'Der Ort wird endgueltig entfernt. Es gibt keine zweite Kopie.',
      }),
      confirmDelete,
      this.deleteCancel,
      this.deleteFeedback,
    ]);

    // Die Dialoge haengen im Panel. Unkritisch, weil ein modaler Dialog den
    // Bereichswechsel blockiert: Es kann nie einer offen sein, waehrend das
    // Panel ueber hidden aus dem Baum genommen wird.
    this.panel = el('section', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', { text: 'Orte' }), this.addButton]),
      this.feedback,
      this.emptyLine,
      this.hiddenHint,
      this.list,
      this.createDialog.element,
      this.editDialog.element,
      this.deleteDialog.element,
    ]);
  }

  reportSaved(location: Location): void {
    // Erst schliessen, dann melden: Die Bestaetigung gehoert ins Panel, weil
    // der Dialog, in dem sie entstand, gleich verschwindet.
    this.closeDialogs();
    const text = formatSaveConfirmation(location.name, location.accuracyMetres);
    setText(this.feedback, text);
    this.announcer.announce(text);
    this.focusEntry(location.id);
  }

  /**
   * Nach dem Loeschen: beide Dialoge zu, Bestaetigung ins Panel.
   *
   * Der Fokus kann nicht zurueck zum Oeffner - der Listeneintrag, von dem der
   * Weg ausging, existiert nicht mehr.
   */
  reportRemoved(): void {
    const name = this.editing?.name ?? 'Der Ort';
    this.closeDialogs();
    const text = `${name} geloescht.`;
    setText(this.feedback, text);
    this.announcer.announce(text);
    // Nicht auf das Panel: Das Plus ist die naechste sinnvolle Handlung und
    // steht direkt neben der Ueberschrift.
    this.addButton.focus();
  }

  reportFailure(reason: SaveFailure): void {
    this.report(PARSE_ERROR[reason]);
  }

  /** Assertiv, weil ein nicht gespeicherter Ort verloren ist, sobald man weiterklickt. */
  reportStorageError(message: string): void {
    this.report(message);
  }

  render(locations: readonly Location[]): void {
    this.list.textContent = '';
    this.rows.clear();
    this.emptyLine.hidden = locations.length > 0;

    for (const location of locations) {
      this.list.append(this.buildRow(location));
    }
    this.renderHiddenHint();
  }

  /**
   * Zieht genau eine Zeile nach, nachdem ihr Ausblenden umgeschaltet wurde.
   *
   * Kein render(), keine Ansage: Der Fokus steht auf dem Gluehbirnen-Knopf, und
   * der traegt seinen neuen Namen selbst vor. Ein zweiter Ruf ueber den
   * Announcer waere dieselbe Information ein zweites Mal (docs/design.md 6.5).
   */
  applyHidden(location: Location): void {
    const row = this.rows.get(location.id);
    if (row === undefined) {
      return;
    }
    row.location = location;
    this.dressToggle(row);
    this.renderHiddenHint();
  }

  private buildRow(location: Location): HTMLLIElement {
    // Nur der Name, kein Zusatz: VoiceOver soll den Eintrag als Knopf mit genau
    // diesem Namen ansagen. Alles Weitere steht im Dialog dahinter.
    const entry = el('button', {
      type: 'button',
      class: 'entry',
      text: location.name,
    }) as HTMLButtonElement;
    entry.addEventListener('click', () => {
      this.openEdit(location, entry);
    });

    const toggle = el('button', { type: 'button', class: 'icon-button' }) as HTMLButtonElement;
    toggle.addEventListener('click', () => {
      // Der Zustand kommt aus der Zeile, nicht aus dieser Schliessung: Nach dem
      // ersten Umschalten haelt die Zeile den neuen Stand, die Schliessung den
      // alten - der Knopf klemmte sonst nach dem zweiten Tippen fest.
      const current = this.rows.get(location.id);
      if (current !== undefined) {
        this.callbacks.onToggleHidden(location.id, !current.location.hidden);
      }
    });

    const row: Row = { entry, toggle, location };
    this.dressToggle(row);
    this.rows.set(location.id, row);

    // Name links, Gluehbirne rechts - im DOM in dieser Reihenfolge, damit der
    // Wischweg erst den Ort nennt und dann, was mit ihm zu tun ist.
    return el('li', {}, [el('div', { class: 'entry-row' }, [entry, toggle])]) as HTMLLIElement;
  }

  /**
   * Der Knopf sagt, was der Tipp bewirkt - nicht, in welchem Zustand er ist.
   *
   * "Ausgewaehlt" ueber aria-pressed muesste gedeutet werden; "einblenden"
   * nennt Zustand und naechsten Schritt in einem Wort. Dasselbe Muster faehrt
   * der Anhalten-Knopf im Bereich Navigation.
   */
  private dressToggle(row: Row): void {
    const hidden = row.location.hidden;
    setButtonLabel(
      row.toggle,
      `${row.location.name} ${hidden ? 'einblenden' : 'ausblenden'}`,
      hidden ? ICON_BULB_OFF : ICON_BULB_ON,
    );
    row.toggle.classList.toggle('bulb-off', hidden);
  }

  /** Sagt, dass etwas fehlt - sonst waere die kuerzere Kegel-Liste nicht erklaerbar. */
  private renderHiddenHint(): void {
    const total = this.rows.size;
    const hidden = [...this.rows.values()].filter((row) => row.location.hidden).length;

    setText(
      this.hiddenHint,
      hidden === 0 ? '' : `${hidden} von ${total} Orten sind ausgeblendet.`,
    );
    // Bei null Ausgeblendeten gar nicht erst im Wischweg liegen.
    this.hiddenHint.hidden = hidden === 0;
  }

  /**
   * Der Namensvorschlag steht beim Oeffnen im Feld, statt hinter einem Knopf.
   *
   * Ein Name ist Pflicht (docs/design.md 6); im Stehen soll dafuer nichts
   * getippt werden muessen. Ueberschreiben geht trotzdem.
   */
  private openCreate(): void {
    this.nameInput.value = this.callbacks.suggestName();
    this.coordinateInput.value = '';
    setText(this.createFeedback, '');
    this.createDialog.open(this.addButton, this.nameInput);
  }

  private openEdit(location: Location, opener: HTMLElement): void {
    this.editing = location;
    this.editDialog.setTitle(location.name);
    setText(this.editDetails, formatLocationDetails(location));
    this.editName.value = location.name;
    setText(this.editFeedback, '');
    this.editDialog.open(opener, this.editName);
  }

  private openDelete(): void {
    const editing = this.editing;
    if (editing === null) {
      return;
    }
    this.deleteDialog.setTitle(`${editing.name} loeschen?`);
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

  private currentName(): string {
    return this.nameInput.value;
  }
}
