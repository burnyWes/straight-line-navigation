/**
 * Guete der Kompassrichtung.
 *
 * Fachliche Regel aus docs/design.md 4.5: Ein sehender Nutzer sieht einen
 * zittrigen Zeiger und misstraut ihm von selbst. Diese Rueckmeldung fehlt hier
 * vollstaendig, also muss sie ausgesprochen werden - sonst klingt eine
 * unbrauchbare Peilung genauso souveraen wie eine gute.
 */

export type HeadingQuality = 'gut' | 'ungenau' | 'unkalibriert' | 'unbekannt';

/**
 * Anteil des Kegelwinkels, um den die Guete sich bessern muss, bevor wieder
 * "gut" gemeldet wird. Ohne diesen Abstand flattert die Ansage an der Grenze.
 */
export const QUALITY_HYSTERESIS_FACTOR = 0.8;

/**
 * Der Messfehler wird am Kegel gemessen, nicht an einer festen Gradzahl: Ist er
 * breiter als der halbe Oeffnungswinkel, entscheidet nicht mehr die
 * Blickrichtung, welche Orte erscheinen, sondern der Zufall.
 */
export function classifyHeadingAccuracy(
  accuracyDeg: number | null,
  coneHalfAngleDeg: number,
): HeadingQuality {
  if (accuracyDeg === null || !Number.isFinite(accuracyDeg)) {
    return 'unbekannt';
  }
  if (accuracyDeg < 0) {
    return 'unkalibriert';
  }
  return accuracyDeg > coneHalfAngleDeg ? 'ungenau' : 'gut';
}

/**
 * Meldet nur Wechsel, nie den Dauerzustand.
 *
 * Eine App, die alle zwei Sekunden "ungenau" sagt, wird weggeschaltet und
 * meldet dann gar nichts mehr.
 */
export class HeadingQualityMonitor {
  private current: HeadingQuality = 'unbekannt';
  private reported = false;

  constructor(private coneHalfAngleDeg: number) {}

  setConeHalfAngle(coneHalfAngleDeg: number): void {
    this.coneHalfAngleDeg = coneHalfAngleDeg;
  }

  get quality(): HeadingQuality {
    return this.current;
  }

  reset(): void {
    this.current = 'unbekannt';
    this.reported = false;
  }

  /** Gibt die neue Guete zurueck, wenn sie sich geaendert hat - sonst null. */
  update(accuracyDeg: number | null): HeadingQuality | null {
    const next = this.classifyWithHysteresis(accuracyDeg);

    if (this.reported && next === this.current) {
      return null;
    }

    this.current = next;
    this.reported = true;
    return next;
  }

  private classifyWithHysteresis(accuracyDeg: number | null): HeadingQuality {
    const plain = classifyHeadingAccuracy(accuracyDeg, this.coneHalfAngleDeg);

    // Der Rueckweg von "ungenau" nach "gut" ist enger als der Hinweg. Nur diese
    // Richtung braucht Hysterese - "unkalibriert" und "unbekannt" sind
    // eindeutige Zustaende ohne Schwelle.
    if (this.current === 'ungenau' && plain === 'gut' && accuracyDeg !== null) {
      const recoveryThreshold = this.coneHalfAngleDeg * QUALITY_HYSTERESIS_FACTOR;
      if (accuracyDeg > recoveryThreshold) {
        return 'ungenau';
      }
    }

    return plain;
  }
}
