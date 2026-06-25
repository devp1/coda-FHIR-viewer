import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Build config for the standalone Coda FHIR Viewer.
 *
 * `vite-plugin-singlefile` inlines ALL JS + CSS into one `dist/index.html` so the result is a single
 * self-contained file the recipient double-clicks to open — no server, no install, no internet. The
 * viewer parses dropped FHIR entirely in-browser, so the file works offline and uploads nothing.
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline everything
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
