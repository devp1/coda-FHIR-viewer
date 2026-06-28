'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FhirFlowsheet, FhirFlowsheetRow } from '../lib/fhir-chart';
import {
  measurementTrendPoints,
  MeasurementTrendModal,
  TrendSparkline,
  FhirCellHover,
  useHoverCard,
  type FhirCellDetail,
  type MeasurementTrend,
  type MeasurementTrendPoint,
} from './fhir-trend';
import { FilterInput } from './fhir-primitives';
import { computeColumnLayout, DATE_COL_FLOOR_PX } from './fhir-flowsheet-layout';
import { buildLabFlowsheetDisplayRows, type FhirFlowsheetDisplayRow } from './fhir-flowsheet-rows';

/** Rows rendered outside the viewport buffer are virtualized away for performance. */
const ROW_PX = 30;
const OVERSCAN = 12;
const NAME_COL = 'w-[20rem] min-w-[20rem] max-w-[20rem]';
// The pure column-layout math (fill-then-scroll even-tiling invariant) lives in a separate module so it
// can be unit-tested without React/DOM — see fhir-flowsheet-layout.ts + tests/fhir-viewer-flowsheet-layout.test.ts.
/** Hard ceiling on rendered date columns so a huge window can't lock the browser (older off-screen). */
const COLUMN_RENDER_CAP = 120;
// Opaque frozen-name column with an inset divider — copied technique from the signed grid.
const STICKY_FREEZE = 'sticky left-0 z-20 shadow-[inset_-1px_0_0_0_rgba(0,0,0,0.12)]';
const GROUP_CHIP = 'mono inline-flex h-5 shrink-0 items-center justify-center rounded-full border px-2 text-[0.55rem] font-medium uppercase leading-none tracking-wider';

/** YYYY-MM-DD of a flowsheet column key (undated → ''). */
function dayOf(dateKey: string): string {
  return dateKey.startsWith('undated') ? '' : dateKey.slice(0, 10);
}

function baseDateKey(dateKey: string): string {
  return dateKey.replace(/·\d+$/, '');
}

