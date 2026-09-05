/**
 * Modale Dialoge.
 *
 * Natives `<dialog>` mit `showModal()`, keine selbst gebaute Fokusfalle: Der
 * Browser setzt den Hintergrund inert, haelt den Fokus im Dialog und behandelt
 * Escape. Nachgebaut waere das ein Dutzend Zeilen, die mit VoiceOver jedes Mal
 * anders brechen. Safari kann `<dialog>` seit 15.4, auf dem Zielgeraet also
 * vorhanden.
 *
 * Was der Browser **nicht** uebernimmt, ist die Fokusrueckgabe an den Oeffner -
 * die haengt hier am `close`-Ereignis, damit sie auch bei Escape greift.
 */

import { el, setText } from './dom.js';

export class ModalDialog {
  readonly element: HTMLDialogElement;

  private readonly heading: HTMLElement;
  private opener: HTMLElement | null = null;

  constructor(id: string, title: string, body: readonly Node[]) {
    this.heading = el('h2', { id: `${id}-titel`, text: title });

    this.element = el(
      'dialog',
      {
        id,
        class: 'sheet',
        // Der Dialog traegt den Namen seiner Ueberschrift, statt ihn zu
        // wiederholen - VoiceOver sagt ihn beim Oeffnen einmal an.
        'aria-labelledby': `${id}-titel`,
      },
      [this.heading, ...body],
    );

    this.element.addEventListener('close', () => {
      const opener = this.opener;
      this.opener = null;
      opener?.focus();
    });
  }

  get isOpen(): boolean {
    return this.element.open;
  }

  /** Oeffnet modal; der Fokus landet auf `initialFocus`. */
  open(opener: HTMLElement, initialFocus: HTMLElement): void {
    this.opener = opener;
    this.element.showModal();
    initialFocus.focus();
  }

  /** Schliesst und gibt den Fokus an den Oeffner zurueck - auch bei Escape. */
  close(): void {
    this.element.close();
  }

  /**
   * Schliesst, ohne den Fokus zu setzen - der Aufrufer uebernimmt ihn.
   *
   * Noetig nach jedem Speichern: Das folgende Neu-Rendern ersetzt den Knopf,
   * der den Dialog geoeffnet hat. Der Fokus gehoerte danach einem Knoten, der
   * nicht mehr im Baum haengt.
   */
  closeKeepingFocus(): void {
    this.opener = null;
    this.element.close();
  }

  setTitle(text: string): void {
    setText(this.heading, text);
  }
}
