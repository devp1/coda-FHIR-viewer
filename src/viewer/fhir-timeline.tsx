'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FHIR_TIMELINE_FAMILIES,
  FHIR_TIMELINE_FAMILY_LABEL,
  monthLabelOf,
  type FhirTimelineEntry,
  type FhirTimelineDetail,
  type FhirTimelineFamily,
} from '../lib/fhir-timeline';

type FhirTimelineColumn = {
  dateKey: string;
  dateLabel: string;
  entries: FhirTimelineColumnEntry[];
  isCollapsedMonth?: boolean;
};

type FhirTimelineColumnEntry = FhirTimelineEntry & {
  datedGroups?: FhirTimelinePreviewDateGroup[];
};

type FhirTimelinePreviewDateGroup = {
  dateKey: string;
  dateLabel: string;
  datePrecision: FhirTimelineEntry['datePrecision'];
  lines: string[];
  totalCount: number;
  detail?: FhirTimelineDetail;
};

type TrackMonth = { kind: 'month'; key: string; centerX: number };
type TrackBreak = { kind: 'break'; afterKey: string; beforeKey: string; skipCount: number; centerX: number };
type TrackItem = TrackMonth | TrackBreak;
type YearBracket = { year: string; leftX: number; rightX: number };
type Track = { items: TrackItem[]; xByKey: Map<string, number>; yearBrackets: YearBracket[]; width: number };

const DECELERATE = 'cubic-bezier(0.05,0.7,0.1,1)';
const MONTH_W = 60;
const BREAK_W = 26;
const GAP_BREAK_MIN = 5;
const CARD_W_ESTIMATE = 960;
const MIN_DOT_PITCH = 30;
const MIN_LABEL_PITCH = 56;
const STORAGE_KEY = 'coda.fhirTimeline.expanded';
const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const FAMILY_HEX: Record<FhirTimelineFamily, string> = {
  problems: '#7a3b52',
  allergies: '#b91c1c',
  medications: '#6f5b2a',
  vitals: '#1a6b4a',
  labs: '#2f5e8c',
  orders: '#92400e',
  notes: '#525252',
  social: '#4b5c2a',
};

export function FhirTimeline({
  entries,
  onSelectDate,
}: {
  entries: FhirTimelineEntry[];
  onSelectDate: (dateKey: string, family?: FhirTimelineFamily) => void;
}) {
  const columns = useMemo(() => collapseColumnsByMonth(groupByDate(entries)), [entries]);
  const regionId = useId();
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setExpanded(stored === 'true');
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const first = columns[0];
  const last = columns[columns.length - 1];
  const range = first && last
    ? first.dateKey.slice(0, 7) === last.dateKey.slice(0, 7)
      ? monthLabelOf(first.dateKey)
      : `${monthLabelOf(first.dateKey)} - ${monthLabelOf(last.dateKey)}`
    : 'No dated entries';

  return (
    <section className="overflow-hidden rounded-sm border border-hairline bg-surface" data-testid="fhir-timeline" aria-label="Chart timeline">
      <div className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-2">
        <span className="mono text-[0.58rem] uppercase tracking-widest text-ink-mid">Chart timeline</span>
        <span className="text-[0.7rem] text-ink-faint">{range}</span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="mono ml-auto inline-flex items-center gap-1 rounded-full border border-hairline-strong px-2.5 py-0.5 text-[0.5rem] uppercase tracking-widest text-ink-mid transition-colors hover:border-ok hover:text-ok"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>
      <div
        id={regionId}
        className="grid motion-reduce:transition-none"
        aria-hidden={!expanded}
        inert={!expanded ? true : undefined}
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr', transition: `grid-template-rows 260ms ${DECELERATE}` }}
      >
        <div className="overflow-hidden [min-height:0]">
          {columns.length === 0 ? (
            <p className="px-3.5 py-3 text-[0.72rem] leading-relaxed text-ink-faint">No dated chart entries.</p>
          ) : (
            <TimelineSwimlanes columns={columns} onSelectDate={onSelectDate} />
          )}
        </div>
      </div>
    </section>
  );
}

