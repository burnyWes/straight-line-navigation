import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_CONE,
  InvalidViewConeError,
  ViewCone,
  viewConeConfig,
} from './viewCone.js';

describe('viewConeConfig', () => {
  it('ergaenzt den Austrittswinkel mit fuenf Grad Hysterese', () => {
    expect(viewConeConfig(20)).toEqual({ enterHalfAngleDeg: 20, exitHalfAngleDeg: 25 });
  });

  it('weist einen Austrittswinkel kleiner als der Eintrittswinkel ab', () => {
    // Sonst gaebe es keine Hysterese, sondern ein Loch: ein Ziel koennte
    // gleichzeitig zu weit zum Bleiben und nah genug zum Eintreten sein.
    expect(() => viewConeConfig(20, 15)).toThrow(InvalidViewConeError);
  });

  it('weist unsinnige Eintrittswinkel ab', () => {
    expect(() => viewConeConfig(0)).toThrow(InvalidViewConeError);
    expect(() => viewConeConfig(-5)).toThrow(InvalidViewConeError);
    expect(() => viewConeConfig(200)).toThrow(InvalidViewConeError);
  });
});

describe('ViewCone', () => {
  let cone: ViewCone;

  beforeEach(() => {
    cone = new ViewCone(DEFAULT_VIEW_CONE);
  });

  it('nimmt ein Ziel innerhalb des Eintrittswinkels auf', () => {
    const result = cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
    expect(result.inside).toEqual(['a']);
    expect(result.entered).toEqual(['a']);
    expect(result.left).toEqual([]);
  });

  it('laesst ein Ziel ausserhalb des Eintrittswinkels draussen', () => {
    const result = cone.update(0, [{ id: 'a', bearingDeg: 22 }]);
    expect(result.inside).toEqual([]);
    expect(result.entered).toEqual([]);
  });

  it('meldet den Eintritt nur einmal', () => {
    cone.update(0, [{ id: 'a', bearingDeg: 10 }]);
    const second = cone.update(0, [{ id: 'a', bearingDeg: 10 }]);
    expect(second.inside).toEqual(['a']);
    expect(second.entered).toEqual([]);
  });

  describe('Hysterese', () => {
    it('haelt ein aufgenommenes Ziel bis zum Austrittswinkel', () => {
      cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
      // 22 Grad: zu weit zum Eintreten, aber nah genug zum Bleiben.
      const result = cone.update(0, [{ id: 'a', bearingDeg: 22 }]);
      expect(result.inside).toEqual(['a']);
      expect(result.left).toEqual([]);
    });

    it('laesst ein Ziel jenseits des Austrittswinkels fallen', () => {
      cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
      const result = cone.update(0, [{ id: 'a', bearingDeg: 26 }]);
      expect(result.inside).toEqual([]);
      expect(result.left).toEqual(['a']);
    });

    it('verhindert Flackern bei Zittern um die Eintrittsgrenze', () => {
      // Genau der Fall, wegen dem es die Hysterese gibt: Die Hand wackelt um
      // die 20-Grad-Marke. Ohne Hysterese wuerde hier bei jedem Schritt ein
      // Signal feuern und die Liste umspringen.
      cone.update(0, [{ id: 'a', bearingDeg: 19 }]);

      let signals = 0;
      for (const bearing of [21, 19, 22, 18, 23, 20, 24]) {
        const result = cone.update(0, [{ id: 'a', bearingDeg: bearing }]);
        signals += result.entered.length + result.left.length;
        expect(result.inside).toEqual(['a']);
      }
      expect(signals).toBe(0);
    });

    it('nimmt ein herausgefallenes Ziel erst am Eintrittswinkel wieder auf', () => {
      cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
      cone.update(0, [{ id: 'a', bearingDeg: 30 }]);

      const stillOut = cone.update(0, [{ id: 'a', bearingDeg: 22 }]);
      expect(stillOut.inside).toEqual([]);

      const backIn = cone.update(0, [{ id: 'a', bearingDeg: 19 }]);
      expect(backIn.entered).toEqual(['a']);
    });
  });

  it('rechnet ueber Norden hinweg', () => {
    const result = cone.update(355, [{ id: 'a', bearingDeg: 10 }]);
    expect(result.inside).toEqual(['a']);
  });

  it('meldet ein verschwundenes Ziel als herausgefallen', () => {
    // Geloescht oder aus dem Radius gefallen: Ohne Meldung verschwaende es
    // stumm und der Nutzer wuerde es nicht bemerken.
    cone.update(0, [{ id: 'a', bearingDeg: 5 }]);
    const result = cone.update(0, []);
    expect(result.left).toEqual(['a']);
    expect(result.inside).toEqual([]);
  });

  it('behandelt mehrere Ziele unabhaengig', () => {
    const result = cone.update(0, [
      { id: 'nah', bearingDeg: 5 },
      { id: 'rand', bearingDeg: 19 },
      { id: 'weg', bearingDeg: 90 },
    ]);
    expect(result.inside).toEqual(['nah', 'rand']);
  });

  it('vergisst den Zustand bei reset', () => {
    cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
    cone.reset();
    const result = cone.update(0, [{ id: 'a', bearingDeg: 15 }]);
    expect(result.entered).toEqual(['a']);
  });
});
