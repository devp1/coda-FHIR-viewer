// Pure data layer for the measurement trend modal (R3 M4). Kept React-free so the risky
// parsing (compound BP reference ranges, half-pair readings, unit suffixes with slashes) has
// real behavioral test coverage — source-shape guards alone let two BP bugs through (Codex P1/P2).

export type MeasurementTrendPoint = {
  dateKey: string;
  dateLabel: string;
  valueText: string;
  /** One slot PER SERIES, aligned by index: single-analyte rows carry [value]; compound
      readings like BP carry [systolic, diastolic]. A half-pair reading ("144/—") keeps its
      date with a null in the missing slot — the adapter deliberately emits half-pairs, and
      dropping the date would hide a real reading. */
  values: Array<number | null>;
  outOfRange?: boolean;
  flag?: 'H' | 'L';
};

export type TrendBand = { low: number; high: number };

type TrendCellLike = {
  value: number | null;
  valueText: string;
  outOfRange?: boolean;
  flag?: 'H' | 'L';
} | null;

type TrendColumnLike = { dateKey: string; label: string };

const NUMERIC = String.raw`\d+(?:\.\d+)?`;
// A compound reading: numeric-or-dash on BOTH sides of a slash ("118/76", "144/—", "—/82").
// The dash side must be a dash CHARACTER, not a number, so unit slashes ("mg/dL") never match.
const COMPOUND_READING = new RegExp(`^(${NUMERIC}|[—–-])\\s*/\\s*(${NUMERIC}|[—–-])$`);

function compoundSide(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function measurementTrendPoints(
  cells: TrendCellLike[],
  columns: TrendColumnLike[],
): MeasurementTrendPoint[] {
  const out: MeasurementTrendPoint[] = [];
  columns.forEach((column, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(column.dateKey)) return;
    const cell = cells[i];
    if (!cell) return;
    const base = {
      dateKey: column.dateKey,
      dateLabel: column.label,
      valueText: cell.valueText,
      outOfRange: cell.outOfRange,
      flag: cell.flag,
    };
    const compound = cell.valueText.trim().match(COMPOUND_READING);
    if (compound) {
      const values = [compoundSide(compound[1]), compoundSide(compound[2])];
      if (values.some(v => v !== null)) out.push({ ...base, values });
      return;
    }
    if (cell.value === null || !Number.isFinite(cell.value)) return;
    out.push({ ...base, values: [cell.value] });
  });
  return out;
}

// ── Time windowing + label density (R6, user-approved 2026-06-10) ──────────────────────────────
// The trend modal never auto-fits an unbounded span: histories longer than a year open on the
// most recent year, with 3M/6M/1Y/ALL presets and a draggable overview strip. Pure helpers so
// the window math (clamping at both ends, presets longer than the span) has real test coverage.

export type TrendWindowPreset = '3M' | '6M' | '1Y' | 'ALL';

const DAY_MS = 86400000;
export const TREND_WINDOW_MS: Record<Exclude<TrendWindowPreset, 'ALL'>, number> = {
  '3M': 91 * DAY_MS,
  '6M': 182 * DAY_MS,
  '1Y': 365 * DAY_MS,
};

/** Plot-key (YYYY-MM-DD) → UTC ms. The ONE date-math rule the viewer and these helpers share. */
export function trendDayMs(dateKey: string): number {
  return Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)));
}

/** A fixed-length window anchored at `endMs` (default: the newest reading), clamped inside the
 *  full history. A preset longer than the history degrades to the full span. */
export function trendWindowBounds(
  firstMs: number,
  lastMs: number,
  windowMs: number,
  endMs: number | null,
): { start: number; end: number } {
  if (windowMs >= lastMs - firstMs) return { start: firstMs, end: lastMs };
  const minEnd = firstMs + windowMs;
  const end = Math.min(lastMs, Math.max(endMs ?? lastMs, minEnd));
  return { start: end - windowMs, end };
}

/** Per-point label rule (R6): a dot keeps its inline value label only when it has at least
 *  `minGap` px to its nearest neighbor — clustered dots drop labels and disclose on hover/focus
 *  instead. xs must be ascending (chronological window points). */
export function trendLabelVisibility(xs: number[], minGap = 30): boolean[] {
  return xs.map((x, i) => {
    const prevGap = i > 0 ? x - xs[i - 1] : Infinity;
    const nextGap = i < xs.length - 1 ? xs[i + 1] - x : Infinity;
    return Math.min(prevGap, nextGap) >= minGap;
  });
}

// Reference bands parsed from DISPLAY text, one band PER SERIES, fail-quiet (display-only):
//  - "0.7–1.3 mg/dL" with 1 series → [{0.7,1.3}] (the unit slash never splits a band).
//  - "4.5-11 ×10⁹/L" with 1 series → [{4.5,11}].
//  - "90-120/60-80" with 2 series → [{90,120},{60,80}] (systolic + diastolic bands).
//  - "90-120/60-80" with 1 series → [] (a compound range cannot honestly band one series).
//  - "<5", "negative", one-sided or qualitative → [] — never a fabricated bound.
export function parseTrendReferenceBands(text: string | undefined, seriesCount: number): TrendBand[] {
  if (!text) return [];
  const RANGE = new RegExp(`(-?${NUMERIC})\\s*(?:-|–|—|to)\\s*(-?${NUMERIC})`);
  const rangeIn = (segment: string): TrendBand | null => {
    const m = segment.match(RANGE);
    if (!m) return null;
    const low = Number(m[1]);
    const high = Number(m[2]);
    return Number.isFinite(low) && Number.isFinite(high) && high > low ? { low, high } : null;
  };
  // Compound form: a slash with a numeric RANGE on each side (unit slashes like "×10⁹/L" have
  // no range after the slash, so they fall through to the single-band path).
  const sides = text.split('/');
  if (sides.length >= 2) {
    const sideBands = sides.map(rangeIn);
    if (sideBands.length >= 2 && sideBands.slice(0, 2).every(Boolean)) {
      // Honest only when the band count can map 1:1 onto the series.
      return seriesCount === 2 ? (sideBands.slice(0, 2) as TrendBand[]) : [];
    }
  }
  if (seriesCount !== 1) return [];
  const single = rangeIn(text);
  return single ? [single] : [];
}
