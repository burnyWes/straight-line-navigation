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

/** Aufsteigend = Eintritt, absteigend = Austritt. */
const ENTER_TONES = [660, 990];
const EXIT_TONES = [990, 660];
const NOTE_SECONDS = 0.12;
const PEAK_GAIN = 0.25;

export class WebAudioCue implements CuePort {
  private context: AudioContext | null = null;

  /** Muss aus einer echten Beruehrung heraus laufen, sonst bleibt der Context suspended. */
  unlock(): void {
    const context = this.ensureContext();
    if (context !== null && context.state === 'suspended') {
      void context.resume();
    }
  }

  entered(): void {
    this.play(ENTER_TONES);
  }

  left(): void {
    this.play(EXIT_TONES);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.context === null && typeof AudioContext === 'function') {
      this.context = new AudioContext();
    }
    return this.context;
  }

  private play(frequencies: readonly number[]): void {
    const context = this.ensureContext();
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
