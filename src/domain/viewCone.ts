/**
 * Sichtkegel mit Hysterese.
 *
 * Fachliche Regel aus docs/design.md 4.1: Eintritt bei 20 Grad, Austritt erst
 * bei 25 Grad. Die Hysterese ist keine Politur - ohne sie flackert die Liste im
 * Takt des Handzitterns und die Ein-/Austritts-Signale feuern im Stakkato.
 */

import { angularOffset } from './angle.js';

export interface ViewConeConfig {
  /** Halber Oeffnungswinkel, ab dem ein Ziel als eingetreten gilt. */
  readonly enterHalfAngleDeg: number;
  /** Halber Oeffnungswinkel, ab dem ein bereits erfasstes Ziel wieder herausfaellt. */
  readonly exitHalfAngleDeg: number;
}

export const DEFAULT_VIEW_CONE: ViewConeConfig = {
  enterHalfAngleDeg: 20,
  exitHalfAngleDeg: 25,
};

export class InvalidViewConeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidViewConeError';
  }
}

export function viewConeConfig(
  enterHalfAngleDeg: number,
  exitHalfAngleDeg = enterHalfAngleDeg + 5,
): ViewConeConfig {
  if (!Number.isFinite(enterHalfAngleDeg) || enterHalfAngleDeg <= 0 || enterHalfAngleDeg > 180) {
    throw new InvalidViewConeError('Der Eintrittswinkel muss zwischen 0 und 180 Grad liegen.');
  }
  if (exitHalfAngleDeg < enterHalfAngleDeg) {
    throw new InvalidViewConeError(
      'Der Austrittswinkel darf nicht kleiner als der Eintrittswinkel sein, sonst gibt es keine Hysterese.',
    );
  }
  if (exitHalfAngleDeg > 180) {
    throw new InvalidViewConeError('Der Austrittswinkel darf hoechstens 180 Grad betragen.');
  }
  return { enterHalfAngleDeg, exitHalfAngleDeg };
}

/** Ein Ziel, wie der Kegel es sieht: eine Kennung und eine Richtung. */
export interface ConeTarget {
  readonly id: string;
  readonly bearingDeg: number;
}

export interface ConeTransition {
  /** Alle Kennungen, die jetzt im Kegel liegen. */
  readonly inside: readonly string[];
  /** Seit dem letzten Aufruf neu eingetreten. */
  readonly entered: readonly string[];
  /** Seit dem letzten Aufruf herausgefallen (auch: geloescht). */
  readonly left: readonly string[];
}

/**
 * Zustandsbehaftet, weil Hysterese Gedaechtnis braucht: Ob ein Ziel bei 23 Grad
 * drin ist, haengt davon ab, ob es vorher drin war.
 */
export class ViewCone {
  private inside = new Set<string>();

  constructor(private config: ViewConeConfig = DEFAULT_VIEW_CONE) {}

  setConfig(config: ViewConeConfig): void {
    this.config = config;
  }

  /** Vergisst den Zustand - etwa wenn die Navigation neu gestartet wird. */
  reset(): void {
    this.inside = new Set<string>();
  }

  update(headingDeg: number, targets: readonly ConeTarget[]): ConeTransition {
    const next = new Set<string>();
    const entered: string[] = [];

    for (const target of targets) {
      const offset = angularOffset(headingDeg, target.bearingDeg);
      const wasInside = this.inside.has(target.id);
      const threshold = wasInside ? this.config.exitHalfAngleDeg : this.config.enterHalfAngleDeg;

      if (offset <= threshold) {
        next.add(target.id);
        if (!wasInside) {
          entered.push(target.id);
        }
      }
    }

    // Auch ein geloeschtes Ziel gilt als herausgefallen - sonst bliebe es
    // stumm verschwunden und die Signale waeren unvollstaendig.
    const left: string[] = [];
    for (const id of this.inside) {
      if (!next.has(id)) {
        left.push(id);
      }
    }

    this.inside = next;
    return { inside: [...next], entered, left };
  }
}
