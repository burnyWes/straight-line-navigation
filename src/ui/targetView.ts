/**
 * Betriebsart "Ziel": ein gewaehlter Ort, eine Peilzeile, ein Kreisbild.
 *
 * Die Orientierungsseite beantwortet "was ist da?", diese Seite beantwortet
 * "wo ist **das**?" - und sie beantwortet es ohne Sprache und ohne Wischen,
 * waehrend beide Haende und die Aufmerksamkeit beim Gehen sind
 * (docs/design.md 4.7).
 */

import {
  el,
  icon,
  setButtonLabel,
  setHidden,
  setText,
  ICON_LIST,
  ICON_SPEAKER_OFF,
  ICON_SPEAKER_ON,
} from './dom.js';
import { Dial } from './dial.js';
import { formatBearingLabel } from './format.js';
import type { GuidanceSnapshot } from '../application/guidanceService.js';
import type { Location } from '../domain/location.js';

const PICKER_ID = 'ziel-waehlen';

export interface TargetViewCallbacks {
  /** Leerer Wert im Rad bedeutet "kein Ziel". */
  onSelectTarget(id: string | null): void;
  /** Zurueck zur Betriebsart "Orientierung". */
  onSwitchMode(): void;
  /** Der Zielton wurde ein- oder ausgeschaltet. */
  onToggleTone(on: boolean): void;
}

export class TargetView {
  /** Zielrad, Hinweiszeile und Peilzeile - im Fluss, unter der Ueberschrift. */
  readonly element: HTMLElement;
  /** Schwebt unten links; im DOM hinter dem Bild, wie im Wischweg gewollt. */
  readonly modeButton: HTMLButtonElement;
  /** Schwebt unten rechts, an der Stelle des Anhalten-Knopfes. */
  readonly toneButton: HTMLButtonElement;

  private readonly pickerLabel: HTMLLabelElement;
  private readonly picker: HTMLSelectElement;
  private readonly hint: HTMLElement;
  private readonly bearing: HTMLButtonElement;
  private readonly dial: Dial;

  private bearingLabel = '';
  private locationCount = 0;
  private selectedId: string | null = null;
  private toneOn = false;

