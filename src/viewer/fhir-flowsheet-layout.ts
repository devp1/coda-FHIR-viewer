/**
 * Pure column-layout math for the Labs/Vitals flowsheet — extracted from fhir-flowsheet.tsx so it can be
 * unit-tested in isolation (no React/DOM). The component imports these; the test asserts the invariant.
 *
 * THE INVARIANT (audited, regression-proofed): in BOTH modes the date columns must tile the VISIBLE date
 * band (freeWidth = frame − nameCol) to a WHOLE number of equal columns, so colPx evenly divides
 * freeWidth. That makes a multiple-of-colPx scrollLeft land a whole column at BOTH the left date seam AND
 * the right frame edge (right-edge content-x = scrollLeft + freeWidth = (k + perView)·colPx, a column
 * boundary); maxLeft = (real − perView)·colPx is itself a multiple of colPx so the far-right rest is
 * whole too. The earlier fixed-80px-floor scroll width broke this (80 ∤ 996/1024/1144 → clipped sliver).
 */

/** 20rem — the frozen name column width; single source for the date equal-share calc. */
export const NAME_COL_PX = 320;
/** Per-date-column min width (the legible floor): "MMM D 'YY" header (~60px) + px-2 padding ≈ 5rem. */
export const DATE_COL_FLOOR_PX = 80;

export type FlowsheetColumnLayout = {
  /** Exact per-date-column width in px. Evenly divides the visible band (the no-clip invariant). */
  colPx: number;
  /** True when the real columns fit the band at/above the floor → they stretch to fill (no scroll). */
  fill: boolean;
  /** CSS width string for each date <col>. */
  colWidth: string;
  /** Authoritative table width: name col + real columns at colPx. FILL → frame; SCROLL → wider. */
  tableWidth: string;
};

/**
 *  - perView = whole columns the band holds at/above the legible floor = max(1, floor(freeWidth/floor)).
 *  - FILL (real ≤ perView, freeWidth ≥ floor): real columns split the band (freeWidth/real) → stretch to
 *    fill the frame edge-to-edge, no whitespace, no scroll.
 *  - SCROLL (real > perView, or a sub-column frame): colPx = freeWidth/perView (exact divisor ≥ floor),
 *    so freeWidth is an integer multiple of colPx → every snapped rest shows whole columns, no clip.
 *  - colPx floored at DATE_COL_FLOOR_PX so a narrow frame scrolls at a legible 80px, not a sub-floor col.
 */
export function computeColumnLayout(frameWidthPx: number, realCount: number): FlowsheetColumnLayout {
  const freeWidth = Math.max(0, frameWidthPx - NAME_COL_PX);
  const real = Math.max(1, realCount);
  const perView = Math.max(1, Math.floor(freeWidth / DATE_COL_FLOOR_PX));
  // FILL only when the real columns fit the band at/above the floor. At a sub-column frame (freeWidth <
  // floor) even one floor-width column overflows, so it must scroll, not falsely "fill".
  const fill = real <= perView && freeWidth >= DATE_COL_FLOOR_PX;
  const rawColPx = fill ? freeWidth / real : freeWidth / perView;
  const colPx = Math.max(DATE_COL_FLOOR_PX, rawColPx);
  return {
    colPx,
    fill,
    colWidth: `${colPx}px`,
    tableWidth: `${NAME_COL_PX + real * colPx}px`,
  };
}
