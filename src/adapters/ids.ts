/** Kennungen fuer neue Orte. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback fuer aeltere Safari-Versionen: fuer geraetelokale Kennungen
  // ausreichend eindeutig.
  return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
