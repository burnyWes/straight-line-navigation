/**
 * Einstiegspunkt: verdrahtet Adapter, Anwendungsfaelle und Oberflaeche.
 *
 * Die aeusserste Schale - hier und nur hier werden Browser-APIs beruehrt.
 */

import './ui/styles.css';

import { NavigationService } from './application/navigationService.js';
import { LocationService, type MergeResult } from './application/locationService.js';
import { GroupService, type GroupMergeResult } from './application/groupService.js';
import { toNavigationSettings, type AppSettings } from './application/settings.js';
import { isPositionStale } from './application/positionFreshness.js';
import { systemClock, type CuePort, type PositionFix, type Unsubscribe } from './application/ports.js';
import { HeadingQualityMonitor } from './domain/headingQuality.js';

import { StoredLocationRepository } from './adapters/storedLocationRepository.js';
import { StoredGroupRepository } from './adapters/storedGroupRepository.js';
import { loadSettings, saveSettings } from './adapters/storedSettings.js';
import { GeolocationPositionProvider } from './adapters/geolocationPositionProvider.js';
import {
  DeviceOrientationHeadingProvider,
  requestHeadingPermission,
} from './adapters/deviceOrientationHeadingProvider.js';
import { WebAudioCue, silentCue } from './adapters/cues.js';
import { ScreenWakeLock } from './adapters/wakeLock.js';
import { deserializeBackup, serializeBackup } from './adapters/backupSerialization.js';
import { newId } from './adapters/ids.js';
import { registerServiceWorker } from './adapters/serviceWorker.js';

import { Announcer } from './ui/announcer.js';
import { Tabs } from './ui/tabs.js';
import { NavigationView } from './ui/navigationView.js';
import { LocationsView } from './ui/locationsView.js';
import { GroupsView } from './ui/groupsView.js';
import { SettingsView } from './ui/settingsView.js';
import { el } from './ui/dom.js';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Kein Wurzelelement gefunden.');
}

// --- Adapter und Dienste ----------------------------------------------------

const store = window.localStorage;
const repository = new StoredLocationRepository(store);
// Eigener Schluessel, eigenes Repository: zwei Aggregate, zwei Speicher
// (docs/design.md 6.6).
const groupRepository = new StoredGroupRepository(store);
let settings: AppSettings = loadSettings(store);

const locationService = new LocationService(repository, systemClock, newId);
const groupService = new GroupService(groupRepository, newId);
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
  groupNamesOf: (id) =>
    groupService
      .all()
      .filter((group) => group.memberIds.includes(id))
      .map((group) => group.name),
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
        // Die Gruppenzeilen nennen, wie viele ihrer Orte ausgeblendet sind -
        // die Zahl haengt an genau dieser Aenderung.
        renderGroups();
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
        // Erst den Ort loeschen, dann aufraeumen: Schlaegt das Aufraeumen fehl,
        // bleibt eine verwaiste Kennung zurueck - und die ist durch das Filtern
        // in membersOf() unschaedlich (docs/design.md 6.6).
        locationService.remove(id);
        groupService.removeLocationEverywhere(id);
        locationsView.render(locationService.all());
        renderGroups();
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

