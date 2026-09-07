import { describe, expect, it } from 'vitest';
import { dialPoint } from './dial.js';

describe('dialPoint', () => {
  it('setzt geradeaus nach oben', () => {
    // Der Pfeil steht fest und zeigt nach oben - er ist die eigene Nase.
    const { x, y } = dialPoint(0);
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(20, 6);
  });

  it('setzt rechts nach rechts', () => {
    const { x, y } = dialPoint(90);
    expect(x).toBeCloseTo(180, 6);
    expect(y).toBeCloseTo(100, 6);
  });

  it('setzt hinter einem nach unten', () => {
    const { x, y } = dialPoint(180);
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(180, 6);
  });

  it('setzt links nach links', () => {
    // In SVG waechst y nach unten - ohne das Minus vor dem Kosinus stuende
    // hier das Spiegelbild.
    const { x, y } = dialPoint(-90);
    expect(x).toBeCloseTo(20, 6);
    expect(y).toBeCloseTo(100, 6);
  });

  it('bleibt auf dem Ring', () => {
    for (const offset of [0, 17, 45, 90, 137, 180, -30, -175]) {
      const { x, y } = dialPoint(offset);
      expect(Math.hypot(x - 100, y - 100)).toBeCloseTo(80, 6);
    }
  });
});
