'use client';

/**
 * Trend sparkline + trend modal — COPIED VERBATIM from the signed-chart measurement grid
 * (clinical-entry/clinical-chart-viewer.tsx: TrendSparkline + MeasurementTrendModal), adapted only to:
 *   - drop reference ranges / High-Low (the FHIR exports don't carry them): there is no `refText`, no
 *     `outOfRange`/`flag` on the trend point, and the range/"In range"/"Out of range" legend rows are
 *     removed;
 *   - live self-contained in fhir-viewer (the pure trend-math helpers are imported — those are
 *     React-free leak-safe data helpers, not the surface chrome).
 *
 * The chart geometry, time-window presets (3M/6M/1Y/ALL), draggable overview strip, per-point label
 * collision resolver, and dot popouts are the REAL ones, byte-for-byte.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  measurementTrendPoints,
  trendDayMs,
  trendLabelVisibility,
  trendWindowBounds,
  TREND_WINDOW_MS,
  type MeasurementTrendPoint,
  type TrendWindowPreset,
} from './measurement-trend-data';
import { resolveTrendLabels, type TrendLabelBox } from './trend-label-layout';
import { useHoverCard } from './use-hover-card';

export { measurementTrendPoints, useHoverCard };
export type { MeasurementTrendPoint };

/**
 * Palette for the SVG trend chrome. These mirror the named Coda tokens (tailwind.config.js / DESIGN.md)
 * by their hex values — SVG `stroke`/`fill` can't read a Tailwind class, so the tokens are restated once
 * here as constants rather than scattered as raw literals, so a palette change updates them in one place.
 * (The bespoke low-alpha tints below — grip/scrim/hairline washes — are SVG-specific opacity chrome with
 * no named token, so they stay inline.)
 */
const TREND = {
  ink: '#0A0A0A', // token: ink
  inkMid: '#525252', // token: ink-mid
  inkLight: '#8A8A8A', // token: ink-light
  inkFaint: '#A3A3A3', // token: ink-faint
  ok: '#1a6b4a', // token: ok (brand green)
  info: '#2d3e50', // token: info
  surface: '#FFFFFF', // token: surface
} as const;

/**
 * Per-cell hover detail — COPIED from the signed grid's ReferencePopover (clinical-chart-viewer.tsx),
 * stripped to what a raw-FHIR chart honestly has: value · unit · date · delta-vs-nearest-earlier-reading.
 * Dropped (absent in raw FHIR exports): reference-range text, High/Low flags, and the reasoning-mode
 * "use in turn / link result" actions. The hard part — the probe-based containing-block position
 * conversion + edge-aware above/below placement — is the REAL one. `useHoverCard` (the 120ms-open /
 * warm-window-glide / Esc-scroll-dismiss timing controller) is imported, not reforked.
 */
export type FhirCellDetail = {
  rowLabel: string;
  unit: string | null;
  dateLabel: string;
  display: string;
  value: number | null;
  /** Nearest EARLIER dated reading in the same row (never column adjacency), for the "vs prior" delta. */
  prior: { value: number; dateLabel: string } | null;
};

export function FhirCellHover({ detail, anchor, cardRef, onCardEnter, onCardLeave }: {
  detail: FhirCellDetail;
  anchor: DOMRect;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onCardEnter: () => void;
  onCardLeave: () => void;
}) {
  const delta = detail.prior && detail.value !== null ? detail.value - detail.prior.value : null;
  const gap = 6; // read-only card: hover-transparent with breathing room (never walls rows).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    // position:fixed is offset by any ancestor containing block (filter/transform); measure the
    // containing block's origin with a zero-size probe and convert viewport placement into its coords.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;visibility:hidden;';
    node.parentElement?.appendChild(probe);
    const base = probe.getBoundingClientRect();
    probe.remove();
    const cardHeight = node.offsetHeight;
    const cardWidth = 224; // w-[14rem]
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - cardWidth / 2, window.innerWidth - cardWidth - 8));
    const above = anchor.top - gap - cardHeight;
    const below = Math.min(anchor.bottom + gap, window.innerHeight - cardHeight - 8);
    setPos({ top: (above >= 8 ? above : below) - base.top, left: left - base.left });
  }, [anchor, cardRef]);
  return (
    <div
      ref={cardRef}
      role="tooltip"
      aria-label={`${detail.rowLabel} detail`}
      data-testid="fhir-cell-hover"
      className="coda-fade-in-up pointer-events-none fixed z-50 w-[14rem] rounded-sm border border-hairline-strong bg-surface p-3 shadow-[0_12px_40px_rgba(10,10,10,0.18)]"
      style={pos ? { top: pos.top, left: pos.left } : { top: anchor.top, left: anchor.left, visibility: 'hidden' }}
      onPointerEnter={onCardEnter}
      onPointerLeave={onCardLeave}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{detail.rowLabel}</span>
        <span className="mono text-[0.62rem] uppercase tracking-wider text-ink-faint">{detail.dateLabel}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-lg tabular-nums text-ink">{detail.display}</span>
        {detail.unit && <span className="text-[0.65rem] text-ink-faint">{detail.unit}</span>}
      </div>
      <div className="mt-1.5 border-t border-hairline pt-1.5 text-[0.68rem] leading-snug">
        {delta !== null && detail.prior ? (
          <span className="text-ink-mid">
            <span className={`mono mr-1 ${delta > 0 ? 'text-warn' : delta < 0 ? 'text-ok' : 'text-ink-faint'}`}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta).toFixed(Math.abs(delta) < 1 ? 1 : 0)}
            </span>
            from {detail.prior.dateLabel}
          </span>
        ) : (
          <span className="text-ink-mid">First result</span>
        )}
      </div>
    </div>
  );
}