function TimelineSwimlanes({
  columns,
  onSelectDate,
}: {
  columns: FhirTimelineColumn[];
  onSelectDate: (dateKey: string, family?: FhirTimelineFamily) => void;
}) {
  const track = useMemo(() => buildCompressedTrack(columns), [columns]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const visibleFamilies = useMemo(
    () => FHIR_TIMELINE_FAMILIES.filter(family => columns.some(col => col.entries.some(entry => entry.family === family))),
    [columns],
  );
  const modalColumn = modalKey ? columns.find(col => col.dateKey === modalKey) ?? null : null;

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setLaneWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pack = useMemo(() => packTrack(track.xByKey.size, laneWidth || CARD_W_ESTIMATE), [track, laneWidth]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [track.width, laneWidth, pack.scroll, pack.scrollWidth]);

  const activeKey = hoverKey;
  const selected = activeKey ? columns.find(col => col.dateKey === activeKey) ?? null : null;
  const xPx = useCallback((monthKey: string) => track.xByKey.get(monthKey.slice(0, 7)) ?? -1, [track]);
  const frac = useCallback((x: number): string => {
    if (x < 0) return '-100%';
    const pct = track.width > 0 ? (x / track.width) * 100 : 50;
    return `${3 + (pct / 100) * 94}%`;
  }, [track.width]);

  const restSummary = useMemo(() => {
    const tally = new Map<FhirTimelineFamily, number>();
    let entryTotal = 0;
    for (const col of columns) {
      for (const entry of col.entries) {
        tally.set(entry.family, (tally.get(entry.family) ?? 0) + 1);
        entryTotal += entry.totalCount;
      }
    }
    return {
      datedCount: columns.length,
      entryTotal,
      tally: FHIR_TIMELINE_FAMILIES.filter(family => tally.has(family)).map(family => ({ family, count: tally.get(family)! })),
    };
  }, [columns]);

  const openDate = useCallback((key: string) => {
    setHoverKey(key);
    setModalKey(key);
  }, []);

  const navigateFromModal = useCallback((dateKey: string, family?: FhirTimelineFamily) => {
    setModalKey(null);
    onSelectDate(dateKey, family);
  }, [onSelectDate]);

  return (
    <div className="grid min-w-0 md:grid-cols-[minmax(0,1fr)_242px]">
      <div className="flex min-w-0 overflow-hidden py-2.5">
        <div className="z-[2] shrink-0 bg-surface pl-3.5 pr-2">
          <div className="h-3" aria-hidden />
          {visibleFamilies.map((family, i) => (
            <div key={family} className={`flex h-[26px] items-center ${i > 0 ? 'border-t border-dotted border-transparent' : ''}`}>
              <span className="mono flex items-center gap-1.5 text-[0.5rem] uppercase tracking-widest text-ink-light">
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: FAMILY_HEX[family] }} />
                {FHIR_TIMELINE_FAMILY_LABEL[family]}
              </span>
            </div>
          ))}
          <div className="h-4" aria-hidden />
        </div>

        <div
          ref={trackRef}
          className="relative min-w-0 flex-1 overflow-x-auto"
          data-testid="fhir-timeline-track"
          onMouseLeave={() => setHoverKey(null)}
          onBlur={() => setHoverKey(null)}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setHoverKey(null); }
          }}
        >
          <div className="relative w-full" style={pack.scroll ? { minWidth: pack.scrollWidth } : undefined}>
            <div className="h-3" aria-hidden />
            {selected && xPx(selected.dateKey) >= 0 && (
              <div className="pointer-events-none absolute inset-y-0 z-[1]" style={{ left: frac(xPx(selected.dateKey)) }}>
                <div className="absolute top-3 bottom-9 w-px -translate-x-1/2" style={{ background: FAMILY_HEX[selected.entries[0].family], opacity: 0.5 }} />
              </div>
            )}
            {visibleFamilies.map((family, i) => (
              <div key={family} className={`relative flex h-[26px] items-center ${i > 0 ? 'border-t border-dotted border-hairline' : ''}`}>
                <div className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
                {columns.filter(col => col.entries.some(entry => entry.family === family) && xPx(col.dateKey) >= 0).map(col => {
                  const entry = col.entries.find(e => e.family === family)!;
                  const isActive = col.dateKey === activeKey;
                  return (
                    <button
                      key={`${family}-${col.dateKey}`}
                      type="button"
                      onMouseEnter={() => setHoverKey(col.dateKey)}
                      onFocus={() => setHoverKey(col.dateKey)}
                      onClick={() => openDate(col.dateKey)}
                      data-testid={`fhir-timeline-dot-${family}-${col.dateKey}`}
                      aria-label={`${FHIR_TIMELINE_FAMILY_LABEL[family]} ${col.dateLabel}. ${entry.totalCount} ${entry.totalCount === 1 ? 'entry' : 'entries'}. Open preview.`}
                      className="absolute top-1/2 z-[2] flex h-3 min-w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-surface transition-shadow focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(26,107,74,0.32)] motion-reduce:transition-none"
                      style={{
                        left: frac(xPx(col.dateKey)),
                        background: FAMILY_HEX[family],
                        paddingInline: entry.totalCount > 1 ? '4px' : undefined,
                        boxShadow: isActive ? '0 0 0 2px #FFFFFF, 0 0 0 5px #dde6d4' : undefined,
                      }}
                    >
                      {entry.totalCount > 1 && <span className="mono text-[0.5rem] leading-none text-white">{entry.totalCount}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            <TimeAxis track={track} frac={frac} selected={selected} labelsFit={pack.labelsFit} />
          </div>
        </div>
      </div>
      <Readout
        column={selected}
        summary={restSummary}
      />
      {modalColumn && (
        <DatePreviewModal
          column={modalColumn}
          onClose={() => setModalKey(null)}
          onNavigate={navigateFromModal}
        />
      )}
    </div>
  );
}

function TimeAxis({ track, frac, selected, labelsFit }: { track: Track; frac: (x: number) => string; selected: FhirTimelineColumn | null; labelsFit: boolean }) {
  const dimmed = !!selected;
  return (
    <div className="relative mt-1.5 h-9">
      {labelsFit && track.items.map((it, idx) => it.kind === 'month' && track.xByKey.has(it.key) ? (
        <div
          key={`m-${it.key}-${idx}`}
          className={`mono pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[0.5rem] tracking-wider transition-colors ${dimmed ? 'text-ink-faint/30' : 'text-ink-mid'}`}
          style={{ left: frac(it.centerX) }}
        >
          {monthShort(it.key)}
        </div>
      ) : null)}
      {selected && (
        <div
          className="mono pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-sm bg-surface px-1 text-[0.52rem] font-medium tracking-wider text-ink"
          style={{ left: frac(track.xByKey.get(selected.dateKey) ?? -1) }}
          data-testid="fhir-timeline-active-date"
        >
          {selected.dateLabel}
        </div>
      )}
      {track.items.map((it, idx) => it.kind === 'break' ? (
        <div
          key={`b-${it.afterKey}-${idx}`}
          className="pointer-events-auto absolute top-0 -translate-x-1/2"
          style={{ left: frac(it.centerX) }}
          role="separator"
          aria-label={`${it.skipCount} ${it.skipCount === 1 ? 'month' : 'months'} between ${monthLabelOf(it.afterKey)} and ${monthLabelOf(it.beforeKey)} with no dated entries`}
          title={`${it.skipCount} ${it.skipCount === 1 ? 'month' : 'months'} with no dated entries`}
        >
          <svg width="11" height="9" viewBox="0 0 11 9" className="block" aria-hidden>
            <line x1="2" y1="8" x2="6" y2="1" stroke="rgba(0,0,0,0.24)" strokeWidth="1" />
            <line x1="5" y1="8" x2="9" y2="1" stroke="rgba(0,0,0,0.24)" strokeWidth="1" />
          </svg>
        </div>
      ) : null)}
      {track.yearBrackets.map(yb => {
        const left = frac(yb.leftX);
        const right = frac(yb.rightX);
        return (
          <div
            key={yb.year}
            className={`pointer-events-none absolute top-[17px] flex h-[15px] items-center justify-center rounded-sm border bg-surface px-1.5 transition-colors ${dimmed ? 'border-hairline/40 text-ink-light/30' : 'border-hairline-strong text-ink-light'}`}
            style={{ left, width: `calc(${right} - ${left})` }}
          >
            <span className="mono whitespace-nowrap text-[0.5rem] tracking-wider">{yb.year}</span>
          </div>
        );
      })}
    </div>
  );
}

function Readout({
  column,
  summary,
}: {
  column: FhirTimelineColumn | null;
  summary: { datedCount: number; entryTotal: number; tally: Array<{ family: FhirTimelineFamily; count: number }> };
}) {
  return (
    <div className="flex min-h-[206px] min-w-0 flex-col overflow-hidden border-t border-hairline bg-surface-dim px-3 py-2.5 md:border-l md:border-t-0" data-testid="fhir-timeline-readout">
      {column ? (
        <>
          <div>
            <div className="min-w-0">
              <div className="mono text-[0.5rem] uppercase tracking-widest text-ink-light">Preview</div>
              <div className="text-[0.95rem] text-ink">{column.dateLabel}</div>
            </div>
          </div>
          <div className="mt-1.5 min-h-0 space-y-1 overflow-hidden">
            {column.entries.map(entry => (
              <div key={entry.family} className="flex min-w-0 items-baseline gap-1.5 text-[0.72rem] leading-snug">
                <span className="mt-1 h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: FAMILY_HEX[entry.family] }} />
                <span className="mono shrink-0 text-[0.5rem] uppercase tracking-widest text-ink-light">{FHIR_TIMELINE_FAMILY_LABEL[entry.family]}</span>
                {entry.totalCount > 1 && <span className="mono shrink-0 rounded-full border border-hairline px-1 text-[0.45rem] tabular-nums text-ink-faint">{entry.totalCount}</span>}
                <span className="min-w-0 truncate text-ink-mid">{entry.summaryLines[0] || '-'}</span>
              </div>
            ))}
          </div>
          <div className="mono mt-auto pt-2 text-[0.5rem] uppercase tracking-widest text-ink-faint">Click a dot for full preview</div>
        </>
      ) : (
        <>
          <div className="mono text-[0.5rem] uppercase tracking-widest text-ink-light">Chart</div>
          <div className="text-[0.8rem] leading-snug text-ink-mid">
            {summary.datedCount} {summary.datedCount === 1 ? 'chart month' : 'chart months'} · {summary.entryTotal} {summary.entryTotal === 1 ? 'dated item' : 'dated items'}
          </div>
          <div className="mt-2 space-y-1 overflow-hidden">
            {summary.tally.map(t => (
              <div key={t.family} className="flex items-center gap-1.5 text-[0.62rem] leading-snug">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: FAMILY_HEX[t.family] }} />
                <span className="mono shrink-0 uppercase tracking-widest text-ink-light">{FHIR_TIMELINE_FAMILY_LABEL[t.family]}</span>
                <span className="mono tabular-nums text-ink-faint">{t.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DatePreviewModal({
  column,
  onClose,
  onNavigate,
}: {
  column: FhirTimelineColumn;
  onClose: () => void;
  onNavigate: (dateKey: string, family?: FhirTimelineFamily) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const itemTotal = column.entries.reduce((sum, entry) => sum + entry.totalCount, 0);
  const widthClass = modalWidthClass(column);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" data-testid="fhir-timeline-modal" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
        }}
        className={`max-h-[88dvh] w-[96vw] ${widthClass} overflow-y-auto rounded-sm border border-hairline-strong bg-surface p-5 shadow-[0_28px_100px_rgba(10,10,10,0.22)] focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <div className="mono text-[0.66rem] uppercase tracking-widest text-ink-mid">Chart entries on</div>
            <h2 id={titleId} className="serif mt-1 text-3xl leading-tight text-ink">{column.dateLabel}</h2>
            <p className="mt-1 text-sm text-ink-light">
              {column.entries.length} {column.entries.length === 1 ? 'family' : 'families'} · {itemTotal} {itemTotal === 1 ? 'item' : 'items'} · read-only preview
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="mono shrink-0 rounded-full border border-hairline-strong px-3 py-1 text-[0.62rem] uppercase tracking-wider text-ink-mid transition-colors hover:border-ok hover:text-ok"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {column.entries.map(entry => (
            <section key={entry.family} className="rounded-sm border border-hairline bg-surface-dim p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="mono flex min-w-0 items-center gap-2 text-[0.66rem] uppercase tracking-widest text-ink-mid">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FAMILY_HEX[entry.family] }} />
                      <span className="truncate">{FHIR_TIMELINE_FAMILY_LABEL[entry.family]}</span>
                      {entry.totalCount > 1 && (
                        <span className="rounded-full border border-hairline bg-surface px-1.5 text-[0.6rem] tabular-nums tracking-normal text-ink-faint">
                          {entry.totalCount} {countNoun(entry.family, entry.totalCount)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(column.dateKey, entry.family)}
                      data-testid={`fhir-timeline-modal-open-${entry.family}`}
                      className="mono shrink-0 rounded-full border border-hairline-strong px-2.5 py-1 text-[0.58rem] uppercase tracking-wider text-ok transition-colors hover:border-ok hover:bg-ok-soft"
                    >
                      Open {FHIR_TIMELINE_FAMILY_LABEL[entry.family]} →
                    </button>
                  </div>

                  <div className="mt-3 space-y-3">
                    {previewDateGroupsForEntry(column, entry).map(group => (
                      <div key={`${entry.family}-${group.dateKey}`} data-testid={`fhir-timeline-modal-date-${entry.family}-${group.dateKey}`}>
                        <div className="mono border-b border-hairline pb-1 text-[0.55rem] uppercase tracking-widest text-ink-light">
                          {modalDateLabel(group)}
                          {group.totalCount > 1 && <span className="ml-1 text-ink-faint">· {group.totalCount}</span>}
                        </div>
                        <div className="mt-1.5">
                          <GroupedDetail detail={group.detail} lines={group.lines} />
                        </div>
                      </div>
                    ))}
                  </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function previewDateGroupsForEntry(column: FhirTimelineColumn, entry: FhirTimelineColumnEntry): FhirTimelinePreviewDateGroup[] {
  if (entry.datedGroups && entry.datedGroups.length > 0) return entry.datedGroups;
  return [{
    dateKey: entry.dateKey,
    dateLabel: entry.dateLabel || column.dateLabel,
    datePrecision: entry.datePrecision,
    lines: entry.allLines,
    totalCount: entry.totalCount,
    detail: entry.detail,
  }];
}

function GroupedDetail({ detail, lines }: { detail?: FhirTimelineDetail; lines: string[] }) {
  if (detail && detail.groups.length > 0) {
    return (
      <div className="space-y-2">
        {detail.groups.map((group, groupIdx) => (
          <div key={groupIdx}>
            {group.label && (
              <div className="mono mb-0.5 text-[0.55rem] uppercase tracking-widest text-ink-light">{group.label}</div>
            )}
            <ul className="ml-[2px] border-l-2 border-hairline-strong">
              {group.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-baseline justify-between gap-3 py-[3px] pl-3">
                  <span className="text-[0.9rem] leading-snug text-ink-mid">{item.name}</span>
                  {item.value !== undefined && (
                    <span className="whitespace-nowrap text-[0.9rem] tabular-nums text-ink-mid">
                      {item.value}
                      {item.unit && <span className="ml-1 text-[0.72rem] text-ink-faint">{item.unit}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {lines.length > 0
        ? lines.map((line, i) => <li key={i} className="text-[0.9rem] leading-relaxed text-ink-mid">{line}</li>)
        : <li className="text-[0.9rem] text-ink-faint">No detail recorded.</li>}
    </ul>
  );
}

function modalDateLabel(group: FhirTimelinePreviewDateGroup): string {
  return group.datePrecision === 'day' ? group.dateLabel : group.dateLabel;
}

function modalWidthClass(column: FhirTimelineColumn): string {
  let maxRows = 0;
  let labsRows = 0;
  for (const entry of column.entries) {
    const rows = previewDateGroupsForEntry(column, entry).reduce((sum, group) => sum + detailRowCount(group), 0);
    maxRows = Math.max(maxRows, rows);
    if (entry.family === 'labs') labsRows += rows;
  }
  const families = column.entries.length;
  if (families >= 4 || labsRows >= 12 || maxRows >= 12) return 'max-w-5xl';
  if (families >= 3 || labsRows >= 6 || maxRows >= 7) return 'max-w-4xl';
  if (families >= 2 || labsRows >= 1 || maxRows >= 4) return 'max-w-2xl';
  return 'max-w-md';
}

function detailRowCount(group: FhirTimelinePreviewDateGroup): number {
  if (!group.detail) return Math.max(group.lines.length, 1) + 1;
  return group.detail.groups.reduce((sum, detailGroup) => sum + Math.max(detailGroup.items.length, 1) + (detailGroup.label ? 1 : 0), 1);
}

function countNoun(family: FhirTimelineFamily, count: number): string {
  if (family === 'labs') return count === 1 ? 'test' : 'tests';
  return count === 1 ? 'entry' : 'entries';
}

function groupByDate(entries: FhirTimelineEntry[]): FhirTimelineColumn[] {
  const byDate = new Map<string, FhirTimelineColumn>();
  for (const entry of entries) {
    const key = entry.dateKey;
    const existing = byDate.get(key);
    if (existing) existing.entries.push(entry);
    else byDate.set(key, { dateKey: key, dateLabel: entry.dateLabel, entries: [entry] });
  }
  return Array.from(byDate.values()).map(col => ({
    ...col,
    entries: FHIR_TIMELINE_FAMILIES.filter(f => col.entries.some(e => e.family === f)).map(f => col.entries.find(e => e.family === f)!),
  }));
}

function collapseColumnsByMonth(columns: FhirTimelineColumn[]): FhirTimelineColumn[] {
  const byMonth = new Map<string, FhirTimelineColumn[]>();
  for (const col of columns) {
    const key = col.dateKey.slice(0, 7);
    const bucket = byMonth.get(key) ?? [];
    bucket.push(col);
    byMonth.set(key, bucket);
  }
  return Array.from(byMonth.entries()).map(([monthKey, cols]) => {
    const byFamily = new Map<FhirTimelineFamily, FhirTimelineEntry>();
    const groupsByFamily = new Map<FhirTimelineFamily, FhirTimelinePreviewDateGroup[]>();
    for (const col of cols) {
      for (const entry of col.entries) {
        const groups = groupsByFamily.get(entry.family) ?? [];
        groups.push({
          dateKey: entry.dateKey,
          dateLabel: entry.dateLabel,
          datePrecision: entry.datePrecision,
          lines: [...entry.allLines],
          totalCount: entry.totalCount,
          detail: entry.detail,
        });
        groupsByFamily.set(entry.family, groups);
        const prev = byFamily.get(entry.family);
        if (!prev) byFamily.set(entry.family, { ...entry, dateKey: monthKey, dateLabel: cols.length === 1 ? entry.dateLabel : monthLabelOf(monthKey), allLines: [...entry.allLines], summaryLines: [...entry.summaryLines] });
        else {
          const lines = [...prev.allLines, ...entry.allLines];
          byFamily.set(entry.family, {
            ...entry,
            dateKey: monthKey,
            dateLabel: monthLabelOf(monthKey),
            allLines: lines,
            summaryLines: lines.slice(0, 4),
            totalCount: prev.totalCount + entry.totalCount,
          });
        }
      }
    }
    const entries = FHIR_TIMELINE_FAMILIES.filter(f => byFamily.has(f)).map(f => {
      const entry = byFamily.get(f)!;
      const groups = groupsByFamily.get(f) ?? [];
      return groups.length > 1 || cols.length > 1 ? { ...entry, datedGroups: groups } : entry;
    });
    return {
      dateKey: monthKey,
      dateLabel: cols.length === 1 ? cols[0].dateLabel : monthLabelOf(monthKey),
      entries,
      isCollapsedMonth: cols.length > 1,
    };
  });
}

function buildCompressedTrack(columns: FhirTimelineColumn[]): Track {
  const items: TrackItem[] = [];
  const xByKey = new Map<string, number>();
  let cursor = 0;
  const pushMonth = (key: string) => {
    const centerX = cursor + MONTH_W / 2;
    items.push({ kind: 'month', key, centerX });
    xByKey.set(key, centerX);
    cursor += MONTH_W;
  };
  for (let i = 0; i < columns.length; i++) {
    const key = columns[i].dateKey.slice(0, 7);
    if (i > 0) {
      const prev = columns[i - 1].dateKey.slice(0, 7);
      const delta = monthDelta(prev, key);
      if (delta !== null && delta >= GAP_BREAK_MIN) {
        items.push({ kind: 'break', afterKey: prev, beforeKey: key, skipCount: delta - 1, centerX: cursor + BREAK_W / 2 });
        cursor += BREAK_W;
      } else if (delta !== null && delta > 1) {
        const parsed = parseMonthKey(prev)!;
        for (let gap = 1; gap < delta; gap++) {
          const next = addMonths(parsed, gap);
          items.push({ kind: 'month', key: next, centerX: cursor + MONTH_W / 2 });
          cursor += MONTH_W;
        }
      }
    }
    pushMonth(key);
  }
  return { items, xByKey, yearBrackets: buildYearBrackets(items), width: Math.max(cursor, 1) };
}

function packTrack(dotCount: number, cardWidth: number): { scroll: boolean; scrollWidth: number; labelsFit: boolean } {
  const floorWidth = Math.max(dotCount, 1) * MIN_DOT_PITCH;
  const scroll = floorWidth > cardWidth;
  const renderedWidth = scroll ? floorWidth : cardWidth;
  const pitch = dotCount > 1 ? renderedWidth / (dotCount - 1) : renderedWidth;
  return { scroll, scrollWidth: floorWidth, labelsFit: pitch >= MIN_LABEL_PITCH };
}

function buildYearBrackets(items: TrackItem[]): YearBracket[] {
  const byYear = new Map<string, { leftX: number; rightX: number }>();
  for (const item of items) {
    if (item.kind !== 'month') continue;
    const year = item.key.slice(0, 4);
    const prev = byYear.get(year);
    const leftX = item.centerX - MONTH_W / 2;
    const rightX = item.centerX + MONTH_W / 2;
    byYear.set(year, prev ? { leftX: Math.min(prev.leftX, leftX), rightX: Math.max(prev.rightX, rightX) } : { leftX, rightX });
  }
  return Array.from(byYear.entries()).map(([year, span]) => ({ year, ...span }));
}

function monthDelta(aKey: string, bKey: string): number | null {
  const a = parseMonthKey(aKey);
  const b = parseMonthKey(bKey);
  if (!a || !b) return null;
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function parseMonthKey(key: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(key);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  if (!Number.isInteger(y) || y < 1 || m < 0 || m > 11) return null;
  return { y, m };
}

function addMonths(start: { y: number; m: number }, add: number): string {
  const total = start.y * 12 + start.m + add;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function monthShort(key: string): string {
  const parsed = parseMonthKey(key);
  return parsed ? SHORT_MONTHS[parsed.m] ?? key : key;
}
