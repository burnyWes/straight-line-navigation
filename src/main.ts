/**
 * Einstiegspunkt: verdrahtet Adapter, Anwendungsfaelle und Oberflaeche.
 *
 * Die aeusserste Schale - hier und nur hier werden Browser-APIs beruehrt.
 */

import './ui/styles.css';

import { NavigationService } from './application/navigationService.js';
import { GuidanceService } from './application/guidanceService.js';
import { LocationService, type MergeResult } from './application/locationService.js';
import { GroupService, type GroupMergeResult } from './application/groupService.js';
import { coneFor, toNavigationSettings, type AppSettings } from './application/settings.js';
import { tapSolo, type SoloKind } from './application/solo.js';
import { isPositionStale } from './application/positionFreshness.js';
import { trackingDemand, type TrackingContext } from './application/trackingPolicy.js';
import { systemClock, type CuePort, type PositionFix, type Unsubscribe } from './application/ports.js';
import type { GuidanceTone } from './domain/guidance.js';
import { HeadingQualityMonitor } from './domain/headingQuality.js';

import { StoredLocationRepository } from './adapters/storedLocationRepository.js';
import { StoredGroupRepository } from './adapters/storedGroupRepository.js';
import { loadSettings, saveSettings } from './adapters/storedSettings.js';
import { GeolocationPositionProvider } from './adapters/geolocationPositionProvider.js';
import {
  DeviceOrientationHeadingProvider,
  headingPermissionRequired,
  requestHeadingPermission,
} from './adapters/deviceOrientationHeadingProvider.js';
import { WebAudioCue, silentCue } from './adapters/cues.js';
import { WebAudioGuidance } from './adapters/guidanceTone.js';
import { ScreenWakeLock } from './adapters/wakeLock.js';
import { deserializeBackup, serializeBackup } from './adapters/backupSerialization.js';
import { newId } from './adapters/ids.js';
import { registerServiceWorker } from './adapters/serviceWorker.js';

import { Announcer } from './ui/announcer.js';
import { Tabs } from './ui/tabs.js';
import { NavigationView } from './ui/navigationView.js';
import { TargetView } from './ui/targetView.js';
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
// Ein Lauf, zwei Sichten: Der Kegel beantwortet "was ist da?", das Ziel "wo ist
// **das**?" - beide aus denselben Messwerten (docs/design.md 4.7).
// Der Kegel entscheidet hier nicht ueber die Liste, sondern darueber, wann das
// Ziel als "geradeaus" gilt und der Dreiklang steht (docs/design.md 4.7).
const guidanceService = new GuidanceService(coneFor(settings.coneHalfAngleDeg));
const qualityMonitor = new HeadingQualityMonitor(settings.coneHalfAngleDeg);
const wakeLock = new ScreenWakeLock();

const announcer = new Announcer();
const audioCue = new WebAudioCue();
// Beide Kanaele teilen sich einen AudioContext (adapters/audioContext.ts).
const guidanceAudio = new WebAudioGuidance();

function cuePort(): CuePort {
  // In "Ziel" schweigt der Kegel. Zwei gleichzeitige Tonkanaele - ein Zweiklang
  // bei jedem Ein- und Austritt neben der Zielauskunft - machten die Seite
  // unbrauchbar. Gerechnet wird er weiter (navigationService.update laeuft
  // unveraendert), damit seine Hysterese beim Zurueckwechseln keinen Schwall
  // von Eintritts-Toenen ausloest (docs/design.md 4.7).
  if (navigationView.currentMode === 'target') {
    return silentCue;
  }
  return settings.cues.earcon ? audioCue : silentCue;
}

// --- Zustand der Ortung -----------------------------------------------------

let latestFix: PositionFix | null = null;
let latestHeading: number | null = null;
let dirty = false;
/** Zeitpunkt des letzten Bildes - Grundlage fuer den Herzschlag in tick(). */
let lastRenderMs = 0;

/**
 * Was gerade offen und was schon gemessen ist.
 *
 * Aus diesen fuenf Angaben leitet trackingPolicy.ts ab, was laufen soll - es
 * gibt keinen Start- und keinen Stopp-Knopf mehr, den man vergessen koennte.
 */
