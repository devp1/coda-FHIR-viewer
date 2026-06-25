'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { FhirChart, FhirListRow, FhirNote, FhirSocialLine } from '../lib/fhir-chart';
import { FhirCard, FhirListGroup, FhirListItem } from './fhir-card';
import { ClinicalTable, type ColumnDef, type SortState } from './fhir-clinical-table';
import { FhirFlowsheet } from './fhir-flowsheet';
import { CountChip, DateStamp } from './fhir-primitives';
import { SectionShell } from './fhir-section';
import { ALLERGY_COLUMNS, MEDICATION_COLUMNS, ORDER_COLUMNS, PROBLEM_COLUMNS } from './fhir-section-columns';
import { FhirSectionList } from './fhir-section-list';

/**
 * Compact EHR chart viewer for a raw FHIR export — a faithful React port of OpenEMR's patient chart,
 * re-skinned with Coda tokens (DESIGN.md). Reproduces the real OpenEMR structure (audited from source):
 *
 *   - patient BANNER             (demographics.php:924-930 — name, MRN/pubpid, DOB, sex)
 *   - horizontal SECTION NAV     (PatientMenuRole.php:206-243 `<nav class="navbar"><ul class="navbar-nav">`,
 *                                 sections from standard.json) that swaps the content pane
 *   - Dashboard = multi-column   (demographics.php:1089-1102 `<div class="row"><div class="col-md-{12/n}">`)
 *     dense card GRID summary; each other section = its full list / matrix view.
 *
 * Self-contained — no `clinical-entry`/`cases` imports.
 */

type SectionKey = 'dashboard' | 'allergies' | 'problems' | 'medications' | 'labs' | 'vitals' | 'orders' | 'notes' | 'social';

/**
 * Derived display-only age (whole years) from a verbatim FHIR birthDate, e.g. "1952-03-04" → "74y".
 * Returns '' when the date can't be parsed — NEVER mutates the signed model (zero-judgment: this is a
 * presentation convenience the banner computes, not a stored fact).
 */
function ageSuffix(birthDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 150 ? `${age}y` : '';
}

/** One demographics field in the identity band — optional mono label + verbatim value, `·`-separated. */
function IdentityField({ label, value }: { label?: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 before:text-ink-light before:content-['·'] first:before:content-none">
      {label && <dt className="text-ink-faint">{label}</dt>}
      <dd className="text-ink-mid">{value}</dd>
    </div>
  );
}

