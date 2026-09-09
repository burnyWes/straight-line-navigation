/**
 * Kleine DOM-Helfer.
 *
 * Kein Framework: Der VoiceOver-Fokus haengt an der Identitaet des DOM-Knotens.
 * Wird beim Neu-Rendern ein Listeneintrag durch ein neues Element ersetzt statt
 * aktualisiert, ist der Fokus weg - optisch unsichtbar, mit Screenreader fatal
 * (docs/design.md 9). Deshalb legen wir Knoten einmal an und aendern danach nur
 * noch ihren Inhalt.
 */

type Attributes = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) {
      continue;
    }
    if (name === 'text') {
      node.textContent = String(value);
    } else if (value === true) {
      node.setAttribute(name, '');
    } else {
      node.setAttribute(name, String(value));
    }
  }

  node.append(...children);
  return node;
}

/** Setzt Text nur, wenn er sich geaendert hat - jedes Schreiben kann eine Ansage ausloesen. */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/**
 * Schaltet die Sichtbarkeit nur, wenn sie sich aendert.
 *
 * Dasselbe Motiv wie bei setText(): Jedes Schreiben am DOM kann VoiceOver dazu
 * bringen, die Umgebung neu zu lesen - und diese Schalter laufen in Ansichten,
 * die einmal pro Sekunde gerendert werden.
 */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) {
    node.hidden = hidden;
  }
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Rein dekoratives Symbol fuer Knoepfe ohne Beschriftung.
 *
 * Der Name des Knopfes steht im aria-label, nie im Symbol: Ein SVG traegt fuer
 * VoiceOver keine Bedeutung und ist deshalb konsequent aria-hidden.
 */
export function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '26');
  svg.setAttribute('height', '26');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  // Ohne dies nimmt das SVG in aelteren Safaris den Tastaturfokus an.
  svg.setAttribute('focusable', 'false');

  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  return svg;
}

/**
 * Name und Symbol gehoeren zusammen - sonst zeigt der Knopf etwas anderes, als
 * er heisst.
 *
 * Geschrieben wird nur bei geaendertem Namen, aus demselben Grund wie bei
 * setText(): Solo zieht in einem Tipp bis zu dreissig Zeilen mit je zwei
 * Symbolknoepfen nach, und ohne den Riegel wuerde dabei jedes SVG neu gebaut.
 * Sicher, weil es keine Aufrufstelle gibt, an der der Name gleich bleibt und
 * nur der Symbolpfad wechselt: Ueberall haengen Name und Symbol an derselben
 * Bedingung.
 */
export function setButtonLabel(button: HTMLButtonElement, label: string, path: string): void {
  if (button.getAttribute('aria-label') === label) {
    return;
  }
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.replaceChildren(icon(path));
}

export const ICON_PLAY = 'M8 5l12 7-12 7z';
export const ICON_STOP = 'M6 6h12v12H6z';
export const ICON_PAUSE = 'M7 5h4v14H7zm6 0h4v14h-4z';
export const ICON_PLUS = 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z';

/**
 * Gluehbirne ohne Strahlen: der Ort ist ausgeblendet.
 *
 * Von Hand geschrieben wie die uebrigen Symbole - drei Pfade rechtfertigen
 * keine Bildbibliothek (docs/design.md Entscheidung 25).
 */
export const ICON_BULB_OFF =
  'M12 3.5a5.5 5.5 0 0 0-3 10.1V16h6v-2.4a5.5 5.5 0 0 0-3-10.1zM9 17h6v1.8H9zm1.2 2.6h3.6v1.6h-3.6z';

/**
 * Dieselbe Birne mit Strahlen: der Ort wird navigiert.
 *
 * Bewusst aus ICON_BULB_OFF zusammengesetzt: Die Silhouette muss in beiden
 * Zustaenden dieselbe sein, sonst liest sich der Wechsel als anderes Symbol
 * statt als anderer Zustand.
 */
export const ICON_BULB_ON =
  `${ICON_BULB_OFF} M11.1 0h1.8v3h-1.8zM1.5 10.6h3.2v1.7H1.5zm17.8 0h3.2v1.7h-3.2z` +
  'M3.6 3.9l1.2-1.2 2.3 2.3-1.2 1.2zm13.4 1.1l2.3-2.3 1.2 1.2-2.3 2.3z';

/**
 * Muelleimer: Mitglied aus der Gruppe entfernen.
 *
 * Von Hand geschrieben wie die uebrigen Symbole (docs/design.md Entscheidung
 * 25): Deckel mit Griff, Korpus, zwei Rillen. Die Rillen sind nicht Zierde -
 * ohne sie ist der Korpus auf 26 Pixeln ein Trapez wie jedes andere.
 */
