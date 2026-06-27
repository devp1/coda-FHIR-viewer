/**
 * Compact EHR chart model + builder for raw FHIR exports.
 *
 * Turns a per-patient {@link PatientBundle} (from `fhir-ingest.ts`) into a dense, summary-first view
 * model purpose-built for RAW, multi-year, heavily-duplicated EHR data — NOT the signed single-
 * encounter patient profile the reasoning `ClinicalChartViewer` was built for. The shape mirrors the
 * information architecture of a real open-source EHR patient chart (OpenEMR card families), but the
 * mechanics here are mechanical, field-driven, and zero-judgment.
 *
 * ZERO-JUDGMENT posture (same spirit as the ingest layer):
 *  - Nothing is INVENTED. Labels and values are carried verbatim: a label is `code.text` ?? first
 *    `coding[].display` ?? raw code; values are rendered straight from `value*` with the FHIR unit
 *    attached, never converted, never computed (no derived age/BMI/MAP, no reference ranges).
 *  - No hardcoded code lists, no clinical reclassification of what a resource "means", except the
 *    explicit display-only lab grouping catalog. That catalog may group/order lab rows for readability,
 *    but labels, values, units, cells, and unmapped residuals remain verbatim from FHIR.
 *  - Dedup is purely mechanical: group by clinical code, count occurrences, keep the latest instance.
 *    That is a de-duplication of restated facts, not a clinical opinion about what is "active".
 *  - Nothing is silently LOST. This is a compact SUMMARY projection — each card surfaces the
 *    clinically-primary fields for its family (label, latest date, occurrence count, one detail line;
 *    a flowsheet of value × date for measurements). It does NOT carry every secondary field of every
 *    resource (e.g. AllergyIntolerance criticality/reaction, a note's non-primary attachments). What
 *    it surfaces is verbatim; what it cannot place into a card is COUNTED in `chart.unmapped` — whole
 *    types with no card, uncategorized Observations, and individual resources an extractor could not
 *    surface — so the residual is honest and a reader can see exactly what is not on a card.
 *
 * Pure + client-safe (no node:fs, no network) — runs entirely in the browser from dropped files.
 */

import { compareFhirLabRows, resolveFhirLabGroup, type FhirLabGroup } from './fhir-lab-grouping';
import type { FhirResource, PatientBundle } from './fhir-ingest';

// ── view-model shapes ───────────────────────────────────────────────────────────────────────────

export type FhirChartHeader = {
  /** Patient.name[0], composed verbatim. Falls back to the bare patient key. */
  name: string;
  patientKey: string;
  /** Identifier value carried verbatim (no system shown), if any. */
  mrn: string | null;
  gender: string | null;
  /** Verbatim Patient.birthDate — NO computed age (zero-judgment). */
  birthDate: string | null;
  /** First race/ethnicity extension display, verbatim, if present. */
  race: string | null;
};

/** A verbatim label/value pair surfaced in a row's expandable detail block. */
export type FhirField = {
  label: string;
  value: string;
};

/** A deduped clinical entry (Problem / Medication / Order or Procedure). */
export type FhirListRow = {
  /** Verbatim display label. */
  label: string;
  /** The code key this row was grouped on, e.g. "http://snomed.info/sct|59621000". */
  codeKey: string;
  /** Raw code value, verbatim, if resolvable (for the mono detail line). */
  code: string | null;
  /** Most-recent clinically-relevant date for this code (ISO string as found), or null. */
  lastDate: string | null;
  /** Per-resource occurrence dates retained for chronology; undated occurrences remain null. */
  occurrences: Array<{ date: string | null; label: string; detail: string | null }>;
  /** How many raw resources collapsed into this row. */
  count: number;
  /** Short verbatim detail line shown on the summary row (status/sig from the latest instance). */
  detail: string | null;
  /**
   * Full verbatim field bag from the LATEST instance — every clinically-meaningful FHIR field, in
   * order, dropping only empty values and `meta`/`identifier.system` plumbing. Surfaced in the
   * expandable per-row detail (OpenEMR Issues-row detail block). This is the "capture everything
   * meaningful, lose nothing" contract.
   */
  fields: FhirField[];
};

/** One analyte row in a flowsheet (labs / vitals). */
export type FhirFlowsheetRow = {
  /** Verbatim analyte label. */
  label: string;
  codeKey: string;
  /** Display-only grouping resolved from Roger's Lab reference catalog. Present for mapped lab rows only. */
  labGroup?: FhirLabGroup | null;
  /** Unit carried verbatim from the latest valued cell, if any. */
  unit: string | null;
  /** dateKey → cell value (string-rendered, verbatim). dateKey is the full effective timestamp. */
  cells: Record<string, string>;
  /** Numeric series aligned to sorted dateKeys, for the trend sparkline (null where non-numeric). */
  numeric: Array<{ dateKey: string; value: number | null }>;
};

export type FhirMeasurementEventItem = {
  label: string;
  codeKey: string;
  value: string;
  unit: string | null;
  labGroup?: FhirLabGroup | null;
};

export type FhirMeasurementEvent = {
  /** Observation effective/issued date carried verbatim; timeline consumers may day-bucket it. */
  date: string | null;
  /** Parent Observation label, verbatim. Component values remain in `items`. */
  label: string;
  items: FhirMeasurementEventItem[];
};

