/**
 * Signalkanaele fuer Ein- und Austritt.
 *
 * Zwei Implementierungen desselben Ports, in den Einstellungen kombinierbar
 * (docs/design.md 4.4):
 *
 * - Earcon ueber Web Audio: kurz und unaufdringlich, aber **vom
 *   Lautlos-Schalter stummgeschaltet** (gemessen). Damit ist er die Zugabe,
 *   nicht der Traeger.
 * - Ansage ueber eine aria-live-Region: laeuft ueber VoiceOver und ist auch
 *   bei Lautlos hoerbar. Das ist der Kanal, auf den Verlass ist.
 */

import type { CuePort } from '../application/ports.js';
import type { Location } from '../domain/location.js';

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

/**
 * Ansage ueber VoiceOver.
 *
 * Beim Eintritt der Name des Ortes, beim Austritt nur "raus" - bewusst keine
 * vollstaendige Vorlesung des Kegelinhalts (docs/design.md 4.4).
 */
export class LiveRegionCue implements CuePort {
  constructor(private readonly region: HTMLElement) {}

  entered(location: Location): void {
    this.announce(location.name);
  }

  left(): void {
    this.announce('raus');
  }

  announce(text: string): void {
    // Erst leeren: Ein unveraenderter Textinhalt loest bei manchen
    // Screenreadern keine erneute Ansage aus.
    this.region.textContent = '';
    this.region.textContent = text;
  }
}

/** Bündelt mehrere Kanäle, damit die Logik nur einen Port kennt. */
export class CompositeCue implements CuePort {
  constructor(private readonly channels: readonly CuePort[]) {}

  entered(location: Location): void {
    for (const channel of this.channels) {
      channel.entered(location);
    }
  }

  left(location: Location): void {
    for (const channel of this.channels) {
      channel.left(location);
    }
  }
}

export const silentCue: CuePort = {
  entered: () => {},
  left: () => {},
};
