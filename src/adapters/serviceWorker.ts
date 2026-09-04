/**
 * Meldet den Service Worker an, der die App ohne Netz starten laesst, und
 * sorgt dafuer, dass eine neue Fassung auch wirklich ankommt.
 *
 * Der Worker selbst liegt als public/sw.js neben dem Build: Er braucht einen
 * festen Namen und den Gueltigkeitsbereich der Anwendung, gehashte Namen aus
 * dem Bundler waeren beides nicht.
 *
 * Zum Erneuern: Eine installierte App wird auf dem Telefon nie geschlossen,
 * nur pausiert. Ein wartender Worker uebernimmt darum von allein nie. Also
 * wird beim Zurueckkehren nach einer neuen Fassung gesehen und beim Weglegen
 * uebernommen - dann faellt das Neuladen niemandem auf, und mitten in einem
 * Lauf passiert es nicht.
 *
 * Scheitert die Anmeldung, laeuft die App normal weiter - dann eben nur mit
 * Netz. Ein Fehler hier darf den Start nicht verhindern.
 */

/**
 * @param isBusy Wahr, solange ein Navigationslauf laeuft. Waehrenddessen wird
 *   nicht erneuert: Ein Neuladen wuerde den Lauf abreissen.
 */
export function registerServiceWorker(isBusy: () => boolean): void {
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
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((registration) => {
        watchForUpdates(registration, isBusy);
      })
      .catch(() => {
        // Kein Grund zur Meldung: Ohne Worker fehlt der Offline-Start, alles
        // andere funktioniert unveraendert.
      });
  });
}

function watchForUpdates(
  registration: ServiceWorkerRegistration,
  isBusy: () => boolean,
): void {
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur einmal: Ein zweites Neuladen waehrend des ersten faengt sich sonst
    // in einer Schleife.
    if (reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Zurueck in der App: nachsehen, ob es etwas Neues gibt. Ein bedingter
      // Abruf einer kleinen Datei, das faellt auch bei duennem Netz nicht auf.
      void registration.update().catch(() => undefined);
      return;
    }

    const waiting = registration.waiting;
    // Ohne Steuerung ist es die Erstanmeldung - da gibt es nichts abzuloesen.
    if (waiting === null || navigator.serviceWorker.controller === null) {
      return;
    }
    if (isBusy()) {
      return;
    }
    waiting.postMessage('skip-waiting');
  });
}