export type FhirFlowsheet = {
  /** Sorted ascending — chronological, recent on the right. Full effective timestamps. */
  dateKeys: string[];
  rows: FhirFlowsheetRow[];
  /** One valued Observation occurrence per record, preserving chronology without inferring from cells. */
  events: FhirMeasurementEvent[];
};

export type FhirNote = {
  /** Verbatim type label (DocumentReference.type.text ?? coding display). */
  typeLabel: string;
  date: string | null;
  /** Verbatim DocumentReference.author display/reference list, if present. */
  author: string | null;
  /** Decoded note body (base64 `content[].attachment.data` decoded), or plain text if present. */
  body: string;
  /** Verbatim secondary metadata, surfaced in the expandable detail (null when absent). */
  status: string | null;
  docStatus: string | null;
  category: string | null;
};

export type FhirSocialLine = {
  label: string;
  value: string;
  date: string | null;
};

export type FhirChart = {
  header: FhirChartHeader;
  problems: FhirListRow[];
  medications: FhirListRow[];
  allergies: FhirListRow[];
  labs: FhirFlowsheet;
  vitals: FhirFlowsheet;
  ordersAndProcedures: FhirListRow[];
  notes: FhirNote[];
  social: FhirSocialLine[];
  /** resourceType → count of resources NOT surfaced into any card above (honest residual). */
  unmapped: Record<string, number>;
};

// ── small field helpers (all verbatim, all null-tolerant) ─────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

type Coding = { system?: unknown; code?: unknown; display?: unknown };
type CodeableConcept = { text?: unknown; coding?: unknown };

function codings(concept: unknown): Coding[] {
  const c = concept as CodeableConcept | undefined;
  return Array.isArray(c?.coding) ? (c!.coding as Coding[]) : [];
}

/** Verbatim label: code.text ?? first coding display ?? first coding code ?? fallback. */
function labelOf(concept: unknown, fallback = 'Unlabeled'): string {
  const c = concept as CodeableConcept | undefined;
  const text = str(c?.text);
  if (text) return text;
  for (const coding of codings(concept)) {
    const display = str(coding.display);
    if (display) return display;
  }
  for (const coding of codings(concept)) {
    const code = str(coding.code);
    if (code) return code;
  }
  return fallback;
}

/**
 * A stable grouping key for a CodeableConcept: "system|code" of the first coding, else lowered text.
 *
 * `distinctWhenUnlabeled` controls what happens when the concept carries NEITHER a code NOR text. For
 * the deduped clinical LISTS (Problems/Medications/Orders) the caller passes a resource id here: with
 * nothing clinical to group on, collapsing such resources under a shared "unlabeled" key would assert
 * they are the same thing (a judgment this viewer must not make), so each is keyed distinctly by its id.
 * The flowsheet `place()` passes nothing — a value×date matrix wants all un-coded readings on ONE
 * "Unlabeled" analyte row (its per-cell collision logic already keeps distinct values), so it retains
 * the shared text-key grouping.
 */
function codeKeyOf(concept: unknown, distinctWhenUnlabeled?: string | null): string {
  for (const coding of codings(concept)) {
    const code = str(coding.code);
    if (code) return `${str(coding.system) ?? ''}|${code}`;
  }
  const c = concept as CodeableConcept | undefined;
  const text = str(c?.text);
  if (text) return `text|${text.toLowerCase()}`;
  // No code and no text. Lists pass a distinct per-resource token (id or list position) so distinct
  // un-coded resources never merge; the flowsheet passes nothing and keeps the shared "unlabeled" row.
  if (distinctWhenUnlabeled != null) return `id|${distinctWhenUnlabeled}`;
  return `text|${labelOf(concept).toLowerCase()}`;
}

/** Raw code value (first coding's code), verbatim. */
function rawCodeOf(concept: unknown): string | null {
  for (const coding of codings(concept)) {
    const code = str(coding.code);
    if (code) return code;
  }
  return null;
}

// ── generic verbatim value rendering + field bag ─────────────────────────────────────────────────
//
// "Capture everything meaningful, lose nothing." renderFhirValue turns ANY FHIR value (primitive,
// CodeableConcept, Coding, Quantity, Period, Range, Reference, Annotation, or arrays of these) into a
// verbatim display string. fieldBag walks a declared list of (label, raw value) pairs, renders each,
// and drops only the EMPTY ones — never silently losing a present clinically-meaningful field.

