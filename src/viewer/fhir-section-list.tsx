'use client';

import { useMemo, useState } from 'react';
import type { FhirListRow } from '../lib/fhir-chart';
import { ClinicalTable, type SortState } from './fhir-clinical-table';
import { renderRowDetail, type SectionColumns } from './fhir-section-columns';
import { SectionShell } from './fhir-section';

/**
 * Full section list view — a faithful port of OpenMRS's columnar overview (Condition · Onset · Status
 * etc.), re-skinned with Coda tokens. Composes the shared {@link SectionShell} (sticky header +
 * filter) and {@link ClinicalTable} (sortable dense columns + whole-row expand) so every clinical
 * list tab shares chrome 1:1.
 *
 * Used for Problems / Medications / Orders & Procedures / Allergies. The caller passes the
 * per-section {@link SectionColumns} (columns + default sort + comparator); rows are deduped already
 * and run through a client-side filter because real lists run to hundreds of rows.
 */
export function FhirSectionList({
  rows,
  title,
  emptyLabel,
  spec,
}: {
  rows: FhirListRow[];
  title: string;
  emptyLabel: string;
  spec: SectionColumns;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>(spec.defaultSort);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.label.toLowerCase().includes(q) || (r.code ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  // Sort in a useMemo on the stable comparator (never inside render) — see ClinicalTable's sort note.
  const sorted = useMemo(() => filtered.slice().sort(spec.comparator(sort)), [filtered, spec, sort]);

  const onSort = (key: string) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <SectionShell title={title} total={rows.length} shown={filtered.length} query={query} onQuery={setQuery}>
      <ClinicalTable
        columns={spec.columns}
        rows={sorted}
        sort={sort}
        onSort={onSort}
        getRowKey={row => row.codeKey}
        renderDetail={renderRowDetail}
        emptyLabel={query ? 'No matches.' : emptyLabel}
      />
    </SectionShell>
  );
}
