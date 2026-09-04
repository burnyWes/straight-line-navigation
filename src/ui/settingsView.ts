/**
 * Einstellungen: Kegel, Entfernungsgrenze, Signalkanaele, Sicherung.
 */

import { el, setText } from './dom.js';
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
  private readonly announcementBox: HTMLInputElement;
  private readonly importField: HTMLTextAreaElement;
  private readonly backupLine: HTMLElement;
  private readonly feedback: HTMLElement;
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
    this.announcementBox = this.checkbox('ansage', initial.cues.announcement, (checked) => {
      this.update({ cues: { ...this.settings.cues, announcement: checked } });
    });

    const exportFile = el('button', {
      type: 'button',
      class: 'primary',
      text: 'Als Datei sichern',
    }) as HTMLButtonElement;
    exportFile.addEventListener('click', () => {
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
        text:
          'Der Ton ist bei gestelltem Lautlos-Schalter nicht hoerbar. Die Ansage laeuft ueber VoiceOver und ist auch dann da.',
      }),
      this.labelledCheckbox('earcon', 'Ton bei Ein- und Austritt', this.earconBox),
      this.labelledCheckbox('ansage', 'Ansage bei Ein- und Austritt', this.announcementBox),

      el('h3', { text: 'Sicherung' }),
      el('p', {
        class: 'hint',
        text: 'Die Orte liegen nur auf diesem Geraet. Es gibt keine zweite Kopie.',
      }),
      this.backupLine,
      exportFile,
      exportClipboard,
      el('label', { for: 'import', text: 'Sicherung einfuegen' }),
      this.importField,
      importButton,
      this.feedback,
    ]);

    this.renderBackupDate();
  }

  setSettings(settings: AppSettings): void {
    this.settings = settings;
    this.renderBackupDate();
  }

  report(text: string): void {
    setText(this.feedback, text);
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