/** Render any FHIR value verbatim to a string, or null when empty/uninterpretable. */
function renderFhirValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return str(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    const parts = value.map(renderFhirValue).filter((x): x is string => !!x);
    return parts.length ? parts.join('; ') : null;
  }

  const o = value as Record<string, unknown>;

  // Precedence matters — check the more-specific shapes BEFORE the generic ones so a CodeableConcept
  // that happens to carry other keys, or a Reference vs a Quantity, never misclassifies.

  // Ratio { numerator, denominator } — most specific; render whatever halves are present.
  if ('numerator' in o || 'denominator' in o) {
    const n = renderFhirValue(o.numerator);
    const d = renderFhirValue(o.denominator);
    if (n && d) return `${n} / ${d}`;
    return n ?? d;
  }
  // Range { low?, high? }
  if ('low' in o || 'high' in o) {
    const low = renderFhirValue(o.low);
    const high = renderFhirValue(o.high);
    if (low && high) return `${low} – ${high}`;
    return low ?? high;
  }
  // Period { start?, end? }
  if ('start' in o || 'end' in o) {
    const start = str(o.start);
    const end = str(o.end);
    if (start && end) return `${start} → ${end}`;
    return start ?? (end ? `until ${end}` : null);
  }
  // CodeableConcept / Coding — has coding[] or a text/display (checked before the loose value branch
  // so a coded value isn't mistaken for a Quantity).
  if (Array.isArray(o.coding) || (typeof o.text === 'string' && !('value' in o)) || ('display' in o && !('reference' in o) && !('value' in o))) {
    const lbl = labelOf(o, '');
    if (lbl) return lbl;
  }
  // Reference { reference, display? } — only a real reference, not any object with a display.
  if ('reference' in o) {
    return str(o.display) ?? str(o.reference);
  }
  // Quantity { value:number, unit?/code?, comparator? } — REQUIRES a numeric value (a string `value`
  // is not a FHIR Quantity and was misclassifying arbitrary objects).
  if (typeof o.value === 'number') {
    const unit = str(o.unit) ?? str(o.code);
    const comparator = str(o.comparator) ?? '';
    return `${comparator}${o.value}${unit ? ` ${unit}` : ''}`.trim();
  }
  // Annotation { text, author?, time? }
  if (typeof o.text === 'string') {
    const t = str(o.text);
    const time = str(o.time);
    return t ? (time ? `${t} (${time})` : t) : null;
  }
  // Bare display (e.g. a Coding with only display).
  if (typeof o.display === 'string') return str(o.display);
  return null;
}

/** Build a verbatim field bag from declared (label, rawValue) pairs, dropping only empties. */
function fieldBag(entries: Array<[string, unknown]>): FhirField[] {
  const out: FhirField[] = [];
  for (const [label, raw] of entries) {
    const value = renderFhirValue(raw);
    if (value !== null) out.push({ label, value });
  }
  return out;
}

/** AllergyIntolerance.reaction[] → verbatim "manifestation (severity) to substance" lines. */
function reactionLines(reactions: unknown): string | null {
  if (!Array.isArray(reactions)) return null;
  const lines = reactions
    .map(r => {
      const rr = r as { manifestation?: unknown; severity?: unknown; substance?: unknown; description?: unknown };
      const manifestation = renderFhirValue(rr.manifestation);
      const severity = str(rr.severity);
      const substance = renderFhirValue(rr.substance);
      const desc = str(rr.description);
      const head = manifestation ?? desc;
      if (!head) return severity ? `(${severity})` : null;
      return `${head}${severity ? ` (${severity})` : ''}${substance ? ` to ${substance}` : ''}`;
    })
    .filter((x): x is string => !!x);
  return lines.length ? lines.join('; ') : null;
}

/**
 * Compare two ISO-ish date strings; returns the later one (null-safe). Lexicographic compare is
 * correct for ISO-8601 timestamps and falls back gracefully for partial dates.
 */
function laterDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

// ── header ────────────────────────────────────────────────────────────────────────────────────────

function buildHeader(bundle: PatientBundle): FhirChartHeader {
  const p = bundle.patient;
  const names = (p?.name as Array<{ text?: unknown; family?: unknown; given?: unknown }> | undefined) ?? [];
  const first = names[0];
  let name: string | null = null;
  if (first) {
    name = str(first.text);
    if (!name) {
      const given = Array.isArray(first.given) ? first.given.map(str).filter(Boolean).join(' ') : '';
      const family = str(first.family) ?? '';
      name = [given, family].filter(Boolean).join(' ').trim() || null;
    }
  }

  // Identifier value carried verbatim (no system) — first identifier with a value.
  const identifiers = (p?.identifier as Array<{ value?: unknown }> | undefined) ?? [];
  let mrn: string | null = null;
  for (const id of identifiers) {
    const v = str(id?.value);
    if (v) { mrn = v; break; }
  }

  // US-Core race/ethnicity extension display, verbatim, if present.
  let race: string | null = null;
  const extensions = (p?.extension as Array<{ url?: unknown; extension?: unknown }> | undefined) ?? [];
  for (const ext of extensions) {
    const url = str(ext?.url) ?? '';
    if (!/race|ethnic/i.test(url)) continue;
    const sub = Array.isArray(ext?.extension) ? (ext.extension as Array<{ url?: unknown; valueString?: unknown; valueCoding?: { display?: unknown } }>) : [];
    for (const s of sub) {
      const display = str(s?.valueString) ?? str(s?.valueCoding?.display);
      if (display) { race = display; break; }
    }
    if (race) break;
  }

  return {
    name: name ?? bundle.patientKey,
    patientKey: bundle.patientKey,
    mrn,
    gender: str(p?.gender),
    birthDate: str(p?.birthDate),
    race,
  };
}

// ── deduped clinical lists (Problems / Medications / Orders & Procedures) ─────────────────────────

type ListAccumulator = {
  label: string;
  codeKey: string;
  code: string | null;
  lastDate: string | null;
  occurrences: Array<{ date: string | null; label: string; detail: string | null }>;
  count: number;
  detail: string | null;
  fields: FhirField[];
};

/** What a per-family extractor returns for one resource. */
type ListExtract = {
  concept: unknown;
  date: string | null;
  /** Short summary-row detail (status/sig). */
  detail: string | null;
  /** Full verbatim field bag for the expandable detail. */
  fields: FhirField[];
};