export type MeasurementTrend = {
  key: string;
  label: string;
  unit: string;
  categoryLine?: string;
  points: MeasurementTrendPoint[];
};

const LEAF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── inline trend sparkline (copied; out-of-range dot coloring removed) ────────────────────────────
export function TrendSparkline({ points }: { points: MeasurementTrendPoint[] }) {
  const seriesCount = Math.max(...points.map(p => p.values.length));
  let drawable: Array<{ p: MeasurementTrendPoint; i: number; v: number }> = [];
  for (let s = 0; s < seriesCount && drawable.length < 2; s++) {
    drawable = points
      .map((p, i) => ({ p, i, v: p.values[s] ?? null }))
      .filter((d): d is { p: MeasurementTrendPoint; i: number; v: number } => d.v !== null);
  }
  if (drawable.length < 2) {
    return <span aria-hidden="true" className="mono text-[0.6rem] text-ink-faint">⌁</span>;
  }
  const min = Math.min(...drawable.map(d => d.v));
  const span = (Math.max(...drawable.map(d => d.v)) - min) || 1;
  const W = 56;
  const H = 16;
  const n = points.length;
  const xy = drawable.map(d => ({
    p: d.p,
    x: 2 + (W - 4) * (n === 1 ? 0.5 : d.i / (n - 1)),
    y: H - 2 - (H - 4) * ((d.v - min) / span),
  }));
  const last = xy[xy.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="block select-none">
      <polyline points={xy.map(d => `${d.x},${d.y}`).join(' ')} fill="none" stroke={TREND.inkLight} strokeWidth="1.2" />
      <circle cx={last.x} cy={last.y} r="1.8" fill={TREND.ink} />
    </svg>
  );
}

