'use client';

import { type ReactNode } from 'react';
import { CountChip, FilterInput, PANEL, SECTION_HEADING, SECTION_HEADING_ACCENT } from './fhir-primitives';

/**
 * Shared section frame for every list tab (Problems / Medications / Orders / Allergies / Notes /
 * Social) — a faithful port of OpenEMR's Issues full view header band
 * (`stats_full.php:279`), re-skinned with Coda tokens. One PANEL wrapper + one sticky header
 * (title + count chip + filter box) so all six tabs share identical chrome. Self-contained — no
 * `clinical-entry`/`cases` imports.
 *
 * Filter is present by default (LOCKED): Notes AND Social get the same search box as the clinical
 * lists. The parent owns the query state + does its own field-specific filtering, then reports the
 * shown/total counts back here so the count chip reads `N` when unfiltered and `shown / total` when
 * filtered.
 */
export function SectionShell({
  title,
  total,
  shown,
  query,
  onQuery,
  children,
}: {
  title: string;
  /** Full row count (pre-filter). */
  total: number;
  /** Visible row count (post-filter). Equal to `total` when no filter is applied. */
  shown: number;
  query: string;
  onQuery: (next: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={PANEL}>
      {/* sticky section header (stats_full.php:279) */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface-dim px-3 py-2">
        <h2 className={`flex items-baseline gap-2 ${SECTION_HEADING}`}>
          {/* Shared OpenMRS card-header brand cue (SECTION_HEADING_ACCENT) — the SAME underline the
              Dashboard card title carries, so the heading reads identical card↔tab. */}
          <span className={SECTION_HEADING_ACCENT}>{title}</span>
          {shown === total ? (
            <CountChip value={total} />
          ) : (
            <span className="mono text-[0.6rem] tabular-nums text-ink-faint">
              {shown.toLocaleString()} / {total.toLocaleString()}
            </span>
          )}
        </h2>
        <FilterInput value={query} onChange={onQuery} />
      </div>
      {children}
    </div>
  );
}