/**
 * Group resources by clinical code, counting occurrences and keeping the LATEST instance's label,
 * date, detail, and full field bag. `concept`, `date`, `detail`, `fields` are extracted per resource
 * by the caller.
 */
function dedupeList(
  resources: FhirResource[],
  extract: (r: FhirResource) => ListExtract | null,
): { rows: ListAccumulator[]; dropped: number } {
  const map = new Map<string, ListAccumulator>();
  let dropped = 0;
  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const e = extract(r);
    if (!e) {
      // The extractor could not surface this resource (e.g. a medication with neither inline concept
      // nor reference). Counted as residual below — never silently lost.
      dropped += 1;
      continue;
    }
    // For a code-less, text-less concept, key on the resource id — or, failing that, the list index — so
    // distinct un-coded resources stay separate AND the key is deterministic across rebuilds.
    const codeKey = codeKeyOf(e.concept, str((r as { id?: unknown }).id) ?? `pos-${i}`);
    const existing = map.get(codeKey);
    if (!existing) {
      map.set(codeKey, {
        label: labelOf(e.concept),
        codeKey,
        code: rawCodeOf(e.concept),
        lastDate: e.date,
        occurrences: [{ date: e.date, label: labelOf(e.concept), detail: e.detail }],
        count: 1,
        detail: e.detail,
        fields: e.fields,
      });
      continue;
    }
    existing.count += 1;
    existing.occurrences.push({ date: e.date, label: labelOf(e.concept), detail: e.detail });
    // Refresh the displayed label/detail/fields from the incoming instance when it is the new
    // "latest" (dated beats undated; equal/later dated refreshes; undated-vs-undated → input order).
    // Detail/fields are taken verbatim from that winning instance — never a new date with stale data.
    const incomingWins =
      (e.date !== null && existing.lastDate === null) ||
      (e.date !== null && existing.lastDate !== null && e.date >= existing.lastDate) ||
      (e.date === null && existing.lastDate === null);
    if (incomingWins) {
      existing.label = labelOf(e.concept);
      existing.detail = e.detail;
      existing.fields = e.fields;
    }
    existing.lastDate = laterDate(existing.lastDate, e.date);
  }
  return { rows: Array.from(map.values()), dropped };
}

function toRows(acc: ListAccumulator[]): FhirListRow[] {
  return acc.map(a => ({
    label: a.label,
    codeKey: a.codeKey,
    code: a.code,
    lastDate: a.lastDate,
    occurrences: a.occurrences.slice().sort((x, y) => {
      if (x.date && y.date) return x.date > y.date ? -1 : x.date < y.date ? 1 : x.label.localeCompare(y.label);
      if (x.date) return -1;
      if (y.date) return 1;
      return x.label.localeCompare(y.label);
    }),
    count: a.count,
    detail: a.detail,
    fields: a.fields,
  }));
}

/** Newest-date first; undated rows sink to the bottom; tie-break by label. */
function byRecency(a: FhirListRow, b: FhirListRow): number {
  if (a.lastDate && b.lastDate) return a.lastDate > b.lastDate ? -1 : a.lastDate < b.lastDate ? 1 : a.label.localeCompare(b.label);
  if (a.lastDate) return -1;
  if (b.lastDate) return 1;
  return a.label.localeCompare(b.label);
}

// ── medication detail (verbatim dose/sig) ─────────────────────────────────────────────────────────

function medicationConcept(r: FhirResource): unknown {
  // Inline form: MedicationRequest.medicationCodeableConcept.
  const inline = (r as { medicationCodeableConcept?: unknown }).medicationCodeableConcept;
  if (inline) return inline;
  // Reference form: MedicationRequest.medicationReference — synthesize a concept from its display (or
  // bare reference) so the med still appears, grouped on the reference. (Resolving the referenced
  // Medication resource from the shared pool is a later enhancement; never silently drop the row.)
  const ref = (r as { medicationReference?: { display?: unknown; reference?: unknown } }).medicationReference;
  const display = str(ref?.display);
  const reference = str(ref?.reference);
  if (display || reference) {
    return { text: display ?? reference, coding: reference ? [{ code: reference }] : [] };
  }
  return null;
}

function medicationDetail(r: FhirResource): string | null {
  const dosages = (r as { dosageInstruction?: unknown }).dosageInstruction;
  const first = Array.isArray(dosages) ? (dosages[0] as { text?: unknown }) : undefined;
  return str(first?.text);
}

// ── flowsheet (labs / vitals) ─────────────────────────────────────────────────────────────────────

type Quantity = { value?: unknown; unit?: unknown };

/**
 * Render an Observation/component `value[x]` verbatim as a display string + numeric (when scalar).
 * Covers every FHIR R4 Observation.value[x] type; the numeric slot is set only for Quantity/Integer so
 * the sparkline never plots a non-scalar. Returns null ONLY when the resource carries NO value[x] and
 * no dataAbsentReason — and the caller counts those as unmapped (never a silent drop).
 */
