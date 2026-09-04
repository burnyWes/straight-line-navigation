/**
 * Orte-Bereich: anlegen, umbenennen, loeschen.
 */

import { el, setText } from './dom.js';
import type { Announcer } from './announcer.js';
import type { Location } from '../domain/location.js';
import type { CoordinateParseFailure } from '../domain/coordinateParser.js';
import { formatSaveConfirmation } from './format.js';

/** Gruende, aus denen ein Ort nicht angelegt werden kann. */
type SaveFailure = CoordinateParseFailure | 'name-required' | 'position-stale';

const PARSE_ERROR: Record<SaveFailure, string> = {
  empty: 'Bitte eine Koordinate eingeben.',
  'shortlink-unresolvable':
    'Kurzlinks lassen sich nicht auswerten. Den Link zuerst in der Karten-App oeffnen und die Koordinate kopieren.',
  'no-coordinate-found': 'Darin war keine Koordinate zu finden.',
  'out-of-range': 'Diese Koordinate liegt ausserhalb des gueltigen Bereichs.',
  'name-required': 'Bitte einen Namen eingeben.',
  'position-stale':
    'Der Standort ist veraltet. Kurz warten, bis das Geraet wieder misst, dann erneut speichern.',
};

export interface LocationsViewCallbacks {
  onSaveHere(name: string): void;
  onSaveText(name: string, text: string): void;
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  suggestName(): string;
}

export class LocationsView {
  readonly panel: HTMLElement;

  private readonly nameInput: HTMLInputElement;
  private readonly coordinateInput: HTMLInputElement;
  private readonly feedback: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly emptyLine: HTMLElement;
  private pendingDelete: string | null = null;

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

    const suggest = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Namen vorschlagen',
    }) as HTMLButtonElement;
    suggest.addEventListener('click', () => {
      this.nameInput.value = this.callbacks.suggestName();
      this.announcer.announce(`Vorschlag: ${this.nameInput.value}`);
    });

    this.feedback = el('p', { class: 'status', role: 'status' });
    this.list = el('ul', { class: 'entries', 'aria-label': 'Gespeicherte Orte' }) as HTMLUListElement;
    this.emptyLine = el('p', { class: 'status', text: 'Noch keine Orte gespeichert.' });

    this.panel = el('section', { class: 'panel' }, [
      el('h2', { text: 'Orte' }),
      el('h3', { text: 'Neuen Ort anlegen' }),
      el('label', { for: 'ort-name', text: 'Name' }),
      this.nameInput,
      suggest,
      saveHere,
      el('label', { for: 'ort-koordinate', text: 'Koordinate einfuegen' }),
      this.coordinateInput,
      saveText,
      this.feedback,
      el('h3', { text: 'Gespeicherte Orte' }),
      this.emptyLine,
      this.list,
    ]);
  }

  reportSaved(location: Location): void {
    const text = formatSaveConfirmation(location.name, location.accuracyMetres);
    setText(this.feedback, text);
    this.announcer.announce(text);
    this.nameInput.value = '';
    this.coordinateInput.value = '';
  }

  reportFailure(reason: SaveFailure): void {
    const text = PARSE_ERROR[reason];
    setText(this.feedback, text);
    this.announcer.announce(text);
  }

  /** Assertiv, weil ein nicht gespeicherter Ort verloren ist, sobald man weiterklickt. */
  reportStorageError(message: string): void {
    setText(this.feedback, message);
    this.announcer.announce(message);
  }

  render(locations: readonly Location[]): void {
    this.list.textContent = '';
    this.emptyLine.hidden = locations.length > 0;

    for (const location of locations) {
      this.list.append(this.buildRow(location));
    }
  }

  private buildRow(location: Location): HTMLLIElement {
    const title = el('span', { class: 'entry-name', text: location.name });

    const rename = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Umbenennen',
      'aria-label': `${location.name} umbenennen`,
    }) as HTMLButtonElement;
    rename.addEventListener('click', () => {
      this.startRename(location);
    });

    // Zweistufiges Loeschen statt Systemdialog: Ein zweiter Tipp auf denselben
    // Knopf bestaetigt, ein Tipp woanders bricht ab.
    const remove = el('button', {
      type: 'button',
      class: 'danger',
      text: 'Loeschen',
      'aria-label': `${location.name} loeschen`,
    }) as HTMLButtonElement;
    remove.addEventListener('click', () => {
      if (this.pendingDelete === location.id) {
        this.pendingDelete = null;
        this.callbacks.onRemove(location.id);
        this.announcer.announce(`${location.name} geloescht.`);
        return;
      }
      this.pendingDelete = location.id;
      setText(remove, 'Wirklich loeschen?');
      remove.setAttribute('aria-label', `${location.name} wirklich loeschen? Nochmal tippen zum Bestaetigen.`);
      this.announcer.announce('Nochmal tippen zum Bestaetigen.');
    });

    return el('li', {}, [title, rename, remove]) as HTMLLIElement;
  }

  private startRename(location: Location): void {
    this.nameInput.value = location.name;
    this.nameInput.focus();
    const commit = el('button', {
      type: 'button',
      class: 'primary',
      text: `Umbenennung von ${location.name} bestaetigen`,
    }) as HTMLButtonElement;
    commit.addEventListener('click', () => {
      this.callbacks.onRename(location.id, this.nameInput.value);
      commit.remove();
    });
    this.feedback.after(commit);
    this.announcer.announce(`Name von ${location.name} bearbeiten.`);
  }

  private currentName(): string {
    return this.nameInput.value;
  }
}
