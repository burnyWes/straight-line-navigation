import { describe, expect, it } from 'vitest';
import {
  formatDirection,
  formatDistance,
  formatDeleteGroupWarning,
  formatEntryLabel,
  formatGroupEntryLabel,
  formatGroupMembership,
  formatLocationDetails,
  formatSaveConfirmation,
} from './format.js';

describe('formatDistance', () => {
  it('spricht Meter unter einem Kilometer', () => {
    expect(formatDistance(0)).toBe('0 Meter');
    expect(formatDistance(500)).toBe('500 Meter');
    expect(formatDistance(990)).toBe('990 Meter');
  });

  it('spricht Kilometer mit deutschem Dezimalkomma', () => {
    expect(formatDistance(1000)).toBe('1,0 Kilometer');
    expect(formatDistance(1200)).toBe('1,2 Kilometer');
    expect(formatDistance(47_700)).toBe('47,7 Kilometer');
  });

  it('schreibt Einheiten aus', () => {
    // Screenreader lesen "m" und "km" je nach Kontext unterschiedlich vor.
    expect(formatDistance(500)).not.toContain(' m');
    expect(formatDistance(1200)).not.toContain(' km');
  });
});

describe('formatDirection', () => {
  it('nennt kleine Abweichungen geradeaus', () => {
    expect(formatDirection(0)).toBe('geradeaus');
    expect(formatDirection(3)).toBe('geradeaus');
    expect(formatDirection(-3)).toBe('geradeaus');
  });

  it('unterscheidet rechts und links', () => {
    expect(formatDirection(28)).toBe('28 Grad rechts');
    expect(formatDirection(-12)).toBe('12 Grad links');
  });

  it('rundet auf ganze Grad', () => {
    expect(formatDirection(28.4)).toBe('28 Grad rechts');
  });
});

describe('formatEntryLabel', () => {
  it('setzt Name und Entfernung zusammen', () => {
    expect(formatEntryLabel('Bahnhof', 1200)).toBe('Bahnhof, 1,2 Kilometer');
    expect(formatEntryLabel('Zuhause', 500)).toBe('Zuhause, 500 Meter');
  });
});

describe('formatSaveConfirmation', () => {
  it('nennt die Messgenauigkeit', () => {
    expect(formatSaveConfirmation('Bahnhof', 12)).toBe(
      'Bahnhof gespeichert, Genauigkeit 12 Meter.',
    );
  });

  it('laesst sie bei eingegebenen Koordinaten weg', () => {
    expect(formatSaveConfirmation('Bahnhof', null)).toBe('Bahnhof gespeichert.');
  });
});

describe('formatLocationDetails', () => {
  // Mittags in UTC, damit der Kalendertag in keiner Zeitzone kippt.
  const CREATED_AT = '2026-09-04T12:00:00.000Z';

  it('nennt Anlagedatum und Genauigkeit', () => {
    expect(formatLocationDetails({ createdAt: CREATED_AT, accuracyMetres: 12 })).toBe(
      'Angelegt am 4. September 2026, Genauigkeit 12 Meter.',
    );
  });

  it('laesst die Genauigkeit bei eingegebenen Koordinaten weg', () => {
    expect(formatLocationDetails({ createdAt: CREATED_AT, accuracyMetres: null })).toBe(
      'Angelegt am 4. September 2026.',
    );
  });

  it('erfindet bei unlesbarem Datum keine Angabe', () => {
    // Kommt aus einer fremden oder beschaedigten Sicherung.
    expect(formatLocationDetails({ createdAt: 'gestern', accuracyMetres: null })).toBe(
      'Anlagedatum unbekannt.',
    );
    expect(formatLocationDetails({ createdAt: 'gestern', accuracyMetres: 12 })).toBe(
      'Anlagedatum unbekannt, Genauigkeit 12 Meter.',
    );
  });
});

describe('formatGroupEntryLabel', () => {
  it('nennt Namen und Umfang', () => {
    expect(formatGroupEntryLabel('Kiez', 4, 0)).toBe('Kiez, 4 Orte');
  });

  it('beachtet die Einzahl', () => {
    expect(formatGroupEntryLabel('Arbeit', 1, 0)).toBe('Arbeit, 1 Ort');
  });

  it('nennt eine leere Gruppe als solche', () => {
    expect(formatGroupEntryLabel('Wochenende', 0, 0)).toBe('Wochenende, 0 Orte');
  });

  it('haengt die Ausgeblendeten nur an, wenn es welche gibt', () => {
    // "0 ausgeblendet" waere bei jeder Gruppe ein Wort mehr fuer keine
    // Information.
    expect(formatGroupEntryLabel('Kiez', 4, 1)).toBe('Kiez, 4 Orte, 1 ausgeblendet');
    expect(formatGroupEntryLabel('Kiez', 4, 4)).toBe('Kiez, 4 Orte, 4 ausgeblendet');
    expect(formatGroupEntryLabel('Kiez', 1, 1)).toBe('Kiez, 1 Ort, 1 ausgeblendet');
  });
});

describe('formatGroupMembership', () => {
  it('sagt nichts, wenn der Ort in keiner Gruppe steht', () => {
    expect(formatGroupMembership([])).toBe('');
  });

  it('nennt eine einzelne Gruppe in der Einzahl', () => {
    expect(formatGroupMembership(['Kiez'])).toBe('In der Gruppe Kiez.');
  });

  it('verbindet zwei Gruppen mit "und"', () => {
    expect(formatGroupMembership(['Kiez', 'Arbeit'])).toBe('In den Gruppen Kiez und Arbeit.');
  });

  it('setzt bei mehreren Kommas und nur vor der letzten ein "und"', () => {
    expect(formatGroupMembership(['Arbeit', 'Kiez', 'Zuhause'])).toBe(
      'In den Gruppen Arbeit, Kiez und Zuhause.',
    );
  });
});

describe('formatDeleteGroupWarning', () => {
  it('nennt, dass die Orte erhalten bleiben', () => {
    expect(formatDeleteGroupWarning(4, 0)).toBe(
      'Die Gruppe wird entfernt, die 4 Orte darin bleiben gespeichert.',
    );
  });

  it('beachtet die Einzahl', () => {
    expect(formatDeleteGroupWarning(1, 0)).toBe(
      'Die Gruppe wird entfernt, der Ort darin bleibt gespeichert.',
    );
  });

  it('sagt bei einer leeren Gruppe, dass sie leer ist', () => {
    expect(formatDeleteGroupWarning(0, 0)).toBe('Die Gruppe wird entfernt. Sie ist leer.');
  });

  it('warnt nur dann vor ausgeblendeten Orten, wenn es welche gibt', () => {
    // Sonst waere es eine Warnung vor einem Zustand, den es nicht gibt.
    expect(formatDeleteGroupWarning(4, 4)).toBe(
      'Die Gruppe wird entfernt, die 4 Orte darin bleiben gespeichert. ' +
        '4 davon sind ausgeblendet und bleiben es - einblenden geht einzeln auf der Orte-Seite.',
    );
    expect(formatDeleteGroupWarning(4, 1)).toBe(
      'Die Gruppe wird entfernt, die 4 Orte darin bleiben gespeichert. ' +
        'Einer davon ist ausgeblendet und bleibt es - einblenden geht einzeln auf der Orte-Seite.',
    );
  });
});
