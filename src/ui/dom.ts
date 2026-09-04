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

const SVG_NS = 'http://www.w3.org/2000/svg';

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

export const ICON_PLAY = 'M8 5l12 7-12 7z';
export const ICON_STOP = 'M6 6h12v12H6z';
export const ICON_PAUSE = 'M7 5h4v14H7zm6 0h4v14h-4z';
