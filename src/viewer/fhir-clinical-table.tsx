'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';

/**
 * Dense columnar clinical table — the shared "this feels like a real EHR" primitive. Grounded in
 * OpenMRS's Carbon DataTable conditions/vitals overview (sortable columns, STATUS as its own column,
 * `useZebraStyles`, `size='sm'` density, the `TableExpandRow` disclosure pattern, 5-per-page
 * pagination) and Medplum's whole-row-clickable summary item, re-skinned with Coda tokens (DESIGN.md).
 * Self-contained — no `clinical-entry`/`cases` imports.
 *
 * Every list tab (Problems / Medications / Orders / Allergies / Notes / Social) renders through this
 * ONE component, so they share column layout, sort affordance, zebra, row density, whole-row expand,
 * and the detail block. It composes INSIDE the existing SectionShell (which still owns the header +
 * filter + count); this owns only the table.
 *
 * WHOLE-ROW expand (the user's literal ask — "click ANYWHERE on the row, not just the green text"),
 * done a11y-clean. Cells hold only text/pills (no inner interactive), so:
 *  - a real <button> in the FIRST cell owns keyboard + aria-expanded/aria-controls (the authoritative,
 *    AT-operable control — Tab lands here, Enter/Space toggles);
 *  - a MOUSE-only onClick on the <tr> toggles when ANY cell (incl. the far edge: status/date/code) is
 *    clicked, and BAILS when the originating target is inside a <button> so a first-cell click never
 *    double-fires (button click + bubbled tr click) — exactly one toggle per click;
 *  - `tr:focus-within` draws the full-row 2px `ok` outline when the first-cell button is focused.
 * (Verified live: a position:relative <tr> does NOT give an inset-0 overlay the row width — far-edge
 * clicks fall through — so the overlay is out; this tr-onClick + real-button hybrid is what works.)
 *
 * Density follows Carbon `size='sm'`: ~2rem rows, `text-[0.74rem]` cells, tight `py-1`. Separation is
 * carried by UNIVERSAL ZEBRA (odd rows `bg-[#FAFAF8]`, matching the flowsheet); cells carry no per-row
 * border, only the header gets one hairline underline. Headers are muted mono.
 */

export type ColumnAlign = 'left' | 'right';

export type ColumnDef<Row> = {
  /** Stable column id (also the sort key). */
  key: string;
  /** Header label (sentence-case clinical noun). */
  label: string;
  align?: ColumnAlign;
  /** Sortable columns get a clickable header + caret. */
  sortable?: boolean;
  /** Cell renderer for this column. NOTE: column 0 must stay NON-interactive (it sits inside the
      keyboard <button>; an inner link/button there would be a nested-interactive violation). */
  render: (row: Row) => ReactNode;
};

export type SortState = { key: string; dir: 'asc' | 'desc' };

/** Rows past this count collapse behind a "show all" expander so a tab never renders unbounded. */
const PAGE_CAP = 50;

const alignClass = (align: ColumnAlign | undefined) => (align === 'right' ? 'text-right' : 'text-left');

