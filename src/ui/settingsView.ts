/**
 * Einstellungen: Kegel, Entfernungsgrenze, Signalkanaele, Sicherung.
 *
 * Die vier Sicherungswege liegen hinter einem modalen Dialog. Im Panel stehen
 * unter "Daten" nur das Datum der letzten Sicherung und der Oeffner: Der
 * Abschnitt war elf Stationen lang und lag bei jedem Besuch im Wischweg, auch
 * dann, wenn nur der Kegelwinkel geaendert werden sollte (docs/design.md 7).
 */

import { el, setText } from './dom.js';
import { ModalDialog } from './dialog.js';
import type { Announcer } from './announcer.js';
import {
  CONE_ANGLE_CHOICES,
  DISTANCE_LIMIT_CHOICES,
  type AppSettings,
} from '../application/settings.js';
import { formatDistance } from './format.js';

const BACKUP_DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'long',
  timeStyle: 'short',
});

// Knopf und Dialog tragen denselben Namen - VoiceOver sagt den Titel beim
// Oeffnen an, ein anderer Name klaenge, als sei man woanders gelandet.
const BACKUP_TITLE = 'Daten speichern / laden';

export interface SettingsViewCallbacks {
  onChange(settings: AppSettings): void;
  onExportFile(): void;
  onExportClipboard(): void;
  onImport(text: string): void;
}

export class SettingsView {
  readonly panel: HTMLElement;

  private readonly coneSelect: HTMLSelectElement;
  private readonly distanceSelect: HTMLSelectElement;
  private readonly earconBox: HTMLInputElement;
  private readonly importFileField: HTMLInputElement;
  private readonly importField: HTMLTextAreaElement;
  private readonly backupLine: HTMLElement;
  private readonly feedback: HTMLElement;

  /** Traegt beim Oeffnen den Fokus - deshalb als einziger der vier Wege festgehalten. */
  private readonly exportFileButton: HTMLButtonElement;
  private readonly backupButton: HTMLButtonElement;
  private readonly backupFeedback: HTMLElement;
  private readonly backupDialog: ModalDialog;

  private settings: AppSettings;

