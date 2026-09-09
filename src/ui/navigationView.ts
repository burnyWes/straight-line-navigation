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
  ungenau: 'Kompass ungenau. Die Auswahl der Orte ist unzuverlässig, die Entfernungen stimmen.',
  unkalibriert: 'Kompass unkalibriert. Das Gerät einmal in einer Acht durchdrehen.',
  unbekannt: 'Kompassgüte unbekannt',
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
  orientation: 'Standort wieder da. Die Liste läuft.',
  target: 'Standort wieder da. Der Ton läuft.',
};

/** Rang 2: Der Kompass liefert nichts, und iOS wartet auf eine Beruehrung. */
const RELEASE_STATUS = 'Kompass noch nicht freigegeben. Den Knopf oben rechts tippen.';

/** Rang 4: Die Seite ortet schon, aber es ist noch nichts angekommen. */
const WAITING_STATUS = 'Warte auf Standort und Kompass.';

/**
 * Was in der Statuszeile steht, in der Reihenfolge der Dringlichkeit.
 *
 * Sie ist die einzige Beobachtungsflaeche dieser App - es gibt kein Logging und
 * keinen Knopfnamen mehr, der nebenbei "es laeuft" sagt (frueher hiess der
 * Knopf im Kopf "Navigation beenden" und war damit auch eine Auskunft). Deshalb
 * ist die Rangfolge Teil der Fachlichkeit und nicht Kosmetik:
 *
 * 1. eine gemeldete Stoerung nennt den Grund und steht vorn,
 * 2. die fehlende Kompass-Freigabe ist die einzige Stoerung, gegen die der
 *    Nutzer hier und jetzt etwas tun kann,
 * 3. ein veralteter Standort macht alle Zahlen fragwuerdig,
 * 4. ohne jede Messung ist "Navigation laeuft." eine Behauptung,
 * 5. erst danach kommt, ob die Liste angehalten ist.
 *
 * In "Ziel" faellt Rang 5 weg: Dort steht die Liste immer, und eine Zeile, die
 * nie etwas anderes sagt, ist keine Auskunft.
 *
 * `snapshot === null` heisst "noch keine Daten": Ohne Standort **und** Kompass
 * gibt es nichts zu rechnen, die Zeile muss trotzdem etwas sagen.
 */
function statusText(
  snapshot: NavigationSnapshot | null,
  problem: string | null,
  mode: NavigationMode,
  headingReleasePending: boolean,
): string {
  if (problem !== null) {
    return problem;
  }
  if (headingReleasePending) {
    return RELEASE_STATUS;
  }
  if (snapshot === null) {
    return WAITING_STATUS;
  }
  if (snapshot.positionStale) {
    return STALE_STATUS[mode];
  }
  if (mode === 'target') {
    return 'Navigation läuft.';
  }
  return snapshot.frozen ? 'Liste angehalten.' : 'Navigation läuft.';
}

interface Row {
  readonly item: HTMLLIElement;
  readonly button: HTMLButtonElement;
  label: string;
}

export interface NavigationViewCallbacks {
  /**
   * Der eine Tipp, den iOS technisch erzwingt.
   *
   * Kein Start: Geortet wird, weil die Seite offen ist. Freigegeben wird, weil
   * Apple es ohne Beruehrung nicht erlaubt (docs/design.md 5).
   */
  onReleaseHeading(): void;
  onFreezeChange(frozen: boolean): void;
  /** Die Betriebsart hat gewechselt - Signalkanaele und Ton haengen daran. */
  onModeChange(mode: NavigationMode): void;
}

export class NavigationView {
  readonly panel: HTMLElement;

  private readonly heading: HTMLElement;
  private readonly releaseButton: HTMLButtonElement;
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
  /**
   * In "Ziel" haelt die Liste an - aus demselben Grund wie beim
   * Bereichswechsel (docs/design.md Entscheidung 27): Sie wird dort weder
   * gesehen noch erswiped, und beim Zurueckkommen soll sie nicht in voellig
   * anderer Reihenfolge stehen. Der Kegel selbst rechnet weiter.
   */
  private modeFreeze = false;
  /** Die Navigationsseite ist offen und sichtbar - sie rechnet. */
  private active = false;
  /** Der Freigabe-Knopf steht im Kopf; Rang 2 der Statuszeile haengt daran. */
  private headingReleasePending = false;
  private mode: NavigationMode = 'orientation';
  /** Ob die Kegel-Liste zuletzt etwas enthielt - Grundlage fuer die Leerzeile. */
  private hasEntries = false;
  /** Ob Standort und Kompass beide vorliegen - Grundlage fuer Liste und Leerzeile. */
  private hasData = false;
  /**
   * Das naechste Bild uebernimmt den Standort-Zustand, ohne ihn anzusagen.
   *
   * Ein Tabwechsel ist eine Pause, keine Nachricht: Waehrend die Seite steht,
   * altert der letzte Fix, und beim Zurueckkommen kaemen sonst binnen einer
   * Sekunde "veraltet" und "wieder da" hintereinander (docs/design.md 4.6).
   */
  private silentResume = false;
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

    // An der Stelle, an der frueher Start und Stopp standen - und aus demselben
    // Grund dort: Er wird hoechstens einmal pro Sitzung gedrueckt, die Liste
    // dagegen dauernd erswiped und soll frueh im Wischweg beginnen.
    //
    // Von Anfang an verborgen: Ob er gebraucht wird, entscheidet sich durch
    // Zuhoeren - eine Sekunde ohne Kompassmessung -, nicht durch einen
    // ungefragten requestPermission()-Aufruf (docs/design.md 5).
    this.releaseButton = headerButton('Kompass freigeben', ICON_PLAY, 'primary');
    this.releaseButton.hidden = true;
    this.releaseButton.addEventListener('click', () => {
      this.callbacks.onReleaseHeading();
    });

