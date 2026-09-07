/**
 * Das Kreisbild der Zielseite.
 *
 * Rein visuell und deshalb `aria-hidden` wie jedes Symbol dieser App: Es traegt
 * fuer VoiceOver nichts und ist fuer Mitschauende da (docs/design.md 4.7). Der
 * Pfeil steht fest und zeigt nach oben - er ist die eigene Nase, nicht Norden;
 * der Ring dreht sich unter ihm weg.
 *
 * Vier Marken statt einer Gradskala: Sie machen "30 Grad rechts" auf einen
 * Blick ablesbar, eine Skala liest niemand.
 */

import { SVG_NS, ICON_ARROW } from './dom.js';
import { formatDistance } from './format.js';

/** Mittelpunkt des Bildes im viewBox-Raster. */
const CENTRE = 100;
/** Radius des Rings; die Marken straddeln ihn. */
const RADIUS = 80;

/**
 * Die Beschriftung steht mittig **unter** dem Ring, nicht am Punkt.
 *
 * Am Punkt sah es zuerst richtiger aus, war es aber nicht: Neben ihm lief sie
 * an den Rand hinaus und wurde abgeschnitten, nach innen gerueckt kreuzte sie
 * bei waagerechter Peilung den Pfeil - der ist 60 Einheiten hoch und laesst auf
 * dieser Achse keinen Platz. Die Richtung traegt ohnehin der Punkt; Name und
 * Entfernung sind die Bildunterschrift dazu. So kann beides nie kollidieren.
 */
const NAME_Y = 214;
const DISTANCE_Y = 232;

/**
 * Wo der Zielpunkt auf dem Ring sitzt.
 *
 * Null Grad ist oben, positive Winkel laufen nach rechts - wie die Abweichung
 * von der Blickrichtung. In SVG waechst y nach unten, deshalb steht vor dem
 * Kosinus ein Minus.
 */
export function dialPoint(offsetDeg: number): { x: number; y: number } {
  const rad = (offsetDeg * Math.PI) / 180;
  return {
    x: CENTRE + RADIUS * Math.sin(rad),
    y: CENTRE - RADIUS * Math.cos(rad),
  };
}

export class Dial {
  readonly element: SVGSVGElement;

  private readonly point: SVGCircleElement;
  private readonly nameText: SVGTextElement;
  private readonly distanceText: SVGTextElement;

  constructor() {
    this.element = document.createElementNS(SVG_NS, 'svg');
    // 40 Einheiten hoeher als breit: Die unteren gehoeren der Bildunterschrift.
    this.element.setAttribute('viewBox', '0 0 200 240');
    this.element.setAttribute('class', 'dial');
    // Wie bei icon(): keine Bedeutung fuer VoiceOver, und ohne focusable
    // nimmt das SVG in aelteren Safaris den Tastaturfokus an.
    this.element.setAttribute('aria-hidden', 'true');
    this.element.setAttribute('focusable', 'false');

    const ring = svg('circle', {
      cx: CENTRE,
      cy: CENTRE,
      r: RADIUS,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      class: 'dial-ring',
    });

    // Vorn, rechts, hinten, links - jede Marke straddelt den Ring.
    const marks = [
      mark(CENTRE, CENTRE - RADIUS),
      mark(CENTRE + RADIUS, CENTRE),
      mark(CENTRE, CENTRE + RADIUS),
      mark(CENTRE - RADIUS, CENTRE),
    ];

    // Der Pfeil des App-Symbols, vom 24er-Raster auf die Bildmitte gerechnet.
    const arrow = svg('g', {
      transform: `translate(${CENTRE},${CENTRE}) scale(2.5) translate(-12,-12)`,
      class: 'dial-arrow',
    });
    arrow.append(svg('path', { d: ICON_ARROW, fill: 'currentColor' }));

    this.point = svg('circle', { cx: CENTRE, cy: CENTRE - RADIUS, r: 7, class: 'dial-point' });
    // text-anchor steht fest auf middle: Die Beschriftung sitzt auf der Peilung
    // des Punktes, nicht neben ihm, und wird nur waagerecht in den Rahmen
    // gerueckt.
    this.nameText = label(NAME_Y);
    this.distanceText = label(DISTANCE_Y);

    this.element.append(ring, ...marks, arrow, this.point, this.nameText, this.distanceText);
    this.showTarget(false);
  }

  /**
   * Setzt den Zielpunkt und seine Beschriftung.
   *
   * Ohne Ziel bleiben Punkt und Beschriftung weg - Ring, Marken und Pfeil
   * stehen weiterhin da, damit das Bild nicht verschwindet, sondern leer ist.
   */
  render(offsetDeg: number | null, name: string, displayMetres: number): void {
    if (offsetDeg === null) {
      this.showTarget(false);
      return;
    }

    const { x, y } = dialPoint(offsetDeg);
    this.point.setAttribute('cx', String(x));
    this.point.setAttribute('cy', String(y));

    setTextIfChanged(this.nameText, name);
    setTextIfChanged(this.distanceText, formatDistance(displayMetres));

    this.showTarget(true);
  }

  private showTarget(visible: boolean): void {
    for (const node of [this.point, this.nameText, this.distanceText]) {
      if (visible) {
        node.removeAttribute('display');
      } else {
        // `hidden` traegt an SVG-Knoten nicht zuverlaessig - display schon.
        node.setAttribute('display', 'none');
      }
    }
  }
}

function label(y: number): SVGTextElement {
  return svg('text', { x: CENTRE, y, 'text-anchor': 'middle', class: 'dial-label' });
}

function setTextIfChanged(node: SVGTextElement, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

/** Kurzer Strich quer ueber den Ring, an der uebergebenen Stelle. */
function mark(x: number, y: number): SVGLineElement {
  const horizontal = y === CENTRE;
  return svg('line', {
    x1: horizontal ? x - 6 : x,
    y1: horizontal ? y : y - 6,
    x2: horizontal ? x + 6 : x,
    y2: horizontal ? y : y + 6,
    stroke: 'currentColor',
    'stroke-width': 2,
    class: 'dial-mark',
  });
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}
