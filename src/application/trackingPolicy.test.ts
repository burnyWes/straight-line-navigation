import { describe, expect, it } from 'vitest';
import { trackingDemand, type TrackingContext } from './trackingPolicy.js';

/** Nichts offen, nichts gemessen - die Faelle setzen darauf auf. */
const NICHTS: TrackingContext = {
  navigationVisible: false,
  createDialogOpen: false,
  documentVisible: true,
  hasFix: false,
  hasHeading: false,
};

function demand(patch: Partial<TrackingContext>) {
  return trackingDemand({ ...NICHTS, ...patch });
}

describe('trackingDemand', () => {
  it('ortet und rechnet, solange die Navigationsseite offen ist', () => {
    expect(demand({ navigationVisible: true })).toMatchObject({
      position: true,
      navigating: true,
    });
  });

  it('ortet fuer den Anlegen-Dialog, rechnet dort aber nicht', () => {
    expect(demand({ createDialogOpen: true })).toMatchObject({
      position: true,
      navigating: false,
    });
  });

  it('laesst Orte, Gruppen und Einstellungen still', () => {
    expect(demand({})).toEqual({ position: false, navigating: false, wakeLock: false });
  });

  it('schlaegt beides aus, sobald das Dokument verborgen ist', () => {
    expect(
      demand({
        navigationVisible: true,
        createDialogOpen: true,
        documentVisible: false,
        hasFix: true,
        hasHeading: true,
      }),
    ).toEqual({ position: false, navigating: false, wakeLock: false });
  });

  it('haelt den Bildschirm erst wach, wenn Standort und Kompass geliefert haben', () => {
    expect(demand({ navigationVisible: true, hasFix: true }).wakeLock).toBe(false);
    expect(demand({ navigationVisible: true, hasHeading: true }).wakeLock).toBe(false);
    expect(demand({ navigationVisible: true, hasFix: true, hasHeading: true }).wakeLock).toBe(
      true,
    );
  });

  it('haelt den Bildschirm im Anlegen-Dialog nicht wach, auch mit Daten', () => {
    expect(demand({ createDialogOpen: true, hasFix: true, hasHeading: true }).wakeLock).toBe(
      false,
    );
  });
});
