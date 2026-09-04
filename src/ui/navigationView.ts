/**
 * Navigationsbereich: Kegel-Liste, Auto-Freeze, Gueteanzeige.
 */

import { el, setText } from './dom.js';
import { formatDistance, formatEntryLabel } from './format.js';
import type { Announcer } from './announcer.js';
import type { NavigationEntry, NavigationSnapshot } from '../application/navigationService.js';
import type { HeadingQuality } from '../domain/headingQuality.js';

const QUALITY_TEXT: Record<HeadingQuality, string> = {
  gut: 'Kompass in Ordnung',
  ungenau: 'Kompass ungenau. Die Auswahl der Orte ist unzuverlaessig, die Entfernungen stimmen.',
  unkalibriert: 'Kompass unkalibriert. Das Geraet einmal in einer Acht durchdrehen.',
  unbekannt: 'Kompassguete unbekannt',
};

interface Row {
  readonly item: HTMLLIElement;
  readonly button: HTMLButtonElement;
  label: string;
}

export interface NavigationViewCallbacks {
  onStart(): void;
  onStop(): void;
  onFreezeChange(frozen: boolean): void;
}

export class NavigationView {
  readonly panel: HTMLElement;

  private readonly startButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly freezeButton: HTMLButtonElement;
  private readonly statusLine: HTMLElement;
  private readonly qualityLine: HTMLElement;
  private readonly emptyLine: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly rows = new Map<string, Row>();

  private manualFreeze = false;
  private focusFreeze = false;
  private running = false;