function endOfMonth(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, '0')}`;
}

/**
 * Full-width Labs / Vitals flowsheet — own dense matrix (fast, virtualized, searchable), with the
 * REAL trend copied from the signed grid: hover a populated row → an inline sparkline in the name
 * cell; click it → the real trend modal. NO reference ranges, NO High/Low (absent in FHIR exports).
 *
 * Columns = the COLUMN_CAP most-populated dates; rows with no value in those dates are hidden. Flat
 * vitals keep model order; labs can render category/family headers over the model's catalog order.
 * The trend is computed from the analyte's FULL history (every date), not the visible window.
 */
export function FhirFlowsheet({
  flowsheet,
  noun,
  grouping,
  focusDateKey,
  focusToken,
}: {
  flowsheet: FhirFlowsheet;
  noun: 'Lab result' | 'Vital';
  grouping?: 'labs';
  focusDateKey?: string | null;
  focusToken?: number;
}) {
  const [query, setQuery] = useState('');
  const [trendKey, setTrendKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>([]);
  const [collapsedFamilyIds, setCollapsedFamilyIds] = useState<string[]>([]);
  // Per-cell hover detail card (value · unit · date · delta-vs-prior), ported from the signed grid.
  const cellHover = useHoverCard<FhirCellDetail>();

  // ── all populated dated columns (ascending, newest last), + the full data span ───────────────────
  const allDated = useMemo(
    () => flowsheet.dateKeys.filter(k => !k.startsWith('undated')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    [flowsheet.dateKeys],
  );
  const spanStart = allDated.length ? dayOf(allDated[0]) : '';
  const spanEnd = allDated.length ? dayOf(allDated[allDated.length - 1]) : '';

  // ── from→to date window (user-set). Defaults to the full span. ──────────────────────────────────
  const [from, setFrom] = useState(spanStart);
  const [to, setTo] = useState(spanEnd);
  // Re-seed the window when a different export loads (span changes).
  const lastSpan = useRef('');
  useEffect(() => {
    const sig = `${spanStart}|${spanEnd}`;
    if (sig !== lastSpan.current) { lastSpan.current = sig; setFrom(spanStart); setTo(spanEnd); }
  }, [spanStart, spanEnd]);

  const focusMonth = focusDateKey?.slice(0, 7) ?? null;
  useEffect(() => {
    if (!focusMonth || !spanStart || !spanEnd) return;
    const start = `${focusMonth}-01`;
    const end = endOfMonth(focusMonth);
    setFrom(start < spanStart ? spanStart : start);
    setTo(end > spanEnd ? spanEnd : end);
  }, [focusMonth, focusToken, spanStart, spanEnd]);

  // ── columns within the window — EVERY populated date in [from,to], scrolled horizontally. The most
  // recent COLUMN_RENDER_CAP are rendered (newest on the right); older ones are reported off-screen
  // (narrow the window to reach them). ──
  const windowDates = useMemo(
    () => allDated.filter(k => { const d = dayOf(k); return (!from || d >= from) && (!to || d <= to); }),
    [allDated, from, to],
  );
  const visibleDates = windowDates.length > COLUMN_RENDER_CAP ? windowDates.slice(windowDates.length - COLUMN_RENDER_CAP) : windowDates;
  const hiddenOlder = windowDates.length - visibleDates.length;

  // Data rows: ordered by the model (alphabetical for flat vitals, catalog order for labs), present in
  // >=1 visible column, matching the search. Category/family headers are built after this filter.
  const dataRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flowsheet.rows.filter(r => {
      if (!visibleDates.some(k => r.cells[k] !== undefined)) return false;
      if (q) {
        const searchable = [
          r.label,
          r.unit ?? '',
          r.labGroup?.categoryLabel ?? '',
          r.labGroup?.familyLabel ?? '',
          grouping === 'labs' && !r.labGroup ? 'Other labs unmapped' : '',
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [flowsheet.rows, grouping, visibleDates, query]);

  const groupedLabs = grouping === 'labs';
  const forceOpenGroups = groupedLabs && query.trim().length > 0;
  const displayRows = useMemo<FhirFlowsheetDisplayRow[]>(
    () => groupedLabs
      ? buildLabFlowsheetDisplayRows(dataRows, collapsedCategoryIds, collapsedFamilyIds, forceOpenGroups)
      : dataRows.map(row => ({ kind: 'data' as const, key: row.codeKey, row })),
    [collapsedCategoryIds, collapsedFamilyIds, dataRows, forceOpenGroups, groupedLabs],
  );
  const toggleCategory = (id: string) => setCollapsedCategoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleFamily = (id: string) => setCollapsedFamilyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── trend rows (full history per analyte) for the inline sparkline + modal ──────────────────────
  const trendByKey = useMemo(() => {
    const map = new Map<string, MeasurementTrend>();
    for (const row of flowsheet.rows) {
      // Build day-resolution columns + cells (latest value per day) for THIS analyte's full history.
      const dayCells = new Map<string, { valueText: string; value: number | null; fullKey: string }>();
      for (const fullKey of Object.keys(row.cells)) {
        const day = dayOf(fullKey);
        if (!day) continue; // undated points can't plot on a time axis
        const value = row.numeric.find(n => n.dateKey === fullKey)?.value ?? null;
        const prev = dayCells.get(day);
        if (!prev || fullKey > prev.fullKey) dayCells.set(day, { valueText: row.cells[fullKey], value, fullKey });
      }
      const days = [...dayCells.keys()].sort();
      const columns = days.map(d => ({ dateKey: d, label: d }));
      const cells = days.map(d => {
        const c = dayCells.get(d)!;
        return { value: c.value, valueText: c.valueText };
      });
      const points: MeasurementTrendPoint[] = measurementTrendPoints(cells, columns);
      if (points.length >= 2) {
        map.set(row.codeKey, { key: row.codeKey, label: row.label, unit: row.unit ?? '', points });
      }
    }
    return map;
  }, [flowsheet.rows]);

  // ── virtualization + responsive frame width (for the fill-then-scroll column layout) ──────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [frameW, setFrameW] = useState(1000);
  // Current exact column width (px), kept in a ref so the scroll-end handler can snap without re-binding.
  const colPxRef = useRef(DATE_COL_FLOOR_PX);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setScrollTop(el.scrollTop);
      // Whole-column snap: after horizontal scrolling settles (~120ms idle), round scrollLeft to the
      // nearest multiple of colPx. Because colPx EVENLY DIVIDES the visible band freeWidth (the layout
      // invariant — colPx = freeWidth/perView in scroll mode), a multiple-of-colPx scrollLeft lands a
      // whole column at BOTH edges; and maxLeft = (real−perView)·colPx is itself a multiple of colPx, so
      // the clamp preserves the whole-right far rest. Skip when there's nothing to scroll (fill mode).
      if (snapTimer.current) clearTimeout(snapTimer.current);
      snapTimer.current = setTimeout(() => {
        const cp = colPxRef.current;
        const maxLeft = el.scrollWidth - el.clientWidth;
        if (cp <= 0 || maxLeft <= 0) return;
        const snapped = Math.min(maxLeft, Math.round(el.scrollLeft / cp) * cp);
        if (Math.abs(snapped - el.scrollLeft) > 0.5) el.scrollTo({ left: snapped, behavior: 'smooth' });
      }, 120);
    };
    const ro = new ResizeObserver(() => { setViewportH(el.clientHeight); setFrameW(el.clientWidth); });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setViewportH(el.clientHeight);
    setFrameW(el.clientWidth);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); if (snapTimer.current) clearTimeout(snapTimer.current); };
  }, []);
  // Dynamic fill-then-scroll layout: when sparse the REAL date columns stretch to fill the whole frame
  // (no whitespace, no filler); as dates are added they shrink evenly to the floor; past that, scroll.
  const layout = useMemo(() => computeColumnLayout(frameW, visibleDates.length), [frameW, visibleDates.length]);
  colPxRef.current = layout.colPx;
  // Start scrolled to the RIGHT (newest dates) whenever the visible window changes.
  const colCount = visibleDates.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [colCount, from, to]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxTop = Math.max(0, displayRows.length * ROW_PX - viewportH);
    if (el.scrollTop > maxTop) {
      el.scrollTop = maxTop;
      setScrollTop(maxTop);
    }
  }, [displayRows.length, viewportH]);
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
  const endIdx = Math.min(displayRows.length, Math.ceil((scrollTop + viewportH) / ROW_PX) + OVERSCAN);
  const padTop = startIdx * ROW_PX;
  const padBottom = (displayRows.length - endIdx) * ROW_PX;
  const slice = displayRows.slice(startIdx, endIdx);

  // trend modal navigation (prev/next over the trend-capable rows in display order)
  const trendRows = useMemo(() => dataRows.filter(r => trendByKey.has(r.codeKey)), [dataRows, trendByKey]);
  const trendIdx = trendKey ? trendRows.findIndex(r => r.codeKey === trendKey) : -1;
  const activeTrend = trendKey ? trendByKey.get(trendKey) ?? null : null;

  if (flowsheet.rows.length === 0) {
    return <p className="text-sm text-ink-faint">No measurements.</p>;
  }

  return (
    <div className="flex flex-col rounded-sm border border-hairline">
      {/* header: count · date-window (from → to) · search (no duplicate title, no DRAWN) */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline bg-surface-dim px-3 py-2">
        <span className="mono text-[0.62rem] uppercase tracking-wider text-ink-faint">
          {dataRows.length.toLocaleString()}
          {dataRows.length !== flowsheet.rows.length ? ` of ${flowsheet.rows.length.toLocaleString()}` : ''} analytes ·{' '}
          {windowDates.length.toLocaleString()} date{windowDates.length === 1 ? '' : 's'} in window
          {hiddenOlder > 0 ? ` · ${hiddenOlder} oldest hidden — narrow the date window to view` : ''}
        </span>
        <div className="flex items-center gap-2">
          <label className="mono flex items-center gap-1 text-[0.58rem] uppercase tracking-wider text-ink-faint">
            from
            <input
              type="date"
              value={from}
              min={spanStart}
              max={to || spanEnd}
              onChange={e => setFrom(e.target.value)}
              className="mono rounded-sm border border-hairline bg-surface px-1.5 py-0.5 text-[0.68rem] text-ink focus:border-ok focus:outline-none"
            />
          </label>
          <label className="mono flex items-center gap-1 text-[0.58rem] uppercase tracking-wider text-ink-faint">
            to
            <input
              type="date"
              value={to}
              min={from || spanStart}
              max={spanEnd}
              onChange={e => setTo(e.target.value)}
              className="mono rounded-sm border border-hairline bg-surface px-1.5 py-0.5 text-[0.68rem] text-ink focus:border-ok focus:outline-none"
            />
          </label>
          {(from !== spanStart || to !== spanEnd) && (
            <button
              type="button"
              onClick={() => { setFrom(spanStart); setTo(spanEnd); }}
              className="mono text-[0.58rem] uppercase tracking-wider text-ink-mid hover:text-ok"
            >
              reset
            </button>
          )}
          <FilterInput value={query} onChange={setQuery} placeholder="Search analytes…" width="w-48" />
        </div>
      </div>

      {/* Whole-column rest: on scroll-end, JS rounds scrollLeft to the nearest multiple of colPx. Because
          colPx evenly divides the visible band freeWidth (the layout invariant), a multiple-of-colPx
          scrollLeft shows whole columns at both edges. (CSS scroll-snap is unreliable here — the sticky
          <thead> cells snap-align inconsistently — so this is done deterministically in the handler.) */}
      {/* RC4: an empty visible window (a from→to sub-range with no populated dates) must NOT collapse the
          table to a 256px name-col island floating in a full-frame void — render a full-width empty state. */}
      {visibleDates.length === 0 ? (
        <p className="px-3 py-8 text-center text-[0.8rem] text-ink-faint">
          No measurements{from || to ? ` between ${from || '…'} and ${to || '…'}` : ''}.
        </p>
      ) : (
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
        {/* Cell text 0.74rem — one EHR-grade cell size shared with ClinicalTable (E3). Row height
            (ROW_PX virtualization) and the trend/date-window logic are unchanged. */}
        {/* `table-fixed` + a <colgroup> of EXACT computed widths: layout is authoritative (not
            content-driven, so it can't shift as virtualized rows mount/unmount) AND the table width is
            the exact column sum — name col + N whole `freeWidth/N` columns. In FILL mode that equals the
            frame (fills edge-to-edge, no void); in SCROLL mode it's wider by whole columns (wrapper
            scrolls, every column lands whole — no clipped partial at the seam). */}
        <table className="table-fixed border-collapse text-[0.74rem]" style={{ width: layout.tableWidth }}>
          <colgroup>
            <col className={NAME_COL} />
            {visibleDates.map(dateKey => (
              <col key={dateKey} style={{ width: layout.colWidth }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-30">
            <tr className="border-b border-hairline-strong">
              <th className={`${STICKY_FREEZE} ${NAME_COL} bg-surface-dim py-1.5 pl-3 pr-3 text-left align-bottom font-normal`}>
                <span className="mono text-[0.6rem] uppercase tracking-wider text-ink-faint">{noun}</span>
              </th>
              {visibleDates.map(dateKey => {
                const focused = focusMonth && dateKey.slice(0, 7) === focusMonth;
                const dateTimeLabel = formatFlowsheetDateTimeLabel(dateKey);
                const timeLabel = formatFlowsheetTimeLabel(dateKey);
                return (
                <th
                  key={dateKey}
                  title={dateTimeLabel}
                  aria-label={dateTimeLabel}
                  className={`border-l border-hairline px-2 py-1 text-center align-bottom font-normal ${focused ? 'bg-ok-soft text-ok shadow-[inset_0_-2px_0_#1a6b4a]' : 'bg-surface-dim'}`}
                >
                  <span className="mono flex min-h-7 flex-col items-center justify-center leading-tight text-ink-mid">
                    <span className="whitespace-nowrap text-[0.62rem]">{shortDate(dateKey)}</span>
                    {timeLabel && <span className="mt-0.5 whitespace-nowrap text-[0.56rem] text-ink-faint">{timeLabel}</span>}
                  </span>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr style={{ height: padTop }}><td colSpan={1 + visibleDates.length} /></tr>}
            {slice.map((displayRow, i) => {
              if (displayRow.kind !== 'data') {
                const isCategory = displayRow.kind === 'category';
                const toggle = () => (isCategory ? toggleCategory(displayRow.id) : toggleFamily(displayRow.id));
                const bg = isCategory ? 'bg-ok-soft/35' : 'bg-surface';
                const rowLabel = isCategory && !displayRow.mapped ? 'unmapped' : isCategory ? 'category' : 'family';
                const resultLabel = displayRow.count === 1 ? 'result' : 'results';
                const border = isCategory ? 'border-ok/45' : 'border-hairline-strong';
                const frozenRail = isCategory
                  ? 'sticky left-0 z-30 shadow-[inset_5px_0_0_0_#1a6b4a,inset_-1px_0_0_0_rgba(0,0,0,0.12)]'
                  : 'sticky left-0 z-20 shadow-[inset_31px_0_0_-28px_rgba(26,107,74,0.42),inset_-1px_0_0_0_rgba(0,0,0,0.12)]';
                const chipTone = isCategory
                  ? 'border-ok/50 bg-surface text-ok'
                  : 'border-info/35 bg-surface text-info';
                return (
                  <tr
                    key={displayRow.key}
                    className={`border-b ${border} ${bg} ${isCategory ? 'border-t border-t-ok/25' : ''}`}
                    style={{ height: ROW_PX }}
                  >
                    <th
                      scope="row"
                      className={`${frozenRail} ${NAME_COL} ${bg} ${isCategory ? 'pl-3' : 'pl-7'} cursor-pointer py-1 pr-2 text-left align-middle font-normal`}
                      onClick={toggle}
                    >
                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); toggle(); }}
                        aria-expanded={displayRow.expanded}
                        aria-label={`${displayRow.label} ${rowLabel}, ${displayRow.count} ${resultLabel}`}
                        className="group flex min-w-0 items-center gap-2 text-left transition-colors hover:text-ok"
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 transition-transform ${displayRow.expanded ? 'rotate-90' : ''} ${isCategory ? 'text-ok' : 'text-ink-light'}`}
                        >
                          ›
                        </span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`truncate ${isCategory ? 'text-xs font-semibold text-ink' : 'text-[0.72rem] font-medium text-ink-mid'}`} title={displayRow.label}>
                            {displayRow.label}
                          </span>
                          {isCategory ? (
                            <>
                              <span className={`${GROUP_CHIP} ${chipTone}`}>
                                {rowLabel}
                              </span>
                              <span className={`${GROUP_CHIP} ${chipTone}`}>
                                {displayRow.count} {resultLabel}
                              </span>
                            </>
                          ) : (
                            <span className={`${GROUP_CHIP} ${chipTone}`}>
                              {displayRow.count} {resultLabel}
                            </span>
                          )}
                        </span>
                      </button>
                    </th>
                    <td colSpan={visibleDates.length} className={`${bg} px-0 py-0 align-middle`} aria-hidden="true" />
                  </tr>
                );
              }
              const row = displayRow.row;
              const zebra = (startIdx + i) % 2 === 1;
              const rowBg = zebra ? 'bg-[#FAFAF8]' : 'bg-surface';
              const trend = trendByKey.get(row.codeKey);
              const showSpark = trend && hoverKey === row.codeKey;
              const rowIndent = groupedLabs ? (row.labGroup ? 'pl-11' : 'pl-7') : 'pl-3';
              return (
                <tr
                  key={row.codeKey}
                  className={`border-b border-hairline ${rowBg}`}
                  style={{ height: ROW_PX }}
                  onPointerEnter={() => setHoverKey(row.codeKey)}
                  onPointerLeave={() => setHoverKey(cur => (cur === row.codeKey ? null : cur))}
                >
                  <th scope="row" className={`${STICKY_FREEZE} ${NAME_COL} ${rowBg} ${rowIndent} py-1 pr-2 text-left align-middle font-normal`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-ink" title={row.label}>{row.label}</span>
                        {row.unit && <span className="mono shrink-0 text-[0.6rem] text-ink-faint">{row.unit}</span>}
                      </span>
                      {trend && (
                        <button
                          type="button"
                          onClick={() => setTrendKey(row.codeKey)}
                          aria-label={`Open ${row.label} trend`}
                          title={`${row.label} — trend over time`}
                          className={`shrink-0 rounded-sm transition-opacity ${showSpark ? 'opacity-100' : 'opacity-0'} hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none`}
                        >
                          <TrendSparkline points={trend.points} />
                        </button>
                      )}
                    </div>
                  </th>
                  {visibleDates.map(dateKey => {
                    const value = row.cells[dateKey];
                    const populated = value !== undefined;
                    const focused = focusMonth && dateKey.slice(0, 7) === focusMonth;
                    return (
                      <td
                        key={dateKey}
                        // Marks this cell as a hover-card ANCHOR so the card's pointer-down-outside
                        // dismissal (use-hover-card) treats a click on the cell as "inside", not "close".
                        {...(populated ? { 'data-hovercard-anchor': '' } : {})}
                        className={`truncate whitespace-nowrap border-l border-hairline px-2 py-1 text-center align-middle tabular-nums text-ink ${focused ? 'bg-ok-soft/55' : ''} ${populated ? 'cursor-default' : ''}`}
                        onPointerEnter={populated ? e => cellHover.scheduleOpen(buildCellDetail(row, dateKey, value), e.currentTarget.getBoundingClientRect()) : undefined}
                        onPointerLeave={populated ? () => cellHover.scheduleClose() : undefined}
                        onFocus={populated ? e => cellHover.openNow(buildCellDetail(row, dateKey, value), e.currentTarget.getBoundingClientRect()) : undefined}
                        onBlur={populated ? () => cellHover.closeNow() : undefined}
                        tabIndex={populated ? 0 : undefined}
                      >
                        {populated ? value : <span className="text-ink-faint/50">–</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {padBottom > 0 && <tr style={{ height: padBottom }}><td colSpan={1 + visibleDates.length} /></tr>}
          </tbody>
        </table>
      </div>
      )}

      {cellHover.open && (
        <FhirCellHover
          detail={cellHover.open.payload}
          anchor={cellHover.open.anchor}
          cardRef={cellHover.cardRef}
          onCardEnter={cellHover.onCardEnter}
          onCardLeave={cellHover.onCardLeave}
        />
      )}

      {activeTrend && (
        <MeasurementTrendModal
          trend={activeTrend}
          switchNoun={noun === 'Vital' ? 'vital' : 'test'}
          onClose={() => setTrendKey(null)}
          onBlurClose={() => setTrendKey(null)}
          onPrev={trendRows.length > 1 ? () => setTrendKey(trendRows[(trendIdx - 1 + trendRows.length) % trendRows.length].codeKey) : undefined}
          onNext={trendRows.length > 1 ? () => setTrendKey(trendRows[(trendIdx + 1) % trendRows.length].codeKey) : undefined}
          prevLabel={trendRows.length > 1 ? trendRows[(trendIdx - 1 + trendRows.length) % trendRows.length].label : undefined}
          nextLabel={trendRows.length > 1 ? trendRows[(trendIdx + 1) % trendRows.length].label : undefined}
        />
      )}
    </div>
  );
}

/** Compact date header: "MMM D 'YY" (no "Drawn" prefix). */
function shortDate(dateKey: string): string {
  const day = dayOf(baseDateKey(dateKey));
  if (!day) return '—';
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${mon} ${d.getUTCDate()} ’${String(d.getUTCFullYear()).slice(2)}`;
}

/** Source-local HH:MM from a FHIR instant/dateTime key; no timezone conversion. */
export function formatFlowsheetTimeLabel(dateKey: string): string | null {
  const match = /T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/.exec(baseDateKey(dateKey));
  if (!match) return null;
  const seconds = match[3] && match[3] !== '00' ? `:${match[3]}` : '';
  const zone = formatSourceTimezoneLabel(match[4]);
  const suffix = /·\d+$/.exec(dateKey)?.[0] ?? '';
  return `${match[1]}:${match[2]}${seconds}${zone}${suffix ? ` ${suffix}` : ''}`;
}

function formatSourceTimezoneLabel(offset: string | undefined): string {
  if (!offset) return '';
  if (offset === 'Z') return ' UTC';
  const normalized = offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset;
  const usDaylightLabel: Record<string, string> = {
    '-04:00': 'EDT',
    '-05:00': 'CDT',
    '-06:00': 'MDT',
    '-07:00': 'PDT',
    '-08:00': 'AKDT',
    '-09:00': 'HDT',
  };
  const daylightLabel = usDaylightLabel[normalized];
  if (daylightLabel) return ` ${daylightLabel}`;
  return ` UTC${normalized}`;
}

export function formatFlowsheetDateTimeLabel(dateKey: string): string {
  const time = formatFlowsheetTimeLabel(dateKey);
  const label = time ? `${shortDate(dateKey)} ${time}` : shortDate(dateKey);
  return baseDateKey(dateKey) === dateKey ? label : `${label} (${dateKey})`;
}

/**
 * Build the per-cell hover detail for `row` at `dateKey`. The "prior" is the nearest EARLIER dated cell
 * IN THE SAME ROW that carries a numeric value (never column adjacency — a blank middle column can't
 * fabricate a wrong delta), matching the signed grid's rule. `cellText` is the bare value already shown.
 */
function buildCellDetail(row: FhirFlowsheetRow, dateKey: string, cellText: string): FhirCellDetail {
  const numeric = row.numeric.find(n => n.dateKey === dateKey)?.value ?? null;
  // nearest-earlier numeric reading (numeric series is aligned to sorted dateKeys, ascending)
  let prior: { value: number; dateLabel: string } | null = null;
  if (numeric !== null) {
    for (let i = row.numeric.length - 1; i >= 0; i--) {
      const n = row.numeric[i];
      if (n.dateKey < dateKey && n.value !== null) { prior = { value: n.value, dateLabel: formatFlowsheetDateTimeLabel(n.dateKey) }; break; }
    }
  }
  return { rowLabel: row.label, unit: row.unit, dateLabel: formatFlowsheetDateTimeLabel(dateKey), display: cellText, value: numeric, prior };
}
