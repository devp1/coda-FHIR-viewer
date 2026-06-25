import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Inject a restrictive Content-Security-Policy into the BUILT single-file HTML only (not dev — Vite's
 * HMR client needs a WebSocket + eval that a strict policy forbids). This turns "no network, nothing
 * leaves the browser" from a behavior into an enforced policy for the shipped artifact:
 *   - connect-src 'none'  → the page cannot open ANY network connection (no exfiltration of dropped PHI)
 *   - default-src 'none'  → deny by default; only the few things the inlined app needs are allowed
 *   - script/style 'unsafe-inline' → the single-file build inlines its JS and CSS as inline blocks
 *   - img-src data: + font-src 'self' → inline data-URI images and system fonts only (no CDN)
 */
const CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "connect-src 'none'";

const injectCspOnBuild = (): Plugin => ({
  name: 'inject-csp-on-build',
  apply: 'build',
  transformIndexHtml: html =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/**
 * Build config for the standalone Coda FHIR Viewer.
 *
 * `vite-plugin-singlefile` inlines ALL JS + CSS into one `dist/index.html` so the result is a single
 * self-contained file the recipient double-clicks to open — no server, no install, no internet. The
 * viewer parses dropped FHIR entirely in-browser, so the file works offline and uploads nothing.
 */
export default defineConfig({
  plugins: [react(), injectCspOnBuild(), viteSingleFile()],
  // The viewer ships as ONE inlined HTML with no static assets — disable `public/` entirely so a stray
  // file there (e.g. a clinical NDJSON fixture used while testing) can never be copied into dist/ and
  // shipped next to the artifact. Keep clinical fixtures out of the build tree.
  publicDir: false,
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // inline everything
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
