/**
 * Was ein Tipp auf einen Solo-Knopf bewirkt.
 *
 * Reine Regel ohne Repository und ohne Oberflaeche: Sie bekommt den Stand von
 * jetzt gereicht und sagt, wie er danach aussieht. Der Schnappschuss ist die
 * erste Erinnerung dieser App an eine **vergangene** Welt - und damit nichts,
 * was sich aus der gegenwaertigen ableiten liesse (docs/design.md 6.5).
 */

export type SoloKind = 'location' | 'group';

export interface SoloState {
  readonly kind: SoloKind;
  readonly id: string;
  /** Wer ausgeblendet war, bevor das Solo begann - der Weg zurueck. */
  readonly hiddenBefore: readonly string[];
}

export interface SoloTap {
  /** Ausgeblendet ist danach genau, wer hier steht. */
  readonly hiddenAfter: readonly string[];
  readonly solo: SoloState | null;
}

export function tapSolo(input: {
  readonly current: SoloState | null;
  readonly target: { readonly kind: SoloKind; readonly id: string };
  readonly allIds: readonly string[];
  readonly hiddenNow: readonly string[];
  /** Was hell bleiben soll: der Ort selbst bzw. die Mitglieder der Gruppe. */
  readonly keep: readonly string[];
}): SoloTap {
  const { current, target, allIds, hiddenNow, keep } = input;

  // Nichts zu verschonen hiesse: alles ausblenden. Die Ansichten lassen den
  // Knopf dort gar nicht erst zu (leere Gruppe); hier steht der Riegel ein
  // zweites Mal, weil der Fall der einzige waere, der etwas kaputt macht.
  if (keep.length === 0) {
    return { hiddenAfter: hiddenNow, solo: current };
  }

  // Zweiter Druck auf dieselbe Zeile: zurueck auf den gemerkten Stand.
  if (current !== null && current.kind === target.kind && current.id === target.id) {
    return { hiddenAfter: current.hiddenBefore, solo: null };
  }

  // Laeuft schon ein Solo, wandert es - der Schnappschuss bleibt der erste.
  // Sonst waere der gemerkte Stand selbst ein Solo-Zustand, und der Weg in
  // den Alltag wuerde mit jedem Sprung einen Druck laenger.
  const hiddenBefore = current?.hiddenBefore ?? hiddenNow;
  const spared = new Set(keep);
  return {
    hiddenAfter: allIds.filter((id) => !spared.has(id)),
    solo: { kind: target.kind, id: target.id, hiddenBefore },
  };
}
