# AGENTS.md — Coda FHIR Viewer

Guidance for anyone (human or AI) working in this repo. Read this before changing code.

---

## What this is

A **standalone, browser-only viewer for FHIR R4 patient exports.** Drop a FHIR NDJSON bulk-export and
it renders a compact, EHR-style patient chart entirely in the browser — no server, no database, no
network call, nothing uploaded. `npm run build:html` inlines all JS+CSS into one `dist/index.html` that
anyone can double-click to open offline.

**North star:** make a raw, multi-year, heavily-duplicated FHIR export *legible at a glance* the way a
real EHR chart is — dense but scannable, faithful to the data, never inventing or hiding anything.

## Origin — where this came from

The viewer components were **extracted verbatim from the Coda Health Lab app** (an internal clinical
reasoning platform). Only import paths changed during extraction (`@/components/clinical-entry/…` →
`./…`, `@/lib/fhir-viewer/…` → `../lib/…`); the component logic, layout, dedup, and zero-judgment
behavior are identical to the in-app `/patients/fhir-chart-proof` route.

Three helper files under `src/viewer/` are **copied from the Lab's clinical-entry measurement grid**
(they were pure, React-or-data-only, leak-safe):
- `measurement-trend-data.ts` — trend math (window bounds, day math, label visibility).
- `trend-label-layout.ts` — per-point label collision resolver for the trend chart.
- `use-hover-card.ts` — the hover-card open/close timing controller (120ms open, warm-window glide,
  Esc/scroll dismiss).

`fhir-trend.tsx` (the sparkline + trend modal) and the per-cell hover card were copied from the Lab's
`clinical-chart-viewer.tsx`, stripped of reference-ranges / High-Low flags / authoring actions that
don't exist in raw FHIR exports. **If you touch the trend/hover code, you are editing copied surface
chrome — keep it faithful; don't reinvent.**

Because this is now a fully independent repo, there is **no monorepo dependency** — every import is
local. Do not reintroduce a `@/…` import.

---

## Architecture (file by file)

### Entry
- `src/main.tsx` — React root; renders `<FhirChartProofClient/>`.
- `src/App.tsx` — the app shell: drag/drop + file-picker ingest → patient index (if many) → chart.
  This is the Lab's route client, verbatim minus the Next.js bits.

### Model (pure, no React, no DOM)
- `src/lib/fhir-ingest.ts` — parse NDJSON → group resources per patient by `subject.reference` →
  lightweight index. Drops nothing silently; every skip/dup is a named warning.
- `src/lib/fhir-chart.ts` — the **zero-judgment view-model builder**. Raw FHIR → a compact chart model:
  verbatim labels/values, mechanical dedup (group by clinical code, keep latest, count occurrences),
  BP component expansion, the flowsheet matrix, and an **honest `unmapped` residual** counting anything
  it couldn't place on a card. **This file makes no clinical decisions.** (See "Zero-judgment" below.)

### Shared primitives
- `src/viewer/fhir-primitives.tsx` — `PANEL`, `DateStamp`/`formatChartDate`, `CountChip`, `FilterInput`,
  `FhirStatusPill` (+ tone map), `SECTION_HEADING`, `SECTION_HEADING_ACCENT`. One definition each — do
  not re-roll these inline at a call site.
- `src/viewer/fhir-card.tsx` — `FhirCard` (collapsible dashboard card), `FhirListGroup`, `FhirListItem`.

### Tables & sections
- `src/viewer/fhir-clinical-table.tsx` — the dense **columnar clinical table**: sortable columns, zebra,
  status pills, whole-row click-to-expand (native `<table>` + a first-cell keyboard `<button>` carrying
  `aria-expanded`/`aria-controls` + a guarded `<tr>` onClick for whole-row mouse click), pagination cap.
- `src/viewer/fhir-section-columns.tsx` — per-section column definitions + the verbatim status→tone
  mapping (Problems/Medications/Allergies/Orders).
- `src/viewer/fhir-section.tsx` / `fhir-section-list.tsx` — `SectionShell` (header + count + filter) and
  the section composed over `ClinicalTable`.

### Flowsheet (labs/vitals — the most complex, most bug-prone surface)
- `src/viewer/fhir-flowsheet.tsx` — analyte × date matrix: virtualized rows, the fill/scroll column
  layout, whole-column scroll snap, date-window filter, search, per-cell hover card.
- `src/viewer/fhir-flowsheet-layout.ts` — **pure column-layout math** (extracted so it's unit-testable
  without React). Holds the layout invariant. **READ THE INVARIANT BELOW BEFORE TOUCHING THIS.**
- `src/viewer/fhir-trend.tsx` — copied sparkline + trend modal + the per-cell hover card.

### Shell
- `src/viewer/fhir-chart-viewer.tsx` — banner (identity band), horizontal section nav, Dashboard card
  grid, Notes/Social.

---

## Design language — Coda Health Lab

Calm, editorial, clinical-document feel. **Not** a marketing page, **not** a database sheet. Restrained
green accent; amber/red only for genuine clinical severity cues. Off-white background, white panels,
thin hairline borders.

- **Typography:** editorial serif headings (`.serif`), Inter-style body (default sans), JetBrains-mono
  labels/counts/dates (`.mono`). In this standalone the font CSS variables fall back to system stacks
  (Georgia / system-sans / ui-monospace) so the single HTML works offline — see `src/index.css`.
- **Density:** dense but scannable. Tight rows, hairline rules, zebra striping on tables/flowsheet.

