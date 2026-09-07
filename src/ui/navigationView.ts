/**
 * Navigationsbereich: Kegel-Liste, Anhalten-Knopf, Gueteanzeige.
 */

import {
  el,
  setText,
  setHidden,
  icon,
  setButtonLabel,
  ICON_PLAY,
  ICON_STOP,
  ICON_PAUSE,
  ICON_TARGET,
} from './dom.js';
import { formatDistance, formatEntryLabel } from './format.js';
import type { Announcer } from './announcer.js';
import type { TargetView } from './targetView.js';
import type { NavigationEntry, NavigationSnapshot } from '../application/navigationService.js';
import type { HeadingQuality } from '../domain/headingQuality.js';

/**
 * Zwei Betriebsarten eines Bereichs.
 *
 * Der Tab heisst weiterhin "Navigation" - er ist die meistgehoerte Station und
 * wird nicht angefasst. Haetten Tab und Betriebsart denselben Namen, waere mit
 * VoiceOver nicht zu unterscheiden, was gemeint ist (docs/design.md 4.7).
 */
export type NavigationMode = 'orientation' | 'target';

/**
 * Die h2 traegt den Namen der Betriebsart, nicht den des Bereichs.
 *
 * Sie sagte bisher dasselbe wie der Tab darueber und war damit ein Wisch ohne
 * Aussage; jetzt ist sie die Bestaetigung des Wechsels.
 */
const MODE_HEADING: Record<NavigationMode, string> = {
  orientation: 'Orientierung',
  target: 'Ziel',
};

const QUALITY_TEXT: Record<HeadingQuality, string> = {
  gut: 'Kompass in Ordnung',
  ungenau: 'Kompass ungenau. Die Auswahl der Orte ist unzuverlaessig, die Entfernungen stimmen.',
  unkalibriert: 'Kompass unkalibriert. Das Geraet einmal in einer Acht durchdrehen.',
  unbekannt: 'Kompassguete unbekannt',
};

/**
 * Was der veraltete Standort in der jeweiligen Betriebsart bedeutet.
 *
 * In "Orientierung" steht die Liste still, in "Ziel" schweigt der Ton - zwei
 * Saetze, weil es zwei verschiedene Nachrichten sind (docs/design.md 4.6).
 */
const STALE_STATUS: Record<NavigationMode, string> = {
  orientation: 'Standort veraltet. Die Liste ist angehalten.',
  target: 'Standort veraltet. Der Ton schweigt.',
};

const STALE_ANNOUNCEMENT: Record<NavigationMode, string> = {
  orientation:
    'Standort veraltet. Die Entfernungen stammen von der letzten Messung und die Liste steht still.',
  target:
    'Standort veraltet. Die Entfernung stammt von der letzten Messung und der Ton schweigt.',
};

const FRESH_ANNOUNCEMENT: Record<NavigationMode, string> = {
  orientation: 'Standort wieder da. Die Liste laeuft.',
  target: 'Standort wieder da. Der Ton laeuft.',
};

/**
 * Was in der Statuszeile steht, in der Reihenfolge der Dringlichkeit.
 *
 * Eine gemeldete Stoerung nennt den Grund und steht deshalb vorn; ohne sie
 * bleibt der veraltete Standort die wichtigste Aussage. Erst danach kommt, ob
 * die Liste angehalten ist. Frueher schrieb der Render hier unbedingt
 * "Navigation laeuft." - und wischte damit jede Fehlermeldung im naechsten
 * Bild wieder weg.
 *
 * In "Ziel" faellt der Rang "Liste angehalten" weg: Dort steht die Liste immer,
 * und eine Zeile, die nie etwas anderes sagt, ist keine Auskunft.
 */
