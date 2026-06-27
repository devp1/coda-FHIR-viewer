/**
 * Regression proof for the flowsheet column-layout invariant — the bug that kept recurring (a clipped
 * partial date column at the right frame edge / a white void with sparse dates). Asserts the even-tiling
 * invariant across the FULL state space so it can never silently regress again.
 *
 * Run: `npm test`  (node --test --experimental-strip-types)
 *
 *   In BOTH modes colPx must evenly divide the visible band (freeWidth = frame − nameCol), so:
 *     - SCROLL: freeWidth is an integer multiple of colPx ⇒ no clipped sliver at any whole-column rest,
 *       and maxLeft = tableWidth − frame is itself a multiple of colPx ⇒ the far-right rest is whole.
 *     - FILL (sparse): the real columns stretch to fill the frame exactly ⇒ no white void, no scroll.
 *     - colPx ≥ DATE_COL_FLOOR_PX always (legible), even at narrow / sub-column frames (which scroll).
 */
import assert from 'node:assert';
import { test } from 'node:test';
import {
  computeColumnLayout,
  NAME_COL_PX,
  DATE_COL_FLOOR_PX,
} from '../src/viewer/fhir-flowsheet-layout.ts';

/** FP-robust remainder: distance from a to the nearest multiple of b. */
const rem = (a: number, b: number) => Math.abs(a - Math.round(a / b) * b);
const EPS = 1e-6;
const px = (s: string) => Number(s.replace('px', ''));

test('flowsheet column layout invariant holds across the full state space', () => {
  // Frame widths 200–2560px × column counts 0–120, fill / scroll / sub-column.
  const FRAMES = [200, 256, 300, 320, 768, 1000, 1252, 1280, 1400, 1536, 1920, 2560];
  const COUNTS = [0, 1, 2, 5, 11, 12, 13, 14, 15, 20, 30, 40, 50, 120];

  for (const frame of FRAMES) {
    for (const count of COUNTS) {
      const L = computeColumnLayout(frame, count);
      const freeWidth = Math.max(0, frame - NAME_COL_PX);
      const real = Math.max(1, count);
      const tableWidth = px(L.tableWidth);
      const maxLeft = tableWidth - frame; // = scrollWidth − clientWidth
      const subColumn = freeWidth < DATE_COL_FLOOR_PX; // frame narrower than one legible column
      const tag = `frame=${frame} count=${count}`;

      // (1) Columns are always legible — never below the floor, never 0px.
      assert.ok(L.colPx >= DATE_COL_FLOOR_PX - EPS, `${tag}: colPx ${L.colPx} below floor`);

      // (2) Table width is the exact column sum.
      assert.ok(
        Math.abs(tableWidth - (NAME_COL_PX + real * L.colPx)) < EPS,
        `${tag}: tableWidth mismatch`,
      );

      if (L.fill) {
        // (3) FILL: the table fills the frame exactly — no white void, no horizontal scroll.
        assert.ok(Math.abs(tableWidth - frame) < 0.5, `${tag}: FILL must equal frame`);
        assert.ok(maxLeft <= 0.5, `${tag}: FILL must not scroll`);
      } else if (!subColumn) {
        // (4) SCROLL: colPx evenly divides the band ⇒ no clipped sliver; maxLeft is a whole multiple.
        assert.ok(rem(freeWidth, L.colPx) < EPS, `${tag}: SCROLL colPx ${L.colPx} ∤ freeWidth ${freeWidth}`);
        assert.ok(maxLeft <= 0 || rem(maxLeft, L.colPx) < EPS, `${tag}: maxLeft ${maxLeft} not a colPx multiple`);
      }
      // sub-column frames must SCROLL (one legible column can't fit a narrower frame — partial unavoidable).
      if (subColumn) assert.ok(!L.fill, `${tag}: sub-column frame must scroll, not fill`);
    }
  }
});

test('historically-broken widths produce exact even divisors', () => {
  for (const [frame, count, wantColPx] of [
    [1280, 40, 960 / 12],
    [1400, 40, 1080 / 13],
    [1252, 20, 932 / 11],
  ] as const) {
    const L = computeColumnLayout(frame, count);
    assert.ok(!L.fill, `frame=${frame}: should be SCROLL`);
    assert.ok(Math.abs(L.colPx - wantColPx) < EPS, `frame=${frame}: colPx ${L.colPx} != ${wantColPx}`);
  }
});
