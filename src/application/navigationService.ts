/**
 * Verrechnet Position, Blickrichtung und gespeicherte Orte zu dem, was die
 * Navigationsansicht zeigt und die Signale melden.
 *
 * Frei von DOM und Browser-APIs.
 */

import type { Coordinate } from '../domain/coordinate.js';
import type { Location } from '../domain/location.js';
import { greatCircleDistance, initialBearing } from '../domain/geo.js';
import { signedAngularDifference } from '../domain/angle.js';
import { roundDisplayDistanceMetres } from '../domain/distance.js';
import { DEFAULT_VIEW_CONE, ViewCone, type ViewConeConfig } from '../domain/viewCone.js';

export interface NavigationSettings {
  readonly cone: ViewConeConfig;
  /**
   * Obergrenze in Metern, oder null fuer unbegrenzt.
   *
   * Standard ist unbegrenzt: Ein stillschweigend ausgeblendetes Ziel ist bei
   * einer Audio-App nicht bemerkbar. Wer filtern will, stellt es bewusst ein.
   */
  readonly maxDistanceMetres: number | null;
}

export const DEFAULT_NAVIGATION_SETTINGS: NavigationSettings = {
  cone: DEFAULT_VIEW_CONE,
  maxDistanceMetres: null,
};

export interface NavigationEntry {
  readonly location: Location;
  /** Exakte Luftlinie in Metern - fuer Sortierung und Vergleiche. */
  readonly distanceMetres: number;
  /** Auf Anzeigestufen gerundet - fuer Labels, die nicht flackern. */
  readonly displayDistanceMetres: number;
  /** Peilung zum Ziel, 0..360 gegen geografisch Nord. */
  readonly bearingDeg: number;
  /** Abweichung von der Blickrichtung, -180..180. Positiv = rechts. */
  readonly offsetDeg: number;
}

export interface NavigationSnapshot {
  /**
   * Was angezeigt wird: nur der Kegelinhalt, **weitestes Ziel oben, naechstes
   * unten**. Erswiped wird von oben nach unten, und das naechste Ziel ist das
   * wichtigste - es steht am Ende des Weges, nicht am Anfang (design.md 4.2).
   */
  readonly entries: readonly NavigationEntry[];
  readonly entered: readonly Location[];
  readonly left: readonly Location[];
  readonly frozen: boolean;
  /**
   * Der Standort ist zu alt, um noch etwas zu behaupten - die Liste steht
   * still und die Zahlen stammen aus der letzten gueltigen Messung.
   */
  readonly positionStale: boolean;
}

export class NavigationService {
  private readonly cone: ViewCone;
  private settings: NavigationSettings;
  private frozen = false;
  /** Reihenfolge der zuletzt angezeigten Liste - Grundlage fuers Einfrieren. */
  private lastOrder: readonly string[] = [];
  /** Reihenfolge, die beim Einfrieren galt - sie bleibt bis zum Auftauen. */
  private frozenOrder: readonly string[] = [];
  /**
   * Zuletzt aus einem gueltigen Standort gerechnete Liste.
   *
   * Faellt der Standort aus, wird sie unveraendert weitergereicht, statt sie
   * aus dem alten Fix neu zu rechnen: Die Zahlen bleiben stehen, wo sie zuletzt
   * stimmten, und die Liste sortiert sich beim Drehen nicht mehr um.
   */
  private lastEntries: readonly NavigationEntry[] = [];
  /**
   * Zuletzt gesehene Orte je Kennung.
   *
   * Noetig, damit ein Ziel, das geloescht wurde oder aus dem Radius gefallen
   * ist, beim "raus"-Signal noch benennbar ist - sonst verschwaende es stumm.
   */
  private readonly known = new Map<string, Location>();

  constructor(settings: NavigationSettings = DEFAULT_NAVIGATION_SETTINGS) {
    this.settings = settings;
    this.cone = new ViewCone(settings.cone);
  }

  updateSettings(settings: NavigationSettings): void {
    this.settings = settings;
    this.cone.setConfig(settings.cone);
  }

