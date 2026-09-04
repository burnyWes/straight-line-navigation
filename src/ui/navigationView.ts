/**
 * Navigationsbereich: Kegel-Liste, Auto-Freeze, Gueteanzeige.
 */

import { el, setText, icon, ICON_PLAY, ICON_STOP, ICON_PAUSE } from './dom.js';
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

const STALE_STATUS = 'Standort veraltet. Die Liste ist angehalten.';
const STALE_ANNOUNCEMENT =
  'Standort veraltet. Die Entfernungen stammen von der letzten Messung und die Liste steht still.';

/**
 * Was in der Statuszeile steht, in der Reihenfolge der Dringlichkeit.
 *
 * Eine gemeldete Stoerung nennt den Grund und steht deshalb vorn; ohne sie
 * bleibt der veraltete Standort die wichtigste Aussage. Erst danach kommt, ob
 * die Liste angehalten ist. Frueher schrieb der Render hier unbedingt
 * "Navigation laeuft." - und wischte damit jede Fehlermeldung im naechsten
 * Bild wieder weg.
 */
function statusText(snapshot: NavigationSnapshot, problem: string | null): string {
  if (problem !== null) {
    return problem;
  }
  if (snapshot.positionStale) {
    return STALE_STATUS;
  }
  return snapshot.frozen ? 'Liste angehalten.' : 'Navigation laeuft.';
}

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
  private tabFreeze = false;
  private running = false;
  /**
   * Zuletzt gemeldete Stoerung je Kanal, oder null.
   *
   * Getrennt gehalten, weil sie getrennt vergehen: Ein Standortfehler
   * verschwindet mit dem naechsten Fix, ein Kompassfehler mit der naechsten
   * Messung. In einem gemeinsamen Feld loeschte der eine Kanal die Meldung des
   * anderen - Kompassereignisse kommen um ein Vielfaches haeufiger.
   */
  private positionProblem: string | null = null;
  private headingProblem: string | null = null;
  /** Zuletzt angezeigter Standort-Zustand - Grundlage fuer die Ansage des Wechsels. */
  private stale = false;

  constructor(
    private readonly announcer: Announcer,
    private readonly callbacks: NavigationViewCallbacks,
  ) {
    // Start und Stopp stehen als Symbol rechts neben der Ueberschrift, nicht
    // mehr bildschirmbreit darunter: Sie werden einmal pro Weg gedrueckt, die
    // Liste dagegen dauernd erswiped - sie soll frueh im Wischweg beginnen.
    this.startButton = headerButton('Navigation starten', ICON_PLAY, 'primary');

    // iOS gibt den Kompass erst nach einer echten Beruehrung frei - die App
    // kann nicht von selbst loslaufen (docs/design.md 5).
    this.startButton.addEventListener('click', () => {
      this.callbacks.onStart();
    });

    // Ohne Gegenstueck liefe die Bildschirmsperre bis zum Schliessen der App
    // weiter und zoege dabei Akku.
    this.stopButton = headerButton('Navigation beenden', ICON_STOP, 'secondary');
    this.stopButton.hidden = true;
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

    // Symbol ohne Text, schwebend unten rechts - im Gehen mit dem Daumen
    // erreichbar. Im DOM steht der Knopf trotzdem **vor** der Liste: VoiceOver
    // wischt in DOM-Reihenfolge, dahinter laege er hinter allen Eintraegen.
    this.freezeButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button freeze',
        'aria-pressed': 'false',
        'aria-label': 'Liste anhalten',
        title: 'Liste anhalten',
      },
      [icon(ICON_PAUSE)],
    ) as HTMLButtonElement;

    this.freezeButton.addEventListener('click', () => {
      this.manualFreeze = !this.manualFreeze;
      this.freezeButton.setAttribute('aria-pressed', String(this.manualFreeze));
      setButtonLabel(
        this.freezeButton,
        this.manualFreeze ? 'Liste fortsetzen' : 'Liste anhalten',
        this.manualFreeze ? ICON_PLAY : ICON_PAUSE,
      );
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

    this.panel = el('section', { class: 'panel panel-navigation' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: 'Navigation' }),
        this.startButton,
        this.stopButton,
      ]),
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
    this.clearProblems();
    this.startButton.hidden = true;
    this.stopButton.hidden = false;
    this.freezeButton.hidden = false;
    this.list.hidden = false;
    setText(this.statusLine, 'Warte auf Standort und Kompass.');
  }

  markStopped(): void {
    this.running = false;
    this.clearProblems();
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

  /**
   * Meldet, ob der Navigationsbereich gerade sichtbar ist.
   *
   * Ist er es nicht, haelt die Liste an: Sie wird dort weder gesehen noch
   * erswiped, und beim Zurueckkommen soll sie nicht in voellig anderer
   * Reihenfolge stehen. Sensoren und Signale laufen weiter - "Hier speichern"
   * im Bereich Orte braucht einen frischen Standort (docs/design.md 4.3).
   *
   * Bewusst ohne Ansage: Gemeldet wird das Anhalten nur dort, wo es die
   * gerade gelesene Liste betrifft.
   */
  setPanelActive(active: boolean): void {
    if (this.tabFreeze === !active) {
      return;
    }
    this.tabFreeze = !active;
    this.syncFreeze();
  }

  /**
   * Meldung, bevor der Lauf beginnt - etwa eine abgelehnte Berechtigung.
   *
   * Schreibt direkt in die Statuszeile: Solange nicht gestartet ist, rendert
   * niemand dagegen an.
   */
  showError(message: string): void {
    setText(this.statusLine, message);
    this.announcer.announce(message);
  }

  /**
   * Stoerung des Standorts, oder null, wenn wieder Fixe eintreffen.
   *
   * Angesagt wird nur der Wechsel. `watchPosition` meldet einen ausgefallenen
   * Standort im Sekundentakt erneut; wer das jedes Mal ansagt, macht die App
   * unbenutzbar - dieselbe Regel wie bei der Kompassguete (design.md 4.5).
   */
  setPositionProblem(message: string | null): void {
    if (message === this.positionProblem) {
      return;
    }
    this.positionProblem = message;
    if (message !== null) {
      this.announcer.announce(message);
    }
  }

  /** Stoerung des Kompasses, oder null bei der naechsten gueltigen Messung. */
  setHeadingProblem(message: string | null): void {
    if (message === this.headingProblem) {
      return;
    }
    this.headingProblem = message;
    if (message !== null) {
      this.announcer.announce(message);
    }
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
    setText(this.statusLine, statusText(snapshot, this.positionProblem ?? this.headingProblem));

    // Der Wechsel auf "veraltet" ist die eigentliche Nachricht: Ab hier stimmen
    // die Zahlen nicht mehr. Wer nur die Liste erswiped, wuerde ihn sonst nicht
    // bemerken - sie steht ja weiterhin da und klingt unveraendert plausibel.
    if (snapshot.positionStale !== this.stale) {
      this.stale = snapshot.positionStale;
      this.announcer.announce(
        this.stale ? STALE_ANNOUNCEMENT : 'Standort wieder da. Die Liste laeuft.',
      );
    }

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

  private clearProblems(): void {
    this.positionProblem = null;
    this.headingProblem = null;
    this.stale = false;
  }

  private syncFreeze(): void {
    this.callbacks.onFreezeChange(this.manualFreeze || this.focusFreeze || this.tabFreeze);
  }
}

/** Knopf ohne Beschriftung: Was er tut, steht im aria-label, nicht im Symbol. */
function headerButton(label: string, path: string, variant: string): HTMLButtonElement {
  return el(
    'button',
    {
      type: 'button',
      class: `icon-button ${variant}`,
      'aria-label': label,
      title: label,
    },
    [icon(path)],
  ) as HTMLButtonElement;
}

/** Name und Symbol gehoeren zusammen - sonst zeigt der Knopf etwas anderes, als er heisst. */
function setButtonLabel(button: HTMLButtonElement, label: string, path: string): void {
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.replaceChildren(icon(path));
}
