/**
 * Einstiegspunkt: verdrahtet Adapter, Anwendungsfaelle und Oberflaeche.
 *
 * Die aeusserste Schale - hier und nur hier werden Browser-APIs beruehrt.
 */

import './ui/styles.css';

import { NavigationService } from './application/navigationService.js';
import { LocationService } from './application/locationService.js';
import { toNavigationSettings, type AppSettings } from './application/settings.js';
import { isPositionStale } from './application/positionFreshness.js';
import { systemClock, type CuePort, type PositionFix, type Unsubscribe } from './application/ports.js';
import { HeadingQualityMonitor } from './domain/headingQuality.js';

import { StoredLocationRepository } from './adapters/storedLocationRepository.js';
import { loadSettings, saveSettings } from './adapters/storedSettings.js';
import { GeolocationPositionProvider } from './adapters/geolocationPositionProvider.js';
import {
  DeviceOrientationHeadingProvider,
  requestHeadingPermission,
} from './adapters/deviceOrientationHeadingProvider.js';
import { WebAudioCue, silentCue } from './adapters/cues.js';
import { ScreenWakeLock } from './adapters/wakeLock.js';
import { deserializeLocations, serializeBackup } from './adapters/locationSerialization.js';
import { newId } from './adapters/ids.js';
import { registerServiceWorker } from './adapters/serviceWorker.js';

import { Announcer } from './ui/announcer.js';
import { Tabs } from './ui/tabs.js';
import { NavigationView } from './ui/navigationView.js';
import { LocationsView } from './ui/locationsView.js';
import { SettingsView } from './ui/settingsView.js';
import { el } from './ui/dom.js';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Kein Wurzelelement gefunden.');
}

// --- Adapter und Dienste ----------------------------------------------------

const store = window.localStorage;
const repository = new StoredLocationRepository(store);
let settings: AppSettings = loadSettings(store);

const locationService = new LocationService(repository, systemClock, newId);
const navigationService = new NavigationService(toNavigationSettings(settings));
const qualityMonitor = new HeadingQualityMonitor(settings.coneHalfAngleDeg);
const wakeLock = new ScreenWakeLock();

const announcer = new Announcer();
const audioCue = new WebAudioCue();

function cuePort(): CuePort {
  return settings.cues.earcon ? audioCue : silentCue;
}

// --- Zustand des Navigationslaufs -------------------------------------------

let latestFix: PositionFix | null = null;
let latestHeading: number | null = null;
let dirty = false;
let running = false;
/** Zeitpunkt des letzten Bildes - Grundlage fuer den Herzschlag in tick(). */
let lastRenderMs = 0;
const subscriptions: Unsubscribe[] = [];

// Muss ohne Netz starten koennen - genau dafuer ist die App gedacht. Eine
// neue Fassung uebernimmt erst, wenn kein Lauf aktiv ist: Das Neuladen wuerde
// ihn sonst abreissen.
registerServiceWorker(() => running);

// --- Oberflaeche ------------------------------------------------------------

const navigationView = new NavigationView(announcer, {
  onStart: () => {
    void startNavigation();
  },
  onStop: () => {
    stopNavigation();
  },
  onFreezeChange: (frozen) => {
    if (frozen) {
      navigationService.freeze();
    } else {
      navigationService.unfreeze();
    }
    dirty = true;
  },
});

const locationsView = new LocationsView(announcer, {
  suggestName: () => locationService.suggestName(),
  onSaveHere: (name) => {
    // Den Fix festhalten: Gespeichert wird der Standort zum Zeitpunkt des
    // Tippens, nicht der, der beim Schreiben zufaellig aktuell ist.
    const fix = latestFix;
    if (fix === null) {
      locationsView.reportFailure('no-position');
      return;
    }
    // Ein veralteter Fix ist hier schlimmer als gar keiner: Der Ort landet
    // dauerhaft in der Liste und sieht danach aus wie jeder andere.
    if (isPositionStale(fix, systemClock.now().getTime())) {
      locationsView.reportFailure('position-stale');
      return;
    }
    handleSave(() => locationService.saveCurrentPosition(name, fix));
  },
  onSaveText: (name, text) => {
    handleSave(() => locationService.saveFromText(name, text));
  },
  onRename: (id, name) => {
    handleSave(() => locationService.rename(id, name));
  },
  onToggleHidden: (id, hidden) => {
    guardStorage(
      () => {
        const updated = locationService.setHidden(id, hidden);
        if (updated === null) {
          return;
        }
        // Nur die eine Zeile nachziehen: Der Fokus steht auf dem Knopf, und
        // ein neu gebauter naehme ihn mit.
        locationsView.applyHidden(updated);
        // Der Kegel rechnet im naechsten Bild mit der kuerzeren Liste. Liegt
        // der Ort gerade darin, klingt der Austritts-Ton - wie beim Loeschen.
        dirty = true;
      },
      (message) => {
        // Der Knopf bleibt im alten Zustand: applyHidden wurde nicht erreicht.
        locationsView.reportStorageError(message);
      },
    );
  },
  onRemove: (id) => {
    guardStorage(
      () => {
        locationService.remove(id);
        locationsView.render(locationService.all());
        dirty = true;
        // Die Ansage liegt in der Ansicht: Nur sie kennt die offenen Dialoge
        // und weiss, wohin der Fokus danach gehoert.
        locationsView.reportRemoved();
      },
      (message) => {
        locationsView.reportStorageError(message);
      },
    );
  },
});