let context: TrackingContext = {
  navigationVisible: false,
  createDialogOpen: false,
  documentVisible: document.visibilityState === 'visible',
  hasFix: false,
  hasHeading: false,
};

let positionUnsubscribe: Unsubscribe | null = null;
let headingUnsubscribe: Unsubscribe | null = null;
/** Angefordertes Bild der Renderschleife, oder null - ein zweiter Aufruf startet keine zweite. */
let loopHandle: number | null = null;
/**
 * Das naechste Bild rechnet, aber schweigt.
 *
 * Gesetzt, sobald die Navigationsseite von "steht" auf "rechnet" wechselt -
 * Kaltstart eingeschlossen. Ohne das feuerte der Kegel beim Zurueckkommen
 * "eingetreten" fuer alles, was in ihm liegt: genau der Schwall, vor dem
 * docs/design.md 4.7 schon einmal gewarnt hat.
 */
let resumeSilent = false;
/** Ob je eine Kompassmessung eintraf - danach ist die Freigabe fuer die Sitzung erledigt. */
let headingEverSeen = false;
/** Laufender Zeitgeber der Freigabe-Probe, oder null. */
let releaseProbe: number | null = null;

// Muss ohne Netz starten koennen - genau dafuer ist die App gedacht. Eine neue
// Fassung uebernimmt erst, wenn nichts geortet wird: Das Neuladen risse eine
// laufende Navigation ab. Beim Weglegen ist der Bedarf falsch - genau deshalb
// pausiert ein verborgenes Dokument die Sensoren (trackingPolicy.ts).
registerServiceWorker(() => {
  const demand = trackingDemand(context);
  return demand.position || demand.navigating;
});

// --- Oberflaeche ------------------------------------------------------------

const targetView = new TargetView({
  onSelectTarget: (id) => {
    chooseTarget(id);
  },
  onSwitchMode: () => {
    navigationView.setMode('orientation');
  },
  onToggleTone: (on) => {
    toggleGuidanceTone(on);
  },
});

const navigationView = new NavigationView(announcer, targetView, {
  onReleaseHeading: () => {
    void releaseHeading();
  },
  onFreezeChange: (frozen) => {
    if (frozen) {
      navigationService.freeze();
    } else {
      navigationService.unfreeze();
    }
    dirty = true;
  },
  onModeChange: () => {
    // Der Signalkanal haengt an der Betriebsart (siehe cuePort). Der Ton
    // verstummt sofort: Ohne das liefe er auf der Orientierungsseite weiter -
    // derselbe Fehlermodus, den ein haengender Freeze schon einmal gekostet
    // hat (docs/design.md 4.3).
    guidanceAudio.silence();
    dirty = true;
  },
});

