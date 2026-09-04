/**
 * Haelt den Bildschirm waehrend der Navigation wach.
 *
 * Sperrt iOS den Bildschirm, friert Safari die Seite ein - kein Kompass, keine
 * Toene (docs/design.md 2.1). Wake Lock ist die einzige Gegenmassnahme, die
 * einer PWA zur Verfuegung steht.
 *
 * Ein Bildschirmvorhang wird bewusst nicht nachgebaut: Den bringt VoiceOver
 * mit.
 */

export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  get isHeld(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<boolean> {
    this.wanted = true;
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
    this.wanted = false;
    const held = this.sentinel;
    this.sentinel = null;
    await held?.release();
  }

  /**
   * Nach dem Zurueckschalten in die App ist die Sperre verloren.
   *
   * Aufrufen, wenn das Dokument wieder sichtbar wird - sonst laeuft die
   * Navigation weiter, aber der Bildschirm schlaeft nach kurzer Zeit ein.
   */
  async reacquireIfWanted(): Promise<void> {
    if (this.wanted && this.sentinel === null) {
      await this.acquire();
    }
  }
}