function statusText(
  snapshot: NavigationSnapshot,
  problem: string | null,
  mode: NavigationMode,
): string {
  if (problem !== null) {
    return problem;
  }
  if (snapshot.positionStale) {
    return STALE_STATUS[mode];
  }
  if (mode === 'target') {
    return 'Navigation laeuft.';
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
  /** Die Betriebsart hat gewechselt - Signalkanaele und Ton haengen daran. */
  onModeChange(mode: NavigationMode): void;
}

export class NavigationView {
  readonly panel: HTMLElement;

  private readonly heading: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly freezeButton: HTMLButtonElement;
  /** Der Weg **hin** zur Zielseite; das Gegenstueck haelt die TargetView. */
  private readonly targetModeButton: HTMLButtonElement;
  private readonly statusLine: HTMLElement;
  private readonly qualityLine: HTMLElement;
  private readonly emptyLine: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly list: HTMLUListElement;
  /** Festgehalten, damit ihn die Speicherbereinigung nicht einsammelt. */
  private footObserver: ResizeObserver | null = null;
  private readonly rows = new Map<string, Row>();

  private manualFreeze = false;
  private tabFreeze = false;
  /**
   * In "Ziel" haelt die Liste an - aus demselben Grund wie beim
   * Bereichswechsel (docs/design.md Entscheidung 27): Sie wird dort weder
   * gesehen noch erswiped, und beim Zurueckkommen soll sie nicht in voellig
   * anderer Reihenfolge stehen. Der Kegel selbst rechnet weiter.
   */
  private modeFreeze = false;
  private running = false;
  private mode: NavigationMode = 'orientation';
  /** Ob die Kegel-Liste zuletzt etwas enthielt - Grundlage fuer die Leerzeile. */
  private hasEntries = false;
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
    private readonly targetView: TargetView,
    private readonly callbacks: NavigationViewCallbacks,
  ) {
    // tabindex="-1", damit setMode() den Fokus hierher setzen kann: Nach dem
    // Wechsel ist "Ziel, Ueberschrift" die Bestaetigung, und eine zusaetzliche
    // Ansage waere derselbe doppelte Kanal, den docs/design.md 6.5 vermeidet.
    this.heading = el('h2', { text: MODE_HEADING.orientation, tabindex: '-1' });

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

    // Symbol ohne Text, schwebend rechts unten dicht ueber der Statusleiste -
    // im Gehen mit dem Daumen erreichbar. Im DOM steht der Knopf trotzdem
    // **vor** der Liste: VoiceOver wischt in DOM-Reihenfolge, dahinter laege er
    // hinter allen Eintraegen.
    this.freezeButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button floating floating-right',
        'aria-pressed': 'false',
        'aria-label': 'Liste anhalten',
        title: 'Liste anhalten',
      },
      [icon(ICON_PAUSE)],
    ) as HTMLButtonElement;

    this.freezeButton.addEventListener('click', () => {
      this.manualFreeze = !this.manualFreeze;
      this.showFreezeState(this.manualFreeze);
      this.announcer.announce(this.manualFreeze ? 'angehalten' : 'aktualisiert');
      this.syncFreeze();
    });

    // Die Liste haelt **nur** auf ausdrueckliche Anweisung an. Frueher fror
    // schon der Fokus sie ein: Der VoiceOver-Cursor setzte sich auf eine Zeile,
    // die Liste stand, und beim Weiterwischen sagte sie abwechselnd
    // "angehalten" und "aktualisiert" - stoerender als die Umsortierung, gegen
    // die es half. Wer eine stehende Liste will, drueckt den Knopf unten rechts.
    this.list = el('ul', { class: 'entries', 'aria-label': 'Orte in Sichtrichtung' }) as HTMLUListElement;

    // Status und Kompassguete stehen am unteren Bildrand und bleiben dort
    // stehen, egal wie weit die Liste gescrollt ist - Gegenstueck zur
    // angehefteten Tab-Leiste oben. Im DOM stehen sie trotzdem **hinter** der
    // Liste: VoiceOver wischt in DOM-Reihenfolge, und wer navigiert, will die
    // Orte hoeren, nicht jedes Mal zwei Zeilen Zustand davor. Gesagt wird
    // ohnehin nur der Wechsel; die Zeilen sind zum Nachschlagen da
    // (docs/design.md 4.6).
    // Der Weg zur Zielseite. Zwei Knoten fuer einen Wechsel: Auf der
    // Orientierungsseite gehoert er hinter den Anhalten-Knopf und **vor** die
    // Liste, auf der Zielseite hinter das Bild - ein einzelner Knoten koennte
    // nur an einer der beiden Stellen stehen (docs/design.md 4.7).
    this.targetModeButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button floating floating-left',
        'aria-label': 'Zum Ziel wechseln',
        title: 'Zum Ziel wechseln',
      },
      [icon(ICON_TARGET)],
    ) as HTMLButtonElement;
    this.targetModeButton.addEventListener('click', () => {
      this.setMode('target');
    });

    this.foot = el('div', { class: 'panel-foot' }, [this.statusLine, this.qualityLine]);

    // Eine DOM-Reihenfolge fuer beide Betriebsarten: Was zur anderen gehoert,
    // ist verborgen und faellt damit auch aus dem Wischweg. In "Orientierung"
    // bleibt der Weg genau der bisherige.
    this.panel = el('section', { class: 'panel panel-navigation' }, [
      el('div', { class: 'panel-head' }, [this.heading, this.startButton, this.stopButton]),
      this.freezeButton,
      this.targetModeButton,
      this.emptyLine,
      this.list,
      this.targetView.element,
      this.targetView.modeButton,
      this.targetView.toneButton,
      this.foot,
    ]);

    this.applyMode();
    this.trackFootHeight();
  }

  /**
   * Wechselt die Betriebsart.
   *
   * Ohne Ansage: Der Fokus springt auf die Ueberschrift, und "Ziel,
   * Ueberschrift" ist die Bestaetigung. Die Betriebsart wird bewusst **nicht**
   * gespeichert - die App startet immer in "Orientierung" (docs/design.md 4.7).
   */
  setMode(mode: NavigationMode): void {
    if (mode === this.mode) {
      return;
    }
    this.mode = mode;
    this.modeFreeze = mode === 'target';
    setText(this.heading, MODE_HEADING[mode]);
    this.applyMode();
    this.syncFreeze();
    this.callbacks.onModeChange(mode);
    this.heading.focus();
  }

  get currentMode(): NavigationMode {
    return this.mode;
  }

  /**
   * Haelt die Sichtbarkeit aller Bloecke an Betriebsart und Lauf.
   *
   * An einer Stelle und nicht verteilt: Sonst stuende in "Ziel" ein
   * funktionsloser Anhalten-Knopf unten rechts, sobald der Lauf startet.
   */
  private applyMode(): void {
    const target = this.mode === 'target';

    setHidden(this.targetModeButton, target);
    setHidden(this.targetView.modeButton, !target);
    // Das Zielrad bleibt sichtbar, auch wenn nichts laeuft: Gewaehlt wird vor
    // dem Start, nicht danach.
    setHidden(this.targetView.element, !target);

    // Der Anhalten-Knopf gehoert zur Liste, der Lautsprecher zum Ton: Beide
    // nur dort, wo sie etwas bewirken, und beide nur bei laufender Navigation.
    setHidden(this.freezeButton, target || !this.running);
    setHidden(this.targetView.toneButton, !target || !this.running);
    setHidden(this.list, target || !this.running);
    setHidden(this.emptyLine, target || !this.running || this.hasEntries);
  }

  /**
   * Meldet die Hoehe der angehefteten Statusleiste als `--foot-height` zurueck
   * ins Layout.
   *
   * Angeheftet liegt die Leiste ausserhalb des Flusses und schiebt nichts mehr
   * weg. Der letzte Listeneintrag und der schwebende Knopf brauchen darunter
   * aber genau so viel Platz, wie sie einnimmt - sonst liegt sie auf ihnen.
   * Ein fester Wert reichte nicht: Eine gemeldete Stoerung laeuft ueber mehrere
   * Zeilen, und die Schriftgroesse folgt der Systemeinstellung.
   */
  private trackFootHeight(): void {
    if (typeof ResizeObserver === 'undefined') {
      // Ohne Beobachter bleibt es beim Ruecksprungwert aus dem Stylesheet.
      return;
    }
    // Der Beobachter wird festgehalten, nicht nur erzeugt: Ohne Verweis haengt
    // seine Lebensdauer am Wohlwollen der Speicherbereinigung.
    this.footObserver = new ResizeObserver(() => {
      // Waehrend die App im Hintergrund liegt, liefert der Browser keine
      // Bilder und damit auch keine Meldung. Eine Hoehe von 0 stammt aus einem
      // verborgenen Bereich und wuerde die Leiste nur falsch einplanen.
      const height = this.foot.offsetHeight;
      if (height > 0) {
        this.panel.style.setProperty('--foot-height', `${height}px`);
      }
    });
    this.footObserver.observe(this.foot);
  }

  markRunning(): void {
    this.running = true;
    this.clearProblems();
    this.resetFreeze();
    this.hasEntries = false;
    setHidden(this.startButton, true);
    setHidden(this.stopButton, false);
    this.applyMode();
    setText(this.statusLine, 'Warte auf Standort und Kompass.');
  }

  markStopped(): void {
    this.running = false;
    this.clearProblems();
    this.resetFreeze();
    this.hasEntries = false;
    setHidden(this.startButton, false);
    setHidden(this.stopButton, true);
    this.list.textContent = '';
    this.rows.clear();
    this.targetView.reset();
    this.applyMode();
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

    setText(
      this.statusLine,
      statusText(snapshot, this.positionProblem ?? this.headingProblem, this.mode),
    );

    // Der Wechsel auf "veraltet" ist die eigentliche Nachricht: Ab hier stimmen
    // die Zahlen nicht mehr. Wer nur die Liste erswiped, wuerde ihn sonst nicht
    // bemerken - sie steht ja weiterhin da und klingt unveraendert plausibel.
    if (snapshot.positionStale !== this.stale) {
      this.stale = snapshot.positionStale;
      this.announcer.announce(
        this.stale ? STALE_ANNOUNCEMENT[this.mode] : FRESH_ANNOUNCEMENT[this.mode],
      );
    }

    // In "Ziel" steht die Liste ohnehin und ist verborgen. Sie trotzdem
    // fortzuschreiben kostete Arbeit an Knoten, die niemand liest - beim
    // Zurueckwechseln zieht sie das naechste Bild nach.
    if (this.mode === 'target') {
      return;
    }

    const wanted = snapshot.entries.map((entry) => entry.location.id);
    this.dropRemoved(new Set(wanted));

    snapshot.entries.forEach((entry) => {
      this.upsert(entry);
    });

    this.reorder(wanted);

    this.hasEntries = snapshot.entries.length > 0;
    setHidden(this.emptyLine, this.hasEntries);
  }

  /**
   * Bringt die Zeilen in die gewuenschte Reihenfolge und ruehrt dabei nur an,
   * was tatsaechlich falsch steht.
   *
   * Frueher hing der Render jede Zeile in jedem Bild neu an. `append`
   * verschiebt einen vorhandenen Knoten zwar, statt ihn zu ersetzen - es nimmt
   * ihn dafuer aber aus dem Dokument und setzt ihn wieder ein. Fuer VoiceOver
   * ist das eine neue Zeile: Wer den Finger auf einem Eintrag liegen liess,
   * bekam ihn im Sekundentakt erneut vorgelesen. Stimmt die Reihenfolge schon,
   * aendert sich am DOM jetzt gar nichts mehr.
   */
  private reorder(wanted: readonly string[]): void {
    // Wird die fokussierte Zeile verschoben, nimmt der Browser sie dabei kurz
    // aus dem Dokument - der Fokus faellt dann auf den Rumpf. Seit die Liste
    // unter dem Fokus weiterlaeuft, ist das der Normalfall und nicht mehr die
    // Ausnahme, also wird der Fokus hier gehalten: Sonst stuende der
    // VoiceOver-Cursor nach jeder Umsortierung wieder am Seitenanfang statt auf
    // dem Ort, den er gerade las.
    const focused = document.activeElement;
    const keepFocus = focused instanceof HTMLElement && this.list.contains(focused);

    let next: ChildNode | null = this.list.firstChild;
    for (const id of wanted) {
      const row = this.rows.get(id);
      if (row === undefined) {
        continue;
      }
      if (row.item === next) {
        next = row.item.nextSibling;
        continue;
      }
      this.list.insertBefore(row.item, next);
    }

    if (keepFocus && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
  }

  private dropRemoved(wanted: ReadonlySet<string>): void {
    for (const [id, row] of this.rows) {
      if (!wanted.has(id)) {
        row.item.remove();
        this.rows.delete(id);
      }
    }
  }

  private upsert(entry: NavigationEntry): void {
    const id = entry.location.id;
    let row = this.rows.get(id);

    if (row === undefined) {
      // Ein echter Button, nicht nur ein Listeneintrag: Nur fokussierbare
      // Elemente nimmt der VoiceOver-Cursor als eigene Station, und nur an
      // ihnen haengt die Zusage, dass die gelesene Zeile stehen bleibt.
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
    //
    // Bewusst ohne Bedingung auf das Einfrieren: Steht der Fokus in der Liste,
    // gilt die Zusage aus design.md 4.3 - die Zeile behaelt ihre Beschriftung,
    // bis der Fokus sie verlaesst. Hing das am Freeze-Zustand, las VoiceOver in
    // genau dem Bild neu vor, in dem das Einfrieren noch nicht durchgereicht
    // war.
    if (document.activeElement === row.button) {
      return;
    }

    row.button.textContent = label;
    row.button.setAttribute(
      'aria-label',
      `${entry.location.name}, ${formatDistance(entry.displayDistanceMetres)}`,
    );
    row.label = label;
  }

  /**
   * Setzt das Anhalten zurueck - jeder Lauf beginnt laufend.
   *
   * Frueher ueberlebte die Flagge das Beenden. Wer die Liste angehalten hatte,
   * startete den naechsten Lauf mit einem eingefrorenen Zustand, den der Dienst
   * nach seinem reset() gar nicht mehr kannte: Der naechste Griff zum Knopf fror
   * die noch leere Liste ein, und sie blieb leer. Zu hoeren waren nur noch die
   * Ein- und Austritts-Signale.
   */
  private resetFreeze(): void {
    this.manualFreeze = false;
    this.showFreezeState(false);
    this.syncFreeze();
  }

  /** Haelt Beschriftung und Zustand des Anhalten-Knopfes am gemeldeten Zustand. */
  private showFreezeState(frozen: boolean): void {
    if (this.freezeButton.getAttribute('aria-pressed') === String(frozen)) {
      return;
    }
    this.freezeButton.setAttribute('aria-pressed', String(frozen));
    setButtonLabel(
      this.freezeButton,
      frozen ? 'Liste fortsetzen' : 'Liste anhalten',
      frozen ? ICON_PLAY : ICON_PAUSE,
    );
  }

  private clearProblems(): void {
    this.positionProblem = null;
    this.headingProblem = null;
    this.stale = false;
  }

  private syncFreeze(): void {
    this.callbacks.onFreezeChange(this.manualFreeze || this.tabFreeze || this.modeFreeze);
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
