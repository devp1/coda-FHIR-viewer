'use client';

import type { FhirField, FhirListRow } from '../lib/fhir-chart';
import { CountChip, DateStamp, FhirStatusPill, formatChartDate, type FhirStatusTone } from './fhir-primitives';
import type { ColumnDef, SortState } from './fhir-clinical-table';

/**
 * Per-section clinical column sets + the verbatim FHIR-status → pill-tone mapping for the list tabs
 * (Problems / Medications / Allergies / Orders), modeled on OpenMRS's columnar overviews (Condition ·
 * Onset · Status, etc.). Every column value is read VERBATIM from the existing chart model — the
 * deduped row's named fields plus its captured field bag — never invented; an absent value renders as
 * an em dash. Self-contained — no `clinical-entry`/`cases` imports.
 */

const DASH = '—';

/** Read a value verbatim out of the row's captured field bag (the same bag the detail block shows). */
function fieldValue(fields: FhirField[], label: string): string | null {
  return fields.find(f => f.label === label)?.value ?? null;
}

/** A plain verbatim cell, em dash when absent. */
function textCell(value: string | null) {
  return value ? <span className="text-ink">{value}</span> : <span className="text-ink-faint">{DASH}</span>;
}

/** A mono verbatim cell (codes), em dash when absent. */
function monoCell(value: string | null) {
  return value ? <span className="mono text-[0.68rem] text-ink-mid">{value}</span> : <span className="text-ink-faint">{DASH}</span>;
}

/** Date cell — the shared DateStamp, em dash when absent. */
function dateCell(value: string | null) {
  return value ? <DateStamp value={value} /> : <span className="text-ink-faint">{DASH}</span>;
}

/**
 * Mechanical verbatim FHIR clinical-status → tone. Matches the captured status string (lowercased)
 * against the FHIR `condition-clinical` / generic status value sets — no invented severity:
 *  active/recurrence/relapse → ok; inactive/remission/resolved → neutral; entered-in-error → bad.
 */
function clinicalStatusTone(value: string | null): FhirStatusTone {
  const v = (value ?? '').toLowerCase();
  if (/entered.?in.?error/.test(v)) return 'bad';
  if (/inactive|remission|resolved|complete|stopped|cancel/.test(v)) return 'neutral';
  if (/active|recurrence|relapse|current|ongoing/.test(v)) return 'ok';
  return 'neutral';
}

/**
 * Mechanical verbatim AllergyIntolerance.criticality → tone (FHIR `allergy-intolerance-criticality`):
 * high → warn, low → neutral, unable-to-assess → neutral. "severe" anywhere in the verbatim string
 * escalates (matches the row's existing severe emphasis).
 */
function criticalityTone(value: string | null): FhirStatusTone {
  const v = (value ?? '').toLowerCase();
  if (/high|severe|life.?threat|fatal|anaphyl/.test(v)) return 'warn';
  return 'neutral';
}

/** A status pill cell from a verbatim status string + a tone resolver; em dash when absent. */
function pillCell(value: string | null, tone: FhirStatusTone) {
  return value ? <FhirStatusPill label={value} tone={tone} /> : <span className="text-ink-faint">{DASH}</span>;
}

/** The deduped ×count chip appended to a name cell (only when >1, matching the prior row behavior). */
function nameWithCount(row: FhirListRow) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 break-words">{row.label}</span>
      {row.count > 1 && <CountChip value={row.count} variant="boxed" prefix="×" />}
    </span>
  );
}

// ── sort comparators ────────────────────────────────────────────────────────────────────────────
//
// One comparator factory per value kind. It builds a STABLE comparator for a (getter, dir): the
// primary key is compared, `dir` flips ONLY that comparison, EMPTY values always sink last (never
// flipped to the top by desc), and every result tie-breaks by label so it never returns 0-only.

type Kind = 'date' | 'text' | 'number';

function compareBy(
  kind: Kind,
  get: (r: FhirListRow) => string | number | null,
  dir: 'asc' | 'desc',
) {
  const flip = dir === 'desc' ? -1 : 1;
  return (a: FhirListRow, b: FhirListRow): number => {
    const va = get(a);
    const vb = get(b);
    const aEmpty = va === null || va === '';
    const bEmpty = vb === null || vb === '';
    // Empty always last, in BOTH directions (not flipped by desc).
    if (aEmpty && bEmpty) return a.label.localeCompare(b.label);
    if (aEmpty) return 1; // a empty → a after b
    if (bEmpty) return -1; // b empty → a before b
    let primary: number;
    if (kind === 'number') primary = (va as number) - (vb as number);
    else if (kind === 'date') primary = (va as string) < (vb as string) ? -1 : (va as string) > (vb as string) ? 1 : 0;
    else primary = (va as string).localeCompare(vb as string);
    if (primary !== 0) return primary * flip;
    return a.label.localeCompare(b.label); // stable tiebreak, direction-independent
  };
}

export type SectionColumns = {
  columns: ColumnDef<FhirListRow>[];
  defaultSort: SortState;
  /** Sort comparator factory keyed by column key (the parent sorts in a useMemo). */
  comparator: (sort: SortState) => (a: FhirListRow, b: FhirListRow) => number;
};

