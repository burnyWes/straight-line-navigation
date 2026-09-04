import { describe, expect, it } from 'vitest';
import { MAX_POSITION_AGE_MS, isPositionStale, positionAgeMs } from './positionFreshness.js';
import type { PositionFix } from './ports.js';
import { BRANDENBURGER_TOR } from '../testing/fixtures.js';

const NOW = 1_700_000_000_000;

function fixAt(timestamp: number): PositionFix {
  return { coordinate: BRANDENBURGER_TOR, accuracyMetres: 8, timestamp };
}

describe('positionAgeMs', () => {
  it('misst den Abstand zur Uhr', () => {
    expect(positionAgeMs(fixAt(NOW - 3_000), NOW)).toBe(3_000);
  });

  it('macht einen Fix aus der Zukunft nicht frischer als frisch', () => {
    expect(positionAgeMs(fixAt(NOW + 5_000), NOW)).toBe(0);
  });
});

describe('isPositionStale', () => {
  it('haelt einen frischen Fix fuer gueltig', () => {
    expect(isPositionStale(fixAt(NOW - 1_000), NOW)).toBe(false);
  });

  it('laesst die Grenze selbst noch gelten', () => {
    expect(isPositionStale(fixAt(NOW - MAX_POSITION_AGE_MS), NOW)).toBe(false);
  });

  it('meldet den Fix jenseits der Grenze als veraltet', () => {
    expect(isPositionStale(fixAt(NOW - MAX_POSITION_AGE_MS - 1), NOW)).toBe(true);
  });

  it('bleibt unter dem Timeout der Geolocation-API, damit der Nutzer frueher erfaehrt', () => {
    expect(MAX_POSITION_AGE_MS).toBeLessThan(20_000);
  });
});
