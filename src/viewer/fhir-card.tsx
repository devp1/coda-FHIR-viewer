'use client';

import { useId, useState, type ReactNode } from 'react';
import { CountChip, PANEL, SECTION_HEADING, SECTION_HEADING_ACCENT } from './fhir-primitives';

/**
 * Chart card — a faithful React port of OpenEMR's `templates/patient/card/card_base.html.twig`,
 * re-skinned with Coda tokens (DESIGN.md). Structure mirrors the real OpenEMR markup 1:1:
 *
 *   <section class="card">
 *     <div class="card-body p-1">
 *       <h6 class="card-title mb-0 d-flex p-1 justify-content-between">
 *         <a data-toggle="collapse" aria-expanded …>{title}<i class="fa fa-expand|fa-compress"></i></a>
 *         <span>{add/edit action icons}</span>
 *       </h6>
 *       <div class="card-text collapse{ show }">{content}</div>
 *     </div>
 *   </section>
 *
 * Coda re-skin: card face `bg-surface`, `border-hairline`, `rounded-sm`; the `card-title` is a small
 * medium-weight Inter heading (NOT a giant serif), the collapse affordance is the same expand/compress
 * toggle, dense `p-1` body. Bodies are OpenEMR `list-group list-group-flush` rows (see FhirListGroup).
 */
export function FhirCard({
  title,
  count,
  initiallyCollapsed = false,
  actions,
  children,
}: {
  title: string;
  /** Shown as a mono count chip in the card-title (the N in "show all N"). Omit to hide. */
  count?: number;
  /** OpenEMR `initiallyCollapsed` — large cards default collapsed. */
  initiallyCollapsed?: boolean;
  /** OpenEMR card-title right-side action slot (add/edit icons). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!initiallyCollapsed);
  const bodyId = useId();

  return (
    // section.card — 1px border (OpenEMR card border rgba(.125) → Coda hairline), radius 4px.
    // Shares the one PANEL border token so every chart panel matches.
    <section className={`overflow-hidden ${PANEL}`}>
      {/* card-body p-1 */}
      <div className="p-1">
        {/* h6.card-title.mb-0.d-flex.p-1.justify-content-between */}
        <div className="mb-0 flex items-center justify-between gap-2 p-1">
          {/* card-title link — OpenEMR renders a weight-700 colored link (blue #1d4ed8); the Coda
              re-skin makes the title IDENTICAL to a full-tab section header: shared SECTION_HEADING
              (ink, semibold, not green/bold) + the shared SECTION_HEADING_ACCENT green underline, so
              a card heading and its tab heading read byte-identical (text + accent). The collapse
              chevron alone signals the card is clickable. */}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="group flex min-w-0 items-center gap-1.5 text-left"
          >
            <span className={`min-w-0 ${SECTION_HEADING} ${SECTION_HEADING_ACCENT}`}>
              <span className="block truncate">{title}</span>
            </span>
            {typeof count === 'number' && <CountChip value={count} variant="boxed" />}
          </button>
          {/* right side: optional action slot + the OpenEMR fa-expand/fa-compress collapse affordance. */}
          <span className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              aria-controls={bodyId}
              aria-label={open ? 'Collapse' : 'Expand'}
              // Slightly larger + a touch darker at rest (ink-light, was ink-faint) so the collapse
              // affordance is discoverable without breaking the calm restraint; clear ink on hover.
              className="-m-1 rounded-sm p-1 text-[0.82rem] leading-none text-ink-light transition-colors hover:text-ink"
            >
              {open ? '⤡' : '⤢'}
            </button>
          </span>
        </div>

        {/* div.card-text.collapse.show */}
        {open && (
          <div id={bodyId} className="pt-1">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * OpenEMR `list-group list-group-flush pami-list` body — the dense flat row list used inside every
 * summary card. `list-group-flush` means NO borders between rows (verified on the real rendered
 * chart: list-group-item border-top-width = 0). Coda re-skin keeps it flush; density `p-1` (4px),
 * Inter ~13px. A subtle hover band gives row separation instead of a divider.
 */
export function FhirListGroup({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

/**
 * A single OpenEMR `list-group-item p-1 d-flex w-100 justify-content-between` row. `title` left,
 * optional `meta` (codes/sig) under it, optional `right` (date / count) right-aligned.
 */
export function FhirListItem({
  title,
  meta,
  right,
  emphasis = false,
  interactive = false,
  zebra = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  /** OpenEMR severe-allergy `bg-warning font-weight-bold` cue → Coda warn tint. */
  emphasis?: boolean;
  /** Expandable rows get the green `ok` accent + medium weight; non-interactive rows stay plain ink.
      LOCKED: green ONLY when the row is expandable. */
  interactive?: boolean;
  /** Odd-row zebra tint so a Dashboard summary list echoes the ClinicalTable density (E3 parity). */
  zebra?: boolean;
}) {
  // Match ClinicalTable density (text-[0.74rem], py-1) so a card row ↔ a full-tab row read continuous.
  const bg = emphasis ? 'bg-warn-soft font-medium text-warn' : zebra ? 'bg-[#FAFAF8]' : '';
  return (
    <div className={`flex w-full items-baseline justify-between gap-3 px-1 py-1 text-[0.74rem] transition-colors hover:bg-surface-dim ${bg}`}>
      <span className="min-w-0">
        <span className={`block break-words leading-snug ${interactive ? 'font-medium text-ok' : 'text-ink'}`}>{title}</span>
        {meta && <span className="mono block break-words text-[0.62rem] leading-tight text-ink-faint">{meta}</span>}
      </span>
      {right && <span className="flex shrink-0 items-baseline gap-2 text-right">{right}</span>}
    </div>
  );
}
