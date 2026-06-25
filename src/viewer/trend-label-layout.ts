// Collision-aware label layout for the measurement trend modal (R5, user-approved 2026-06-10).
// EVERY plot label (dot values, reference-band bounds, REF/SYS/DIA gutter tags) flows through one
// resolver so "labels never overlap" is a tested property of the layout, not a per-case offset
// tweak — the R4 fixed-offset placements collided whenever the scale compressed (outlier vs band)
// or two BP bands sat close together. React-free so synthetic extremes get real unit coverage.

export type TrendLabelBox = {
  /** Stable identity — the modal renders fills/weights per label by key prefix. */
  key: string;
  x: number;
  /** SVG text baseline of the FIRST line. The resolver only ever moves y, never x: a value
      label must stay over its own dot, a gutter label inside its gutter. */
  y: number;
  /** Multi-line blocks (the SYS/DIA tag + range pairs) move as ONE rect so the resolver can
      never split a tag from its range. */
  lines: string[];
  anchor: 'start' | 'middle' | 'end';
  fontSize: number;
  /** Lower places first and wins its spot; later labels shift around everything already placed. */
  priority: number;
  /** Allowed escape direction. 'both' alternates nearest-first. 'none' never moves (it is the
      anchor others avoid). */
  shift: 'up' | 'down' | 'both' | 'none';
  /** Baseline clamp — keeps labels inside the plot viewBox even while escaping a collision. */
  minY?: number;
  maxY?: number;
};

export type TrendLabelRect = { left: number; right: number; top: number; bottom: number };

// JetBrains Mono advance width is 0.6em; 0.62 adds safety so the estimate never under-reads a
// real glyph run (an under-estimate would let "resolved" labels still touch in the DOM).
const CHAR_ADVANCE = 0.62;
const LINE_GAP = 1.5;
const PAD = 1;

export function trendLabelRect(box: TrendLabelBox, atY?: number): TrendLabelRect {
  const y = atY ?? box.y;
  const widest = Math.max(...box.lines.map(line => line.length), 0);
  const width = widest * box.fontSize * CHAR_ADVANCE;
  const left = box.anchor === 'start' ? box.x : box.anchor === 'end' ? box.x - width : box.x - width / 2;
  return {
    left,
    right: left + width,
    top: y - box.fontSize,
    bottom: y + (box.lines.length - 1) * (box.fontSize + LINE_GAP) + 2,
  };
}

function rectsOverlap(a: TrendLabelRect, b: TrendLabelRect): boolean {
  return a.left < b.right + PAD && b.left < a.right + PAD && a.top < b.bottom + PAD && b.top < a.bottom + PAD;
}

/** Returns the same labels (extra fields ride through untouched) with y resolved so that no two
 *  label rects overlap wherever the clamp range allows an escape. A label that cannot clear every
 *  collision inside its clamp range keeps its nearest-clamped origin — drawn anyway, never
 *  silently dropped (display-layer honesty: hiding a value would misreport the chart). */
export function resolveTrendLabels<T extends TrendLabelBox>(labels: T[]): T[] {
  const entries = labels.map((label, index) => ({ label: { ...label }, index }));
  const placementOrder = [...entries].sort((a, b) => a.label.priority - b.label.priority || a.index - b.index);
  const placed: TrendLabelRect[] = [];
  for (const entry of placementOrder) {
    const box = entry.label;
    const clamp = (y: number) => Math.min(box.maxY ?? Infinity, Math.max(box.minY ?? -Infinity, y));
    const fits = (y: number) => {
      const rect = trendLabelRect(box, y);
      return !placed.some(p => rectsOverlap(p, rect));
    };
    box.y = clamp(box.y);
    if (!fits(box.y) && box.shift !== 'none') {
      const STEP = 4;
      const MAX_STEPS = 24;
      const candidates: number[] = [];
      for (let k = 1; k <= MAX_STEPS; k++) {
        if (box.shift === 'up' || box.shift === 'both') candidates.push(box.y - STEP * k);
        if (box.shift === 'down' || box.shift === 'both') candidates.push(box.y + STEP * k);
      }
      // Clamped duplicates collapse so a label pinned at its bound is only retried once.
      const tried = new Set<number>();
      for (const raw of candidates) {
        const y = clamp(raw);
        if (tried.has(y)) continue;
        tried.add(y);
        if (fits(y)) { box.y = y; break; }
      }
    }
    placed.push(trendLabelRect(box));
  }
  return placementOrder.sort((a, b) => a.index - b.index).map(entry => entry.label as T);
}
