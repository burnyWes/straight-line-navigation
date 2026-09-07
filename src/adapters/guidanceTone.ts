/**
 * Der Zielton ueber Web Audio.
 *
 * Zwei Betriebsarten in einem Kanal: **Ticken**, solange man unterwegs ist -
 * ein kurzer Ton je Schlag, der Takt traegt die Entfernung -, und **Dauerton**
 * ab der Ankunftsschwelle. Der Uebergang ist die eigentliche Ankunftsmeldung
 * und muss hoerbar sein, deshalb faellt dabei die Pause weg.
 *
 * Wie der Earcon bei Lautlos stumm (M2, docs/design.md 11). Die Peilzeile
 * traegt die Auskunft dann weiterhin.
 */

import type { GuidancePort } from '../application/ports.js';
import { guidanceToneSeconds, type GuidanceTone } from '../domain/guidance.js';
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

interface SteadyTone {
  readonly oscillator: OscillatorNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode | null;
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

    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = tone.frequencyHz;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_SECONDS);
    gain.gain.linearRampToValueAtTime(0, at + seconds);

    oscillator.connect(gain);
    connect(context, gain, tone.pan);
    oscillator.start(at);
    oscillator.stop(at + seconds);
  }

  private stopTicking(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // --- Dauerton -------------------------------------------------------------

  /**
   * Ein stehender Oszillator, dessen Hoehe und Panorama gleiten.
   *
   * Nicht bei jedem Bild neu aufgesetzt: Ein neuer Oszillator im Sekundentakt
   * knackte an jeder Naht und waere genau das Flackern, gegen das die
   * Ankunfts-Hysterese gebaut ist.
   */
  private startOrGlideSteady(tone: GuidanceTone): void {
    const context = sharedAudioContext();
    if (context === null) {
      return;
    }

    const at = context.currentTime;
    let steady = this.steady;

    if (steady === null) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(tone.frequencyHz, at);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + ATTACK_SECONDS);

      oscillator.connect(gain);
      const panner = connect(context, gain, tone.pan);
      oscillator.start(at);

      steady = { oscillator, gain, panner };
      this.steady = steady;
      return;
    }

    steady.oscillator.frequency.setTargetAtTime(tone.frequencyHz, at, GLIDE_SECONDS);
    steady.panner?.pan.setTargetAtTime(tone.pan, at, GLIDE_SECONDS);
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
    steady.oscillator.stop(at + RELEASE_SECONDS);
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