  constructor(private readonly callbacks: TargetViewCallbacks) {
    this.pickerLabel = el('label', { for: PICKER_ID, text: 'Ziel' }) as HTMLLabelElement;

    // Der Knoten wird einmal angelegt; getauscht werden nur seine Optionen.
    // Nach der Wahl steht der Fokus weiter auf dem Rad, und ein neu gebautes
    // naehme ihn mit (docs/design.md 9, groupsView.ts).
    this.picker = el('select', { id: PICKER_ID, class: 'target-picker' }) as HTMLSelectElement;
    this.picker.addEventListener('change', () => {
      const value = this.picker.value;
      this.callbacks.onSelectTarget(value.length === 0 ? null : value);
    });

    // Eine Zeile fuer zwei Luecken: Sie steht an der Stelle des Rades, wenn es
    // keine Orte gibt, und an der Stelle der Peilzeile, wenn keine Peilung
    // vorliegt. Beide Male ist der Grund die Nachricht, nicht die Stille.
    this.hint = el('p', { class: 'hint' });

    // Ein echter Button, obwohl nichts passiert, wenn man ihn drueckt: Nur
    // fokussierbare Elemente nimmt der VoiceOver-Cursor als eigene Station
    // (navigationView.ts). Die Zusage einer Listenzeile, unter dem Finger
    // stehen zu bleiben, gilt hier aber ausdruecklich **nicht** - siehe
    // render().
    this.bearing = el('button', {
      type: 'button',
      class: 'entry target-bearing',
    }) as HTMLButtonElement;
    this.bearing.hidden = true;

    // Zwischen Peilzeile und Moduswechsel. Fuer VoiceOver ist es keine
    // Station - der Wischweg geht von der Peilzeile direkt auf den Knopf.
    this.dial = new Dial();

    this.element = el('div', { class: 'target' }, [
      this.pickerLabel,
      this.picker,
      this.hint,
      this.bearing,
      this.dial.element,
    ]);

    // Zwei Knoten fuer einen Wechsel - der zweite steht in der
    // Orientierungsansicht. Ein einzelner koennte nur an einer der beiden
    // richtigen Stellen im Wischweg stehen (docs/design.md 4.7).
    this.modeButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button floating floating-left',
        'aria-label': 'Zur Orientierung wechseln',
        title: 'Zur Orientierung wechseln',
      },
      [icon(ICON_LIST)],
    ) as HTMLButtonElement;
    this.modeButton.addEventListener('click', () => {
      this.callbacks.onSwitchMode();
    });

    // Kein aria-pressed und keine zusaetzliche Ansage: Der Name sagt, was der
    // Tipp **bewirkt**, und der Knopf liest seinen neuen Namen selbst vor -
    // dieselbe Regel wie bei der Gluehbirne (docs/design.md 6.5).
    this.toneButton = el(
      'button',
      {
        type: 'button',
        class: 'icon-button floating floating-right',
        'aria-label': 'Ton einschalten',
        title: 'Ton einschalten',
      },
      [icon(ICON_SPEAKER_OFF)],
    ) as HTMLButtonElement;
    this.toneButton.addEventListener('click', () => {
      this.callbacks.onToggleTone(!this.toneOn);
    });
  }

  /** Haelt Name und Symbol des Tonknopfes am gemeldeten Zustand. */
  setToneState(on: boolean): void {
    if (on === this.toneOn) {
      return;
    }
    this.toneOn = on;
    setButtonLabel(
      this.toneButton,
      on ? 'Ton ausschalten' : 'Ton einschalten',
      on ? ICON_SPEAKER_ON : ICON_SPEAKER_OFF,
    );
  }

  /**
   * Fuellt das Rad mit **allen** gespeicherten Orten, auch ausgeblendeten.
   *
   * `hidden` ist eine Regel ueber den Kegel, nicht ueber den Willen
   * (docs/design.md 6.5): Das geparkte Auto blendet man aus, damit es tagsueber
   * nicht toent - und will abends genau dorthin.
   */
  renderTargets(locations: readonly Location[], selectedId: string | null): void {
    this.locationCount = locations.length;

    // Gibt es nichts auszuwaehlen, faellt das Rad weg statt leer im Wischweg zu
    // liegen - ein Rad ohne Auswahl ist ein toter Knopf (groupsView.ts).
    const empty = locations.length === 0;
    setHidden(this.pickerLabel, empty);
    setHidden(this.picker, empty);

    this.picker.replaceChildren(
      // Ohne Vorgabeoption waere der erste Ort schon gewaehlt, und ein Tipp auf
      // "Fertig" machte ihn zum Ziel, ohne dass jemand ihn gewaehlt haette.
      el('option', { value: '', text: 'Ziel wählen' }),
      ...locations.map((location) => el('option', { value: location.id, text: location.name })),
    );
    // Eine Kennung ohne Option faellt hier still auf "" zurueck. Genau deshalb
    // wird der gemerkte Stand **danach** aus dem Rad gelesen und nicht aus dem
    // Argument: Ein geloeschtes Ziel meldet sich so als "kein Ziel gewaehlt"
    // statt als "warte auf Peilung" (docs/design.md 6.6).
    this.picker.value = selectedId ?? '';
    this.selectedId = this.picker.value.length === 0 ? null : this.picker.value;

    this.renderHint();
  }

  render(snapshot: GuidanceSnapshot): void {
    const entry = snapshot.entry;
    setHidden(this.bearing, entry === null);
    this.dial.render(
      entry?.offsetDeg ?? null,
      snapshot.target?.name ?? '',
      entry?.displayDistanceMetres ?? 0,
    );

    if (entry === null) {
      this.bearingLabel = '';
      this.renderHint();
      return;
    }

    this.renderHint();

    const label = formatBearingLabel(entry.offsetDeg, entry.displayDistanceMetres);
    if (label === this.bearingLabel) {
      return;
    }

    // Sie wird **auch** unter dem Finger neu beschriftet - anders als eine
    // Listenzeile (docs/design.md 4.3). Dort ist das Neubeschriften eine
    // Stoerung: Man wischt durch viele Zeilen, und eine, die sich mitten im
    // Satz aendert, reisst den Faden ab. Hier ist es der Zweck: Es gibt genau
    // eine Zeile, und man laesst den Finger auf ihr liegen, **um** die Richtung
    // beim Drehen mitlaufen zu hoeren. Die Rundung auf fuenf Grad haelt die
    // Zahl dabei ruhig genug (Praxistest, docs/design.md 4.7).
    this.bearing.textContent = label;
    this.bearingLabel = label;
  }

  /** Vergisst die gehaltene Beschriftung - jeder Lauf beginnt ohne Peilung. */
  reset(): void {
    this.bearingLabel = '';
    this.bearing.textContent = '';
    setHidden(this.bearing, true);
    this.dial.render(null, '', 0);
    this.renderHint();
  }

  private renderHint(): void {
    setHidden(this.hint, !this.bearing.hidden);
    setText(this.hint, this.hintText());
  }

  private hintText(): string {
    if (this.locationCount === 0) {
      return 'Noch keine Orte gespeichert.';
    }
    if (this.selectedId === null) {
      return 'Noch kein Ziel gewählt.';
    }
    // Gewaehlt, aber noch nichts gemessen. Warum, steht in der Statuszeile am
    // unteren Rand - hier stuende es ein zweites Mal.
    return 'Noch keine Peilung.';
  }
}
