/**
 * Toleranter Parser fuer eingefuegte Koordinaten.
 *
 * Ersatz fuer eine eigene Adresssuche (docs/design.md 6.2): Der Ort wird in
 * einer Karten-App gesucht, die bereits barrierefrei ist, und die Koordinate
 * herueberkopiert. Zwoelf Ziffern mit VoiceOver zu tippen ist keine zumutbare
 * Alternative - ein Vertipper an der dritten Nachkommastelle verschiebt um
 * hundert Meter.
 *
 * Reine Domaenenlogik: String rein, Coordinate oder Fehlergrund raus. Die
 * Fehlermeldung formuliert die Praesentation, nicht dieses Modul.
 */

import { coordinate, InvalidCoordinateError, type Coordinate } from './coordinate.js';

export type CoordinateParseFailure =
  /** Nichts eingegeben. */
  | 'empty'
  /** Kurzlink, der ohne Netz nicht aufgeloest werden kann. */
  | 'shortlink-unresolvable'
  /** Text erkannt, aber keine Koordinate darin gefunden. */
  | 'no-coordinate-found'
  /** Zahlen gefunden, aber ausserhalb des gueltigen Bereichs. */
  | 'out-of-range';

export type CoordinateParseResult =
  | { readonly ok: true; readonly coordinate: Coordinate }
  | { readonly ok: false; readonly reason: CoordinateParseFailure };

interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

/** Kurzlink-Hosts, die serverseitig aufgeloest werden muessten. */
const SHORTLINK_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'g.co',
  'bit.ly',
  'tinyurl.com',
  't.co',
]);

const DECIMAL_PAIR =
  /(-?\d+(?:\.\d+)?)\s*(?:[,;]\s*|\s+)(-?\d+(?:\.\d+)?)/;

/** Deutsche Dezimalkommas mit Komma als Trenner: "52,516275, 13,377704". */
const GERMAN_DECIMAL_PAIR =
  /^\s*(-?\d+),(\d+)\s*[,;]\s*(-?\d+),(\d+)\s*$/;

export function parseCoordinate(input: string): CoordinateParseResult {
  const text = input.trim();
  if (text.length === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (isShortlink(text)) {
    return { ok: false, reason: 'shortlink-unresolvable' };
  }

  const found =
    parseGeoUri(text) ??
    parseFromUrl(text) ??
    parseHemisphereNotation(text) ??
    parseGermanDecimalPair(text) ??
    parseDecimalPair(text);

  if (found === null) {
    return { ok: false, reason: 'no-coordinate-found' };
  }

  try {
    return { ok: true, coordinate: coordinate(found.lat, found.lon) };
  } catch (error) {
    if (error instanceof InvalidCoordinateError) {
      return { ok: false, reason: 'out-of-range' };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------

function isShortlink(text: string): boolean {
  const url = toUrl(text);
  if (url === null) {
    return false;
  }
  if (SHORTLINK_HOSTS.has(url.hostname.toLowerCase())) {
    return true;
  }
  // Apples Kurzlinks: maps.apple.com/p/<token>
  return url.hostname.toLowerCase().endsWith('maps.apple.com') && url.pathname.startsWith('/p/');
}

function toUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function parseGeoUri(text: string): LatLon | null {
  const match = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(text);
  return match === null ? null : numbersFrom(match[1], match[2]);
}

function parseFromUrl(text: string): LatLon | null {
  const url = toUrl(text);
  if (url === null) {
    return null;
  }

  // Apple Maps (?ll=), Google Maps (?q=, ?center=, ?daddr=), OpenStreetMap.
  for (const key of ['ll', 'q', 'center', 'daddr', 'sll', 'query', 'destination']) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      const pair = parseDecimalPair(value);
      if (pair !== null) {
        return pair;
      }
    }
  }

  const mlat = url.searchParams.get('mlat');
  const mlon = url.searchParams.get('mlon');
  if (mlat !== null && mlon !== null) {
    const pair = numbersFrom(mlat, mlon);
    if (pair !== null) {
      return pair;
    }
  }

  // Google Maps traegt die Kartenmitte im Pfad: /maps/@52.5163,13.3777,15z
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname);
  if (at !== null) {
    return numbersFrom(at[1], at[2]);
  }

  // OpenStreetMap: #map=15/52.5163/13.3777
  const osm = /map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
  if (osm !== null) {
    return numbersFrom(osm[1], osm[2]);
  }

  return null;
}

/**
 * Grad/Minuten/Sekunden und Grad/Dezimalminuten, in beliebiger Reihenfolge und
 * mit der Himmelsrichtung vor oder hinter den Zahlen.
 *
 * Das Vorzeichen kommt hier ausschliesslich aus dem Buchstaben, deshalb werden
 * Minuszeichen bewusst nicht gelesen.
 */
function parseHemisphereNotation(text: string): LatLon | null {
  const cleaned = text.toUpperCase().replace(/[°º'′"″]/g, ' ');
  const tokens = cleaned.match(/[NSEW]|\d+(?:[.,]\d+)?/g);
  if (tokens === null) {
    return null;
  }

  interface Group {
    letter: string;
    numbers: number[];
  }

  const groups: Group[] = [];
  let pending: number[] = [];
  let open: Group | null = null;

  for (const token of tokens) {
    if (token === 'N' || token === 'S' || token === 'E' || token === 'W') {
      if (pending.length > 0) {
        // Zahlen standen vor dem Buchstaben: 52 30 58.6 N
        groups.push({ letter: token, numbers: pending });
        pending = [];
        open = null;
      } else {
        // Buchstabe steht vorn: N 52 30.977
        open = { letter: token, numbers: [] };
        groups.push(open);
      }
      continue;
    }

    const value = Number(token.replace(',', '.'));
    if (!Number.isFinite(value)) {
      return null;
    }
    if (open !== null) {
      open.numbers.push(value);
    } else {
      pending.push(value);
    }
  }

  const latGroup = groups.find((g) => g.letter === 'N' || g.letter === 'S');
  const lonGroup = groups.find((g) => g.letter === 'E' || g.letter === 'W');
  if (latGroup === undefined || lonGroup === undefined) {
    return null;
  }

  const lat = sexagesimalToDecimal(latGroup.numbers, latGroup.letter === 'S');
  const lon = sexagesimalToDecimal(lonGroup.numbers, lonGroup.letter === 'W');
  if (lat === null || lon === null) {
    return null;
  }
  return { lat, lon };
}

function sexagesimalToDecimal(numbers: readonly number[], negative: boolean): number | null {
  if (numbers.length === 0 || numbers.length > 3) {
    return null;
  }
  const [degrees = 0, minutes = 0, seconds = 0] = numbers;
  const value = degrees + minutes / 60 + seconds / 3600;
  return negative ? -value : value;
}

function parseGermanDecimalPair(text: string): LatLon | null {
  const match = GERMAN_DECIMAL_PAIR.exec(text);
  if (match === null) {
    return null;
  }
  const [, latWhole, latFraction, lonWhole, lonFraction] = match;
  if (
    latWhole === undefined ||
    latFraction === undefined ||
    lonWhole === undefined ||
    lonFraction === undefined
  ) {
    return null;
  }
  return numbersFrom(`${latWhole}.${latFraction}`, `${lonWhole}.${lonFraction}`);
}

function parseDecimalPair(text: string): LatLon | null {
  const match = DECIMAL_PAIR.exec(text);
  return match === null ? null : numbersFrom(match[1], match[2]);
}

function numbersFrom(rawLat: string | undefined, rawLon: string | undefined): LatLon | null {
  if (rawLat === undefined || rawLon === undefined) {
    return null;
  }
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}