const settingsView = new SettingsView(settings, announcer, {
  onChange: (next) => {
    settings = next;
    guardStorage(
      () => {
        saveSettings(store, settings);
      },
      (message) => {
        settingsView.report(message);
      },
    );
    navigationService.updateSettings(toNavigationSettings(settings));
    // Der Kegel hat sich geaendert: Die Guetebewertung misst sich am Kegel,
    // also muss auch ihr Zustand neu anlaufen.
    qualityMonitor.setConeHalfAngle(settings.coneHalfAngleDeg);
    qualityMonitor.reset();
    dirty = true;
  },
  onExportFile: () => {
    const content = exportContent();
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = el('a', {
      href: url,
      download: `orte-${new Date().toISOString().slice(0, 10)}.json`,
    }) as HTMLAnchorElement;
    link.click();
    URL.revokeObjectURL(url);
    markBackedUp('Sicherung als Datei erstellt.');
  },
  onExportClipboard: () => {
    void navigator.clipboard
      .writeText(exportContent())
      .then(() => {
        markBackedUp('Sicherung in die Zwischenablage kopiert.');
      })
      .catch(() => {
        settingsView.report('Die Zwischenablage war nicht erreichbar.');
      });
  },
  onImport: (text) => {
    if (text.trim().length === 0) {
      // Ohne diesen Fall meldet der leere Knopfdruck "keine Orte gefunden" -
      // das klingt nach einer kaputten Sicherung statt nach einem leeren Feld.
      settingsView.report(
        'Das Feld war leer. Erst die Sicherung einfuegen oder eine Datei waehlen.',
      );
      return;
    }
    const parsed = deserializeLocations(text);
    if (parsed.locations.length === 0) {
      settingsView.report(
        parsed.skipped > 0
          ? `Keine lesbaren Orte gefunden, ${parsed.skipped} Eintraege waren beschaedigt.`
          : 'Darin waren keine Orte zu finden.',
      );
      return;
    }
    guardStorage(
      () => {
        const result = locationService.merge(parsed.locations);
        locationsView.render(locationService.all());
        dirty = true;
        settingsView.report(
          `${result.added} Orte ergaenzt, ${result.duplicates} waren schon vorhanden` +
            (parsed.skipped > 0 ? `, ${parsed.skipped} beschaedigt` : '') +
            '.',
        );
      },
      (message) => {
        settingsView.report(message);
      },
    );
  },
});

const tabs = new Tabs(
  [
    { id: 'navigation', label: 'Navigation', panel: navigationView.panel },
    { id: 'orte', label: 'Orte', panel: locationsView.panel },
    { id: 'einstellungen', label: 'Einstellungen', panel: settingsView.panel },
  ],
  // Die App wird geoeffnet, um zu navigieren.
  'navigation',
  (id) => {
    // Auf einem anderen Bereich haelt die Liste an. Der Lauf selbst geht
    // weiter: Die Sensoren bleiben angemeldet, damit "Hier speichern" im
    // Bereich Orte einen frischen Standort vorfindet (docs/design.md 4.3).
    navigationView.setPanelActive(id === 'navigation');
  },
);

root.append(
  el('h1', { text: 'Straight-Line-Navigation' }),
  tabs.element,
  navigationView.panel,
  locationsView.panel,
  settingsView.panel,
  announcer.element,
);

locationsView.render(locationService.all());

const skipped = repository.skippedOnLoad();
if (skipped > 0) {
  // Ehrlich melden statt still schlucken - die Orte sind nur hier gespeichert.
  announcer.announce(`Achtung: ${skipped} gespeicherte Orte waren beschaedigt und fehlen.`);
}

// --- Navigationslauf --------------------------------------------------------