  constructor(
    private readonly announcer: Announcer,
    private readonly callbacks: NavigationViewCallbacks,
  ) {
    this.startButton = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Navigation starten',
    }) as HTMLButtonElement;

    // iOS gibt den Kompass erst nach einer echten Beruehrung frei - die App
    // kann nicht von selbst loslaufen (docs/design.md 5).
    this.startButton.addEventListener('click', () => {
      this.callbacks.onStart();
    });

    // Ohne Gegenstueck liefe die Bildschirmsperre bis zum Schliessen der App
    // weiter und zoege dabei Akku.
    this.stopButton = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Navigation beenden',
      hidden: true,
    }) as HTMLButtonElement;
    this.stopButton.addEventListener('click', () => {
      this.callbacks.onStop();
    });

    this.statusLine = el('p', { class: 'status', text: 'Noch nicht gestartet.' });
    this.qualityLine = el('p', { class: 'status' });
    this.emptyLine = el('p', {
      class: 'status',
      text: 'Nichts in Sichtrichtung.',
      hidden: true,
    });

    this.freezeButton = el('button', {
      type: 'button',
      class: 'secondary',
      'aria-pressed': 'false',
      text: 'Liste anhalten',
    }) as HTMLButtonElement;

    this.freezeButton.addEventListener('click', () => {
      this.manualFreeze = !this.manualFreeze;
      this.freezeButton.setAttribute('aria-pressed', String(this.manualFreeze));
      setText(this.freezeButton, this.manualFreeze ? 'Liste fortsetzen' : 'Liste anhalten');
      this.announcer.announce(this.manualFreeze ? 'angehalten' : 'aktualisiert');
      this.syncFreeze();
    });

    this.list = el('ul', { class: 'entries', 'aria-label': 'Orte in Sichtrichtung' }) as HTMLUListElement;

    // Auto-Freeze: Solange der Fokus in der Liste steht, darf sie sich nicht
    // umsortieren - sonst laeuft sie unter dem Finger weg.
    this.list.addEventListener('focusin', () => {
      if (!this.focusFreeze) {
        this.focusFreeze = true;
        this.announcer.announce('angehalten');
        this.syncFreeze();
      }
    });
    this.list.addEventListener('focusout', (event) => {
      const next = (event as FocusEvent).relatedTarget;
      if (next instanceof Node && this.list.contains(next)) {
        return;
      }
      if (this.focusFreeze) {
        this.focusFreeze = false;
        this.announcer.announce('aktualisiert');
        this.syncFreeze();
      }
    });

    this.panel = el('section', { class: 'panel' }, [
      el('h2', { text: 'Navigation' }),
      this.startButton,
      this.stopButton,
      this.statusLine,
      this.qualityLine,
      this.freezeButton,
      this.emptyLine,
      this.list,
    ]);

    this.freezeButton.hidden = true;
    this.list.hidden = true;
  }

  markRunning(): void {
    this.running = true;
    this.startButton.hidden = true;
    this.stopButton.hidden = false;
    this.freezeButton.hidden = false;
    this.list.hidden = false;
    setText(this.statusLine, 'Warte auf Standort und Kompass.');
  }

  markStopped(): void {
    this.running = false;
    this.startButton.hidden = false;
    this.stopButton.hidden = true;
    this.freezeButton.hidden = true;
    this.list.hidden = true;
    this.list.textContent = '';
    this.rows.clear();
    this.emptyLine.hidden = true;
    setText(this.statusLine, 'Navigation beendet.');
    setText(this.qualityLine, '');
    // Fokus auf den Startknopf, damit er nicht ins Leere faellt.
    this.startButton.focus();
  }

  showError(message: string): void {
    setText(this.statusLine, message);
    this.announcer.announce(message);
  }

  showQuality(quality: HeadingQuality, announce: boolean): void {
    const text = QUALITY_TEXT[quality];
    setText(this.qualityLine, text);
    if (announce) {
      this.announcer.announce(text);
    }
  }

  render(snapshot: NavigationSnapshot): void {
    if (!this.running) {
      return;
    }
    setText(this.statusLine, snapshot.frozen ? 'Liste angehalten.' : 'Navigation laeuft.');

    const wanted = snapshot.entries.map((entry) => entry.location.id);
    this.dropRemoved(new Set(wanted));

    snapshot.entries.forEach((entry) => {
      this.upsert(entry, snapshot.frozen);
    });

    // In gewuenschter Reihenfolge anhaengen. appendChild verschiebt einen
    // bestehenden Knoten, statt ihn zu ersetzen - der Fokus bleibt erhalten.
    for (const id of wanted) {
      const row = this.rows.get(id);
      if (row !== undefined) {
        this.list.append(row.item);
      }
    }

    this.emptyLine.hidden = snapshot.entries.length > 0;
  }

  private dropRemoved(wanted: ReadonlySet<string>): void {
    for (const [id, row] of this.rows) {
      if (!wanted.has(id)) {
        row.item.remove();
        this.rows.delete(id);
      }
    }
  }

  private upsert(entry: NavigationEntry, frozen: boolean): void {
    const id = entry.location.id;
    let row = this.rows.get(id);

    if (row === undefined) {
      // Ein echter Button, nicht nur ein Listeneintrag: Nur fokussierbare
      // Elemente erzeugen die focus-Ereignisse, an denen das Auto-Freeze haengt.
      const button = el('button', { type: 'button', class: 'entry' }) as HTMLButtonElement;
      const item = el('li', {}, [button]) as HTMLLIElement;
      row = { item, button, label: '' };
      this.rows.set(id, row);
    }

    const label = formatEntryLabel(entry.location.name, entry.displayDistanceMetres);
    if (label === row.label) {
      return;
    }

    // Den Eintrag unter dem Finger nicht neu beschriften: Aendert sich der
    // Name eines fokussierten Elements, liest VoiceOver ihn mitten im Satz neu
    // vor. Die uebrigen Zeilen duerfen sich still aktualisieren.
    if (frozen && document.activeElement === row.button) {
      return;
    }

    row.button.textContent = label;
    row.button.setAttribute(
      'aria-label',
      `${entry.location.name}, ${formatDistance(entry.displayDistanceMetres)}`,
    );
    row.label = label;
  }

  private syncFreeze(): void {
    this.callbacks.onFreezeChange(this.manualFreeze || this.focusFreeze);
  }
}
