
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import {
  ingestFhirNdjson,
  type FhirIngestResult,
  type FhirSourceFile,
  type PatientIndexEntry,
} from './lib/fhir-ingest';
import { buildFhirChart } from './lib/fhir-chart';
import { FhirChartViewer } from './viewer/fhir-chart-viewer';

// Minimal typings for the non-standard (but universally supported in Chromium/WebKit) directory-entry
// API used to read a DROPPED FOLDER recursively. `dataTransfer.files` is empty for folder drops.
type FsFileEntry = FileSystemEntry & { file: (cb: (f: File) => void, err?: (e: unknown) => void) => void };
type FsDirEntry = FileSystemEntry & {
  createReader: () => { readEntries: (cb: (entries: FileSystemEntry[]) => void, err?: (e: unknown) => void) => void };
};

/** Recursively walk dropped directory/file entries into a flat File[] (folder drop → all nested files). */
async function collectFilesFromEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FsFileEntry).file(resolve, reject));
      out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FsDirEntry).createReader();
      // readEntries returns at most ~100 entries per call — loop until it returns an empty batch.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (batch.length === 0) break;
        for (const child of batch) await visit(child);
      }
    }
  };
  for (const entry of entries) await visit(entry);
  return out;
}

/**
 * Local FHIR chart viewer client. Drop a FHIR R4 export (its `resources/*.ndjson` files) → the files
 * are read + parsed + built into a compact EHR chart model ENTIRELY in the browser → rendered through
 * the purpose-built compact <FhirChartViewer> (OpenEMR-style cards, Coda skin). No server fs, no
 * backend, no env path. Self-contained — no `clinical-entry`/`cases` imports.
 *
 * One patient → opens the chart directly. Several → a lightweight index → click to open one.
 */
