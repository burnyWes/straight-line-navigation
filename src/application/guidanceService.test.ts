import { beforeEach, describe, expect, it } from 'vitest';
import { GuidanceService } from './guidanceService.js';
import { BRANDENBURGER_TOR, pointAt, testLocation } from '../testing/fixtures.js';
import { viewConeConfig } from '../domain/viewCone.js';

const BAHNHOF = testLocation('Bahnhof', pointAt(BRANDENBURGER_TOR, 90, 1200));
const KIOSK = testLocation('Kiosk', pointAt(BRANDENBURGER_TOR, 0, 300));
/** Innerhalb der Ankunftsschwelle von 25 Metern. */
const BANK = testLocation('Bank', pointAt(BRANDENBURGER_TOR, 0, 10));
/** Zwischen den Schwellen - dort entscheidet allein die Hysterese. */
const AMPEL = testLocation('Ampel', pointAt(BRANDENBURGER_TOR, 0, 30));

describe('GuidanceService', () => {
  let service: GuidanceService;

  beforeEach(() => {
    service = new GuidanceService();
  });

  it('meldet ohne gewaehltes Ziel nichts', () => {
    const snapshot = service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    expect(snapshot.target).toBeNull();
    expect(snapshot.entry).toBeNull();
    expect(snapshot.tone).toBeNull();
  });

  it('loest das gewaehlte Ziel auf und misst Peilung und Entfernung', () => {
    service.setTarget(BAHNHOF.id);

    const snapshot = service.update(BRANDENBURGER_TOR, 0, [BAHNHOF, KIOSK]);

    expect(snapshot.target).toBe(BAHNHOF);
    expect(snapshot.entry?.offsetDeg).toBeCloseTo(90, 1);
    expect(snapshot.entry?.distanceMetres).toBeCloseTo(1200, 0);
  });

  it('rechnet die Abweichung gegen die Blickrichtung', () => {
    service.setTarget(BAHNHOF.id);

    const snapshot = service.update(BRANDENBURGER_TOR, 60, [BAHNHOF]);

    expect(snapshot.entry?.offsetDeg).toBeCloseTo(30, 1);
  });

  it('faellt bei einem geloeschten Ziel still auf "kein Ziel" zurueck', () => {
    // Die Kennung stand in den Einstellungen, der Ort ist inzwischen weg -
    // dieselbe Regel wie bei verwaisten Gruppenmitgliedern (design.md 6.6).
    service.setTarget('gibt-es-nicht');

    const snapshot = service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    expect(snapshot.target).toBeNull();
    expect(snapshot.entry).toBeNull();
  });

  it('haelt bei veraltetem Standort den zuletzt gerechneten Stand', () => {
    service.setTarget(BAHNHOF.id);
    const live = service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    const held = service.holdStale();

    expect(held.target).toBe(BAHNHOF);
    expect(held.entry).toBe(live.entry);
  });

  it('meldet vor der ersten Messung auch bei veraltetem Standort nichts', () => {
    service.setTarget(BAHNHOF.id);

    expect(service.holdStale().entry).toBeNull();
  });

  it('vergisst den gehaltenen Stand beim Zielwechsel', () => {
    // Der alte Stand waere fuer das neue Ziel eine Behauptung ueber einen Ort,
    // zu dem noch nie gemessen wurde.
    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    service.setTarget(KIOSK.id);

    expect(service.holdStale().entry).toBeNull();
  });

  it('rechnet den Ton aus Richtung und Entfernung', () => {
    service.setTarget(BAHNHOF.id);

    // Ziel genau rechts: eine Oktave unter "vor mir", ganz rechts im Panorama.
    const tone = service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]).tone;

    expect(tone?.frequencyHz).toBeCloseTo(440, 3);
    expect(tone?.pan).toBeCloseTo(1, 3);
    expect(tone?.rateHz).toBeGreaterThan(0.5);
    expect(tone?.continuous).toBe(false);
  });

  it('geht an der Ankunftsschwelle in den Dauerton ueber', () => {
    service.setTarget(BANK.id);

    expect(service.update(BRANDENBURGER_TOR, 0, [BANK]).tone?.continuous).toBe(true);
  });

  it('haelt den Dauerton ueber die Hysterese hinweg', () => {
    // Ohne sie kippte der Ton im Takt der GPS-Streuung zwischen beiden.
    service.setTarget(BANK.id);
    service.update(BRANDENBURGER_TOR, 0, [BANK]);

    service.setTarget(AMPEL.id);
    // Frisches Ziel, frische Ankunft: 30 Meter allein reichen nicht.
    expect(service.update(BRANDENBURGER_TOR, 0, [AMPEL]).tone?.continuous).toBe(false);
  });

  it('liefert ohne Ziel und bei veraltetem Standort keinen Ton', () => {
    // Aus einem alten Fix klaenge er exakt so souveraen wie aus einem
    // gueltigen (design.md 4.6) - das Verstummen ist die Nachricht.
    expect(service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]).tone).toBeNull();

    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    expect(service.holdStale().tone).toBeNull();
  });

  it('vergisst den gehaltenen Stand bei reset()', () => {
    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 0, [BAHNHOF]);

    service.reset();

    expect(service.holdStale().entry).toBeNull();
    // Das Ziel selbst ist eine Absicht und ueberlebt den Lauf.
    expect(service.selectedId).toBe(BAHNHOF.id);
  });

  it('legt den Dreiklang auf das Ziel, sobald es geradeaus liegt', () => {
    service.setTarget(BAHNHOF.id);

    // Der Bahnhof liegt genau oestlich: Wer nach Osten schaut, hat ihn vorn.
    expect(service.update(BRANDENBURGER_TOR, 90, [BAHNHOF]).tone?.chord).toBe(true);
    expect(service.update(BRANDENBURGER_TOR, 130, [BAHNHOF]).tone?.chord).toBe(false);
  });

  it('haelt den Dreiklang ueber die Hysterese des Kegels hinweg', () => {
    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 90, [BAHNHOF]);

    // 22 Grad daneben: drin, weil vorher drin - sonst flackerte der Akkord im
    // Takt des Handzitterns (docs/design.md 4.1, 4.7).
    expect(service.update(BRANDENBURGER_TOR, 112, [BAHNHOF]).tone?.chord).toBe(true);
  });

  it('nimmt die Schwelle aus dem eingestellten Kegel', () => {
    const wide = new GuidanceService(viewConeConfig(45));
    wide.setTarget(BAHNHOF.id);

    expect(wide.update(BRANDENBURGER_TOR, 130, [BAHNHOF]).tone?.chord).toBe(true);
  });

  it('vergisst den Dreiklang, wenn der Kegel neu eingestellt wird', () => {
    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 90, [BAHNHOF]);

    service.setCone(viewConeConfig(10));

    // Ohne das Vergessen haelte die Hysterese des alten Kegels hier noch.
    expect(service.update(BRANDENBURGER_TOR, 103, [BAHNHOF]).tone?.chord).toBe(false);
  });

  it('vergisst den Dreiklang beim Zielwechsel', () => {
    service.setTarget(BAHNHOF.id);
    service.update(BRANDENBURGER_TOR, 90, [BAHNHOF, KIOSK]);

    service.setTarget(KIOSK.id);

    // Der Kiosk liegt noerdlich; wer nach Osten schaut, hat ihn nicht vorn -
    // und darf die Hysterese des alten Ziels nicht erben.
    expect(service.update(BRANDENBURGER_TOR, 90, [BAHNHOF, KIOSK]).tone?.chord).toBe(false);
  });
});
