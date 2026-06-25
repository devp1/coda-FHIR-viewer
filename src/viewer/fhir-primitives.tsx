'use client';

/**
 * Shared FHIR-viewer atoms — the single source of truth for the small repeated bits of chrome
 * (dates, count chips, the panel border, the filter input) so every surface in the chart agrees
 * instead of each call site re-rolling its own slightly-different span. Self-contained: no
 * `clinical-entry`/`cases` imports.
 */

/** One panel-border token. All chart panels share this so borders never drift. */
export const PANEL = 'rounded-sm border border-hairline bg-surface';

/**
 * One section-heading token — IDENTICAL size, weight, AND color on the Dashboard card titles and the
 * full-tab section headers, so the same section reads the same moving between the two. The collapse
 * chevron (not a green/bold title) is what signals a card is clickable.
 */
export const SECTION_HEADING = 'text-[0.84rem] font-semibold tracking-tight text-ink';

/**
 * The OpenMRS card-header brand cue (card-header.scss `h4:after`) Coda-toned to a short, thin
 * `ok`-green underline bar — applied to a span WRAPPING the heading text so it sits directly under the
 * title. Shared so the Dashboard card title and the full-tab section header carry the SAME accent
 * (the heading must read identical card↔tab). Accent is the `::after` bar ONLY; the heading text keeps
 * {@link SECTION_HEADING} (ink/semibold) — never tint or embolden the text.
 */
export const SECTION_HEADING_ACCENT =
  "after:mt-1 after:block after:h-[1.5px] after:w-6 after:rounded-full after:bg-ok after:content-['']";

/** Normalize a FHIR date/instant to its YYYY-MM-DD day (drops any time/zone tail). */
export function formatChartDate(value: string): string {
  return value.slice(0, 10);
}

/**
 * The one chart date stamp — `mono text-[0.62rem] text-ink-faint`, day-precision. Used at every row
 * site and the section-list detail so a row and its expanded detail always read the same date.
 */
export function DateStamp({ value, className = '' }: { value: string; className?: string }) {
  return <span className={`mono text-[0.62rem] text-ink-faint ${className}`}>{formatChartDate(value)}</span>;
}

/**
 * The one count chip — `text-[0.6rem]`, `text-ink-faint`, tabular. `boxed` is the pill used for
 * "row ×N" everywhere; `plain` is the bare inline count used in the nav / list header.
 */
export function CountChip({
  value,
  variant = 'plain',
  prefix = '',
  className = '',
}: {
  value: number;
  variant?: 'boxed' | 'plain';
  /** e.g. '×' for the per-row occurrence count. */
  prefix?: string;
  className?: string;
}) {
  const box = variant === 'boxed' ? 'rounded-sm bg-surface-dim px-1.5 py-0.5' : '';
  return (
    <span className={`mono shrink-0 text-[0.6rem] tabular-nums text-ink-faint ${box} ${className}`}>
      {prefix}
      {value.toLocaleString()}
    </span>
  );
}

/**
 * The one filter/search input — `mono text-[0.7rem]`, hairline border, green focus ring. Shared by
 * the section lists and the flowsheet so search boxes are pixel-identical across the chart.
 */
export function FilterInput({
  value,
  onChange,
  placeholder = 'Filter…',
  width = 'w-40',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Tailwind width class — `w-40` (default) or `w-48`. */
  width?: 'w-40' | 'w-48';
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`mono ${width} rounded-sm border border-hairline bg-surface px-2 py-1 text-[0.7rem] text-ink placeholder:text-ink-faint focus:border-ok focus:outline-none`}
    />
  );
}

/**
 * Clinical-status verdict tones for {@link FhirStatusPill}. Mechanical, not a clinical opinion — the
 * call site maps a verbatim FHIR status/criticality string onto one of these (E2 owns that mapping):
 *  - `ok`      → active / current (green `ok` light tag).
 *  - `neutral` → resolved / inactive / completed (muted ink on surface-dim).
 *  - `warn`    → high-severity / high-criticality cue (Coda warn tint).
 *  - `bad`     → critical / entered-in-error / cancelled (Coda bad tint).
 *
 * Named `Fhir…` deliberately: there is a separate `StatusPill`/`StatusPillTone` in the cases family
 * (`@/components/list-page`) with an incompatible tone union, across the import boundary the viewer
 * must not cross — the prefix kills the auto-import footgun.
 */
export type FhirStatusTone = 'ok' | 'neutral' | 'warn' | 'bad';

const FHIR_STATUS_PILL_TONE: Record<FhirStatusTone, string> = {
  ok: 'bg-ok-soft text-ok',
  // Hairline border (not a fill) so the muted "inactive/resolved" pill still reads on every zebra
  // row background — a bg-surface-dim fill would vanish against a hovered/odd row.
  neutral: 'border border-hairline text-ink-mid',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
};

/**
 * Small clinical status tag — the single biggest "feels like an EHR" lever (Medplum StatusBadge /
 * Carbon Tag, light variant). Verbatim `label`, tone picked by the call site. Coda-skinned: a soft
 * tinted pill, mono, uppercase, tight.
 */
export function FhirStatusPill({ label, tone = 'neutral' }: { label: string; tone?: FhirStatusTone }) {
  return (
    <span className={`mono inline-block shrink-0 rounded-sm px-1.5 py-0.5 text-[0.6rem] uppercase leading-none tracking-wide ${FHIR_STATUS_PILL_TONE[tone]}`}>
      {label}
    </span>
  );
}
