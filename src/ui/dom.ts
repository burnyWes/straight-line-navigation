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