async function startNavigation(): Promise<void> {
  if (running) {
    return;
  }

  // Muss aus der Beruehrung heraus laufen: iOS gibt den Kompass sonst nicht frei.
  audioCue.unlock();

  const granted = await requestHeadingPermission();
  if (!granted) {
    navigationView.showError(
      'Zugriff auf die Ausrichtung wurde abgelehnt. In den Einstellungen unter Safari bei "Bewegung & Ausrichtung" freigeben.',
    );
    return;
  }

  running = true;
  navigationView.markRunning();
  navigationService.reset();
  qualityMonitor.reset();
  void wakeLock.acquire();

  subscriptions.push(
    new GeolocationPositionProvider().subscribe(
      (fix) => {
        latestFix = fix;
        navigationView.setPositionProblem(null);
        dirty = true;
      },
      (error) => {
        // watchPosition meldet einen Ausfall im Sekundentakt erneut. Die
        // Ansicht sagt deshalb nur den Wechsel an, nicht jede Wiederholung.
        navigationView.setPositionProblem(error.message);
        dirty = true;
      },
    ),
  );

  subscriptions.push(
    new DeviceOrientationHeadingProvider().subscribe(
      (reading) => {
        latestHeading = reading.headingDeg;
        navigationView.setHeadingProblem(null);
        const changed = qualityMonitor.update(reading.accuracyDeg);
        if (changed !== null) {
          // Nur der Wechsel wird gemeldet, nie der Dauerzustand.
          navigationView.showQuality(changed, true);
        }
        dirty = true;
      },
      (error) => {
        navigationView.setHeadingProblem(error.message);
        dirty = true;
      },
    ),
  );

  lastRenderMs = 0;
  requestAnimationFrame(tick);
}

function stopNavigation(): void {
  if (!running) {
    return;
  }
  running = false;

  for (const unsubscribe of subscriptions.splice(0)) {
    unsubscribe();
  }
  void wakeLock.release();

  latestFix = null;
  latestHeading = null;
  navigationService.reset();
  qualityMonitor.reset();
  navigationView.markStopped();
  announcer.announce('Navigation beendet.');
}

function tick(): void {
  if (running) {
    requestAnimationFrame(tick);
  }

  // Ein Bild pro Sekunde, auch wenn nichts hereinkommt: Ein veralteter Standort
  // meldet sich nicht selbst. Ohne diesen Herzschlag bliebe die Liste genau
  // dann stumm stehen, wenn auch der Kompass verstummt - also im schlimmsten
  // Fall. Gerechnet wird dabei nur, was ohnehin schon gemessen ist.
  const now = systemClock.now().getTime();
  if (running && now - lastRenderMs >= 1000) {
    dirty = true;
  }

  if (!dirty) {
    return;
  }
  dirty = false;
  lastRenderMs = now;
  renderNavigation();
}

function renderNavigation(): void {
  const fix = latestFix;
  const heading = latestHeading;
  if (fix === null || heading === null) {
    return;
  }

  // Der Standort ist zu alt: Die Liste wird gehalten, nicht neu gerechnet.
  // Der Kompass laeuft in diesem Fall meist weiter - genau daraus entstuende
  // sonst eine Liste, die sich beim Drehen umsortiert und Entfernungen zu
  // einem Standort nennt, an dem der Nutzer laengst nicht mehr steht.
  if (isPositionStale(fix, systemClock.now().getTime())) {
    navigationView.render(navigationService.holdStale());
    return;
  }

  // visible(), nicht all(): Ausgeblendete Orte erreichen den Kegel gar nicht
  // erst (docs/design.md 6.5).
  const snapshot = navigationService.update(fix.coordinate, heading, locationService.visible());

  const cue = cuePort();
  for (const location of snapshot.entered) {
    cue.entered(location);
  }
  for (const location of snapshot.left) {
    cue.left(location);
  }

  navigationView.render(snapshot);
}

// Nach dem Zurueckschalten in die App ist die Bildschirmsperre verloren.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void wakeLock.reacquireIfWanted();
  }
});

// --- Hilfen -----------------------------------------------------------------

/**
 * Jeder Schreibzugriff kann scheitern: voller Speicher, blockierte
 * Website-Daten, privater Modus. Ohne Backend gibt es keine zweite Kopie -
 * ein stillschweigend verlorener Ort waere der schlimmste Fehlermodus dieser
 * App. Deshalb wird jeder Fehlschlag gemeldet, nie geschluckt.
 */
function guardStorage(action: () => void, report: (message: string) => void): void {
  try {
    action();
  } catch {
    report('Speichern fehlgeschlagen. Der Geraetespeicher ist voll oder blockiert.');
  }
}

function handleSave(save: () => ReturnType<LocationService['saveCurrentPosition']>): void {
  guardStorage(
    () => {
      const result = save();
      if (result.ok) {
        // Erst rendern, dann melden: reportSaved fokussiert den Eintrag, und
        // das Rendern ersetzt genau diesen Knopf.
        locationsView.render(locationService.all());
        dirty = true;
        locationsView.reportSaved(result.location);
      } else {
        locationsView.reportFailure(result.reason);
      }
    },
    (message) => {
      locationsView.reportStorageError(message);
    },
  );
}

function exportContent(): string {
  return serializeBackup(locationService.all(), systemClock.now());
}

function markBackedUp(message: string): void {
  settings = { ...settings, lastBackupAt: systemClock.now().toISOString() };
  saveSettings(store, settings);
  settingsView.setSettings(settings);
  settingsView.report(message);
}
