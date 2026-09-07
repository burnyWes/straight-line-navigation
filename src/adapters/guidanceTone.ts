/**
 * Der Zielton ueber Web Audio.
 *
 * Zwei Betriebsarten in einem Kanal: **Ticken**, solange man unterwegs ist -
 * ein kurzer Ton je Schlag, der Takt traegt die Entfernung -, und **Dauerton**
 * ab der Ankunftsschwelle. Der Uebergang ist die eigentliche Ankunftsmeldung
 * und muss hoerbar sein, deshalb faellt dabei die Pause weg.
 *
 * Quer dazu der **Dreiklang**, solange das Ziel geradeaus liegt: Terz und
 * Quinte schwellen ueber demselben Grundton auf und wieder ab. Kein zweiter
 * Ton neben dem ersten, sondern eine andere Klangfarbe desselben - deshalb
 * gilt er im Ticken wie im Dauerton.
 *
 * Wie der Earcon bei Lautlos stumm (M2, docs/design.md 11). Die Peilzeile
 * traegt die Auskunft dann weiterhin.
 */

import type { GuidancePort } from '../application/ports.js';
import {
  GUIDANCE_CHORD_RATIOS,
  guidanceChordHz,
  guidanceToneSeconds,
  type GuidanceTone,
} from '../domain/guidance.js';
import { sharedAudioContext } from './audioContext.js';

/**
 * Etwas leiser als der Earcon (cues.ts PEAK_GAIN 0,25).
 *
 * Der Earcon ist ein Ereignis und darf herausstechen; dieser Ton laeuft
 * minutenlang nebenher. Beim Zurueckwechseln nach "Orientierung" bleibt der
 * Earcon damit der lautere von beiden.
 */
const PEAK_GAIN = 0.2;

/** Weiche Flanken, sonst knackt es - dieselbe Huellkurve wie beim Earcon. */
const ATTACK_SECONDS = 0.01;

/**
 * Zeitkonstante fuer das Gleiten von Tonhoehe und Panorama.
 *
 * Der Ton soll beim Drehen wandern, nicht springen. Zu traege waere er eine
 * Auskunft von vorgestern, zu flink knackte er - 50 ms sind der Punkt, an dem
 * eine Vierteldrehung noch innerhalb eines Bildes ankommt.
 */
const GLIDE_SECONDS = 0.05;

/** Ausklingen beim Verstummen: kurz genug, um als "sofort" zu gelten. */
const RELEASE_SECONDS = 0.05;

/**
 * Lautstaerke von Terz und Quinte, gemessen am Grundton.
 *
 * Deutlich leiser als er: Der Akkord soll die Klangfarbe faerben, nicht die
 * Tonhoehe verdecken - innerhalb des Kegels wird weiter nachjustiert, und dazu
 * muss der Grundton der hoerbar fuehrende bleiben. Der Summenpegel bleibt so
 * bei 0,38 und damit unter der Uebersteuerung.
 */
const CHORD_PARTIAL_GAIN = 0.45;

/**
 * Ein Teilton des Dreiklangs mit eigenem Regler.
 *
 * Eigener Regler je Teilton, damit der Akkord auf- und abschwellen kann, ohne
 * den Grundton anzufassen: Ein neu gestarteter Oszillator an der Kegelgrenze
 * waere genau das Knacken, gegen das die Hysterese gebaut ist.
 */
interface Partial {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
  /** Sein Verhaeltnis zum Grundton - daraus gleitet seine Hoehe mit. */
  readonly ratio: number;
}

interface SteadyTone {
  readonly partials: readonly Partial[];
  /** Gemeinsame Huellkurve ueber allen Teiltoenen. */
  readonly gain: GainNode;
  readonly panner: StereoPannerNode | null;
}

/**
 * Der Grundton traegt immer, die Teiltoene nur bei "geradeaus".
 *
 * Sie werden nicht abgeschaltet, sondern auf null gefahren: Der Weg zurueck
 * ist derselbe Regler, und ein stehender Oszillator bei null kostet nichts.
 */
function partialGain(index: number, chord: boolean): number {
  if (index === 0) {
    return 1;
  }
  return chord ? CHORD_PARTIAL_GAIN : 0;
}

export class WebAudioGuidance implements GuidancePort {
  /** Zuletzt gemeldeter Sollzustand; die Schlaege lesen ihn beim Schlag. */
  private tone: GuidanceTone | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private steady: SteadyTone | null = null;

  /**
   * Meldet den gewuenschten Ton.
   *
   * Idempotent: Der Aufruf kommt in jedem Bild, und ein laufender Ton darf
   * davon nicht neu anfangen. Geaendert wird nur, was sich unterscheidet.
   */
  play(tone: GuidanceTone): void {
    this.tone = tone;
    if (tone.continuous) {
      this.stopTicking();
      this.startOrGlideSteady(tone);
    } else {
      this.stopSteady();
      this.startTicking();
    }
  }

  silence(): void {
    this.tone = null;
    this.stopTicking();
    this.stopSteady();
  }

  // --- Ticken ---------------------------------------------------------------

  private startTicking(): void {
    if (this.timer !== null) {
      return;
    }
    this.beat();
  }