  /**
   * Friert die Liste ein, solange der VoiceOver-Fokus darin steht.
   *
   * Die Signale laufen weiter - eingefroren ist die Anzeige, nicht der Kegel.
   */
  freeze(): void {
    if (!this.frozen) {
      this.frozen = true;
      this.frozenOrder = this.lastOrder;
    }
  }

  unfreeze(): void {
    this.frozen = false;
    this.frozenOrder = [];
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  reset(): void {
    this.cone.reset();
    this.unfreeze();
    this.lastOrder = [];
    this.lastEntries = [];
    this.known.clear();
  }

  update(
    position: Coordinate,
    headingDeg: number,
    locations: readonly Location[],
  ): NavigationSnapshot {
    for (const location of locations) {
      this.known.set(location.id, location);
    }

    const measured = locations
      .map((location) => this.measure(position, headingDeg, location))
      .filter((entry) => this.withinRange(entry.distanceMetres));

    const byId = new Map(measured.map((entry) => [entry.location.id, entry]));

    // Laeuft auch bei leerer Liste: Nur so meldet der Kegel Ziele als
    // herausgefallen, die geloescht wurden oder aus dem Radius gefallen sind.
    const transition = this.cone.update(
      headingDeg,
      measured.map((entry) => ({ id: entry.location.id, bearingDeg: entry.bearingDeg })),
    );

    const inside = transition.inside
      .map((id) => byId.get(id))
      .filter((entry): entry is NavigationEntry => entry !== undefined);

    const entries = this.frozen
      ? // Eingefroren heisst: keine Umsortierung, kein Entfernen. Die Entfernungen
        // laufen still weiter, damit die Zahlen beim Auftauen nicht springen.
        this.frozenOrder
          .map((id) => byId.get(id))
          .filter((entry): entry is NavigationEntry => entry !== undefined)
      : sortFarthestFirst(inside);

    if (!this.frozen) {
      this.lastOrder = entries.map((entry) => entry.location.id);
    }

    this.lastEntries = entries;

    return {
      entries,
      entered: this.resolve(transition.entered),
      left: this.resolve(transition.left),
      frozen: this.frozen,
      positionStale: false,
    };
  }

  /**
   * Kein gueltiger Standort: haelt die zuletzt gezeigte Liste.
   *
   * Der Kegel wird bewusst **nicht** fortgeschrieben. Ein Ein- oder Austritt,
   * der aus einem veralteten Standort folgt, ist eine Behauptung ueber die
   * Wirklichkeit, die niemand geprueft hat - und er klaenge genauso wie ein
   * echter. Lieber kein Signal als ein falsches. Beim naechsten gueltigen Fix
   * setzt der Kegel mit seiner Hysterese dort wieder auf, wo er stand.
   */
  holdStale(): NavigationSnapshot {
    return {
      entries: this.lastEntries,
      entered: [],
      left: [],
      frozen: true,
      positionStale: true,
    };
  }

  private measure(
    position: Coordinate,
    headingDeg: number,
    location: Location,
  ): NavigationEntry {
    const distanceMetres = greatCircleDistance(position, location.coordinate);
    const bearingDeg = initialBearing(position, location.coordinate);
    return {
      location,
      distanceMetres,
      displayDistanceMetres: roundDisplayDistanceMetres(distanceMetres),
      bearingDeg,
      offsetDeg: signedAngularDifference(headingDeg, bearingDeg),
    };
  }

  private withinRange(distanceMetres: number): boolean {
    const max = this.settings.maxDistanceMetres;
    return max === null || distanceMetres <= max;
  }

  private resolve(ids: readonly string[]): Location[] {
    return ids
      .map((id) => this.known.get(id))
      .filter((location): location is Location => location !== undefined);
  }
}

/** Weitestes Ziel zuerst; bei gleicher Entfernung alphabetisch, damit die Reihenfolge stabil ist. */
function sortFarthestFirst(entries: readonly NavigationEntry[]): NavigationEntry[] {
  return [...entries].sort((a, b) => {
    const byDistance = b.distanceMetres - a.distanceMetres;
    return byDistance !== 0 ? byDistance : a.location.name.localeCompare(b.location.name, 'de');
  });
}