// ── trend modal (copied; reference bands + In/Out-of-range legend removed) ────────────────────────
export function MeasurementTrendModal({ trend, switchNoun, onClose, onBlurClose, onPrev, onNext, prevLabel, nextLabel }: {
  trend: MeasurementTrend;
  switchNoun: string;
  onClose: () => void;
  onBlurClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { dialogRef.current?.focus(); }, [trend.key]);
  const allPoints = trend.points;
  const seriesCount = Math.max(...allPoints.map(p => p.values.length));
  const dual = seriesCount === 2;
  const W = 660, H = 230, L = 42, RGUT = 88, T = 18, B = 34;
  const plotW = W - L - RGUT;
  const baselineY = H - B;
  const firstMs = trendDayMs(allPoints[0].dateKey);
  const lastMs = trendDayMs(allPoints[allPoints.length - 1].dateKey);
  const windowing = lastMs - firstMs > TREND_WINDOW_MS['1Y'];
  const [preset, setPreset] = useState<TrendWindowPreset>('1Y');
  const [windowEndMs, setWindowEndMs] = useState<number | null>(null);
  const [popout, setPopout] = useState<{ x: number; y: number; point: MeasurementTrendPoint } | null>(null);
  const readingText = (p: MeasurementTrendPoint) => `${p.valueText}${trend.unit ? ` ${trend.unit}` : ''}`;
  useEffect(() => { setPreset('1Y'); setWindowEndMs(null); setPopout(null); }, [trend.key]);
  const bounds = windowing && preset !== 'ALL'
    ? trendWindowBounds(firstMs, lastMs, TREND_WINDOW_MS[preset], windowEndMs)
    : { start: firstMs, end: lastMs };
  const points = windowing
    ? allPoints.filter(p => { const t = trendDayMs(p.dateKey); return t >= bounds.start && t <= bounds.end; })
    : allPoints;
  const tSpan = Math.max(1, bounds.end - bounds.start);
  const xOf = (p: MeasurementTrendPoint) => !windowing && points.length === 1
    ? L + plotW / 2
    : L + plotW * ((trendDayMs(p.dateKey) - bounds.start) / tSpan);
  const windowValues = points.flatMap(p => p.values).filter((v): v is number => v !== null);
  let lo = windowValues.length > 0 ? Math.min(...windowValues) : 0;
  let hi = windowValues.length > 0 ? Math.max(...windowValues) : 1;
  if (hi === lo) { hi += 1; lo -= 1; }
  const span0 = hi - lo;
  lo -= span0 * 0.14;
  hi += span0 * 0.18;
  const yOf = (v: number) => T + (baselineY - T) * (1 - (v - lo) / (hi - lo));
  const fmtValue = (v: number) => {
    const fixed = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
    return fixed.includes('.') ? fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : fixed;
  };
  const SYS_HEX = TREND.ok;
  const DIA_HEX = TREND.info;
  type PlotLabel = TrendLabelBox & { fill: string; fillOpacity?: number };
  const LABEL_CLAMP = { minY: 10, maxY: baselineY };
  const labeled = trendLabelVisibility(points.map(p => xOf(p)));
  const plotLabels: PlotLabel[] = [];
  if (!dual) {
    points.forEach((p, i) => {
      const v = p.values[0];
      if (v === null || !labeled[i]) return;
      const x = xOf(p);
      const nearRightEdge = x > L + plotW - 14;
      plotLabels.push({
        key: `val:${p.dateKey}`,
        x: nearRightEdge ? x - 2 : x,
        y: yOf(v) - 9,
        lines: [fmtValue(v)],
        anchor: nearRightEdge ? 'end' : 'middle',
        fontSize: 9.5,
        priority: 1,
        shift: 'both',
        ...LABEL_CLAMP,
        fill: TREND.inkMid,
      });
    });
  } else {
    points.forEach((p, i) => {
      if (!labeled[i]) return;
      const x = xOf(p);
      const sys = p.values[0];
      const dia = p.values[1] ?? null;
      if (sys !== null) plotLabels.push({ key: `sys:${p.dateKey}`, x, y: yOf(sys) - 9, lines: [fmtValue(sys)], anchor: 'middle', fontSize: 9.5, priority: 1, shift: 'up', ...LABEL_CLAMP, fill: TREND.inkMid });
      if (dia !== null) plotLabels.push({ key: `dia:${p.dateKey}`, x, y: yOf(dia) + 17, lines: [fmtValue(dia)], anchor: 'middle', fontSize: 9.5, priority: 1, shift: 'down', ...LABEL_CLAMP, fill: TREND.inkMid });
      if (sys !== null && dia === null) plotLabels.push({ key: `half:${p.dateKey}`, x, y: yOf(sys) + 17, lines: ['/—'], anchor: 'middle', fontSize: 9.5, priority: 1, shift: 'down', ...LABEL_CLAMP, fill: TREND.inkFaint });
      if (sys === null && dia !== null) plotLabels.push({ key: `half:${p.dateKey}`, x, y: yOf(dia) - 9, lines: ['—/'], anchor: 'middle', fontSize: 9.5, priority: 1, shift: 'up', ...LABEL_CLAMP, fill: TREND.inkFaint });
    });
  }
  const resolvedLabels = resolveTrendLabels(plotLabels);
  const monthYearLabel = (ms: number) => {
    const d = new Date(ms);
    return `${LEAF_MONTHS[d.getUTCMonth()] ?? ''} ’${String(d.getUTCFullYear()).slice(2)}`;
  };
  const tickLabels = (() => {
    const count = windowing ? 5 : Math.min(5, Math.max(2, points.length));
    const out: Array<{ x: number; label: string }> = [];
    for (let k = 0; k < count; k++) {
      const ms = bounds.start + (tSpan * k) / (count - 1);
      const d = new Date(ms);
      const mon = LEAF_MONTHS[d.getUTCMonth()] ?? '';
      const label = tSpan < 80 * 86400000 ? `${mon} ${d.getUTCDate()}` : monthYearLabel(ms);
      if (out.length === 0 || out[out.length - 1].label !== label) {
        out.push({ x: L + plotW * (k / (count - 1)), label });
      }
    }
    return out;
  })();
  const stripXOf = (ms: number) => L + plotW * ((ms - firstMs) / Math.max(1, lastMs - firstMs));
  const stripSeries = allPoints
    .map(p => ({ ms: trendDayMs(p.dateKey), v: p.values.find(v => v !== null) ?? null }))
    .filter((d): d is { ms: number; v: number } => d.v !== null);
  const stripLo = stripSeries.length ? Math.min(...stripSeries.map(d => d.v)) : 0;
  const stripHi = stripSeries.length ? Math.max(...stripSeries.map(d => d.v)) : 1;
  const stripYOf = (v: number) => stripHi === stripLo ? 14 : 23 - 17 * ((v - stripLo) / (stripHi - stripLo));
  const stripWinX = stripXOf(bounds.start);
  const stripWinW = Math.max(6, stripXOf(bounds.end) - stripXOf(bounds.start));
  const stripDrag = useRef<{ startPx: number; startEnd: number } | null>(null);
  const stripMsPerPx = (lastMs - firstMs) / plotW;
  const stripPx = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) * (W / rect.width);
  };
  const onStripPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (preset === 'ALL') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const px = stripPx(event);
    let end = bounds.end;
    const t = firstMs + (px - L) * stripMsPerPx;
    if (t < bounds.start || t > bounds.end) {
      end = t + (bounds.end - bounds.start) / 2;
      setWindowEndMs(end);
    }
    setPopout(null);
    stripDrag.current = { startPx: px, startEnd: end };
  };
  const onStripPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = stripDrag.current;
    if (!drag) return;
    const windowLen = bounds.end - bounds.start;
    const px = stripPx(event);
    const raw = drag.startEnd + (px - drag.startPx) * stripMsPerPx;
    const clamped = Math.min(lastMs, Math.max(firstMs + windowLen, raw));
    if (clamped !== raw) {
      drag.startEnd = clamped;
      drag.startPx = px;
    }
    setWindowEndMs(clamped);
  };
  const onStripPointerUp = () => { stripDrag.current = null; };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6" data-testid="fhir-trend-modal" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-label={`${trend.label} trend over time`}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') onClose();
          if (event.key === 'ArrowLeft') onPrev?.();
          if (event.key === 'ArrowRight') onNext?.();
        }}
        onBlur={event => {
          if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) onBlurClose();
        }}
        className="w-full max-w-2xl overflow-hidden rounded border border-hairline-strong bg-surface shadow-[0_18px_60px_rgba(10,10,10,0.22)] focus:outline-none"
      >
        <div className="flex items-baseline gap-2.5 border-b border-hairline px-5 py-3.5">
          <span className="serif text-2xl leading-none text-ink">{trend.label}</span>
          {trend.unit && <span className="mono rounded-sm border border-hairline px-1.5 py-0.5 text-[0.62rem] normal-case text-ink-mid">{trend.unit}</span>}
          {trend.categoryLine && <span className="text-xs text-ink-light">{trend.categoryLine}</span>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trend"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:shadow-[0_0_0_1.5px_rgba(120,120,120,0.55)]"
          >
            <span aria-hidden="true" className="leading-none">✕</span>
          </button>
        </div>
        {windowing && (
          <div className="flex items-center gap-1.5 px-5 pt-3">
            {(['3M', '6M', '1Y', 'ALL'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => { setPreset(p); setWindowEndMs(null); setPopout(null); }}
                className={`mono rounded-full border px-2.5 py-0.5 text-[0.6rem] tracking-wider transition-colors ${preset === p ? 'border-ink text-ink' : 'border-hairline text-ink-light hover:text-ink'} focus-visible:outline-none focus-visible:shadow-[0_0_0_1.5px_rgba(120,120,120,0.55)]`}
              >
                {p}
              </button>
            ))}
            <span className="mono ml-auto text-[0.58rem] uppercase tracking-wider text-ink-faint">
              Showing {monthYearLabel(bounds.start)} – {monthYearLabel(bounds.end)} · {points.length} of {allPoints.length} {dual ? 'readings' : 'results'}
            </span>
          </div>
        )}
        <div className={`px-5 ${windowing ? 'pt-1.5' : 'pt-3.5'}`}>
          <div className="relative">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${trend.label} values across ${points.length} dates`} className="select-none" fontFamily="JetBrains Mono, ui-monospace, monospace">
              <line x1={L} y1={baselineY} x2={L + plotW} y2={baselineY} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
              {points.length === 0 && (
                <text x={L + plotW / 2} y={(T + baselineY) / 2} textAnchor="middle" fontSize="10" fill={TREND.inkFaint}>No results in this window — drag the strip or pick a preset</text>
              )}
              {!dual && (
                <g>
                  <polyline
                    fill="none"
                    stroke={TREND.inkMid}
                    strokeWidth="1.5"
                    points={points.map(p => p.values[0] !== null ? `${xOf(p)},${yOf(p.values[0]!)}` : null).filter(Boolean).join(' ')}
                  />
                  {points.map((p, i) => {
                    const v = p.values[0];
                    if (v === null) return null;
                    const x = xOf(p);
                    const y = yOf(v);
                    return (
                      <circle
                        key={p.dateKey}
                        cx={x}
                        cy={y}
                        r={3.2}
                        fill={TREND.ink}
                        tabIndex={labeled[i] ? undefined : 0}
                        aria-label={labeled[i] ? undefined : `${p.dateLabel}: ${readingText(p)}`}
                        className="focus:outline-none"
                        onPointerEnter={() => setPopout({ x, y, point: p })}
                        onPointerLeave={() => setPopout(cur => (cur?.point === p ? null : cur))}
                        onFocus={() => setPopout({ x, y, point: p })}
                        onBlur={() => setPopout(cur => (cur?.point === p ? null : cur))}
                      />
                    );
                  })}
                </g>
              )}
              {dual && (
                <g>
                  {points.map((p, i) => {
                    const x = xOf(p);
                    const sys = p.values[0];
                    const dia = p.values[1] ?? null;
                    const capYs = [sys, dia].filter((v): v is number => v !== null).map(yOf);
                    const anchorY = capYs.length > 0 ? Math.min(...capYs) : T;
                    return (
                      <g
                        key={p.dateKey}
                        tabIndex={labeled[i] ? undefined : 0}
                        aria-label={labeled[i] ? undefined : `${p.dateLabel}: ${readingText(p)}`}
                        className="focus:outline-none"
                        onPointerEnter={() => setPopout({ x, y: anchorY, point: p })}
                        onPointerLeave={() => setPopout(cur => (cur?.point === p ? null : cur))}
                        onFocus={() => setPopout({ x, y: anchorY, point: p })}
                        onBlur={() => setPopout(cur => (cur?.point === p ? null : cur))}
                      >
                        {sys !== null && dia !== null && <line x1={x} y1={yOf(sys)} x2={x} y2={yOf(dia)} stroke={TREND.inkFaint} strokeWidth="1.5" />}
                        {sys !== null && <circle cx={x} cy={yOf(sys)} r="3.6" fill={SYS_HEX} />}
                        {dia !== null && <circle cx={x} cy={yOf(dia)} r="3.6" fill={DIA_HEX} />}
                      </g>
                    );
                  })}
                </g>
              )}
              {resolvedLabels.map(lab => (
                <text key={lab.key} x={lab.x} y={lab.y} fontSize={lab.fontSize} textAnchor={lab.anchor} fill={lab.fill} opacity={lab.fillOpacity}>
                  {lab.lines.length === 1
                    ? lab.lines[0]
                    : lab.lines.map((line, li) => (
                        <tspan key={line} x={lab.x} dy={li === 0 ? 0 : lab.fontSize + 1.5} opacity={li === 0 ? 1 : 0.8}>{line}</tspan>
                      ))}
                </text>
              ))}
              <g fontSize="8.5" fill={TREND.inkLight} textAnchor="middle">
                {tickLabels.map(tick => (
                  <g key={tick.x}>
                    <text x={tick.x} y={H - 16}>{tick.label.toUpperCase()}</text>
                    <line x1={tick.x} y1={baselineY} x2={tick.x} y2={baselineY + 4} stroke="rgba(0,0,0,0.12)" />
                  </g>
                ))}
              </g>
            </svg>
            {popout && (
              <div
                className="pointer-events-none absolute z-10"
                style={{
                  left: `${Math.min(90, Math.max(10, (popout.x / W) * 100))}%`,
                  top: `${(popout.y / H) * 100}%`,
                  transform: popout.y < 56 ? 'translate(-50%, 14px)' : 'translate(-50%, -112%)',
                }}
              >
                <div className="whitespace-nowrap rounded-sm border border-hairline-strong bg-surface px-2 py-1 shadow-[0_4px_14px_rgba(10,10,10,0.12)]">
                  <div className="mono text-[0.58rem] uppercase tracking-wider text-ink-light">{popout.point.dateLabel}</div>
                  <div className="text-xs font-medium text-ink">{readingText(popout.point)}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        {windowing && (
          <div className="px-5 pt-0.5">
            <svg
              width="100%"
              viewBox={`0 0 ${W} 44`}
              aria-hidden="true"
              className={`select-none ${preset === 'ALL' ? 'opacity-50' : 'cursor-pointer touch-none'}`}
              onPointerDown={onStripPointerDown}
              onPointerMove={onStripPointerMove}
              onPointerUp={onStripPointerUp}
              onPointerCancel={onStripPointerUp}
              fontFamily="JetBrains Mono, ui-monospace, monospace"
            >
              <rect x={L} y={2} width={plotW} height={26} fill={TREND.surface} stroke="rgba(0,0,0,0.08)" />
              <polyline fill="none" stroke={TREND.inkFaint} strokeWidth="1" points={stripSeries.map(d => `${stripXOf(d.ms)},${stripYOf(d.v)}`).join(' ')} />
              {stripSeries.map(d => (
                <circle key={d.ms} cx={stripXOf(d.ms)} cy={stripYOf(d.v)} r="1.6" fill={TREND.inkLight} />
              ))}
              {stripWinX > L + 0.5 && <rect x={L} y={2} width={stripWinX - L} height={26} fill="rgba(10,10,10,0.05)" />}
              {stripWinX + stripWinW < L + plotW - 0.5 && <rect x={stripWinX + stripWinW} y={2} width={L + plotW - stripWinX - stripWinW} height={26} fill="rgba(10,10,10,0.05)" />}
              <rect x={stripWinX} y={2} width={stripWinW} height={26} fill="rgba(26,107,74,0.06)" stroke={TREND.ok} strokeOpacity="0.5" className={preset === 'ALL' ? undefined : 'cursor-grab'} />
              <rect x={stripWinX - 3} y={6} width={3.5} height={18} rx={1.5} fill={TREND.ok} opacity="0.75" />
              <rect x={stripWinX + stripWinW - 0.5} y={6} width={3.5} height={18} rx={1.5} fill={TREND.ok} opacity="0.75" />
              <text x={L} y={40} fontSize="8" fill={TREND.inkFaint}>{monthYearLabel(firstMs).toUpperCase()}</text>
              <text x={L + plotW} y={40} fontSize="8" fill={TREND.inkFaint} textAnchor="end">{monthYearLabel(lastMs).toUpperCase()}</text>
            </svg>
          </div>
        )}
        {/* Legend: dual = systolic/diastolic; single = nothing (no reference / range language). */}
        <div className="flex items-center gap-4 px-5 pb-3 pt-0.5">
          {dual && (
            <>
              <span className="mono text-[0.6rem] uppercase tracking-wider text-ink-light"><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-ok align-[-1px]" />Systolic</span>
              <span className="mono text-[0.6rem] uppercase tracking-wider text-ink-light"><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-info align-[-1px]" />Diastolic</span>
            </>
          )}
          <span className="mono ml-auto text-[0.6rem] uppercase tracking-wider text-ink-faint">
            {allPoints.length} {dual ? 'readings' : 'results'} · {allPoints[0]?.dateLabel} – {allPoints[allPoints.length - 1]?.dateLabel}
          </span>
        </div>
        <div className="flex items-center border-t border-hairline bg-surface-dim px-5 py-2.5">
          {onPrev && prevLabel ? (
            <button type="button" onClick={onPrev} className="mono text-[0.6rem] uppercase tracking-wider text-ink-mid transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-ink">‹ {prevLabel}</button>
          ) : <span />}
          <span className="mono flex-1 text-center text-[0.6rem] uppercase tracking-wider text-ink-faint">
            {[onPrev || onNext ? `← → switch ${switchNoun}` : '', windowing && preset !== 'ALL' ? 'drag the strip to pan' : ''].filter(Boolean).join(' · ')}
          </span>
          {onNext && nextLabel ? (
            <button type="button" onClick={onNext} className="mono text-[0.6rem] uppercase tracking-wider text-ink-mid transition-colors hover:text-ink focus-visible:outline-none focus-visible:text-ink">{nextLabel} ›</button>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}