const groupsView = new GroupsView(announcer, {
  onCreate: (name) => {
    guardStorage(
      () => {
        const result = groupService.create(name);
        if (result.ok) {
          // Erst rendern, dann melden: reportCreated fokussiert den Eintrag,
          // und das Rendern baut genau diesen Knopf.
          renderGroups();
          groupsView.reportCreated(result.group);
        } else {
          groupsView.reportFailure(result.reason);
        }
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  onRename: (id, name) => {
    guardStorage(
      () => {
        const result = groupService.rename(id, name);
        if (result.ok) {
          renderGroups();
          groupsView.reportRenamed(result.group);
        } else {
          groupsView.reportFailure(result.reason);
        }
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  onRemove: (id) => {
    guardStorage(
      () => {
        // Die Orte bleiben - auch ihre Sichtbarkeit. Ein Loeschen, das nebenbei
        // dreissig Orte in den Kegel zurueckholte, waere die Ueberraschung,
        // gegen die docs/design.md 6.5 argumentiert.
        groupService.remove(id);
        renderGroups();
        // Die Ansage liegt in der Ansicht: Nur sie kennt die offenen Dialoge
        // und weiss, wohin der Fokus danach gehoert.
        groupsView.reportRemoved();
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  onAddMember: (groupId, locationId) => {
    guardStorage(
      () => {
        const updated = groupService.addMember(groupId, locationId);
        const location = locationService.all().find((candidate) => candidate.id === locationId);
        if (updated === null || location === undefined) {
          return;
        }
        renderGroups();
        groupsView.reportMemberAdded(updated, location);
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  onRemoveMember: (groupId, locationId) => {
    guardStorage(
      () => {
        const location = locationService.all().find((candidate) => candidate.id === locationId);
        const updated = groupService.removeMember(groupId, locationId);
        if (updated === null || location === undefined) {
          return;
        }
        renderGroups();
        groupsView.reportMemberRemoved(updated, location);
      },
      (message) => {
        groupsView.reportStorageError(message);
      },
    );
  },
  onToggleGroupHidden: (groupId, hidden) => {
    guardStorage(
      () => {
        const group = groupService.byId(groupId);
        if (group === null) {
          return;
        }
        // Reihenschalter: Die Gruppe besitzt keinen Zustand, sie schreibt
        // nur den der Mitglieder (docs/design.md 6.6).
        for (const member of groupService.membersOf(group, locationService.all())) {
          locationService.setHidden(member.id, hidden);
        }
        // Nur die eine Zeile nachziehen: Der Fokus steht auf der Birne, und
        // ein neu gebauter Knopf naehme ihn mit.
        groupsView.applyGroupHidden(group);
        // Das Orte-Panel ist verdeckt - vollstaendiges Rendern unkritisch.
        locationsView.render(locationService.all());
        // Der Kegel rechnet im naechsten Bild mit der geaenderten Liste. Ein-
        // und Austritts-Toene klingen wie beim einzelnen Ort.
        dirty = true;
      },
      (message) => {
        // Ehrlich bleiben: Bricht es mittendrin ab, ist ein Teil der Orte schon
        // geschaltet. Die Meldung sagt deshalb nur, dass das Speichern
        // fehlschlug - und beide Ansichten werden vollstaendig neu gezeichnet,
        // damit sie den tatsaechlichen Stand zeigen statt den beabsichtigten.
        groupsView.reportStorageError(message);
        renderGroups();
        locationsView.render(locationService.all());
        dirty = true;
      },
    );
  },
  membersOf: (group) => groupService.membersOf(group, locationService.all()),
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
      // Nicht mehr "orte-": Die Datei enthaelt seit den Gruppen beides, und in
      // der Dateien-App ist der Name das einzige, woran sie zu erkennen ist.
      download: `sicherung-${new Date().toISOString().slice(0, 10)}.json`,
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
    const parsed = deserializeBackup(text);
    if (parsed.locations.length === 0 && parsed.groups.length === 0) {
      settingsView.report(
        parsed.skippedLocations + parsed.skippedGroups > 0
          ? `Keine lesbaren Orte gefunden, ${parsed.skippedLocations + parsed.skippedGroups} Eintraege waren beschaedigt.`
          : 'Darin waren keine Orte zu finden.',
      );
      return;
    }
    guardStorage(
      () => {
        // Erst die Orte, dann die Gruppen: Die Abbildung aus dem ersten Schritt
        // traegt die Mitgliedschaften auf die lokalen Kennungen um. Beide
        // Zusammenfuehrungen liegen im selben guardStorage() - schlaegt die
        // zweite fehl, sind die Orte trotzdem da, und eine Gruppe fehlt statt
        // aller Orte.
        const result = locationService.merge(parsed.locations);
        const groupResult = groupService.merge(parsed.groups, result.idMapping);
        locationsView.render(locationService.all());
        renderGroups();
        dirty = true;
        settingsView.report(importSummary(result, groupResult, parsed));
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
    // Zwischen "Orte" und "Einstellungen": Gruppen sind eine Sicht auf Orte,
    // kein Einstellungsthema (docs/design.md 5).
    { id: 'gruppen', label: 'Gruppen', panel: groupsView.panel },
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
  groupsView.panel,
  settingsView.panel,
  announcer.element,
);

locationsView.render(locationService.all());
renderGroups();

const skipped = repository.skippedOnLoad();
if (skipped > 0) {
  // Ehrlich melden statt still schlucken - die Orte sind nur hier gespeichert.
  announcer.announce(`Achtung: ${skipped} gespeicherte Orte waren beschaedigt und fehlen.`);
}

const skippedGroups = groupRepository.skippedOnLoad();
if (skippedGroups > 0) {
  announcer.announce(
    `Achtung: ${skippedGroups} gespeicherte Gruppen waren beschaedigt und fehlen.`,
  );
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

/**
 * Zieht die Gruppen-Ansicht nach.
 *
 * Vollstaendig und nicht zeilenweise: Das Panel ist bei fast jedem Anlass
 * verdeckt - eine Aenderung auf der Orte-Seite -, der Fokus also unkritisch.
 * Die Ausnahme ist die Gluehbirne an der Gruppe; die zieht ihre eigene Zeile
 * ueber applyGroupHidden() nach.
 */
function renderGroups(): void {
  groupsView.render(groupService.all(), locationService.all());
}

function exportContent(): string {
  return serializeBackup(locationService.all(), groupService.all(), systemClock.now());
}

/**
 * Meldung nach dem Import - genannt wird nur, was ungleich null ist.
 *
 * "1 Gruppe erweitert, 0 Gruppen ergaenzt" waere doppelt so lang und sagte
 * nichts dazu; beschaedigte Eintraege werden dagegen immer genannt, weil sie
 * verloren sind (docs/design.md 7).
 */
function importSummary(
  locations: MergeResult,
  groups: GroupMergeResult,
  parsed: { skippedLocations: number; skippedGroups: number },
): string {
  const parts = [
    `${locations.added} Orte ergaenzt`,
    `${locations.duplicates} waren schon vorhanden`,
  ];
  if (groups.added > 0) {
    parts.push(`${groups.added} ${groups.added === 1 ? 'Gruppe' : 'Gruppen'} ergaenzt`);
  }
  if (groups.extended > 0) {
    parts.push(`${groups.extended} ${groups.extended === 1 ? 'Gruppe' : 'Gruppen'} erweitert`);
  }
  if (parsed.skippedLocations > 0) {
    parts.push(`${parsed.skippedLocations} Orte beschaedigt`);
  }
  if (parsed.skippedGroups > 0) {
    parts.push(
      `${parsed.skippedGroups} ${parsed.skippedGroups === 1 ? 'Gruppe' : 'Gruppen'} beschaedigt`,
    );
  }
  return `${parts.join(', ')}.`;
}

function markBackedUp(message: string): void {
  settings = { ...settings, lastBackupAt: systemClock.now().toISOString() };
  saveSettings(store, settings);
  settingsView.setSettings(settings);
  settingsView.report(message);
}
