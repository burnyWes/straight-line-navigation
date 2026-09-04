/**
 * Meldet den Service Worker an, der die App ohne Netz starten laesst.
 *
 * Der Worker selbst liegt als public/sw.js neben dem Build: Er braucht einen
 * festen Namen und den Gueltigkeitsbereich der Anwendung, gehashte Namen aus
 * dem Bundler waeren beides nicht.
 *
 * Scheitert die Anmeldung, laeuft die App normal weiter - dann eben nur mit
 * Netz. Ein Fehler hier darf den Start nicht verhindern.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  // Im Entwicklungsbetrieb stoert ein Zwischenspeicher nur: Der Worker wuerde
  // alte Staende ausliefern, waehrend Vite neue schickt.
  if (!import.meta.env.PROD) {
    return;
  }

  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Kein Grund zur Meldung: Ohne Worker fehlt der Offline-Start, alles
      // andere funktioniert unveraendert.
    });
  });
}