export function FhirChartProofClient() {
  const [ingest, setIngest] = useState<FhirIngestResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      const ndjson = files.filter(f => f.name.endsWith('.ndjson') || f.name.endsWith('.json'));
      if (!ndjson.length) {
        setError('No .ndjson files found. Drop a FHIR export folder (or its resources/*.ndjson files).');
        setBusy(false);
        return;
      }
      const sources: FhirSourceFile[] = await Promise.all(
        ndjson.map(async f => ({ name: f.name, text: await f.text() })),
      );
      const result = ingestFhirNdjson(sources);
      if (result.patients.size === 0) {
        setError('No patients found in the dropped files.');
        setBusy(false);
        return;
      }
      setIngest(result);
      setSelected(result.index.length === 1 ? result.index[0].patientKey : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the dropped files.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      // A FOLDER drop puts nothing in `dataTransfer.files` — the folder arrives as a DataTransferItem
      // whose `webkitGetAsEntry()` is a directory we must walk recursively. Plain FILE drops still
      // populate `.files`. Prefer the entry walk (covers both folders and files); fall back to `.files`.
      const entries = Array.from(e.dataTransfer.items)
        .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter((entry): entry is FileSystemEntry => entry !== null);
      let files: File[];
      if (entries.length > 0) {
        setBusy(true);
        files = await collectFilesFromEntries(entries);
      } else {
        files = Array.from(e.dataTransfer.files);
      }
      await loadFiles(files);
    },
    [loadFiles],
  );

  const reset = useCallback(() => {
    setIngest(null);
    setSelected(null);
    setError(null);
  }, []);

  if (ingest && selected) {
    const bundle = ingest.patients.get(selected)!;
    return (
      <PatientChart
        key={selected}
        bundle={bundle}
        warnings={ingest.warnings}
        onBack={ingest.index.length > 1 ? () => setSelected(null) : reset}
        backLabel={ingest.index.length > 1 ? '← All patients' : '← Load another export'}
      />
    );
  }

  if (ingest && !selected) {
    return <PatientIndex index={ingest.index} onPick={setSelected} onReset={reset} warnings={ingest.warnings} />;
  }

  return (
    <ProofChrome>
      <button
        type="button"
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('fhir-file-input')?.click()}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-sm border border-dashed px-8 py-20 text-center transition-colors ${
          dragOver ? 'border-ok bg-ok-soft/40' : 'border-hairline-strong bg-surface'
        }`}
      >
        <p className="serif text-xl text-ink">Drop a FHIR export here</p>
        <p className="text-sm text-ink-mid">A folder of <code className="mono">resources/*.ndjson</code> files (or select them)</p>
        {busy && <p className="mono text-xs text-ink-faint">Reading…</p>}
        {error && <p className="text-sm text-warn">{error}</p>}
      </button>
      <input
        id="fhir-file-input"
        type="file"
        multiple
        accept=".ndjson,.json"
        // @ts-expect-error — non-standard directory-select attribute, supported in Chromium/WebKit.
        webkitdirectory=""
        className="hidden"
        onChange={e => { void loadFiles(Array.from(e.target.files ?? [])); }}
      />
    </ProofChrome>
  );
}

function PatientChart({
  bundle,
  warnings,
  onBack,
  backLabel,
}: {
  bundle: NonNullable<ReturnType<FhirIngestResult['patients']['get']>>;
  warnings: string[];
  onBack: () => void;
  backLabel: string;
}) {
  const chart = useMemo(() => buildFhirChart(bundle), [bundle]);

  return (
    <main className="min-h-dvh bg-bg p-6">
      <div className="mx-auto max-w-7xl">
        <button type="button" onClick={onBack} className="mono mb-3 text-xs uppercase tracking-widest text-ink-faint hover:text-ink">
          {backLabel}
        </button>
        {warnings.length > 0 && (
          <details className="mb-3 rounded-sm border border-hairline bg-surface px-3 py-2 text-xs text-ink-mid">
            <summary className="cursor-pointer">{warnings.length} parse notice{warnings.length === 1 ? '' : 's'}</summary>
            <ul className="mono mt-2 space-y-1">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        )}
        <FhirChartViewer chart={chart} />
      </div>
    </main>
  );
}

function PatientIndex({
  index,
  onPick,
  onReset,
  warnings,
}: {
  index: PatientIndexEntry[];
  onPick: (key: string) => void;
  onReset: () => void;
  warnings: string[];
}) {
  return (
    <ProofChrome lead={`${index.length} patients in this export. Pick one to open the chart.`}>
      {warnings.length > 0 && <p className="mono mb-3 text-xs text-ink-faint">{warnings.length} parse notice(s)</p>}
      <ul className="divide-y divide-hairline rounded-sm border border-hairline bg-surface">
        {index.map(p => (
          <li key={p.patientKey}>
            <button
              type="button"
              onClick={() => onPick(p.patientKey)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-bg"
            >
              <span className="flex flex-col">
                <span className="text-ink">{p.name ?? p.patientKey}</span>
                <span className="mono text-xs text-ink-faint">
                  {[p.patientKey, p.gender, p.birthDate ? `DOB ${p.birthDate}` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="mono text-xs text-ink-faint">
                {Object.entries(p.counts).filter(([k]) => k !== 'Patient').map(([k, n]) => `${n} ${k}`).join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onReset} className="mono mt-4 text-xs uppercase tracking-widest text-ink-faint hover:text-ink">
        ← Load another export
      </button>
    </ProofChrome>
  );
}

function ProofChrome({ children, lead }: { children: React.ReactNode; lead?: string }) {
  return (
    <main className="min-h-dvh bg-bg p-6">
      <div className="mx-auto max-w-3xl">
        <p className="mono mb-1 text-[0.6rem] uppercase tracking-widest text-ink-faint">Coda Health Lab · FHIR chart viewer</p>
        <h1 className="serif mb-4 text-3xl text-ink">Patient chart</h1>
        {lead && <p className="mb-6 max-w-2xl text-sm text-ink-mid">{lead}</p>}
        {children}
      </div>
    </main>
  );
}