// Verbatim field-bag labels the model writes (see fhir-chart.ts extractors). One place to keep in sync.
const F = {
  status: 'Clinical status',
  medStatus: 'Status',
  onset: 'Onset',
  authored: 'Authored',
  criticality: 'Criticality',
  reaction: 'Reaction',
} as const;

/** Problems: Problem · Status · Onset · Code. Default sort: Onset desc. */
export const PROBLEM_COLUMNS: SectionColumns = {
  defaultSort: { key: 'onset', dir: 'desc' },
  columns: [
    { key: 'problem', label: 'Problem', render: nameWithCount, sortable: true },
    { key: 'status', label: 'Status', render: r => pillCell(fieldValue(r.fields, F.status), clinicalStatusTone(fieldValue(r.fields, F.status))), sortable: true },
    { key: 'onset', label: 'Onset', align: 'right', render: r => dateCell(fieldValue(r.fields, F.onset) ?? r.lastDate), sortable: true },
    { key: 'code', label: 'Code', align: 'right', render: r => monoCell(r.code), sortable: false },
  ],
  comparator: sort => {
    if (sort.key === 'status') return compareBy('text', r => fieldValue(r.fields, F.status), sort.dir);
    if (sort.key === 'onset') return compareBy('date', r => fieldValue(r.fields, F.onset) ?? r.lastDate, sort.dir);
    return compareBy('text', r => r.label, sort.dir);
  },
};

/** Medications: Drug · Dose/Sig · Status · Since. Default sort: Since desc. */
export const MEDICATION_COLUMNS: SectionColumns = {
  defaultSort: { key: 'since', dir: 'desc' },
  columns: [
    { key: 'drug', label: 'Drug', render: nameWithCount, sortable: true },
    { key: 'dose', label: 'Dose / sig', render: r => textCell(r.detail), sortable: false },
    { key: 'status', label: 'Status', render: r => pillCell(fieldValue(r.fields, F.medStatus), clinicalStatusTone(fieldValue(r.fields, F.medStatus))), sortable: true },
    { key: 'since', label: 'Since', align: 'right', render: r => dateCell(fieldValue(r.fields, F.authored) ?? r.lastDate), sortable: true },
  ],
  comparator: sort => {
    if (sort.key === 'status') return compareBy('text', r => fieldValue(r.fields, F.medStatus), sort.dir);
    if (sort.key === 'since') return compareBy('date', r => fieldValue(r.fields, F.authored) ?? r.lastDate, sort.dir);
    return compareBy('text', r => r.label, sort.dir);
  },
};

/** Allergies: Allergen · Criticality · Reaction · Recorded. Default sort: Criticality then name. */
export const ALLERGY_COLUMNS: SectionColumns = {
  defaultSort: { key: 'criticality', dir: 'asc' },
  columns: [
    { key: 'allergen', label: 'Allergen', render: nameWithCount, sortable: true },
    { key: 'criticality', label: 'Criticality', render: r => pillCell(fieldValue(r.fields, F.criticality), criticalityTone(fieldValue(r.fields, F.criticality))), sortable: true },
    { key: 'reaction', label: 'Reaction', render: r => textCell(fieldValue(r.fields, F.reaction)), sortable: false },
    { key: 'recorded', label: 'Recorded', align: 'right', render: r => dateCell(r.lastDate), sortable: true },
  ],
  comparator: sort => {
    if (sort.key === 'recorded') return compareBy('date', r => r.lastDate, sort.dir);
    if (sort.key === 'criticality') {
      // Rank high/severe (warn) ahead of the rest, verbatim-driven; ascending = high first.
      const rank = (r: FhirListRow) => (criticalityTone(fieldValue(r.fields, F.criticality)) === 'warn' ? 0 : 1);
      return compareBy('number', rank, sort.dir);
    }
    return compareBy('text', r => r.label, sort.dir);
  },
};

/** Orders & Procedures: Procedure · Last date · Count. Default sort: alphabetical. */
export const ORDER_COLUMNS: SectionColumns = {
  defaultSort: { key: 'procedure', dir: 'asc' },
  columns: [
    { key: 'procedure', label: 'Procedure', render: r => <span className="break-words text-ink">{r.label}</span>, sortable: true },
    { key: 'last', label: 'Last date', align: 'right', render: r => dateCell(r.lastDate), sortable: true },
    { key: 'count', label: 'Count', align: 'right', render: r => <CountChip value={r.count} variant="boxed" />, sortable: true },
  ],
  comparator: sort => {
    if (sort.key === 'last') return compareBy('date', r => r.lastDate, sort.dir);
    if (sort.key === 'count') return compareBy('number', r => r.count, sort.dir);
    return compareBy('text', r => r.label, sort.dir);
  },
};

/** The shared field-bag detail block (the OpenEMR Issues-row detail) — same content as before. */
export function renderRowDetail(row: FhirListRow) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {row.fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className="contents">
          <span className="mono whitespace-nowrap text-ink-faint">{f.label}</span>
          <span className="break-words text-ink">{f.value}</span>
        </div>
      ))}
      <span className="mono text-ink-faint">Occurrences</span>
      <span className="text-ink">{row.count.toLocaleString()}{row.lastDate ? ` · latest ${formatChartDate(row.lastDate)}` : ''}</span>
    </div>
  );
}