export function ClinicalTable<Row>({
  columns,
  rows,
  sort,
  onSort,
  getRowKey,
  getRowDate,
  getRowDates,
  focusDateKey,
  focusToken,
  renderDetail,
  emptyLabel,
}: {
  columns: ColumnDef<Row>[];
  /** Already-sorted + already-filtered rows. The parent owns sorting (in a useMemo on a stable key). */
  rows: Row[];
  /** Current sort, or null when unsorted. */
  sort: SortState | null;
  /** Toggle/select the sort column. No-op for non-sortable columns. */
  onSort: (key: string) => void;
  /** STABLE row key — open-state keys on this (never the render index), so a re-sort can't desync. */
  getRowKey: (row: Row) => string;
  /** Optional timeline anchor date. Rows in the selected month get a focus tint and scroll target. */
  getRowDate?: (row: Row) => string | null;
  /** Optional multi-date anchor for mechanically deduped rows that retain per-resource occurrences. */
  getRowDates?: (row: Row) => Array<string | null>;
  focusDateKey?: string | null;
  focusToken?: number;
  /** Disclosed detail for an expanded row. Omit to make rows non-expandable (e.g. Social). */
  renderDetail?: (row: Row) => ReactNode;
  emptyLabel: string;
}) {
  // Accordion: one row open at a time, keyed on the STABLE row key (matches the behavior it replaces).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const detailBaseId = useId();
  const tableRef = useRef<HTMLTableElement | null>(null);
  const expandable = typeof renderDetail === 'function';
  const colSpan = columns.length;
  const focusMonth = focusDateKey?.slice(0, 7) ?? null;
  const rowDates = useCallback((row: Row): Array<string | null> => getRowDates?.(row) ?? [getRowDate?.(row) ?? null], [getRowDate, getRowDates]);
  const rowMatchesFocus = useCallback((row: Row): boolean => Boolean(focusMonth && rowDates(row).some(date => date?.slice(0, 7) === focusMonth)), [focusMonth, rowDates]);

  useEffect(() => {
    if (!focusMonth || (!getRowDate && !getRowDates)) return;
    if (
      !showAll &&
      rows.length > PAGE_CAP &&
      rows.slice(PAGE_CAP).some(rowMatchesFocus)
    ) {
      setShowAll(true);
      return;
    }
    const el = tableRef.current?.querySelector<HTMLElement>('[data-entry-focus="true"]');
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }));
  }, [focusMonth, focusToken, showAll]);

  if (rows.length === 0) {
    return <p className="px-3 py-3 text-[0.8rem] text-ink-faint">{emptyLabel}</p>;
  }

  const capped = !showAll && rows.length > PAGE_CAP;
  const visible = capped ? rows.slice(0, PAGE_CAP) : rows;

  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="min-w-full border-collapse text-[0.74rem]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-hairline bg-surface-dim">
            {columns.map(col => {
              const isSorted = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`bg-surface-dim px-2 py-1.5 align-bottom font-normal ${alignClass(col.align)}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={`mono inline-flex items-center gap-1 text-[0.6rem] uppercase tracking-wider transition-colors ${isSorted ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
                    >
                      {col.label}
                      <span aria-hidden className="text-[0.7rem] leading-none">
                        {isSorted ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    <span className="mono text-[0.6rem] uppercase tracking-wider text-ink-faint">{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => {
            const key = getRowKey(row);
            const isOpen = openKey === key;
            const zebra = i % 2 === 1; // visual alternation by render position (Carbon useZebraStyles).
            const rowBg = zebra ? 'bg-[#FAFAF8]' : 'bg-surface';
            const rowDate = getRowDate?.(row) ?? null;
            const focused = rowMatchesFocus(row);
            const detailId = `${detailBaseId}-${key}`;
            const toggle = () => setOpenKey(o => (o === key ? null : key));
            // MOUSE-only convenience so any cell (incl. far edge) toggles; bails on the first-cell
            // button so a button click doesn't ALSO fire here (one toggle per click, not two).
            const onRowClick = expandable
              ? (e: MouseEvent<HTMLTableRowElement>) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  toggle();
                }
              : undefined;
            return (
              <Fragment key={key}>
                <tr
                  onClick={onRowClick}
                  data-entry-date={rowDate ?? undefined}
                  data-entry-focus={focused ? 'true' : undefined}
                  className={`${focused ? 'bg-ok-soft/60 shadow-[inset_3px_0_0_#1a6b4a]' : rowBg} ${expandable ? 'cursor-pointer hover:bg-surface-dim focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ok' : ''}`}
                >
                  {columns.map((col, ci) => {
                    const cell = col.render(row);
                    if (ci === 0 && expandable) {
                      // First cell holds the real keyboard <button> (chevron + the non-interactive label).
                      return (
                        <td key={col.key} className={`px-2 py-1 align-middle ${alignClass(col.align)}`}>
                          <button
                            type="button"
                            onClick={toggle}
                            aria-expanded={isOpen}
                            aria-controls={detailId}
                            className="flex items-center gap-1.5 text-left focus:outline-none"
                          >
                            <span aria-hidden className={`inline-block shrink-0 text-[0.62rem] text-ink-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                              ›
                            </span>
                            <span className="min-w-0">{cell}</span>
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className={`px-2 py-1 align-middle ${alignClass(col.align)}`}>
                        {cell}
                      </td>
                    );
                  })}
                </tr>
                {expandable && isOpen && (
                  <tr className={rowBg}>
                    <td id={detailId} colSpan={colSpan} className="bg-bg px-3 py-2 text-[0.72rem]">
                      {renderDetail!(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {capped && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mono px-3 py-2 text-[0.62rem] uppercase tracking-wider text-ink-faint hover:text-ok"
        >
          Show all {rows.length.toLocaleString()} →
        </button>
      )}
    </div>
  );
}
