/**
 * Signalkanal fuer Ein- und Austritt.
 *
 * Earcon ueber Web Audio: kurz und unaufdringlich, aber **vom Lautlos-Schalter
 * stummgeschaltet** (gemessen, M2 in docs/design.md 11).
 *
 * Eine zweite Ansage ueber eine aria-live-Region gab es hier einmal. Sie ist im
 * Praxistest herausgeflogen: Bei jedem Ein- und Austritt zu reden hat mehr
 * gestoert als geholfen (docs/design.md 4.4). Der Zustand steht in der Liste,
 * der Wechsel klingt.
 */

import type { CuePort } from '../application/ports.js';
import { sharedAudioContext, unlockAudio } from './audioContext.js';

/** Aufsteigend = Eintritt, absteigend = Austritt. */
const ENTER_TONES = [660, 990];
const EXIT_TONES = [990, 660];
const NOTE_SECONDS = 0.12;
const PEAK_GAIN = 0.25;

export class WebAudioCue implements CuePort {
  /**
   * Der Context kommt von aussen und wird hier nicht geschlossen.
   *
   * Frueher erzeugte diese Klasse ihren eigenen und raeumte ihn in einem
   * dispose() wieder ab. Seit der Zielton am selben Context haengt, waere das
   * ein Kanal, der den anderen mit abschaltet - und dispose() hatte ohnehin nie
   * einen Aufrufer.
   */
  unlock(): void {
    unlockAudio();
  }

  entered(): void {
    this.play(ENTER_TONES);
  }

  left(): void {
    this.play(EXIT_TONES);
  }

  private play(frequencies: readonly number[]): void {
    const context = sharedAudioContext();
    if (context === null) {
      return;
    }

    const start = context.currentTime;
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * NOTE_SECONDS;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      // Weiche Huellkurve, sonst knackt es an den Flanken.
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.01);
      gain.gain.linearRampToValueAtTime(0, at + NOTE_SECONDS);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + NOTE_SECONDS);
    });
  }
}

export const silentCue: CuePort = {
  entered: () => {},
  left: () => {},
};
