/**
 * Erzeugt die App-Symbole als PNG - ohne Abhaengigkeiten.
 *
 * Das Projekt kommt mit drei Entwicklungspaketen aus (docs/design.md 9); eine
 * Bildbibliothek nur fuer drei Symbole waere ein schlechter Tausch. Die Dateien
 * unter public/icons/ sind eingecheckt, der Build braucht dieses Skript nicht.
 *
 *     node tools/make-icons.mjs
 *
 * Motiv: ein nach oben zeigender Navigationspfeil, weiss auf dunklem Grund
 * (Kontrast ueber 15:1). Der Pfeil bleibt innerhalb des inneren Kreises mit
 * 40 Prozent Radius, damit ihn ein "maskable"-Zuschnitt nicht anschneidet.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKGROUND = [0x1a, 0x1a, 0x1a]; // --line
const FOREGROUND = [0xff, 0xff, 0xff]; // --on-dark

/** Pfeilspitze oben, Kerbe unten - der klassische Richtungszeiger. */
const ARROW = [
  [0.5, 0.2225],
  [0.7625, 0.7775],
  [0.5, 0.62],
  [0.2375, 0.7775],
];

const SIZES = [180, 192, 512];

// --- Zeichnen ---------------------------------------------------------------

function insidePolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Kantenglaettung durch Ueberabtastung - sonst franst der Pfeil aus. */
function render(size, samples = 4) {
  const pixels = Buffer.alloc(size * size * 3);
  const step = 1 / (size * samples);
  const offset = step / 2;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px / size + sx * step + offset;
          const y = py / size + sy * step + offset;
          if (insidePolygon(ARROW, x, y)) {
            hits += 1;
          }
        }
      }
      const coverage = hits / (samples * samples);
      const base = (py * size + px) * 3;
      for (let c = 0; c < 3; c += 1) {
        pixels[base + c] = Math.round(BACKGROUND[c] + (FOREGROUND[c] - BACKGROUND[c]) * coverage);
      }
    }
  }
  return pixels;
}

// --- PNG --------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Farbtyp 2 (RGB, ohne Alpha) - iOS mag undurchsichtige Symbole. */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Bittiefe
  header[9] = 2; // RGB
  header[10] = 0; // Deflate
  header[11] = 0; // Adaptiver Filter
  header[12] = 0; // Kein Interlace

  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // Filtertyp "none"
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Ausgabe ----------------------------------------------------------------

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(target, { recursive: true });

for (const size of SIZES) {
  const file = join(target, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`${file} (${size}x${size})`);
}
