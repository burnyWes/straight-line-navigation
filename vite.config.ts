import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages liefert unter einem Unterpfad aus. Fehlt das hier, laden
  // Assets und Service-Worker-Scope ins Leere - die klassische Falle bei
  // Pages-Deployments.
  base: '/straight-line-navigation/',

  build: {
    target: 'es2022',
    outDir: 'dist',
  },

  test: {
    // Domaene und Anwendungsschicht sind frei von Browser-APIs und laufen
    // daher ohne DOM-Umgebung.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