    this.statusLine = el('p', { class: 'status', text: WAITING_STATUS });
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
      el('div', { class: 'panel-head' }, [this.heading, this.releaseButton]),
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
   * Haelt die Sichtbarkeit aller Bloecke an Betriebsart und Seitenzustand.
   *
   * An einer Stelle und nicht verteilt: Sonst stuende in "Ziel" ein
   * funktionsloser Anhalten-Knopf unten rechts.
   */
  private applyMode(): void {
    const target = this.mode === 'target';

    setHidden(this.targetModeButton, target);
    setHidden(this.targetView.modeButton, !target);
    // Das Zielrad bleibt sichtbar, auch ohne Daten: Gewaehlt wird, bevor etwas
    // gemessen ist.
    setHidden(this.targetView.element, !target);

    // Der Anhalten-Knopf gehoert zur Liste, der Lautsprecher zum Ton: Beide nur
    // dort, wo sie etwas bewirken. "Laufend" heisst jetzt "Seite offen".
    setHidden(this.freezeButton, target || !this.active);
    setHidden(this.targetView.toneButton, !target || !this.active);
    // Ohne Daten ist die Liste leer, und "Nichts in Sichtrichtung." waere dann
    // eine Behauptung ueber die Umgebung statt ueber den eigenen Zustand - das
    // sagt in diesem Fall die Statuszeile.
    setHidden(this.list, target || !this.active || !this.hasData);
    setHidden(this.emptyLine, target || !this.active || !this.hasData || this.hasEntries);
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

  /**
   * Meldet, ob die Navigationsseite gerade rechnet.
   *
   * Ein Bereichswechsel ist eine **Pause**, kein Ende: Die Zeilen bleiben
   * stehen, der Anhalten-Knopf behaelt seinen Zustand, die Betriebsart bleibt.
   * Nichts wird geleert und nichts angesagt - beim Zurueckkommen soll die Seite
   * genau so dastehen, wie sie verlassen wurde (docs/design.md 4.3).
   */
  setActive(active: boolean): void {
    if (active === this.active) {
      return;
    }
    this.active = active;
    if (active) {
      this.silentResume = true;
    }
    this.applyMode();
  }

  /**
   * Zeigt oder verbirgt den Knopf "Kompass freigeben".
   *
   * Beim Ausblenden nach erfolgter Freigabe wandert der Fokus auf die
   * Ueberschrift: Er stand auf einem Knopf, den es gleich nicht mehr gibt, und
   * fiele sonst auf den Rumpf - der VoiceOver-Cursor stuende danach wieder am
   * Seitenanfang statt am Anfang der Seite, die jetzt endlich laeuft.
   */
  showHeadingRelease(show: boolean): void {
    if (show === this.headingReleasePending) {
      return;
    }
    this.headingReleasePending = show;
    const hadFocus = document.activeElement === this.releaseButton;
    setHidden(this.releaseButton, !show);
    if (!show && hadFocus) {
      this.heading.focus();
    }
  }

  /**
   * Meldung aus einer Handlung heraus - etwa eine abgelehnte Freigabe.
   *
   * Wird wie eine gemeldete Stoerung gefuehrt und nicht nur in die Zeile
   * geschrieben: Seit die Seite ohne Knopfdruck rechnet, wischte das naechste
   * Bild sie sonst binnen einer Sekunde wieder weg. Die naechste gueltige
   * Messung loescht sie.
   *
   * Angesagt wird sie jedes Mal - anders als bei setHeadingProblem(): Wer den
   * Knopf ein zweites Mal tippt, hat eine Antwort verdient; ein Sensor, der
   * seinen Ausfall im Sekundentakt wiederholt, nicht.
   */
  showError(message: string): void {
    this.headingProblem = message;
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

  /**
   * Zeichnet ein Bild; `null` heisst "noch keine Daten".
   *
   * Ohne Standort **und** Kompass gibt es nichts zu rechnen - die Statuszeile
   * muss trotzdem geschrieben werden, sonst stuende beim ersten Oeffnen nichts
   * da, was die Wartezeit erklaert.
   */
  render(snapshot: NavigationSnapshot | null): void {
    if (!this.active) {
      return;
    }

    setText(
      this.statusLine,
      statusText(
        snapshot,
        this.positionProblem ?? this.headingProblem,
        this.mode,
        this.headingReleasePending,
      ),
    );

    if (this.hasData !== (snapshot !== null)) {
      this.hasData = snapshot !== null;
      this.applyMode();
    }

    if (snapshot === null) {
      return;
    }

    // Der Wechsel auf "veraltet" ist die eigentliche Nachricht: Ab hier stimmen
    // die Zahlen nicht mehr. Wer nur die Liste erswiped, wuerde ihn sonst nicht
    // bemerken - sie steht ja weiterhin da und klingt unveraendert plausibel.
    // Das erste Bild nach einer Pause uebernimmt den Zustand dagegen stumm.
    if (snapshot.positionStale !== this.stale) {
      this.stale = snapshot.positionStale;
      if (!this.silentResume) {
        this.announcer.announce(
          this.stale ? STALE_ANNOUNCEMENT[this.mode] : FRESH_ANNOUNCEMENT[this.mode],
        );
      }
    }
    this.silentResume = false;

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

  /**
   * Zwei Gruende halten die Liste an, nicht mehr drei.
   *
   * Der Bereichswechsel ist keiner mehr: Eine pausierte Seite rechnet nicht und
   * kann darum nichts umsortieren - genau davor schuetzte der dritte Grund
   * (docs/design.md 4.3).
   */
  private syncFreeze(): void {
    this.callbacks.onFreezeChange(this.manualFreeze || this.modeFreeze);
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
