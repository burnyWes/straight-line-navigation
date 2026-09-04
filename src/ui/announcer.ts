/**
 * Ansagen ueber eine aria-live-Region.
 *
 * Der einzige Kanal, der auch bei gestelltem Lautlos-Schalter traegt (M2 in
 * docs/design.md 11) - deshalb laeuft hier alles Wesentliche.
 */

import { el } from './dom.js';

export class Announcer {
  readonly element: HTMLElement;

  constructor(politeness: 'polite' | 'assertive' = 'polite') {
    this.element = el('div', {
      'aria-live': politeness,
      'aria-atomic': 'true',
      role: 'status',
      class: 'visually-hidden',
    });
  }

  announce(text: string): void {
    // Erst leeren: Ein unveraenderter Textinhalt loest bei manchen
    // Screenreadern keine erneute Ansage aus.
    this.element.textContent = '';
    // Ein Tick Abstand, damit der Screenreader die Aenderung als neu erkennt.
    window.setTimeout(() => {
      this.element.textContent = text;
    }, 50);
  }
}
