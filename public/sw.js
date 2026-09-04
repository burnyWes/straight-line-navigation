/*
 * Service Worker: Die App muss ohne Netz starten.
 *
 * Genau dafuer ist sie gedacht - draussen, schlechter Empfang, kein Backend.
 * Eine App, die zum Losgehen erst ein Netz braucht, waere in genau dem Moment
 * unbrauchbar, in dem sie gebraucht wird.
 *
 * Bewusst handgeschrieben und klein statt Workbox: Das Projekt kommt ohne
 * UI-Framework aus (docs/design.md 9), eine Build-Abhaengigkeit fuer knapp
 * hundert Zeilen Zwischenspeicher waere ein schlechter Tausch.
 *
 * Strategie:
 *   Seitenaufrufe  -> zuerst Netz, sonst zwischengespeicherte index.html.
 *                     So kommt eine neue Fassung an, sobald Netz da ist.
 *   Alles andere   -> zuerst Zwischenspeicher. Die Dateinamen tragen einen
 *                     Hash, gleicher Name heisst gleicher Inhalt.
 *
 * Kein skipWaiting: Eine neue Fassung uebernimmt beim naechsten Kaltstart.
 * Assets unter laufender Navigation auszutauschen bringt nichts und kann einen
 * Lauf zerlegen.
 *
 * VERSION erhoehen, wenn sich die Strategie aendert - das raeumt alte
 * Zwischenspeicher ab.
 */

const VERSION = 'v1';
const CACHE = `luftlinie-${VERSION}`;

/** Die Schale. Ohne sie startet gar nichts. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/*
 * ignoreVary ist hier kein Schludern, sondern noetig - und gemessen:
 *
 * Der Server schickt "Vary: Origin". Der Worker fuellt den Zwischenspeicher
 * mit eigenen fetch-Aufrufen, die keine Origin-Kopfzeile tragen; die Seite
 * fordert JS und CSS aber mit crossorigin an, also *mit* Origin. Die
 * Cache-API vergleicht die Vary-Kopfzeilen und findet dann nichts - die App
 * bleibt offline weiss, obwohl alles im Speicher liegt.
 *
 * Die Dateinamen tragen einen Inhalts-Hash. Gleiche URL heisst gleicher
 * Inhalt, unabhaengig von jedem Vary. Genau deshalb ist das hier sicher.
 */
const MATCH = { ignoreVary: true };

/**
 * Vite vergibt gehashte Dateinamen, die hier niemand kennen kann. Deshalb
 * fragt der Worker beim Einbau die Bauliste ab (build.manifest in
 * vite.config.ts). Ohne das waere die App erst nach dem *zweiten* Besuch
 * offline lauffaehig - und der zweite Besuch ist womoeglich schon der ohne
 * Netz.
 */
async function buildAssets() {
  try {
    const response = await fetch('./assets-manifest.json', { cache: 'no-cache' });
    if (!response.ok) {
      return [];
    }
    const manifest = await response.json();
    const files = new Set();
    for (const entry of Object.values(manifest)) {
      for (const file of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
        if (typeof file === 'string') {
          files.add(`./${file}`);
        }
      }
    }
    return [...files];
  } catch {
    // Kein Netz beim Einbau, oder ein Entwicklungsserver ohne Bauliste. Die
    // Schale steht trotzdem, der Rest fuellt sich im Betrieb.
    return [];
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const assets = await buildAssets();
      // Einzeln: Ein fehlendes Symbol darf nicht den ganzen Einbau kippen.
      await Promise.all(
        [...SHELL, ...assets].map((url) => cache.add(url).catch(() => undefined)),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== CACHE) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', response.clone());
          return response;
        } catch {
          const cached = await caches.match('./index.html', MATCH);
          if (cached !== undefined) {
            return cached;
          }
          throw new Error('Offline und keine gespeicherte Fassung vorhanden.');
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request, MATCH);
      if (cached !== undefined) {
        return cached;
      }
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