function renderValue(obs: FhirResource): { text: string; unit: string | null; numeric: number | null } | null {
  const o = obs as Record<string, unknown>;
  const q = o.valueQuantity as Quantity | undefined;
  if (q && typeof q.value === 'number') {
    const unit = str(q.unit);
    return { text: unit ? `${q.value} ${unit}` : String(q.value), unit, numeric: q.value };
  }
  if (o.valueCodeableConcept) return { text: labelOf(o.valueCodeableConcept), unit: null, numeric: null };
  const vs = str(o.valueString);
  if (vs) return { text: vs, unit: null, numeric: null };
  if (typeof o.valueBoolean === 'boolean') return { text: String(o.valueBoolean), unit: null, numeric: null };
  if (typeof o.valueInteger === 'number') return { text: String(o.valueInteger), unit: null, numeric: o.valueInteger };
  // The long tail — rendered verbatim via the shared renderer, no numeric (not plottable).
  for (const key of ['valueRange', 'valueRatio', 'valueDateTime', 'valueTime', 'valuePeriod', 'valueSampledData'] as const) {
    if (o[key] !== undefined) {
      const text = renderFhirValue(o[key]);
      if (text) return { text, unit: null, numeric: null };
    }
  }
  // Explicit "no result" reason is itself a meaningful cell (e.g. "specimen unsatisfactory").
  if (o.dataAbsentReason) {
    const text = renderFhirValue(o.dataAbsentReason);
    if (text) return { text: `— ${text}`, unit: null, numeric: null };
  }
  return null;
}

function observationDate(obs: FhirResource): string | null {
  return (
    str((obs as { effectiveDateTime?: unknown }).effectiveDateTime) ??
    str(((obs as { effectivePeriod?: { start?: unknown } }).effectivePeriod ?? {}).start) ??
    str((obs as { issued?: unknown }).issued)
  );
}

/** True when an Observation belongs to a given category code (laboratory / vital-signs / social-history). */
function hasCategory(obs: FhirResource, code: string): boolean {
  const cats = (obs as { category?: unknown }).category;
  if (!Array.isArray(cats)) return false;
  for (const cat of cats) {
    for (const coding of codings(cat)) {
      if (str(coding.code) === code) return true;
    }
    if ((str((cat as CodeableConcept).text) ?? '').toLowerCase() === code) return true;
  }
  return false;
}

type FlowsheetAccumulator = {
  label: string;
  codeKey: string;
  labGroup?: FhirLabGroup | null;
  unit: string | null;
  /** dateKey → cell value. dateKey is the full effective timestamp (+ a "·n" suffix on collision). */
  cells: Record<string, string>;
  numeric: Record<string, number | null>;
  /** Insertion order of dateKeys for this row, so a collision suffix sorts adjacent to its base. */
};

/**
 * Build a flowsheet from category-filtered Observations. Each analyte (by code) becomes a row; each
 * distinct effective timestamp becomes a column (serial intraday draws stay distinct). BP and other
 * multi-component observations expand into one row per component, field-driven.
 *
 * Verbatim only — NO reference ranges, NO abnormal/interpretation flags (these are inconsistently
 * mapped across patients in real exports, so showing them for a few would mislead). Cells carry the
 * value + unit exactly as found.
 */