const locationsView = new LocationsView(announcer, {
  onCreateDialogOpen: () => {
    updateTracking({ createDialogOpen: true });
  },
  onCreateDialogClose: () => {
    updateTracking({ createDialogOpen: false });
  },
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
        // Erst vergessen, dann schalten: Scheitert das Vergessen, ist der Ort
        // noch unveraendert - und der Knopf bleibt wirklich im alten Zustand.
        forgetSolo();
        const updated = locationService.setHidden(id, hidden);
        if (updated === null) {
          return;
        }
        // Nur die eine Zeile nachziehen: Der Fokus steht auf dem Knopf, und
        // ein neu gebauter naehme ihn mit.
        locationsView.applyHidden(updated);
        // Die vorher solo geschaltete Zeile ist meist eine andere als diese;
        // applyHidden() ruehrt nur die eine getippte an.
        locationsView.setSolo(null);
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
  onToggleSolo: (id) => {
    toggleSolo(
      { kind: 'location', id },
      [id],
      () => {
        // Nur die Inhalte nachziehen: Der Fokus steht auf dem Solo-Knopf.
        locationsView.applySolo(locationService.all(), soloIdFor('location'));
        // Die Gruppenzeilen nennen, wie viele ihrer Orte ausgeblendet sind -
        // ihr Panel ist verdeckt, vollstaendiges Zeichnen also unkritisch.
        renderGroups();
      },
      (message) => {
        locationsView.reportStorageError(message);
      },
    );
  },
  onRemove: (id) => {
    guardStorage(
      () => {
        // Zeigt das Solo auf genau diesen Ort, ist der Weg zurueck mit ihm weg.
        // Vor renderLocations(), damit der Neuaufbau schon null sieht.
        if (settings.solo?.kind === 'location' && settings.solo.id === id) {
          forgetSolo();
        }
        // Erst den Ort loeschen, dann aufraeumen: Schlaegt das Aufraeumen fehl,
        // bleibt eine verwaiste Kennung zurueck - und die ist durch das Filtern
        // in membersOf() unschaedlich (docs/design.md 6.6).
        locationService.remove(id);
        groupService.removeLocationEverywhere(id);
        renderLocations();
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
        // Zeigt das Solo auf genau diese Gruppe, ist der Weg zurueck mit ihr
        // weg. Vor renderGroups(), damit der Neuaufbau schon null sieht.
        if (settings.solo?.kind === 'group' && settings.solo.id === id) {
          forgetSolo();
        }
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
        // Erst vergessen, dann schalten - wie bei der einzelnen Birne: Wer eine
        // Birne tippt, sagt damit "so will ich es haben", und der Stand von vor
        // dem Solo ist danach nicht mehr der normale.
        forgetSolo();
        // Reihenschalter: Die Gruppe besitzt keinen Zustand, sie schreibt
        // nur den der Mitglieder (docs/design.md 6.6).
        for (const member of groupService.membersOf(group, locationService.all())) {
          locationService.setHidden(member.id, hidden);
        }
        // Nur die eine Zeile nachziehen: Der Fokus steht auf der Birne, und
        // ein neu gebauter Knopf naehme ihn mit.
        groupsView.applyGroupHidden(group);
        // Die vorher solo geschaltete Zeile ist meist eine andere als diese, und
        // applyGroupHidden() weiss nichts von der neuen Solo-Kennung.
        groupsView.setSolo(null);
        // Das Orte-Panel ist verdeckt - vollstaendiges Rendern unkritisch.
        renderLocations();
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
        renderLocations();
        dirty = true;
      },
    );
  },
  onToggleSolo: (groupId) => {
    const group = groupService.byId(groupId);
    if (group === null) {
      return;
    }
    // Die Mitglieder werden **vor** dem Schreiben aufgeloest, gegen die
    // heutigen Orte. Der Gruppendienst kennt den Ortsdienst damit weiterhin
    // nicht (docs/design.md 6.6).
    const members = groupService.membersOf(group, locationService.all());
    toggleSolo(
      { kind: 'group', id: groupId },
      members.map((member) => member.id),
      () => {
        groupsView.applySolo(locationService.all(), soloIdFor('group'));
        // Das Orte-Panel ist verdeckt - vollstaendiges Zeichnen unkritisch.
        renderLocations();
      },
      (message) => {
        groupsView.reportStorageError(message);
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
    // Und "geradeaus" auf der Zielseite meint denselben Kegel.
    guidanceService.setCone(coneFor(settings.coneHalfAngleDeg));
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
        'Das Feld war leer. Erst die Sicherung einfügen oder eine Datei wählen.',
      );
      return;
    }
    const parsed = deserializeBackup(text);
    if (parsed.locations.length === 0 && parsed.groups.length === 0) {
      settingsView.report(
        parsed.skippedLocations + parsed.skippedGroups > 0
          ? `Keine lesbaren Orte gefunden, ${parsed.skippedLocations + parsed.skippedGroups} Einträge waren beschädigt.`
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
        renderLocations();
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
    // Die Flaeche ist der Schalter: Auf der Navigationsseite wird geortet, auf
    // den uebrigen nicht. Ein Bereichswechsel ist eine Pause, kein Ende - die
    // Liste behaelt ihre Zeilen (docs/design.md 4.3).
    updateTracking({ navigationVisible: id === 'navigation' });
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

// Das gewaehlte Ziel ueberlebt den Kaltstart; die Betriebsart nicht - die App
// startet immer in "Orientierung" (docs/design.md 4.7).
guidanceService.setTarget(settings.targetId);
targetView.setToneState(settings.guidanceTone);

renderLocations();
renderGroups();

const skipped = repository.skippedOnLoad();
if (skipped > 0) {
  // Ehrlich melden statt still schlucken - die Orte sind nur hier gespeichert.
  announcer.announce(`Achtung: ${skipped} gespeicherte Orte waren beschädigt und fehlen.`);
}

const skippedGroups = groupRepository.skippedOnLoad();
if (skippedGroups > 0) {
  announcer.announce(
    `Achtung: ${skippedGroups} gespeicherte Gruppen waren beschädigt und fehlen.`,
  );
}

// --- Ortung -----------------------------------------------------------------

/**
 * Nimmt eine Aenderung an der offenen Flaeche entgegen und gleicht alles daran
 * ab, was Strom zieht.
 *
 * Der einzige Weg, an dem Zustand zu drehen. Frueher standen dafuer
 * startNavigation() und stopNavigation() nebeneinander, und jede Bedingung, die
 * nur in einem der beiden stand, war ein Fehlermodus.
 */
function updateTracking(patch: Partial<TrackingContext>): void {
  const before = trackingDemand(context);
  context = { ...context, ...patch };
  const demand = trackingDemand(context);

  applyPositionSubscription(demand.position);
  applyHeadingSubscription(demand.navigating);
  applyWakeLock(demand.wakeLock);
  navigationView.setActive(demand.navigating);

  if (!demand.navigating) {
    stopLoop();
    // Der Zielton haengt an keiner Schleife und muss hier verstummen.
    guidanceAudio.silence();
    return;
  }

  if (!before.navigating) {
    // Von "steht" auf "rechnet": Das erste Bild wird stumm gerechnet.
    resumeSilent = true;
    dirty = true;
    startHeadingReleaseProbe();
  }
  startLoop();
}

/**
 * Meldet das Standort-Abonnement an oder ab.
 *
 * Beim Abmelden bleibt `latestFix` stehen: Ob er noch etwas taugt, entscheidet
 * allein isPositionStale() - ein zweiter Zeitbegriff neben den 12 Sekunden aus
 * docs/design.md 4.6 waere einer zu viel. Wer innerhalb dieser Frist vom
 * Navigations-Tab ueber "Orte" zum Plus kommt, speichert ohne Wartezeit.
 */
function applyPositionSubscription(wanted: boolean): void {
  if (wanted === (positionUnsubscribe !== null)) {
    return;
  }

  if (!wanted) {
    positionUnsubscribe?.();
    positionUnsubscribe = null;
    return;
  }

  positionUnsubscribe = new GeolocationPositionProvider().subscribe(
    (fix) => {
      const wasUsable =
        latestFix !== null && !isPositionStale(latestFix, systemClock.now().getTime());
      latestFix = fix;
      navigationView.setPositionProblem(null);
      dirty = true;
      // Einmal, nicht je Fix: watchPosition liefert im Sekundentakt. Gemeldet
      // wird der Uebergang von "nichts Brauchbares" zu "jetzt geht es" - genau
      // die Auskunft, auf die im Anlegen-Dialog gewartet wird.
      if (!wasUsable) {
        locationsView.reportPositionReady(fix.accuracyMetres);
      }
      // Nur der erste Fix wird der Policy gemeldet: An ihm haengt der Wake Lock,
      // und updateTracking() gleicht bei jedem Ruf alle Abonnements ab.
      if (!context.hasFix) {
        updateTracking({ hasFix: true });
      }
    },
    (error) => {
      // watchPosition meldet einen Ausfall im Sekundentakt erneut. Die
      // Ansicht sagt deshalb nur den Wechsel an, nicht jede Wiederholung.
      navigationView.setPositionProblem(error.message);
      dirty = true;
    },
  );
}

/** Meldet das Kompass-Abonnement an oder ab; `latestHeading` bleibt stehen. */
function applyHeadingSubscription(wanted: boolean): void {
  if (wanted === (headingUnsubscribe !== null)) {
    return;
  }

  if (!wanted) {
    headingUnsubscribe?.();
    headingUnsubscribe = null;
    return;
  }

  headingUnsubscribe = new DeviceOrientationHeadingProvider().subscribe(
    (reading) => {
      latestHeading = reading.headingDeg;
      navigationView.setHeadingProblem(null);
      noteHeadingArrived();
      const changed = qualityMonitor.update(reading.accuracyDeg);
      if (changed !== null) {
        // Nur der Wechsel wird gemeldet, nie der Dauerzustand.
        navigationView.showQuality(changed, true);
      }
      dirty = true;
      if (!context.hasHeading) {
        updateTracking({ hasHeading: true });
      }
    },
    (error) => {
      navigationView.setHeadingProblem(error.message);
      dirty = true;
    },
  );
}

/**
 * Haelt den Bildschirm wach, sobald Daten fliessen.
 *
 * Die Absicht "wach bleiben" steht in der Policy und nirgends sonst; der
 * Adapter weiss nur, ob er die Sperre gerade haelt.
 */
function applyWakeLock(wanted: boolean): void {
  if (wanted === wakeLock.isHeld) {
    return;
  }
  if (wanted) {
    void wakeLock.acquire();
  } else {
    void wakeLock.release();
  }
}

/**
 * Erkennt durch Zuhoeren, ob iOS noch auf eine Beruehrung wartet.
 *
 * Eine Sekunde ohne Messung ist das Zeichen. Ungefragt requestPermission() zu
 * rufen waere der kuerzere Weg und der falsche: Ein Aufruf ausserhalb einer
 * echten Beruehrung kann als Ablehnung haengenbleiben und die App dauerhaft
 * lahmlegen (docs/design.md 5).
 */
function startHeadingReleaseProbe(): void {
  if (headingEverSeen || releaseProbe !== null || !headingPermissionRequired()) {
    return;
  }
  releaseProbe = window.setTimeout(() => {
    releaseProbe = null;
    if (!headingEverSeen) {
      navigationView.showHeadingRelease(true);
    }
  }, 1000);
}

/** Die erste Messung erledigt die Freigabe fuer die ganze Sitzung. */
function noteHeadingArrived(): void {
  if (headingEverSeen) {
    return;
  }
  headingEverSeen = true;
  if (releaseProbe !== null) {
    window.clearTimeout(releaseProbe);
    releaseProbe = null;
  }
  navigationView.showHeadingRelease(false);
}

/**
 * Der eine Tipp, den iOS technisch erzwingt.
 *
 * Dieselbe Beruehrung entsperrt Web Audio - beides geht nur aus einer echten
 * Geste heraus, und zwei Gesten dafuer zu verlangen waere eine zu viel.
 */
async function releaseHeading(): Promise<void> {
  audioCue.unlock();

  const granted = await requestHeadingPermission();
  if (!granted) {
    navigationView.showError(
      'Zugriff auf die Ausrichtung wurde abgelehnt. In den Einstellungen unter Safari bei "Bewegung & Ausrichtung" freigeben.',
    );
    return;
  }

  // Neu anmelden: Auf iOS liefern Listener, die vor der Freigabe angemeldet
  // wurden, nichts nach.
  if (headingUnsubscribe !== null) {
    headingUnsubscribe();
    headingUnsubscribe = null;
    applyHeadingSubscription(trackingDemand(context).navigating);
  }
}

/** Startet die Renderschleife, falls sie nicht ohnehin schon laeuft. */
function startLoop(): void {
  if (loopHandle !== null) {
    return;
  }
  lastRenderMs = 0;
  loopHandle = requestAnimationFrame(tick);
}

/**
 * Haelt die Renderschleife an - ausdruecklich, statt sie auslaufen zu lassen.
 *
 * Ein verborgenes Dokument bekommt keine Bilder mehr: Ein bloss angefordertes,
 * nie gerufenes Bild bliebe als Rest zurueck, und der naechste Start haette
 * entweder gar keine Schleife oder zwei.
 */
function stopLoop(): void {
  if (loopHandle === null) {
    return;
  }
  cancelAnimationFrame(loopHandle);
  loopHandle = null;
}

function tick(): void {
  loopHandle = null;
  if (!trackingDemand(context).navigating) {
    return;
  }
  loopHandle = requestAnimationFrame(tick);

  // Ein Bild pro Sekunde, auch wenn nichts hereinkommt: Ein veralteter Standort
  // meldet sich nicht selbst. Ohne diesen Herzschlag bliebe die Liste genau
  // dann stumm stehen, wenn auch der Kompass verstummt - also im schlimmsten
  // Fall. Gerechnet wird dabei nur, was ohnehin schon gemessen ist.
  const now = systemClock.now().getTime();
  if (now - lastRenderMs >= 1000) {
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
    // Noch nichts gemessen: Die Statuszeile sagt trotzdem, worauf gewartet wird.
    navigationView.render(null);
    applyGuidanceTone(null);
    return;
  }

  // Der Standort ist zu alt: Die Liste wird gehalten, nicht neu gerechnet.
  // Der Kompass laeuft in diesem Fall meist weiter - genau daraus entstuende
  // sonst eine Liste, die sich beim Drehen umsortiert und Entfernungen zu
  // einem Standort nennt, an dem der Nutzer laengst nicht mehr steht.
  if (isPositionStale(fix, systemClock.now().getTime())) {
    navigationView.render(navigationService.holdStale());
    // Auch die Peilzeile haelt ihren letzten Stand, statt nichts zu zeigen:
    // Wo sie zuletzt stimmte, ist mehr wert als eine leere Zeile - dass sie
    // nicht mehr stimmt, sagt die Statuszeile (docs/design.md 4.6).
    targetView.render(guidanceService.holdStale());
    // Der Ton ist keine stehende Anzeige, sondern eine fortlaufende Behauptung:
    // Aus einem alten Fix klaenge er exakt so souveraen wie aus einem
    // gueltigen. Das Verstummen selbst ist die Nachricht (docs/design.md 4.6).
    applyGuidanceTone(null);
    return;
  }

  // visible(), nicht all(): Ausgeblendete Orte erreichen den Kegel gar nicht
  // erst (docs/design.md 6.5).
  const snapshot = navigationService.update(fix.coordinate, heading, locationService.visible());
  // all(), nicht visible(): Ausblenden ist eine Regel ueber den Kegel, nicht
  // ueber den Willen - das geparkte Auto soll tagsueber nicht toenen und ist
  // abends trotzdem das Ziel (docs/design.md 6.5).
  const guidance = guidanceService.update(fix.coordinate, heading, locationService.all());

  if (resumeSilent) {
    // Rechnen, aber schweigen - dieselbe Idee wie cuePort() in "Ziel", nur
    // einmalig statt dauerhaft: Der Kegel setzt sich am neuen Stand neu auf,
    // ohne alles nachklingen zu lassen, was sich waehrend der Pause geaendert
    // hat (docs/design.md 4.7).
    resumeSilent = false;
  } else {
    const cue = cuePort();
    for (const location of snapshot.entered) {
      cue.entered(location);
    }
    for (const location of snapshot.left) {
      cue.left(location);
    }
  }

  navigationView.render(snapshot);
  targetView.render(guidance);
  applyGuidanceTone(guidance.tone);
}

/**
 * Schaltet den Zielton.
 *
 * Er klingt nur, wenn **alles** zutrifft: Die Navigationsseite ist offen, die
 * Betriebsart ist "Ziel", der Schalter steht an, ein Ziel ist gewaehlt und der
 * Standort ist gueltig. Die Kompassguete stoppt ihn ausdruecklich **nicht** - "ungenau" ist
 * immer noch die beste verfuegbare Angabe, und ein Ton, der bei jedem
 * Kompasswackeln aussetzt, waere unbrauchbar (docs/design.md 4.7).
 *
 * Eine Stelle statt vieler: Jede Bedingung, die anderswo entschiede, waere ein
 * Weg, auf dem der Ton weiterlaeuft, ohne dass ihn jemand gewollt hat.
 */
function applyGuidanceTone(tone: GuidanceTone | null): void {
  const wanted =
    trackingDemand(context).navigating &&
    navigationView.currentMode === 'target' &&
    settings.guidanceTone &&
    tone !== null;
  if (wanted && tone !== null) {
    guidanceAudio.play(tone);
  } else {
    guidanceAudio.silence();
  }
}

/**
 * Uebernimmt den Tonschalter.
 *
 * Anders als das Anhalten der Liste ueberlebt er den Neustart: Ein haengender
 * Freeze war **stumm** und hat einen ganzen Lauf gefressen (docs/design.md
 * 4.3), ein haengender Tonschalter ist das Gegenteil von stumm.
 */
function toggleGuidanceTone(on: boolean): void {
  settings = { ...settings, guidanceTone: on };
  guardStorage(
    () => {
      saveSettings(store, settings);
    },
    (message) => {
      settingsView.report(message);
    },
  );
  settingsView.setSettings(settings);
  // Der Knopf liest seinen neuen Namen selbst vor - keine zusaetzliche Ansage.
  targetView.setToneState(on);
  if (!on) {
    guidanceAudio.silence();
  }
  dirty = true;
}

// Ein verborgenes Dokument pausiert die Sensoren - ausdruecklich, statt es dem
// Einfrieren durch Safari zu ueberlassen. Nur so ist der Bedarf beim Weglegen
// falsch, und nur dann laesst das Update-Tor des Service Workers eine neue
// Fassung durch: Die App wird immer auf der Navigationsseite weggelegt.
// Die Bildschirmsperre wird beim Zurueckkommen ohnehin neu angefordert -
// applyWakeLock() sieht sie als nicht gehalten.
document.addEventListener('visibilitychange', () => {
  updateTracking({ documentVisible: document.visibilityState === 'visible' });
});

// Web Audio braucht eine echte Beruehrung. Auf iOS leistet das der Tipp auf
// "Kompass freigeben"; wo es diesen Knopf nicht gibt, gaebe es sonst gar keine
// Geste mehr, an der die Entsperrung haengen koennte - Earcon und Zielton
// blieben stumm. Einmal reicht, danach ist der Kanal offen.
document.addEventListener(
  'pointerdown',
  () => {
    audioCue.unlock();
  },
  { once: true },
);

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
    report('Speichern fehlgeschlagen. Der Gerätespeicher ist voll oder blockiert.');
  }
}

function handleSave(save: () => ReturnType<LocationService['saveCurrentPosition']>): void {
  guardStorage(
    () => {
      const result = save();
      if (result.ok) {
        // Erst rendern, dann melden: reportSaved fokussiert den Eintrag, und
        // das Rendern ersetzt genau diesen Knopf.
        renderLocations();
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
 * Zieht alles nach, was die Ortsliste zeigt.
 *
 * Beide Ansichten zusammen, weil sie dieselbe Liste zeigen: Das Zielrad wird
 * sonst leer oder veraltet - navigationView.render() kehrt bei stehendem Lauf
 * sofort zurueck und fuellt es nie.
 */
function renderLocations(): void {
  const all = locationService.all();
  locationsView.render(all, soloIdFor('location'));
  targetView.renderTargets(all, guidanceService.selectedId);
}

/** Kennung der solo geschalteten Zeile dieser Art, oder null. */
function soloIdFor(kind: SoloKind): string | null {
  return settings.solo?.kind === kind ? settings.solo.id : null;
}

/**
 * Der gemerkte Stand gilt nur, solange niemand sonst an der Sichtbarkeit dreht.
 *
 * Wer eine Birne tippt, sagt damit: So will ich es haben. Der Stand von vor
 * dem Solo ist danach nicht mehr "mein normaler Stand".
 *
 * Ruft der Aufrufer danach nicht ohnehin vollstaendig neu, muss er die
 * Solo-Knoepfe seiner Ansicht ueber setSolo(null) nachziehen: Die vorher solo
 * geschaltete Zeile ist meist eine **andere** als die getippte und hiesse
 * sonst weiter "Vorherige Auswahl zurueckholen".
 */
function forgetSolo(): void {
  if (settings.solo === null) {
    return;
  }
  settings = { ...settings, solo: null };
  saveSettings(store, settings);
  settingsView.setSettings(settings);
}

/**
 * Ein Tipp auf einen Solo-Knopf - fuer einen Ort wie fuer eine Gruppe.
 *
 * `keep` sind die Orte, die hell bleiben: bei einem Ort er selbst, bei einer
 * Gruppe ihre aufgeloesten Mitglieder. Der Gruppendienst kennt den Ortsdienst
 * damit weiterhin nicht (docs/design.md 6.6).
 */
function toggleSolo(
  target: { kind: SoloKind; id: string },
  keep: readonly string[],
  apply: () => void,
  report: (message: string) => void,
): void {
  // Nichts zu verschonen: Die Ansichten lassen den Knopf dort gar nicht erst
  // zu. Hier steht der Riegel ein zweites Mal - und zwar VOR guardStorage,
  // damit ein Nichts nicht zwei Schreibzugriffe und eine Ansage kostet.
  if (keep.length === 0) {
    return;
  }
  const result = tapSolo({
    current: settings.solo,
    target,
    allIds: locationService.all().map((location) => location.id),
    hiddenNow: locationService.hiddenIds(),
    keep,
  });
  guardStorage(
    () => {
      // Erst die Orte: Der grosse Schreibzugriff scheitert zuerst, und dann
      // ist nichts passiert. Er ist ein einziges setItem - ganz oder gar
      // nicht, anders als der Reihenschalter der Gruppen-Birne.
      locationService.setHiddenIds(result.hiddenAfter);
      settings = { ...settings, solo: result.solo };
      saveSettings(store, settings);
      settingsView.setSettings(settings);
      apply();
      // Der Kegel rechnet im naechsten Bild mit der geaenderten Liste. Ein-
      // und Austritts-Toene klingen wie beim einzelnen Ort.
      dirty = true;
    },
    (message) => {
      // Ehrlich bleiben: Was tatsaechlich geschrieben wurde, weiss nur der
      // Speicher. Beide Ansichten werden deshalb vollstaendig neu gezeichnet.
      report(message);
      renderLocations();
      renderGroups();
      dirty = true;
    },
  );
}

/**
 * Uebernimmt die Zielwahl.
 *
 * Das Ziel ist eine Absicht und muss den Kaltstart einer PWA ueberleben, also
 * wird es geschrieben. settingsView.setSettings() zieht die Kopie im
 * Einstellungs-Panel nach - ohne das ueberschriebe der naechste Kegelwinkel die
 * Zielwahl mit einem veralteten Stand.
 */
function chooseTarget(id: string | null): void {
  guidanceService.setTarget(id);
  settings = { ...settings, targetId: id };
  guardStorage(
    () => {
      saveSettings(store, settings);
    },
    (message) => {
      settingsView.report(message);
    },
  );
  settingsView.setSettings(settings);
  dirty = true;
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
  groupsView.render(groupService.all(), locationService.all(), soloIdFor('group'));
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
    `${locations.added} Orte ergänzt`,
    `${locations.duplicates} waren schon vorhanden`,
  ];
  if (groups.added > 0) {
    parts.push(`${groups.added} ${groups.added === 1 ? 'Gruppe' : 'Gruppen'} ergänzt`);
  }
  if (groups.extended > 0) {
    parts.push(`${groups.extended} ${groups.extended === 1 ? 'Gruppe' : 'Gruppen'} erweitert`);
  }
  if (parsed.skippedLocations > 0) {
    parts.push(`${parsed.skippedLocations} Orte beschädigt`);
  }
  if (parsed.skippedGroups > 0) {
    parts.push(
      `${parsed.skippedGroups} ${parsed.skippedGroups === 1 ? 'Gruppe' : 'Gruppen'} beschädigt`,
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
