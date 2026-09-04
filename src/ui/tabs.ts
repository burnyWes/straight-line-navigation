/**
 * Bereichswechsel.
 *
 * Die Leiste steht oben - nicht unten (docs/design.md 5). VoiceOver laeuft in
 * DOM-Reihenfolge; am Seitenende muesste man sich erst durch die gesamte
 * Kegel-Liste wischen, um den Bereich zu wechseln.
 */

import { el } from './dom.js';

export interface TabDefinition {
  readonly id: string;
  readonly label: string;
  readonly panel: HTMLElement;
}

export class Tabs {
  readonly element: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly tabs: readonly TabDefinition[];
  private activeId: string;

  constructor(tabs: readonly TabDefinition[], initialId: string) {
    this.tabs = tabs;
    this.activeId = initialId;

    const list = el('div', { role: 'tablist', class: 'tablist', 'aria-label': 'Bereiche' });

    for (const tab of tabs) {
      const button = el('button', {
        type: 'button',
        role: 'tab',
        id: `tab-${tab.id}`,
        class: 'tab',
        'aria-controls': `panel-${tab.id}`,
        text: tab.label,
      }) as HTMLButtonElement;

      button.addEventListener('click', () => {
        this.select(tab.id, true);
      });
      button.addEventListener('keydown', (event) => {
        this.onKeydown(event, tab.id);
      });

      this.buttons.set(tab.id, button);
      list.append(button);

      tab.panel.id = `panel-${tab.id}`;
      tab.panel.setAttribute('role', 'tabpanel');
      tab.panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
      // Fokussierbar, damit der Fokus nach dem Wechsel hierher wandern kann.
      tab.panel.setAttribute('tabindex', '-1');
    }

    this.element = list;
    this.select(initialId, false);
  }

  get active(): string {
    return this.activeId;
  }

  select(id: string, moveFocus: boolean): void {
    this.activeId = id;

    for (const tab of this.tabs) {
      const isActive = tab.id === id;
      const button = this.buttons.get(tab.id);
      if (button !== undefined) {
        button.setAttribute('aria-selected', String(isActive));
        // Roving tabindex: Die Leiste ist ein einziger Tabstopp.
        button.tabIndex = isActive ? 0 : -1;
      }
      tab.panel.hidden = !isActive;
    }

    if (moveFocus) {
      // Auf das Panel, nicht auf den Tab-Knopf: Sonst hoert man nicht, dass
      // sich der Inhalt geaendert hat.
      this.tabs.find((tab) => tab.id === id)?.panel.focus();
    }
  }

  private onKeydown(event: KeyboardEvent, currentId: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === currentId);
    if (index === -1) {
      return;
    }

    let nextIndex: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % this.tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + this.tabs.length) % this.tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = this.tabs.length - 1;
        break;
      default:
        return;
    }

    const next = this.tabs[nextIndex];
    if (next !== undefined) {
      event.preventDefault();
      this.select(next.id, false);
      this.buttons.get(next.id)?.focus();
    }
  }
}
