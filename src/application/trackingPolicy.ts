/**
 * Wer ortet, und wann - abgeleitet aus der offenen Flaeche.
 *
 * Es gab einmal einen Start- und einen Stopp-Knopf. Sie verlangten eine
 * Entscheidung, die nie eine war: Auf der Navigationsseite will man **immer**
 * Ortungsdaten, sonst waere man nicht dort. Was sie tatsaechlich erzeugt haben,
 * sind zwei Fehlermodi - der vergessene Start (die App sieht aus wie kaputt:
 * leere Liste, keine Toene, kein Hinweis) und der vergessene Stopp
 * (Bildschirm wach, GPS laeuft, niemand navigiert).
 *
 * Jetzt ist die Flaeche der Schalter. Ein abgeleiteter Zustand kann nicht
 * vergessen werden.
 *
 * Frei von DOM und Browser-APIs: Die Regel selbst ist am Rechner pruefbar, und
 * genau das ist der Grund, warum sie hier steht und nicht in main.ts.
 */

export interface TrackingContext {
  /** Der Bereich "Navigation" ist der offene Tab. */
  readonly navigationVisible: boolean;
  /** Der Dialog "Neuen Ort anlegen" steht offen - er ortet fuer sich selbst. */
  readonly createDialogOpen: boolean;
  /**
   * Das Dokument ist sichtbar.
   *
   * Beim Weglegen pausiert die App ausdruecklich, statt es dem Einfrieren durch
   * Safari zu ueberlassen: Nur so ist der Bedarf falsch, und nur dann laesst
   * das Update-Tor des Service Workers eine neue Fassung durch
   * (adapters/serviceWorker.ts).
   */
  readonly documentVisible: boolean;
  /** Mindestens ein Standort ist eingetroffen. */
  readonly hasFix: boolean;
  /** Mindestens eine Kompassmessung ist eingetroffen. */
  readonly hasHeading: boolean;
}

export interface TrackingDemand {
  /** Das Standort-Abonnement soll laufen. */
  readonly position: boolean;
  /**
   * Die Navigationsseite rechnet: Kompass, Renderschleife, Earcons, Zielton.
   *
   * Der Anlegen-Dialog braucht das alles nicht - er will nur wissen, wo er
   * steht.
   */
  readonly navigating: boolean;
  /** Der Bildschirm soll wach bleiben. */
  readonly wakeLock: boolean;
}

export function trackingDemand(context: TrackingContext): TrackingDemand {
  const navigating = context.documentVisible && context.navigationVisible;
  return {
    position:
      context.documentVisible && (context.navigationVisible || context.createDialogOpen),
    navigating,
    // Erst wenn Daten fliessen: Sonst brennt der Bildschirm genau dort, wo er
    // nichts nuetzt - abgelehnter Standort, nicht freigegebener Kompass,
    // nichts laeuft.
    wakeLock: navigating && context.hasFix && context.hasHeading,
  };
}