  constructor(
    initial: AppSettings,
    private readonly announcer: Announcer,
    private readonly callbacks: SettingsViewCallbacks,
  ) {
    this.settings = initial;

    this.coneSelect = el('select', { id: 'kegel' }) as HTMLSelectElement;
    for (const angle of CONE_ANGLE_CHOICES) {
      this.coneSelect.append(
        el('option', { value: String(angle), text: `plus minus ${angle} Grad` }),
      );
    }
    this.coneSelect.value = String(initial.coneHalfAngleDeg);
    this.coneSelect.addEventListener('change', () => {
      this.update({ coneHalfAngleDeg: Number(this.coneSelect.value) });
    });

    this.distanceSelect = el('select', { id: 'grenze' }) as HTMLSelectElement;
    for (const limit of DISTANCE_LIMIT_CHOICES) {
      this.distanceSelect.append(
        el('option', {
          value: limit === null ? 'unbegrenzt' : String(limit),
          text: limit === null ? 'unbegrenzt' : `bis ${formatDistance(limit)}`,
        }),
      );
    }
    this.distanceSelect.value =
      initial.maxDistanceMetres === null ? 'unbegrenzt' : String(initial.maxDistanceMetres);
    this.distanceSelect.addEventListener('change', () => {
      const raw = this.distanceSelect.value;
      this.update({ maxDistanceMetres: raw === 'unbegrenzt' ? null : Number(raw) });
    });

    this.earconBox = this.checkbox('earcon', initial.cues.earcon, (checked) => {
      this.update({ cues: { ...this.settings.cues, earcon: checked } });
    });

    this.exportFileButton = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Als Datei sichern',
    }) as HTMLButtonElement;
    this.exportFileButton.addEventListener('click', () => {
      this.callbacks.onExportFile();
    });

    const exportClipboard = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'In die Zwischenablage kopieren',
    }) as HTMLButtonElement;
    exportClipboard.addEventListener('click', () => {
      this.callbacks.onExportClipboard();
    });

    // Gegenstueck zu "Als Datei sichern": Ohne diesen Weg muesste eine
    // Sicherungsdatei erst von Hand geoeffnet und ihr Text kopiert werden.
    this.importFileField = el('input', {
      type: 'file',
      id: 'import-datei',
      accept: 'application/json,.json',
    }) as HTMLInputElement;
    this.importFileField.addEventListener('change', () => {
      const file = this.importFileField.files?.[0];
      if (file === undefined) {
        return;
      }
      void file
        .text()
        .then((text) => {
          this.callbacks.onImport(text);
        })
        .catch(() => {
          this.report('Die Datei war nicht lesbar.');
        })
        .finally(() => {
          // Sonst bleibt der Dateiname stehen und dieselbe Datei loest beim
          // zweiten Mal kein 'change' aus.
          this.importFileField.value = '';
        });
    });

    this.importField = el('textarea', {
      id: 'import',
      rows: 4,
      autocomplete: 'off',
    }) as HTMLTextAreaElement;

    const importButton = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Sicherung einlesen',
    }) as HTMLButtonElement;
    importButton.addEventListener('click', () => {
      this.callbacks.onImport(this.importField.value);
    });

    const closeBackup = el('button', {
      type: 'button',
      class: 'secondary',
      text: 'Schliessen',
    }) as HTMLButtonElement;
    // Der Weg ohne Tastatur: Escape leistet dasselbe, aber am iPhone ist keine da.
    closeBackup.addEventListener('click', () => {
      this.backupDialog.close();
    });

    this.backupFeedback = el('p', { class: 'status', role: 'status' });

    // Die Meldungszeile steht **vor** "Schliessen": Sie muss erreichbar sein,
    // bevor der Weg aus dem Dialog kommt.
    this.backupDialog = new ModalDialog('sicherung', BACKUP_TITLE, [
      el('p', {
        class: 'hint',
        // Nennt beides, seit die Sicherung beides enthaelt: Wer hier nur
        // "Orte" liest, haelt seine Gruppen faelschlich fuer ungesichert.
        text: 'Orte und Gruppen liegen nur auf diesem Geraet. Es gibt keine zweite Kopie.',
      }),
      this.exportFileButton,
      exportClipboard,
      el('label', { for: 'import-datei', text: 'Sicherungsdatei einlesen' }),
      this.importFileField,
      el('label', { for: 'import', text: 'Oder Sicherung als Text einfuegen' }),
      el('p', {
        class: 'hint',
        text: 'Den kopierten Text hier einfuegen und dann "Sicherung einlesen" waehlen.',
      }),
      this.importField,
      importButton,
      this.backupFeedback,
      closeBackup,
    ]);

    this.backupButton = el('button', {
      type: 'button',
      text: BACKUP_TITLE,
    }) as HTMLButtonElement;
    this.backupButton.addEventListener('click', () => {
      this.openBackup();
    });

    this.backupLine = el('p', { class: 'status' });
    this.feedback = el('p', { class: 'status', role: 'status' });

    this.panel = el('section', { class: 'panel' }, [
      el('h2', { text: 'Einstellungen' }),

      el('h3', { text: 'Sichtkegel' }),
      el('label', { for: 'kegel', text: 'Oeffnungswinkel' }),
      this.coneSelect,
      el('label', { for: 'grenze', text: 'Groesste Entfernung' }),
      this.distanceSelect,

      el('h3', { text: 'Signale' }),
      el('p', {
        class: 'hint',
        text: 'Der Ton ist bei gestelltem Lautlos-Schalter nicht hoerbar.',
      }),
      this.labelledCheckbox('earcon', 'Ton bei Ein- und Austritt', this.earconBox),

      // Das Datum bleibt **draussen**: Es gehoert in die Einstellungen, wo es
      // ungefragt ins Auge faellt (docs/design.md 7 - kein Noergel-Dialog);
      // hinter einem Dialog saehe es niemand, und genau das ist sein Zweck.
      // Der Warnsatz zieht dagegen mit hinein - er begruendet die Handlung.
      el('h3', { text: 'Daten' }),
      this.backupLine,
      this.backupButton,
      this.feedback,
      // Der Dialog haengt im Panel. Unkritisch, weil ein modaler Dialog den
      // Bereichswechsel blockiert - er kann nie offen sein, waehrend das Panel
      // ueber hidden aus dem Baum genommen wird.
      this.backupDialog.element,
    ]);

    this.renderBackupDate();
  }

  setSettings(settings: AppSettings): void {
    this.settings = settings;
    this.renderBackupDate();
  }

  report(text: string): void {
    // Solange der Dialog offen ist, laege die Zeile des Panels hinter dem
    // modalen Hintergrund - weder zu sehen noch zu erswipen (design.md 6.4).
    // Die Weiche entscheidet nach dem Zustand des Dialogs, nie nach dem Text:
    // "Speichern fehlgeschlagen." aus onChange gehoert ins Panel, derselbe
    // Satz aus onImport in den Dialog.
    setText(this.backupDialog.isOpen ? this.backupFeedback : this.feedback, text);
    this.announcer.announce(text);
  }

  private renderBackupDate(): void {
    const at = this.settings.lastBackupAt;
    setText(
      this.backupLine,
      at === null
        ? 'Noch nie gesichert.'
        : `Zuletzt gesichert: ${BACKUP_DATE_FORMAT.format(new Date(at))}`,
    );
  }

  /**
   * Oeffnet den Sicherungs-Dialog mit leerem Feld und stiller Meldungszeile.
   *
   * Er bleibt nach jeder der vier Handlungen offen: Es sind vier Werkzeuge,
   * kein Formular - als Datei sichern *und* zusaetzlich in die Zwischenablage
   * ist ein sinnvoller Doppelgriff (docs/design.md 6.6).
   */
  private openBackup(): void {
    // Leeren wie beim Anlegen-Dialog: Ein stehen gebliebener Text aus einer
    // frueheren Sitzung liesse sich versehentlich ein zweites Mal einlesen.
    this.importField.value = '';
    setText(this.backupFeedback, '');
    this.backupDialog.open(this.backupButton, this.exportFileButton);
  }

  private update(patch: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.callbacks.onChange(this.settings);
  }

  private checkbox(
    id: string,
    checked: boolean,
    onToggle: (checked: boolean) => void,
  ): HTMLInputElement {
    const box = el('input', { type: 'checkbox', id }) as HTMLInputElement;
    box.checked = checked;
    box.addEventListener('change', () => {
      onToggle(box.checked);
    });
    return box;
  }

  private labelledCheckbox(id: string, label: string, box: HTMLInputElement): HTMLElement {
    return el('div', { class: 'check' }, [box, el('label', { for: id, text: label })]);
  }
}
