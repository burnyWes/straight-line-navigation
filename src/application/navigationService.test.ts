import { beforeEach, describe, expect, it } from 'vitest';
import { NavigationService, type NavigationSettings } from './navigationService.js';
import { DEFAULT_VIEW_CONE, viewConeConfig } from '../domain/viewCone.js';
import { BRANDENBURGER_TOR, pointAt, testLocation } from '../testing/fixtures.js';

const HERE = BRANDENBURGER_TOR;
const NORTH = 0;

const settings: NavigationSettings = {
  cone: DEFAULT_VIEW_CONE,
  maxDistanceMetres: null,
};

/** Ein Ort in gegebener Richtung und Entfernung von der Teststandort-Position. */
function target(name: string, bearingDeg: number, distanceMetres: number) {
  return testLocation(name, pointAt(HERE, bearingDeg, distanceMetres));
}

describe('NavigationService', () => {
  let service: NavigationService;

  beforeEach(() => {
    service = new NavigationService(settings);
  });

  it('zeigt nur Ziele im Sichtkegel', () => {
    const drin = target('Bahnhof', 10, 1200);
    const draussen = target('Museum', 90, 800);

    const snapshot = service.update(HERE, NORTH, [drin, draussen]);

    expect(snapshot.entries.map((e) => e.location.name)).toEqual(['Bahnhof']);
  });

  it('sortiert das naechste Ziel nach oben', () => {
    const fern = target('Bahnhof', 5, 1200);
    const nah = target('Zuhause', -10, 500);

    const snapshot = service.update(HERE, NORTH, [fern, nah]);

    expect(snapshot.entries.map((e) => e.location.name)).toEqual(['Zuhause', 'Bahnhof']);
  });

  it('laesst die Liste leer, wenn nichts im Kegel liegt', () => {
    const snapshot = service.update(HERE, NORTH, [target('Museum', 180, 400)]);
    expect(snapshot.entries).toEqual([]);
  });

  it('liefert gerundete und exakte Entfernung getrennt', () => {
    const snapshot = service.update(HERE, NORTH, [target('Bahnhof', 0, 1234)]);
    const entry = snapshot.entries[0];
    expect(entry).toBeDefined();
    expect(entry?.distanceMetres).toBeCloseTo(1234, 0);
    expect(entry?.displayDistanceMetres).toBe(1200);
  });

  it('gibt die Abweichung vorzeichenbehaftet an', () => {
    const rechts = target('Rechts', 15, 500);
    const links = target('Links', -15, 500);

    const snapshot = service.update(HERE, NORTH, [rechts, links]);
    const byName = new Map(snapshot.entries.map((e) => [e.location.name, e.offsetDeg]));

    expect(byName.get('Rechts') ?? 0).toBeGreaterThan(0);
    expect(byName.get('Links') ?? 0).toBeLessThan(0);
  });

  describe('Entfernungsgrenze', () => {
    it('blendet Ziele jenseits der Grenze aus', () => {
      service.updateSettings({ cone: DEFAULT_VIEW_CONE, maxDistanceMetres: 1000 });
      const snapshot = service.update(HERE, NORTH, [
        target('Nah', 0, 800),
        target('Fern', 0, 1500),
      ]);
      expect(snapshot.entries.map((e) => e.location.name)).toEqual(['Nah']);
    });

    it('zeigt ohne Grenze auch weit entfernte Ziele', () => {
      const snapshot = service.update(HERE, NORTH, [target('Sehr fern', 0, 50_000)]);
      expect(snapshot.entries).toHaveLength(1);
    });
  });

  describe('Signale', () => {
    it('meldet den Eintritt eines Ziels genau einmal', () => {
      const bahnhof = target('Bahnhof', 10, 1200);

      const first = service.update(HERE, NORTH, [bahnhof]);
      expect(first.entered.map((l) => l.name)).toEqual(['Bahnhof']);

      const second = service.update(HERE, NORTH, [bahnhof]);
      expect(second.entered).toEqual([]);
    });

    it('meldet den Austritt beim Wegdrehen', () => {
      const bahnhof = target('Bahnhof', 10, 1200);
      service.update(HERE, NORTH, [bahnhof]);

      const away = service.update(HERE, 90, [bahnhof]);
      expect(away.left.map((l) => l.name)).toEqual(['Bahnhof']);
    });

    it('meldet ein geloeschtes Ziel als herausgefallen und kann es benennen', () => {
      // Der Ort ist aus der Liste verschwunden - fuer die Ansage "raus" muss
      // sein Name trotzdem noch verfuegbar sein.
      const bahnhof = target('Bahnhof', 10, 1200);
      service.update(HERE, NORTH, [bahnhof]);

      const deleted = service.update(HERE, NORTH, []);
      expect(deleted.left.map((l) => l.name)).toEqual(['Bahnhof']);
    });

    it('meldet ein aus dem Radius gefallenes Ziel', () => {
      const bahnhof = target('Bahnhof', 0, 900);
      service.update(HERE, NORTH, [bahnhof]);

      service.updateSettings({ cone: DEFAULT_VIEW_CONE, maxDistanceMetres: 500 });
      const out = service.update(HERE, NORTH, [bahnhof]);
      expect(out.left.map((l) => l.name)).toEqual(['Bahnhof']);
    });

    it('feuert am Kegelrand nicht im Stakkato', () => {
      const bahnhof = target('Bahnhof', 21, 1000);
      service.update(HERE, 2, [bahnhof]); // Abweichung 19 Grad: tritt ein

      let signale = 0;
      for (const heading of [0, 3, -1, 4, 1, 2]) {
        const snapshot = service.update(HERE, heading, [bahnhof]);
        signale += snapshot.entered.length + snapshot.left.length;
      }
      expect(signale).toBe(0);
    });
  });

  describe('Auto-Freeze', () => {
    it('haelt die Reihenfolge fest, solange der Fokus in der Liste steht', () => {
      const bahnhof = target('Bahnhof', 5, 1200);
      const zuhause = target('Zuhause', -5, 500);

      const before = service.update(HERE, NORTH, [bahnhof, zuhause]);
      expect(before.entries.map((e) => e.location.name)).toEqual(['Zuhause', 'Bahnhof']);

      service.freeze();

      // Der Nutzer geht: Der Bahnhof waere jetzt naeher und wuerde die Liste
      // umsortieren - genau das darf unter dem Finger nicht passieren.
      const naeherAmBahnhof = pointAt(HERE, 5, 1100);
      const frozen = service.update(naeherAmBahnhof, NORTH, [bahnhof, zuhause]);

      expect(frozen.frozen).toBe(true);
      expect(frozen.entries.map((e) => e.location.name)).toEqual(['Zuhause', 'Bahnhof']);
    });

    it('aktualisiert die Entfernungen auch im eingefrorenen Zustand', () => {
      const bahnhof = target('Bahnhof', 0, 1200);
      service.update(HERE, NORTH, [bahnhof]);
      service.freeze();

      const naeher = pointAt(HERE, 0, 300);
      const frozen = service.update(naeher, NORTH, [bahnhof]);

      expect(frozen.entries[0]?.displayDistanceMetres).toBe(900);
    });

    it('entfernt im eingefrorenen Zustand keine Eintraege', () => {
      const bahnhof = target('Bahnhof', 10, 1200);
      service.update(HERE, NORTH, [bahnhof]);
      service.freeze();

      const weggedreht = service.update(HERE, 90, [bahnhof]);
      expect(weggedreht.entries.map((e) => e.location.name)).toEqual(['Bahnhof']);
    });

    it('meldet Signale auch im eingefrorenen Zustand', () => {
      // Eingefroren ist die Anzeige, nicht der Kegel - sonst verstummten die
      // Toene genau dann, wenn der Nutzer die Liste liest.
      const bahnhof = target('Bahnhof', 10, 1200);
      service.update(HERE, NORTH, [bahnhof]);
      service.freeze();

      const weggedreht = service.update(HERE, 90, [bahnhof]);
      expect(weggedreht.left.map((l) => l.name)).toEqual(['Bahnhof']);
    });

    it('folgt nach dem Auftauen wieder der Blickrichtung', () => {
      const fern = target('Fern', 0, 1000);
      const nah = target('Nah', 0, 400);

      service.update(HERE, NORTH, [fern, nah]);
      service.freeze();

      const weggedreht = service.update(HERE, 90, [fern, nah]);
      expect(weggedreht.entries.map((e) => e.location.name)).toEqual(['Nah', 'Fern']);

      service.unfreeze();
      const after = service.update(HERE, 90, [fern, nah]);

      expect(after.frozen).toBe(false);
      expect(after.entries).toEqual([]);
    });
  });

  it('uebernimmt einen geaenderten Kegelwinkel', () => {
    const seitlich = target('Seitlich', 30, 800);

    expect(service.update(HERE, NORTH, [seitlich]).entries).toEqual([]);

    service.updateSettings({ cone: viewConeConfig(45), maxDistanceMetres: null });
    expect(service.update(HERE, NORTH, [seitlich]).entries).toHaveLength(1);
  });
});