### Tokens (the single source of truth is `tailwind.config.js` — use the names, never raw hex)

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#FBFBFA` | page background (off-white) |
| `surface` | `#FFFFFF` | panel/card faces |
| `surface-dim` | `#F5F5F3` | header bands, zebra-ish fills |
| `ink` / `ink-mid` / `ink-light` / `ink-faint` | `#0A0A0A` / `#525252` / `#8A8A8A` / `#A3A3A3` | text scale, darkest → faintest |
| `ok` / `ok-soft` | `#1a6b4a` / `#dde6d4` | the brand green; active/current status; links/accents |
| `warn` / `warn-soft` | `#92400e` / amber tint | high-severity / high-criticality cues |
| `bad` / `bad-soft` | `#b91c1c` / red tint | critical / entered-in-error |
| `info` / `info-soft` | `#2d3e50` / `#e4e8ec` | neutral info |
| `border-hairline` | `rgba(0,0,0,0.08)` | the default thin border everywhere |
| `border-hairline-strong` | `rgba(0,0,0,0.12)` | table-header separators, modal/tooltip edges |
| `rounded-sm` / `rounded` | `8px` / `14px` | small (panels/pills) / large radius |
| `#FAFAF8` | (raw) | the one accepted raw hex: zebra odd-row tint, shared by flowsheet + tables |

**Status-pill tones** (`FhirStatusPill`): `ok` = filled green (active/current), `warn` = filled amber
(high-criticality), `bad` = filled red (entered-in-error), `neutral` = **bordered** muted (resolved/
inactive — bordered not filled, so it stays legible on the zebra/hover backgrounds).

---

## Hard invariants — do not break these

### 1. Flowsheet column layout (this bug recurred 4 times — there is now a regression test guarding it)

In **both** fill and scroll modes the date columns must **tile the visible date band to a WHOLE number
of equal columns** — i.e. `colPx` must evenly divide `freeWidth = frame − nameCol`. This is what makes a
multiple-of-`colPx` `scrollLeft` land a whole column at **both** the left seam and the right frame edge,
so there is never a clipped partial column at the right edge and never a white void when dates are
sparse.

- FILL (real dates ≤ capacity): real columns split the whole band (`freeWidth / real`) → stretch to
  fill the frame, no void, no scroll.
- SCROLL (real > capacity): `colPx = freeWidth / perView` (NOT a fixed floor width — a fixed 80px floor
  does **not** divide 996/1024/1144, which is exactly the clip bug) → `freeWidth` is an exact multiple
  of `colPx`, so every snapped rest shows whole columns.
- The scroll-end snap rounds `scrollLeft` to a multiple of that same `colPx`.

**If you change `computeColumnLayout` in `fhir-flowsheet-layout.ts`, run `npm test`** —
`test/flowsheet-layout.test.ts` asserts the invariant across 168 frame×count combinations and is the
durable guard against this recurring bug. Verify the rendered right edge visually too — measuring
`table-width == frame-width` is NOT sufficient; you must confirm the rightmost column renders whole.

### 2. Zero-judgment fidelity (`fhir-chart.ts`)

Nothing is invented; nothing meaningful is silently dropped. Labels are `code.text ?? coding[0].display
?? raw code`. Values are rendered straight from `value[x]` with the FHIR unit verbatim — never
converted, never computed (no derived age/BMI/ranges except the banner's display-only age). Dedup is
mechanical (group by code, count, keep latest), not a clinical opinion about what's "active". Whatever
can't be placed on a card is **counted** in `chart.unmapped`. If you add a card or field, source it
verbatim from the model; absent → em-dash, never a guess.

### 3. Accessibility on the tables

The ClinicalTable whole-row expand uses a real `<button>` (keyboard + `aria-expanded`/`aria-controls`),
not a bare clickable `<tr>`. Native `<table>`/`<tr>`/`<td>` semantics are kept (a div-grid with
`role=table` was tried and rejected — it flattened rows for screen readers). Don't regress this.

### 4. Identical-everywhere consistency

The same semantic element renders the same on every tab: one section-heading token (ink, identical on
cards and tabs, green accent underline on both), one count chip, one date stamp, one panel border
(`hairline`), one detail-tier size. Don't fork styling per call-site — change the shared primitive.

---

## Principles

1. **Faithful to the data.** This is a *viewer*, not an interpreter. Show what the FHIR says, verbatim;
   make the honest residual visible; never fabricate.
2. **Surgical changes.** Touch only what's asked. No drive-by refactors. Match the surrounding code's
   idiom, comment density, and token usage.
3. **Test happy AND non-happy, always.** Every change gets both: the happy path AND stress/adversarial
   (real-scale exports — 10k+ observations, hundreds of analytes/dates — and malformed FHIR: partial/
   invalid dates, null/NaN values, huge labels, bad base64, missing codes, unicode). The flowsheet bugs
   that recurred came from verifying only the easy case.
4. **Look, don't just measure.** For any UI change, render it and *look* at the result — a passing
   assertion on the wrong property is how a visibly-broken thing ships. Measurement is the companion to
   visual confirmation, not a substitute.
5. **Keep it self-contained.** No backend, no network, no monorepo import. Data never leaves the
   browser — that's a privacy guarantee, not an accident. Don't add an upload, a CDN font, or a server
   call.

---

## Workflow

```bash
npm install
npm run dev          # hot-reload dev server → http://localhost:5173
npm run typecheck    # tsc --noEmit
npm test             # the flowsheet column-layout invariant regression test
npm run build:html   # → dist/index.html, the single shippable file
```

Before committing anything non-trivial: `npm run typecheck`, build, and verify in the browser (load a
FHIR export, click through the changed surface, look at it). For flowsheet/layout changes also confirm
the column-tiling invariant holds at multiple widths and scroll positions, and at real scale.

A faithful single-patient or multi-patient FHIR R4 NDJSON export is the test input. Multiple patients →
a picker. The richest stress input is a real bulk-export patient with thousands of observations.
