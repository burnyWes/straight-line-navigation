/**
 * Der geteilte AudioContext.
 *
 * Einer fuer die ganze App, nicht einer je Kanal: Zwei Contexts auf iOS sind
 * Verschwendung, und jeder braeuchte seine eigene Entsperrung. Die muss aus
 * einer echten Beruehrung heraus laufen - dieselbe Bedingung wie bei der
 * Kompass-Freigabe (docs/design.md 5).
 *
 * Genau deshalb schliesst ihn auch niemand: Wer ihn zumachte, raeumte den
 * jeweils anderen Kanal mit ab.
 */

let context: AudioContext | null = null;

/** Erzeugt den Context genau einmal; null, wenn es kein Web Audio gibt. */
export function sharedAudioContext(): AudioContext | null {
  if (context === null && typeof AudioContext === 'function') {
    context = new AudioContext();
  }
  return context;
}

/** Muss aus einer echten Beruehrung heraus laufen, sonst bleibt er suspended. */
export function unlockAudio(): void {
  const shared = sharedAudioContext();
  if (shared !== null && shared.state === 'suspended') {
    void shared.resume();
  }
}
