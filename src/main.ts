/**
 * Einstiegspunkt.
 *
 * Noch ohne Oberflaeche: Bisher stehen Geruest, Domaene und Anwendungsschicht.
 * Die Adapter (Geolocation, DeviceOrientation, localStorage, Signale) und die
 * drei Bereiche Navigation / Orte / Einstellungen folgen.
 */

const app = document.getElementById('app');

if (app !== null) {
  const heading = document.createElement('h1');
  heading.textContent = 'Straight-Line-Navigation';

  const status = document.createElement('p');
  status.textContent =
    'Geruest steht. Die Oberflaeche folgt - siehe docs/design.md fuer den geplanten Aufbau.';

  app.append(heading, status);
}