// NOTE on Observation.status: a flowsheet is a value×date matrix with no per-cell detail slot, so
// the per-result `status` (final/preliminary/amended/corrected) is intentionally NOT surfaced here.
// This is a deliberate, documented choice — not an oversight. Field-allocation scan across the full
// PhysicianBench export confirmed `status` is `final` on 114,241/114,241 observations (an invariant in
// this data), so a per-cell status badge would add visual noise without clinical signal. If a future
// export carries non-final results, revisit (e.g. mark only non-final cells).
function buildFlowsheet(
  observations: FhirResource[],
  options: { resolveGroup?: (codeKey: string, label: string) => FhirLabGroup | null } = {},
): { flowsheet: FhirFlowsheet; skipped: number } {
  const rows = new Map<string, FlowsheetAccumulator>();
  const events: FhirMeasurementEvent[] = [];
  // Map a column key → its sort token. A collision suffix sorts immediately AFTER its base timestamp
  // (and before the next distinct timestamp) — fixing the old lexicographic "#10 before #2" bug and
  // the "#n before next-second" bug. Token = `${base}\u0000${paddedN}` so string compare is correct.
  const sortToken = new Map<string, string>();

  const place = (
    concept: unknown,
    dateKey: string,
    rendered: { text: string; unit: string | null; numeric: number | null },
  ): FhirMeasurementEventItem => {
    const codeKey = codeKeyOf(concept);
    const label = labelOf(concept);
    const labGroup = options.resolveGroup?.(codeKey, label) ?? null;
    let row = rows.get(codeKey);
    if (!row) {
      row = { label, codeKey, labGroup, unit: null, cells: {}, numeric: {} };
      rows.set(codeKey, row);
    } else if (!row.labGroup && labGroup) {
      row.labGroup = labGroup;
    }
    // The cell shows the BARE value — the unit is shown ONCE on the left next to the analyte label, so
    // repeating it in every cell is redundant. Strip the trailing unit from this result's text; the
    // unit itself is still captured into `row.unit` below.
    const cellText =
      rendered.unit && rendered.text.endsWith(` ${rendered.unit}`)
        ? rendered.text.slice(0, -(rendered.unit.length + 1))
        : rendered.text;
    // Collision: this analyte already has a DIFFERENT value at this exact key. Keep both by
    // disambiguating with a "·n" column key — serial same-instant draws (AND multiple undated
    // results) must not silently overwrite. An identical repeat collapses harmlessly.
    let key = dateKey;
    let n = 1;
    if (key in row.cells && row.cells[key] !== cellText) {
      n = 2;
      while (`${dateKey}·${n}` in row.cells) n += 1;
      key = `${dateKey}·${n}`;
    } else if (key in row.cells) {
      // Identical repeat — the matrix cell is already represented, but the source Observation still
      // remains an event for chronology/counting.
      return { label, codeKey, value: cellText, unit: rendered.unit, labGroup };
    }
    row.cells[key] = cellText;
    row.numeric[key] = rendered.numeric;
    if (rendered.unit && !row.unit) row.unit = rendered.unit;
    // Sort token: base timestamp, then a NUL separator + zero-padded collision index, so "·2" sorts
    // right after the base and "·10" after "·2", all before the next distinct timestamp.
    sortToken.set(key, `${dateKey}\u0000${String(n).padStart(6, '0')}`);
    return { label, codeKey, value: cellText, unit: rendered.unit, labGroup };
  };

  let skipped = 0; // categorized observations that surfaced NO cell (no value[x], no valued component)
  for (const obs of observations) {
    const dateKey = observationDate(obs) ?? 'undated';
    const components = (obs as { component?: unknown }).component;
    const parentRendered = renderValue(obs);
    let placedAny = false;
    const eventItems: FhirMeasurementEventItem[] = [];
    if (Array.isArray(components) && components.length > 0) {
      // Multi-component (e.g. blood pressure systolic/diastolic) — one row per component, verbatim.
      // A component with no code falls back to its own label (and is disambiguated by the collision
      // logic), so two un-coded components never overwrite each other.
      for (const comp of components as Array<{ code?: unknown }>) {
        const rendered = renderValue(comp as FhirResource);
        if (!rendered) continue;
        eventItems.push(place((comp as { code?: unknown }).code ?? (obs as { code?: unknown }).code, dateKey, rendered));
        placedAny = true;
      }
      // A parent that ALSO carries its own value (e.g. mean) is kept too — never dropped.
      if (parentRendered) {
        eventItems.push(place((obs as { code?: unknown }).code, dateKey, parentRendered));
        placedAny = true;
      }
    } else if (parentRendered) {
      eventItems.push(place((obs as { code?: unknown }).code, dateKey, parentRendered));
      placedAny = true;
    }
    if (eventItems.length > 0) {
      events.push({ date: dateKey, label: labelOf((obs as { code?: unknown }).code), items: eventItems });
    }
    if (!placedAny) skipped += 1; // counted into chart.unmapped by the caller — never silently lost.
  }

  const allKeys = Array.from(sortToken.keys());
  allKeys.sort((a, b) => {
    const ta = sortToken.get(a)!;
    const tb = sortToken.get(b)!;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const dateKeys = allKeys; // ascending — recent on the right

  const outRows: FhirFlowsheetRow[] = Array.from(rows.values()).map(r => ({
    label: r.label,
    codeKey: r.codeKey,
    labGroup: r.labGroup ?? null,
    unit: r.unit,
    cells: r.cells,
    numeric: dateKeys.filter(k => k in r.numeric).map(k => ({ dateKey: k, value: r.numeric[k] })),
  }));

  // Default: analyte rows are alphabetical by label, matching the old flat viewer.
  //
  // Labs carve-out: when a grouping resolver is supplied, use Roger's reference-catalog source-row order
  // as a display-only readability layer. Values/units/labels stay verbatim and unresolved rows remain
  // visible after the mapped catalog groups.
  outRows.sort(options.resolveGroup ? compareFhirLabRows : (a, b) => a.label.localeCompare(b.label));
  events.sort((a, b) => {
    const da = a.date ?? 'undated';
    const db = b.date ?? 'undated';
    return da.localeCompare(db) || a.label.localeCompare(b.label);
  });

  return { flowsheet: { dateKeys, rows: outRows, events }, skipped };
}

// ── notes (DocumentReference) ─────────────────────────────────────────────────────────────────────

/** Decode base64 (browser `atob` or node Buffer), tolerant of failure. */
function decodeBase64(data: string): string {
  try {
    if (typeof atob === 'function') {
      const binary = atob(data);
      // Reinterpret latin1 bytes as UTF-8 where possible.
      try {
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      } catch {
        return binary;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer;
    if (B) return B.from(data, 'base64').toString('utf-8');
  } catch {
    /* fall through */
  }
  return data;
}

function buildNotes(docRefs: FhirResource[]): FhirNote[] {
  const notes: FhirNote[] = [];
  for (const ref of docRefs) {
    const typeLabel = labelOf((ref as { type?: unknown }).type, 'Note');
    const date = str((ref as { date?: unknown }).date);
    const content = (ref as { content?: unknown }).content;
    let body = '';
    if (Array.isArray(content)) {
      for (const c of content as Array<{ attachment?: { data?: unknown; contentType?: unknown } }>) {
        const data = str(c?.attachment?.data);
        if (data) {
          body = decodeBase64(data);
          break;
        }
      }
    }
    const r = ref as Record<string, unknown>;
    const status = str(r.status as string);
    const docStatus = str(r.docStatus as string);
    const category = str(labelOf(r.category, '')) || null;
    const author = renderFhirValue(r.author);
    notes.push({ typeLabel, date, author, body, status, docStatus, category });
  }
  // Newest first; undated sink.
  notes.sort((a, b) => {
    if (a.date && b.date) return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });
  return notes;
}

// ── social history ────────────────────────────────────────────────────────────────────────────────

function buildSocial(observations: FhirResource[]): FhirSocialLine[] {
  const lines: FhirSocialLine[] = [];
  for (const obs of observations) {
    const rendered = renderValue(obs);
    lines.push({
      label: labelOf((obs as { code?: unknown }).code),
      value: rendered ? rendered.text : '—',
      date: observationDate(obs),
    });
  }
  lines.sort((a, b) => {
    if (a.date && b.date) return a.date > b.date ? -1 : a.date < b.date ? 1 : a.label.localeCompare(b.label);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.label.localeCompare(b.label);
  });
  return lines;
}

// ── top-level builder ─────────────────────────────────────────────────────────────────────────────

/** Resource types fully consumed into cards above — excluded from the `unmapped` residual count. */
const MAPPED_TYPES = new Set([
  'Patient', // the chart subject itself (rendered in the header) — never an "unmapped" clinical resource
  'Condition',
  'MedicationRequest',
  'MedicationStatement',
  'AllergyIntolerance',
  'Observation', // partitioned by category; uncategorized observations stay counted (see below)
  'Procedure',
  'ServiceRequest',
  'DocumentReference',
]);

/**
 * Build the compact EHR chart for one patient bundle.
 *
 * Card families, each omitted (empty) when the source has none:
 *  - Problems              ← Condition (deduped by code, newest onset first)
 *  - Medications           ← Medication{Request,Statement} (deduped by drug, newest authored first)
 *  - Allergies             ← AllergyIntolerance (deduped)
 *  - Labs flowsheet        ← Observation category=laboratory
 *  - Vitals flowsheet      ← Observation category=vital-signs
 *  - Orders & Procedures   ← Procedure + ServiceRequest (deduped by code, alphabetical)
 *  - Notes                 ← DocumentReference (decoded body, newest first)
 *  - Social history        ← Observation category=social-history
 */
export function buildFhirChart(bundle: PatientBundle): FhirChart {
  const header = buildHeader(bundle);
  const byType = new Map<string, FhirResource[]>();
  for (const r of bundle.resources) {
    const list = byType.get(r.resourceType) ?? [];
    list.push(r);
    byType.set(r.resourceType, list);
  }
  const of = (t: string): FhirResource[] => byType.get(t) ?? [];

  // Track resources an extractor could not surface, so the residual is honest (see `unmapped`).
  const droppedByType: Record<string, number> = {};
  const noteDrop = (type: string, n: number) => {
    if (n > 0) droppedByType[type] = (droppedByType[type] ?? 0) + n;
  };

  // Problems (Condition) — capture every clinically-meaningful field verbatim.
  const problemsDedup = dedupeList(of('Condition'), r => {
    const c = r as Record<string, unknown>;
    return {
      concept: c.code,
      date: str(c.onsetDateTime as string) ?? str(c.recordedDate as string),
      detail: str(labelOf(c.clinicalStatus, '')) || null,
      fields: fieldBag([
        ['Code', rawCodeOf(c.code)],
        ['Clinical status', c.clinicalStatus],
        ['Verification', c.verificationStatus],
        ['Category', c.category],
        ['Severity', c.severity],
        ['Body site', c.bodySite],
        ['Onset', c.onsetDateTime ?? c.onsetPeriod ?? c.onsetString ?? c.onsetAge],
        ['Abatement', c.abatementDateTime ?? c.abatementPeriod ?? c.abatementString],
        ['Recorded', c.recordedDate],
        ['Recorder', c.recorder],
        ['Asserter', c.asserter],
        ['Encounter', c.encounter],
        ['Stage', c.stage],
        ['Note', c.note],
      ]),
    };
  });
  noteDrop('Condition', problemsDedup.dropped);
  const problems = toRows(problemsDedup.rows).sort(byRecency);

  // Medications (Request + Statement both contribute; deduped on drug — inline OR reference form)
  const medResources = [...of('MedicationRequest'), ...of('MedicationStatement')];
  const medsDedup = dedupeList(medResources, r => {
    const concept = medicationConcept(r);
    if (!concept) return null; // no inline concept AND no reference — counted as residual, not dropped
    const m = r as Record<string, unknown>;
    const dosage = m.dosageInstruction as Array<Record<string, unknown>> | undefined;
    const firstDose = Array.isArray(dosage) ? dosage[0] : undefined;
    const dispense = m.dispenseRequest as Record<string, unknown> | undefined;
    return {
      concept,
      date:
        str(m.authoredOn as string) ??
        str(((m.effectivePeriod as { start?: unknown }) ?? {}).start as string) ??
        str(m.effectiveDateTime as string),
      detail: medicationDetail(r),
      fields: fieldBag([
        ['Code', rawCodeOf(concept)],
        ['Status', m.status],
        ['Intent', m.intent],
        ['Sig', firstDose?.text],
        ['Route', firstDose?.route],
        ['Dose', firstDose?.doseAndRate],
        ['Authored', m.authoredOn],
        ['Requester', m.requester],
        ['Reason', m.reasonCode],
        ['Quantity', dispense?.quantity],
        ['Refills', dispense?.numberOfRepeatsAllowed],
        ['Validity', dispense?.validityPeriod],
        ['Note', m.note],
      ]),
    };
  });
  noteDrop('Medication (no code or reference)', medsDedup.dropped);
  const medications = toRows(medsDedup.rows).sort(byRecency);

  // Allergies (AllergyIntolerance) — capture criticality, reaction, type, verification verbatim.
  const allergiesDedup = dedupeList(of('AllergyIntolerance'), r => {
    const a = r as Record<string, unknown>;
    const criticality = str(a.criticality as string);
    const reaction = reactionLines(a.reaction);
    // Summary-row detail: the most clinically-salient cues (criticality + reaction), like OpenEMR.
    const detail = [criticality, reaction].filter(Boolean).join(' · ') || null;
    return {
      concept: a.code,
      date: str(a.recordedDate as string) ?? str(a.onsetDateTime as string),
      detail,
      fields: fieldBag([
        ['Code', rawCodeOf(a.code)],
        ['Criticality', a.criticality],
        ['Type', a.type],
        ['Category', a.category],
        ['Clinical status', a.clinicalStatus],
        ['Verification', a.verificationStatus],
        ['Reaction', reaction],
        ['Onset', a.onsetDateTime ?? a.onsetPeriod ?? a.onsetString],
        ['Recorded', a.recordedDate],
        ['Recorder', a.recorder],
        ['Asserter', a.asserter],
        ['Last occurrence', a.lastOccurrence],
        ['Note', a.note],
      ]),
    };
  });
  noteDrop('AllergyIntolerance', allergiesDedup.dropped);
  const allergies = toRows(allergiesDedup.rows).sort(byRecency);

  // Observation partition by category
  const allObs = of('Observation');
  const labObs = allObs.filter(o => hasCategory(o, 'laboratory'));
  const vitalObs = allObs.filter(o => hasCategory(o, 'vital-signs'));
  const socialObs = allObs.filter(o => hasCategory(o, 'social-history'));
  const uncategorizedObs = allObs.filter(
    o => !hasCategory(o, 'laboratory') && !hasCategory(o, 'vital-signs') && !hasCategory(o, 'social-history'),
  );

  const labsBuilt = buildFlowsheet(labObs, { resolveGroup: resolveFhirLabGroup });
  const vitalsBuilt = buildFlowsheet(vitalObs);
  const labs = labsBuilt.flowsheet;
  const vitals = vitalsBuilt.flowsheet;
  // A categorized lab/vital Observation that surfaced no cell (no value[x], no valued component) is a
  // present resource we couldn't render — count it as residual so nothing is silently dropped.
  noteDrop('Observation (laboratory, no value)', labsBuilt.skipped);
  noteDrop('Observation (vital-signs, no value)', vitalsBuilt.skipped);
  const social = buildSocial(socialObs);

  // Orders & Procedures: Procedure + ServiceRequest, deduped by code, alphabetical.
  const orderResources = [...of('Procedure'), ...of('ServiceRequest')];
  const ordersDedup = dedupeList(orderResources, r => {
    const p = r as Record<string, unknown>;
    const isServiceRequest = p.resourceType === 'ServiceRequest';
    return {
      concept: p.code,
      date:
        str(p.performedDateTime as string) ??
        str(((p.performedPeriod as { start?: unknown }) ?? {}).start as string) ??
        str(p.authoredOn as string) ??
        str(p.occurrenceDateTime as string),
      detail: str(labelOf(p.status as unknown, '')) || (typeof p.status === 'string' ? p.status : null),
      fields: fieldBag([
        ['Resource', isServiceRequest ? 'ServiceRequest (order)' : 'Procedure'],
        ['Code', rawCodeOf(p.code)],
        ['Status', p.status],
        ['Category', p.category],
        ['Performed', p.performedDateTime ?? p.performedPeriod ?? p.performedString],
        ['Occurrence', p.occurrenceDateTime ?? p.occurrencePeriod],
        ['Authored', p.authoredOn],
        ['Priority', p.priority],
        ['Intent', p.intent],
        ['Body site', p.bodySite],
        ['Outcome', p.outcome],
        ['Reason', p.reasonCode],
        ['Performer', p.performer],
        ['Requester', p.requester],
        ['Encounter', p.encounter],
        ['Note', p.note],
      ]),
    };
  });
  noteDrop('Procedure/ServiceRequest (no code)', ordersDedup.dropped);
  const ordersAndProcedures = toRows(ordersDedup.rows).sort((a, b) => a.label.localeCompare(b.label));

  const notes = buildNotes(of('DocumentReference'));

  // Honest residual: every resource we did NOT surface into a card, so nothing silently disappears:
  //  - whole resource types with no card,
  //  - uncategorized Observations,
  //  - individual resources a card's extractor could not surface (e.g. a med with no code/reference).
  const unmapped: Record<string, number> = {};
  for (const [type, list] of byType.entries()) {
    if (type === 'Observation') continue; // handled below
    if (!MAPPED_TYPES.has(type)) unmapped[type] = list.length;
  }
  if (uncategorizedObs.length > 0) unmapped['Observation (uncategorized)'] = uncategorizedObs.length;
  for (const [label, n] of Object.entries(droppedByType)) {
    if (n > 0) unmapped[label] = (unmapped[label] ?? 0) + n;
  }

  return {
    header,
    problems,
    medications,
    allergies,
    labs,
    vitals,
    ordersAndProcedures,
    notes,
    social,
    unmapped,
  };
}