export function FhirChartViewer({ chart }: { chart: FhirChart }) {
  const { header } = chart;

  // Only offer sections that have content (OpenEMR hides empty cards/sections).
  const sections = useMemo(() => {
    const s: { key: SectionKey; label: string; count: number }[] = [{ key: 'dashboard', label: 'Dashboard', count: 0 }];
    if (chart.allergies.length) s.push({ key: 'allergies', label: 'Allergies', count: chart.allergies.length });
    if (chart.problems.length) s.push({ key: 'problems', label: 'Problems', count: chart.problems.length });
    if (chart.medications.length) s.push({ key: 'medications', label: 'Medications', count: chart.medications.length });
    if (chart.labs.rows.length) s.push({ key: 'labs', label: 'Labs', count: chart.labs.rows.length });
    if (chart.vitals.rows.length) s.push({ key: 'vitals', label: 'Vitals', count: chart.vitals.rows.length });
    if (chart.ordersAndProcedures.length) s.push({ key: 'orders', label: 'Orders & Procedures', count: chart.ordersAndProcedures.length });
    if (chart.notes.length) s.push({ key: 'notes', label: 'Notes', count: chart.notes.length });
    if (chart.social.length) s.push({ key: 'social', label: 'Social', count: chart.social.length });
    return s;
  }, [chart]);

  const [active, setActive] = useState<SectionKey>('dashboard');

  return (
    <div className="rounded-sm border border-hairline bg-surface">
      {/* ── patient banner (demographics.php:924-930) — a strong identity band: prominent name over a
          mono demographics line (MRN · Sex · DOB · age · Race), the lead-with-identity convention from
          OpenMRS/OpenEMR. Age is a DERIVED display only (never written back to the model). ───────── */}
      <header className="border-b border-hairline bg-surface-dim px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{header.name}</h1>
        <dl className="mono mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.68rem] text-ink-mid">
          {header.mrn && <IdentityField label="MRN" value={header.mrn} />}
          {header.gender && <IdentityField value={header.gender} />}
          {header.birthDate && (
            <IdentityField label="DOB" value={ageSuffix(header.birthDate) ? `${header.birthDate} (${ageSuffix(header.birthDate)})` : header.birthDate} />
          )}
          {header.race && <IdentityField value={header.race} />}
        </dl>
      </header>

      {/* ── horizontal section navbar (PatientMenuRole.php:206-243) ───────────────────────────────
          Real OpenEMR renders these as plain sentence-case text links (~16px, weight 400, no
          uppercase). Coda re-skin: same plain-text links; active = green text + thin underline. */}
      <nav className="flex items-stretch overflow-x-auto border-b border-hairline bg-surface px-3">
        {sections.map(s => {
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[0.8rem] transition-colors ${
                isActive ? 'border-ok font-medium text-ok' : 'border-transparent text-ink-mid hover:text-ink'
              }`}
            >
              {s.label}
              {s.count > 0 && <CountChip value={s.count} className="ml-1.5" />}
            </button>
          );
        })}
      </nav>

      {/* ── content pane ─────────────────────────────────────────────────────────────────────────── */}
      <div className="p-3">
        {active === 'dashboard' && <Dashboard chart={chart} onOpenSection={setActive} />}
        {active === 'allergies' && (
          <FhirSectionList rows={chart.allergies} title="Allergies" emptyLabel="No allergies recorded." spec={ALLERGY_COLUMNS} />
        )}
        {active === 'problems' && (
          <FhirSectionList rows={chart.problems} title="Problems" emptyLabel="No problems recorded." spec={PROBLEM_COLUMNS} />
        )}
        {active === 'medications' && (
          <FhirSectionList rows={chart.medications} title="Medications" emptyLabel="No medications recorded." spec={MEDICATION_COLUMNS} />
        )}
        {active === 'orders' && (
          <FhirSectionList rows={chart.ordersAndProcedures} title="Orders & Procedures" emptyLabel="None recorded." spec={ORDER_COLUMNS} />
        )}
        {active === 'labs' && <FhirFlowsheet flowsheet={chart.labs} noun="Lab result" />}
        {active === 'vitals' && <FhirFlowsheet flowsheet={chart.vitals} noun="Vital" />}
        {active === 'notes' && <NotesFull notes={chart.notes} />}
        {active === 'social' && <SocialFull chart={chart} />}
      </div>

      {Object.keys(chart.unmapped).length > 0 && active === 'dashboard' && (
        <div className="border-t border-hairline px-4 py-2">
          <UnmappedNote unmapped={chart.unmapped} />
        </div>
      )}
    </div>
  );
}

/* ── Dashboard: OpenEMR masonry card grid (templates/patient/dashboard.html.twig) ─────────────────── */

function Dashboard({ chart, onOpenSection }: { chart: FhirChart; onOpenSection: (k: SectionKey) => void }) {
  // OpenEMR's real dashboard (templates/patient/dashboard.html.twig) lays the cards out with Masonry —
  // they flow and PACK to fill the columns, so an absent card (e.g. no Allergies) never leaves a dead
  // column and a short card never leaves a tall void beneath it. We reproduce that masonry with pure
  // CSS multi-column (no JS): every card is `break-inside-avoid` and the column count is responsive.
  // Order is the clinical reading order; columns fill top-to-bottom then left-to-right (OpenEMR's
  // masonry reads the same way). Only non-empty cards are emitted, so there are no holes to fill.
  const cards: ReactNode[] = [];
  if (chart.allergies.length > 0)
    cards.push(
      <FhirCard key="allergies" title="Allergies" count={chart.allergies.length}>
        <SummaryList rows={chart.allergies} limit={8} emphasisSevere onMore={() => onOpenSection('allergies')} />
      </FhirCard>,
    );
  if (chart.problems.length > 0)
    cards.push(
      <FhirCard key="problems" title="Problems" count={chart.problems.length}>
        <SummaryList rows={chart.problems} limit={8} onMore={() => onOpenSection('problems')} />
      </FhirCard>,
    );
  if (chart.medications.length > 0)
    cards.push(
      <FhirCard key="medications" title="Medications" count={chart.medications.length}>
        <SummaryList rows={chart.medications} limit={8} onMore={() => onOpenSection('medications')} />
      </FhirCard>,
    );
  if (chart.ordersAndProcedures.length > 0)
    cards.push(
      <FhirCard key="orders" title="Orders & Procedures" count={chart.ordersAndProcedures.length}>
        <SummaryList rows={chart.ordersAndProcedures} limit={8} onMore={() => onOpenSection('orders')} />
      </FhirCard>,
    );
  if (chart.labs.rows.length > 0)
    cards.push(
      <FhirCard key="labs" title="Labs" count={chart.labs.rows.length}>
        <OpenSectionLink label="Open flowsheet →" onClick={() => onOpenSection('labs')} />
      </FhirCard>,
    );
  if (chart.vitals.rows.length > 0)
    cards.push(
      <FhirCard key="vitals" title="Vitals" count={chart.vitals.rows.length}>
        <OpenSectionLink label="Open flowsheet →" onClick={() => onOpenSection('vitals')} />
      </FhirCard>,
    );
  if (chart.notes.length > 0)
    cards.push(
      <FhirCard key="notes" title="Notes" count={chart.notes.length}>
        <OpenSectionLink label="Open notes →" onClick={() => onOpenSection('notes')} />
      </FhirCard>,
    );

  // Masonry via CSS columns: 1 col (narrow) → 2 (md) → 3 (xl). `gap-3` between columns; each card gets
  // `mb-3` for the vertical gap and `break-inside-avoid` so a card never splits across a column break.
  return (
    <div className="columns-1 gap-3 md:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
      {cards}
    </div>
  );
}

/** The "Open flowsheet/notes →" affordance inside a Dashboard summary card whose detail is its own tab. */
function OpenSectionLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mono px-1 py-1 text-[0.66rem] uppercase tracking-wider text-ink-mid hover:text-ok">
      {label}
    </button>
  );
}

/** A capped dense list for a Dashboard summary card (OpenEMR list-group-flush). */
function SummaryList({
  rows,
  limit,
  onMore,
  emphasisSevere = false,
}: {
  rows: FhirListRow[];
  limit: number;
  onMore?: () => void;
  emphasisSevere?: boolean;
}) {
  const shown = rows.slice(0, limit);
  return (
    <>
      <FhirListGroup>
        {shown.map((row, i) => (
          <FhirListItem
            key={row.codeKey}
            zebra={i % 2 === 1}
            title={row.label}
            meta={[row.detail, row.code].filter(Boolean).join(' · ') || undefined}
            emphasis={emphasisSevere && /sever|anaphyl|fatal|life.?threat/i.test(row.label)}
            right={
              <>
                {row.lastDate && <DateStamp value={row.lastDate} />}
                {row.count > 1 && <CountChip value={row.count} variant="boxed" prefix="×" />}
              </>
            }
          />
        ))}
      </FhirListGroup>
      {rows.length > limit && onMore && (
        <button type="button" onClick={onMore} className="mono px-1 pt-1 text-[0.62rem] uppercase tracking-wider text-ink-faint hover:text-ok">
          Show all {rows.length.toLocaleString()} →
        </button>
      )}
    </>
  );
}

/* ── shared helpers for the Notes/Social tables (verbatim, em dash when absent) ─────────────────────── */

const DASH = '—';

/** Toggle/select sort key: same column flips asc⇄desc; a new column starts at the given initial dir. */
function nextSort(s: SortState, key: string, initialDir: 'asc' | 'desc' = 'asc'): SortState {
  return s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: initialDir };
}

/** Stable date comparator: empty always last (both directions), tie-break by the provided label. */
function dateCompare<T>(get: (t: T) => string | null, label: (t: T) => string, dir: 'asc' | 'desc') {
  const flip = dir === 'desc' ? -1 : 1;
  return (a: T, b: T): number => {
    const da = get(a);
    const db = get(b);
    if (!da && !db) return label(a).localeCompare(label(b));
    if (!da) return 1;
    if (!db) return -1;
    return (da < db ? -1 : da > db ? 1 : 0) * flip || label(a).localeCompare(label(b));
  };
}

/* ── Notes full view (SectionShell + ClinicalTable; Document · Date, expands to the body) ───────────── */

type NoteRow = FhirNote & { key: string };

const NOTE_COLUMNS: ColumnDef<NoteRow>[] = [
  { key: 'document', label: 'Document', render: r => <span className="break-words text-ink">{r.typeLabel}</span>, sortable: true },
  { key: 'date', label: 'Date', align: 'right', render: r => (r.date ? <DateStamp value={r.date} /> : <span className="text-ink-faint">{DASH}</span>), sortable: true },
];

function NotesFull({ notes }: { notes: FhirNote[] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'date', dir: 'desc' });

  // Stable per-note key (index-based — note order from the model is stable) so expand-state can't desync.
  const rows = useMemo<NoteRow[]>(() => notes.map((note, i) => ({ ...note, key: `note-${i}` })), [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.typeLabel.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (sort.key === 'document') {
      const flip = sort.dir === 'desc' ? -1 : 1;
      return filtered.slice().sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) * flip || a.key.localeCompare(b.key));
    }
    return filtered.slice().sort(dateCompare(r => r.date, r => r.typeLabel, sort.dir));
  }, [filtered, sort]);

  return (
    <SectionShell title="Notes" total={notes.length} shown={filtered.length} query={query} onQuery={setQuery}>
      <ClinicalTable
        columns={NOTE_COLUMNS}
        rows={sorted}
        sort={sort}
        onSort={key => setSort(s => nextSort(s, key, key === 'date' ? 'desc' : 'asc'))}
        getRowKey={r => r.key}
        renderDetail={r => (
          <div className="space-y-2">
            {(r.status || r.docStatus || r.category) && (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {r.status && (<><span className="mono whitespace-nowrap text-ink-faint">Status</span><span className="text-ink">{r.status}</span></>)}
                {r.docStatus && (<><span className="mono whitespace-nowrap text-ink-faint">Doc status</span><span className="text-ink">{r.docStatus}</span></>)}
                {r.category && (<><span className="mono whitespace-nowrap text-ink-faint">Category</span><span className="text-ink">{r.category}</span></>)}
              </div>
            )}
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-ink">
              {r.body || '(empty note body)'}
            </pre>
          </div>
        )}
        emptyLabel={query ? 'No matches.' : 'No notes recorded.'}
      />
    </SectionShell>
  );
}

/* ── Social full view (SAME table; Observation · Value · Recorded, whole-row expand) ─────────────────── */

type SocialRow = FhirSocialLine & { key: string };

const SOCIAL_COLUMNS: ColumnDef<SocialRow>[] = [
  { key: 'observation', label: 'Observation', render: r => <span className="break-words text-ink">{r.label}</span>, sortable: true },
  { key: 'value', label: 'Value', render: r => <span className="break-words text-ink-mid">{r.value}</span>, sortable: true },
  { key: 'recorded', label: 'Recorded', align: 'right', render: r => (r.date ? <DateStamp value={r.date} /> : <span className="text-ink-faint">{DASH}</span>), sortable: true },
];

function SocialFull({ chart }: { chart: FhirChart }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'recorded', dir: 'desc' });

  const rows = useMemo<SocialRow[]>(() => chart.social.map((line, i) => ({ ...line, key: `social-${i}` })), [chart.social]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (sort.key === 'recorded') return filtered.slice().sort(dateCompare(r => r.date, r => r.label, sort.dir));
    const get = sort.key === 'value' ? (r: SocialRow) => r.value : (r: SocialRow) => r.label;
    const flip = sort.dir === 'desc' ? -1 : 1;
    return filtered.slice().sort((a, b) => get(a).localeCompare(get(b)) * flip || a.label.localeCompare(b.label));
  }, [filtered, sort]);

  return (
    <SectionShell title="Social" total={chart.social.length} shown={filtered.length} query={query} onQuery={setQuery}>
      <ClinicalTable
        columns={SOCIAL_COLUMNS}
        rows={sorted}
        sort={sort}
        onSort={key => setSort(s => nextSort(s, key, key === 'recorded' ? 'desc' : 'asc'))}
        getRowKey={r => r.key}
        emptyLabel={query ? 'No matches.' : 'No social history recorded.'}
      />
    </SectionShell>
  );
}

function UnmappedNote({ unmapped }: { unmapped: Record<string, number> }) {
  return (
    <details className="text-[0.7rem] text-ink-mid">
      <summary className="mono cursor-pointer uppercase tracking-wider text-ink-faint">
        Other resources not on a card
      </summary>
      <ul className="mono mt-1 space-y-0.5 text-ink-faint">
        {Object.entries(unmapped)
          .sort((a, b) => b[1] - a[1])
          .map(([type, n]) => (
            <li key={type}>
              {n.toLocaleString()} {type}
            </li>
          ))}
      </ul>
    </details>
  );
}
