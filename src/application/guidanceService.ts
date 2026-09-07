/**
 * Haelt das gewaehlte Ziel und rechnet daraus, was die Zielseite zeigt und der
 * Zielton traegt.
 *
 * Gegenstueck zum NavigationService: Der beantwortet "was liegt in
 * Blickrichtung", dieser "wo ist **das**" (docs/design.md 4.7). Beide laufen im
 * selben Lauf und aus denselben Messwerten - frei von DOM und Browser-APIs.
 */

import type { Coordinate } from '../domain/coordinate.js';
import type { Location } from '../domain/location.js';
import {
  ArrivalState,
  OnTargetState,
  guidancePan,
  guidancePitchHz,
  guidanceRateHz,
  type GuidanceTone,
} from '../domain/guidance.js';
import { DEFAULT_VIEW_CONE, type ViewConeConfig } from '../domain/viewCone.js';
import { measureLocation, type NavigationEntry } from './navigationService.js';

export interface GuidanceSnapshot {
  /** Der aufgeloeste Ort, oder null - kein Ziel gewaehlt oder Ziel geloescht. */
  readonly target: Location | null;
  /** Entfernung, Peilung und Abweichung zum Ziel, oder null. */
  readonly entry: NavigationEntry | null;
  /**
   * Der Zielton, oder null - kein Ziel, oder kein gueltiger Standort.
   *
   * Der Ton ist keine stehende Anzeige, sondern eine fortlaufende Behauptung:
   * Aus einem alten Fix klaenge er exakt so souveraen wie aus einem gueltigen
   * (docs/design.md 4.6). Das Verstummen selbst ist die Nachricht.
   */
  readonly tone: GuidanceTone | null;
}

const NOTHING: GuidanceSnapshot = { target: null, entry: null, tone: null };

export class GuidanceService {
  private targetId: string | null = null;
  /**
   * Zuletzt aus einem gueltigen Standort gerechnete Peilung.
   *
   * Faellt der Standort aus, wird sie unveraendert weitergereicht, statt sie
   * aus dem alten Fix neu zu rechnen - dieselbe Regel wie bei der Kegel-Liste
   * (docs/design.md 4.6).
   */
  private lastEntry: NavigationEntry | null = null;
  private lastTarget: Location | null = null;
  /** Die Ankunft braucht Gedaechtnis - sonst kippt der Ton im Takt des GPS. */
  private readonly arrival = new ArrivalState();
  /**
   * "Geradeaus" braucht Gedaechtnis aus demselben Grund - hier ist es das
   * Handzittern statt der GPS-Streuung.
   */
  private readonly onTarget: OnTargetState;

  constructor(cone: ViewConeConfig = DEFAULT_VIEW_CONE) {
    this.onTarget = new OnTargetState(cone);
  }

  /**
   * Der Kegel aus den Einstellungen, wie ihn der NavigationService bekommt.
   *
   * Er entscheidet hier nicht, was in der Liste steht, sondern wann der
   * Dreiklang klingt - dieselbe Frage, dieselbe Antwort (docs/design.md 4.7).
   */
  setCone(cone: ViewConeConfig): void {
    this.onTarget.setConfig(cone);
    // Wie beim Guetemonitor: Die Schwelle hat sich verschoben, also darf der
    // gemerkte Zustand nicht aus der alten stammen.
    this.onTarget.reset();
  }

  get selectedId(): string | null {
    return this.targetId;
  }

  setTarget(id: string | null): void {
    if (id === this.targetId) {
      return;
    }
    this.targetId = id;
    // Der gehaltene Stand gehoerte zum alten Ziel und waere fuer das neue eine
    // Behauptung ueber einen Ort, zu dem noch nie gemessen wurde.
    this.forget();
  }

  reset(): void {
    this.forget();
  }

  update(
    position: Coordinate,
    headingDeg: number,
    locations: readonly Location[],
  ): GuidanceSnapshot {
    const id = this.targetId;
    // Eine Kennung ohne Ort faellt still weg: Der Ort ist geloescht worden,
    // waehrend seine Kennung in den Einstellungen stand - dieselbe Regel wie
    // bei verwaisten Gruppenmitgliedern (docs/design.md 6.6).
    const target = id === null ? null : (locations.find((candidate) => candidate.id === id) ?? null);
    if (target === null) {
      this.forget();
      return NOTHING;
    }

    const entry = measureLocation(position, headingDeg, target);
    this.lastTarget = target;
    this.lastEntry = entry;

    // Die exakte Entfernung, nicht die angezeigte: Die Anzeigestufen sind
    // gegen flackernde Beschriftungen gebaut (docs/design.md 4.2), der Takt
    // soll dagegen stetig mitlaufen.
    const rateHz = guidanceRateHz(entry.distanceMetres);
    const tone: GuidanceTone = {
      frequencyHz: guidancePitchHz(entry.offsetDeg),
      pan: guidancePan(entry.offsetDeg),
      rateHz,
      continuous: this.arrival.update(entry.distanceMetres),
      // Die exakte Abweichung, nicht die auf fuenf Grad gerundete der
      // Peilzeile: Die Rundung ist gegen flackernde Beschriftungen gebaut, die
      // Hysterese haelt den Akkord ohnehin ruhig.
      chord: this.onTarget.update(entry.offsetDeg),
    };

    return { target, entry, tone };
  }

  /**
   * Kein gueltiger Standort: haelt die zuletzt gerechnete Peilung.
   *
   * Sie steht damit weiterhin da, wo sie zuletzt stimmte. Dass sie nicht mehr
   * stimmt, sagt die Statuszeile - und ab Phase 2 das Verstummen des Tons.
   */
  holdStale(): GuidanceSnapshot {
    return { target: this.lastTarget, entry: this.lastEntry, tone: null };
  }

  private forget(): void {
    this.lastEntry = null;
    this.lastTarget = null;
    // Ankunft und "geradeaus" gehoeren zum Ziel: Beim Wechsel waeren sie eine
    // Aussage ueber einen Ort, zu dem noch nie gemessen wurde.
    this.arrival.reset();
    this.onTarget.reset();
  }
}
