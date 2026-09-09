/**
 * Haelt den Bildschirm waehrend der Navigation wach.
 *
 * Sperrt iOS den Bildschirm, friert Safari die Seite ein - kein Kompass, keine
 * Toene (docs/design.md 2.1). Wake Lock ist die einzige Gegenmassnahme, die
 * einer PWA zur Verfuegung steht.
 *
 * Ein Bildschirmvorhang wird bewusst nicht nachgebaut: Den bringt VoiceOver
 * mit.
 *
 * Der Adapter weiss nur, ob er die Sperre gerade haelt - **ob** sie gewollt ist,
 * steht in application/trackingPolicy.ts. Zwei Stellen, die dasselbe wissen,
 * waeren eine zu viel.
 */

export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;

  get isHeld(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<boolean> {
    if (!('wakeLock' in navigator)) {
      return false;
    }

    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch {
      // Abgelehnt, etwa bei niedrigem Akkustand. Kein Grund, die Navigation
      // scheitern zu lassen - der Bildschirm geht dann eben irgendwann aus.
      this.sentinel = null;
      return false;
    }
  }

  async release(): Promise<void> {
    const held = this.sentinel;
    this.sentinel = null;
    await held?.release();
  }
}
