# Coda FHIR Viewer

A standalone, single-file viewer for **FHIR R4 patient data**. Drop a FHIR NDJSON export and it
renders a compact, EHR-style patient chart — banner, problems, medications, allergies, orders, notes,
social history, and a labs/vitals flowsheet with trends.

**Everything runs in your browser.** Your data is never uploaded — there is no server, no database, no
network call. The file works fully offline.

---

## Just want to use it? (no install)

Open **`coda-fhir-viewer.html`** (the pre-built single file) by double-clicking it. It opens in any
modern browser. Then drag a FHIR export folder (its `resources/*.ndjson` files) onto the drop zone.

That's it — no Node, no npm, no terminal, no internet required.

---

## What it shows

- **Patient banner** — name, MRN, sex, DOB (with age), race, drawn verbatim from the export.
- **Dashboard** — a multi-column summary of allergies, problems, medications, and more.
- **Columnar tabs** — Allergies / Problems / Medications / Orders as dense, sortable clinical tables
  with status pills; click any row to expand its full field detail.
- **Notes & Social** — document notes (expand to the full text) and social history.
- **Labs / Vitals flowsheet** — an analyte × date matrix: sparse dates fill the width, dense histories
  scroll; hover a cell for a value/date/delta card; click an analyte for a trend chart.

It is **zero-judgment**: labels and values are shown verbatim from the FHIR; duplicates are collapsed
mechanically (by clinical code, keeping the latest with an occurrence count); nothing meaningful is
dropped, and any resource it can't place on a card is honestly counted as a residual.

### Input format

A FHIR R4 **bulk-export** style set of NDJSON files — one resource per line, grouped per resource type
(`Patient.ndjson`, `Observation.ndjson`, `Condition.ndjson`, …). Drop the folder, or select the files.
Multiple patients in one export are fine — you'll get a picker.

---

## Build it yourself (developers)

```bash
npm install
npm run dev        # local dev server with hot reload → http://localhost:5173
npm run build:html # builds and refreshes coda-fhir-viewer.html
```

`npm run build:html` inlines all JS + CSS into `dist/index.html` (via `vite-plugin-singlefile`) and
then copies it to the repository root as **`coda-fhir-viewer.html`**. Treat `dist/index.html` as the
intermediate build output; **`coda-fhir-viewer.html` is the distributable file to share/open**.

---

## Privacy

The viewer reads dropped files with the browser File API and parses them in memory. No data leaves the
page. Closing the tab discards everything. Suitable for viewing sensitive clinical exports on your own
machine without sending them anywhere.