export const ICON_TRASH =
  'M10 2h4l1 2h4v2H5V4h4zM6.5 7h11l-1 13.2a1.8 1.8 0 0 1-1.8 1.8H9.3a1.8 1.8 0 0 1-1.8-1.8z' +
  // Die Rillen laufen gegen den Uhrzeigersinn, der Korpus mit ihm: Nur so
  // stanzt die Nonzero-Regel sie aus, statt sie mit ihm zu verschmelzen.
  'M10 9.5v9h1.5v-9zM12.5 9.5v9h1.5v-9z';

/**
 * Fadenkreuz: zur Betriebsart "Ziel" wechseln.
 *
 * Ein Ring mit vier Marken und einem Punkt in der Mitte - dasselbe Bild, das
 * die Zielseite gross zeichnet. Von Hand geschrieben wie die uebrigen Symbole
 * (docs/design.md Entscheidung 25). Der Ring ist ein Rechteck-Umriss aus zwei
 * gegenlaeufigen Kreisboegen: Die Nonzero-Regel stanzt den inneren aus.
 */
export const ICON_TARGET =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z' +
  'M11.1 0h1.8v5h-1.8zM11.1 19h1.8v5h-1.8zM0 11.1h5v1.8H0zM19 11.1h5v1.8h-5z' +
  'M12 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z';

/**
 * Drei Balken: zurueck zur Betriebsart "Orientierung".
 *
 * Die Kegel-Liste als Bild. Bewusst nicht dasselbe Symbol wie der Weg hin -
 * die beiden Knoepfe sind zwei Wege, kein Umschalter, und tragen deshalb
 * verschiedene Namen und verschiedene Symbole (docs/design.md 4.7).
 */
export const ICON_LIST = 'M4 6h16v2.6H4zm0 5.7h16v2.6H4zm0 5.7h16v2.6H4z';

/**
 * Lautsprecher ohne Wellen: der Zielton ist aus.
 *
 * Korpus und Trichter in einem Zug - von Hand geschrieben wie die uebrigen
 * Symbole (docs/design.md Entscheidung 25).
 */
export const ICON_SPEAKER_OFF = 'M3 9.2h4L12 4.6v14.8L7 14.8H3z';

/**
 * Derselbe Lautsprecher mit zwei Schallwellen: der Zielton laeuft.
 *
 * Bewusst aus ICON_SPEAKER_OFF zusammengesetzt, wie die Gluehbirne: Die
 * Silhouette muss in beiden Zustaenden dieselbe sein, sonst liest sich der
 * Wechsel als anderes Symbol statt als anderer Zustand.
 */
export const ICON_SPEAKER_ON =
  `${ICON_SPEAKER_OFF} M14.6 8.4a4.8 4.8 0 0 1 0 7.2l1.4 1.5a6.8 6.8 0 0 0 0-10.2z` +
  'M17.6 5.4a8.6 8.6 0 0 1 0 13.2l1.4 1.5a10.6 10.6 0 0 0 0-16.2z';

/**
 * Der Pfeil des App-Symbols: Spitze oben, Kerbe unten.
 *
 * Dieselben vier Punkte wie in tools/make-icons.mjs (dort normiert auf 0..1),
 * hier aufs 24er-Raster gerechnet. Wer den einen aendert, aendert den anderen
 * mit - sonst zeigt das Kreisbild einen anderen Pfeil als der Home-Bildschirm.
 */
export const ICON_ARROW = 'M12 5.34 18.3 18.66 12 14.88 5.7 18.66Z';

/**
 * Drei Punkte, nur der mittlere gefuellt: Diese Zeile ist solo geschaltet.
 *
 * Ein Bild der Sache selbst - viele Orte, einer bleibt. Die Ringe sind mit
 * 1,5 Einheiten die feinste Linie der App - bei 26 px sind das 1,63 CSS-Pixel
 * und auf dem Geraet rund fuenf Bildpunkte. Am Geraet abgenommen: gefuellt und
 * Ring sind klar zu unterscheiden, wie zuvor schon die Gluehbirne.
 */
export const ICON_SOLO_ONE =
  'M1.3 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M2.8 12a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1-3.4 0' +
  'M8.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0' +
  'M16.3 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M17.8 12a1.7 1.7 0 1 1 3.4 0a1.7 1.7 0 1 1-3.4 0';

/**
 * Dieselben drei Punkte, alle gefuellt: Diese Zeile ist nicht solo.
 *
 * Bewusst aus ICON_SOLO_ONE zusammengesetzt, wie Birne und Lautsprecher: Die
 * Silhouette muss in beiden Zustaenden dieselbe sein, sonst liest sich der
 * Wechsel als anderes Symbol statt als anderer Zustand. Die beiden Scheiben
 * laufen mit den Aussenkreisen, stopfen deren Loecher also zu.
 */
export const ICON_SOLO_ALL =
  `${ICON_SOLO_ONE} M2.8 12a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0` +
  'M17.8 12a1.7 1.7 0 1 0 3.4 0a1.7 1.7 0 1 0-3.4 0';
