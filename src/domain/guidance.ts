/**
 * Die Abbildungen des Zieltons: Richtung wird Tonhoehe, Richtung wird
 * Panorama, Entfernung wird Takt.
 *
 * Sie liegen in der Domaene, weil sie ohne Geraet pruefbar sein muessen. Genau
 * das ist der Gewinn aus der Architektur (docs/design.md 8): "ich stehe hier,
 * schaue dorthin" einspeisen und nachrechnen, welcher Ton herauskommt - statt
 * fuer jede Aenderung an der Tonkurve rausgehen und sich im Kreis drehen zu
 * muessen.
 *
 * Frei von Web Audio: Was hier steht, ist eine Zahl, kein Klang.
 */

import { toRadians } from './angle.js';

/** A3 - genau hinter mir. */
export const GUIDANCE_LOW_HZ = 220;
/** A5 - genau vor mir. */
export const GUIDANCE_HIGH_HZ = 880;

/** Schnellster Takt, erreicht an der Ankunftsschwelle. */
export const GUIDANCE_FAST_HZ = 6;
/** Langsamster Takt; die Kappung greift bei rund 1748 Metern. */
export const GUIDANCE_SLOW_HZ = 0.5;

/** Bis hierher gilt man als angekommen: Dauerton statt Ticken. */
export const ARRIVAL_ENTER_METRES = 25;
/** Erst ab hier wieder Ticken - die Hysterese gegen die GPS-Streuung. */
export const ARRIVAL_EXIT_METRES = 35;

/** Laenge eines Schlages, wie beim Earcon (cues.ts NOTE_SECONDS). */
export const GUIDANCE_TONE_SECONDS = 0.12;

export interface GuidanceTone {
  /** Tonhoehe in Hertz. */
  readonly frequencyHz: number;
  /** Panorama, -1 = ganz links, +1 = ganz rechts. */
  readonly pan: number;
  /** Schlaege pro Sekunde; beim Dauerton bedeutungslos. */
  readonly rateHz: number;
  /** Angekommen: ein stehender Ton statt einzelner Schlaege. */
  readonly continuous: boolean;
}

/**
 * Zwei Oktaven, exponentiell: 880 Hz vor mir, 440 Hz neben mir, 220 Hz hinter
 * mir - eine Oktave je 90 Grad.
 *
 * Exponentiell, weil das Gehoer Tonhoehe logarithmisch hoert. Linear in Hertz
 * laege "neben mir" (550 Hz) schon fast bei "vor mir": Drei Viertel der
 * wahrgenommenen Spanne waeren fuer das erste Viertel der Drehung verbraucht.
 * So aendern fuenf Grad Drehung den Ton ueberall um zwei Drittel eines
 * Halbtons.
 *
 * Bewusst **ohne** Markierung bei "geradeaus": Ein zweiter Kanal neben dem
 * stetigen Gleiten ist genau das, was diese App wiederholt entfernt hat
 * (docs/design.md 4.4, 6.5) - und er flackerte an seiner Grenze.
 */
export function guidancePitchHz(offsetDeg: number): number {
  const magnitude = Math.min(180, Math.abs(offsetDeg));
  return GUIDANCE_LOW_HZ * 4 ** ((180 - magnitude) / 180);
}

/**
 * Panorama nach dem Sinus der Abweichung; positiv = rechts.
 *
 * Rein additiv, deshalb ohne Einstellung: Wer ueber den Geraetelautsprecher
 * hoert, bekommt Mono und faellt auf das Drehen zurueck - es geht nichts
 * verloren, es kommt nur nichts dazu. Ein Schalter fuer etwas, das nie stoert,
 * waere eine Station zu viel (docs/design.md 6).
 *
 * Der Sinus und nicht der Winkel selbst: Vor und hinter einem ist die Seite
 * nicht unterscheidbar, und genau dort laeuft er gegen null.
 */
export function guidancePan(offsetDeg: number): number {
  return Math.sin(toRadians(offsetDeg));
}

/**
 * Takt in Schlaegen pro Sekunde: 6 Hz an der Ankunftsschwelle, 0,5 Hz ab rund
 * 1748 Metern.
 *
 * Logarithmisch, weil zwischen 50 Metern und 5 Kilometern zwei
 * Groessenordnungen liegen - linear waere alles ueber 500 Metern
 * ununterscheidbar langsam. Jede Verdopplung der Entfernung nimmt ein Drittel
 * vom Takt.
 */
export function guidanceRateHz(distanceMetres: number): number {
  const ratio = Math.max(0, distanceMetres) / ARRIVAL_ENTER_METRES;
  if (ratio <= 0) {
    return GUIDANCE_FAST_HZ;
  }
  const rate = GUIDANCE_FAST_HZ * ratio ** Math.log2(2 / 3);
  return Math.min(GUIDANCE_FAST_HZ, Math.max(GUIDANCE_SLOW_HZ, rate));
}

/**
 * Laenge eines Schlages - nie mehr als die halbe Periode.
 *
 * Bei 6 Hz ist die Periode 167 ms; eine feste Tonlaenge von 120 ms liesse
 * 47 ms Pause. Das Ticken klaenge dann schon fast wie der Dauerton, den es
 * ankuendigen soll. Also schrumpft die Tonlaenge mit dem Takt mit.
 */
export function guidanceToneSeconds(rateHz: number): number {
  return Math.min(GUIDANCE_TONE_SECONDS, 0.5 / rateHz);
}

/**
 * Ankunft mit Hysterese - gebaut wie der Sichtkegel, und aus demselben Grund.
 *
 * Ohne sie kippte der Ton im Takt der GPS-Streuung zwischen Ticken und
 * Dauerton: dasselbe Flackern, gegen das docs/design.md 4.1 die 20/25-Hysterese
 * des Kegels erfunden hat. Zustandsbehaftet, weil Hysterese Gedaechtnis
 * braucht: Ob man bei 30 Metern angekommen ist, haengt davon ab, ob man es
 * vorher war.
 */
export class ArrivalState {
  private arrived = false;

  /** Vergisst den Zustand - etwa beim Zielwechsel oder Neustart des Laufs. */
  reset(): void {
    this.arrived = false;
  }

  get isArrived(): boolean {
    return this.arrived;
  }

  /** Die Grenzen sind einschliessend: 25 schaltet ein, 35 schaltet aus. */
  update(distanceMetres: number): boolean {
    if (this.arrived) {
      if (distanceMetres >= ARRIVAL_EXIT_METRES) {
        this.arrived = false;
      }
    } else if (distanceMetres <= ARRIVAL_ENTER_METRES) {
      this.arrived = true;
    }
    return this.arrived;
  }
}