  /**
   * Ein Schlag, dann der naechste.
   *
   * Ein Zeitgeber statt eines im Voraus geplanten Rasters: Die Werte werden
   * **beim Schlag** gelesen, damit eine Aenderung binnen eines Schlages wirkt.
   * Ein vorausgeplantes Raster klaenge nach einer Drehung noch Sekunden lang
   * nach der alten Richtung.
   */
  private beat(): void {
    const tone = this.tone;
    if (tone === null || tone.continuous) {
      this.timer = null;
      return;
    }

    this.strike(tone);
    this.timer = setTimeout(() => {
      this.beat();
    }, 1000 / tone.rateHz);
  }

  private strike(tone: GuidanceTone): void {
    const context = sharedAudioContext();
    if (context === null) {
      return;
    }

    const seconds = guidanceToneSeconds(tone.rateHz);
    const at = context.currentTime;

    // Ein Regler und ein Panorama fuer den ganzen Schlag: Terz und Quinte
    // gehoeren zum selben Ton und muessen aus derselben Richtung kommen.
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_SECONDS);
    gain.gain.linearRampToValueAtTime(0, at + seconds);
    connect(context, gain, tone.pan);

    // Beim Schlag kostet das Ab- und Aufschwellen nichts: Jeder Schlag baut
    // seine Toene ohnehin neu auf, also entstehen die stummen gar nicht erst.
    guidanceChordHz(tone.frequencyHz).forEach((frequency, index) => {
      const level = partialGain(index, tone.chord);
      if (level === 0) {
        return;
      }

      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      const partial = context.createGain();
      partial.gain.value = level;

      oscillator.connect(partial);
      partial.connect(gain);
      oscillator.start(at);
      oscillator.stop(at + seconds);
    });
  }

  private stopTicking(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // --- Dauerton -------------------------------------------------------------

  /**
   * Stehende Oszillatoren, deren Hoehe, Panorama und Akkord gleiten.
   *
   * Nicht bei jedem Bild neu aufgesetzt: Ein neuer Oszillator im Sekundentakt
   * knackte an jeder Naht und waere genau das Flackern, gegen das die
   * Ankunfts-Hysterese gebaut ist. Aus demselben Grund laufen Terz und Quinte
   * **immer** mit und stehen ausserhalb des Kegels nur auf null: Sie an der
   * Kegelgrenze zu starten hiesse, das Knacken an eine zweite Stelle zu holen.
   */
  private startOrGlideSteady(tone: GuidanceTone): void {
    const context = sharedAudioContext();
    if (context === null) {
      return;
    }

    const at = context.currentTime;
    const steady = this.steady ?? this.startSteady(context, tone);

    steady.partials.forEach((partial, index) => {
      const frequency = tone.frequencyHz * partial.ratio;
      partial.oscillator.frequency.setTargetAtTime(frequency, at, GLIDE_SECONDS);
      partial.gain.gain.setTargetAtTime(partialGain(index, tone.chord), at, GLIDE_SECONDS);
    });
    steady.panner?.pan.setTargetAtTime(tone.pan, at, GLIDE_SECONDS);
  }

  /** Setzt den stehenden Ton auf; das Gleiten macht der Aufrufer. */
  private startSteady(context: AudioContext, tone: GuidanceTone): SteadyTone {
    const at = context.currentTime;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_SECONDS);
    const panner = connect(context, gain, tone.pan);

    const partials = GUIDANCE_CHORD_RATIOS.map((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(tone.frequencyHz * ratio, at);

      const partial = context.createGain();
      partial.gain.setValueAtTime(partialGain(index, tone.chord), at);

      oscillator.connect(partial);
      partial.connect(gain);
      oscillator.start(at);
      return { oscillator, gain: partial, ratio };
    });

    const steady: SteadyTone = { partials, gain, panner };
    this.steady = steady;
    return steady;
  }

  private stopSteady(): void {
    const steady = this.steady;
    if (steady === null) {
      return;
    }
    this.steady = null;

    const context = sharedAudioContext();
    if (context === null) {
      return;
    }

    // Herunterfahren statt abschneiden: Ein hart gestoppter Oszillator knackt.
    const at = context.currentTime;
    steady.gain.gain.cancelScheduledValues(at);
    steady.gain.gain.setValueAtTime(steady.gain.gain.value, at);
    steady.gain.gain.linearRampToValueAtTime(0, at + RELEASE_SECONDS);
    for (const partial of steady.partials) {
      partial.oscillator.stop(at + RELEASE_SECONDS);
    }
  }
}

/**
 * Haengt die Quelle ans Ziel, mit Panorama wenn das Geraet eines kennt.
 *
 * Ohne StereoPanner klingt der Ton in Mono, und man faellt auf das Drehen
 * zurueck - rein additiv, es geht nichts verloren (docs/design.md 4.7).
 */
function connect(context: AudioContext, source: GainNode, pan: number): StereoPannerNode | null {
  if (typeof context.createStereoPanner !== 'function') {
    source.connect(context.destination);
    return null;
  }
  const panner = context.createStereoPanner();
  panner.pan.value = pan;
  source.connect(panner);
  panner.connect(context.destination);
  return panner;
}
