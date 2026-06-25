
import { useCallback, useMemo, useState, type DragEvent } from 'react';
import {
  ingestFhirNdjson,
  type FhirIngestResult,
  type FhirSourceFile,
  type PatientIndexEntry,
} from './lib/fhir-ingest';
import { buildFhirChart } from './lib/fhir-chart';
import { FhirChartViewer } from './viewer/fhir-chart-viewer';

// Reading a DROPPED FOLDER recursively (`dataTransfer.files` is empty for folder drops) has two APIs:
//
//  • PRIMARY — File System Access: `DataTransferItem.getAsFileSystemHandle()` returns a FileSystemHandle
//    that is NOT bound to the drag data store, so it stays valid after the drop event yields. This is the
//    correct, hang-proof path. Chromium/Edge only.
//  • FALLBACK — legacy entries: `DataTransferItem.webkitGetAsEntry()` returns a FileSystemEntry whose
//    reads (`readEntries`/`file`) are bound to the drag data store; once the drop handler yields, the
//    store goes "protected" and a deferred read can invoke NEITHER callback → a bare Promise hangs
//    forever ("Reading…"). Used only where the handle API is missing (Safari/Firefox), with a timeout so
//    a stalled read fails loudly instead of hanging.

// --- File System Access handles (primary) ---
type FsFileHandle = { kind: 'file'; getFile: () => Promise<File> };
type FsDirHandle = { kind: 'directory'; values: () => AsyncIterable<FsHandle> };
type FsHandle = FsFileHandle | FsDirHandle;
type ItemWithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FsHandle | null> };

/** Recursively collect every File under a dropped File System Access handle (handles survive the yield). */
async function collectFilesFromHandle(handle: FsHandle): Promise<File[]> {
  if (handle.kind === 'file') return [await handle.getFile()];
  const out: File[] = [];
  for await (const child of handle.values()) out.push(...(await collectFilesFromHandle(child)));
  return out;
}

// --- Legacy directory entries (fallback) ---
type FsFileEntry = FileSystemEntry & { file: (cb: (f: File) => void, err?: (e: unknown) => void) => void };
type FsDirEntry = FileSystemEntry & {
  createReader: () => { readEntries: (cb: (entries: FileSystemEntry[]) => void, err?: (e: unknown) => void) => void };
};

/**
 * Wrap a legacy callback-style entry read in a Promise THAT CANNOT HANG FOREVER. On the fallback path the
 * captured entry can be invalidated once the drop event yields, and the read may then invoke NEITHER its
 * success nor its error callback — a bare `new Promise` would stay pending forever, freezing "Reading…".
 * Racing each read against a timeout converts that silent hang into a catchable error the caller surfaces.
 */
function entryRead<T>(run: (resolve: (v: T) => void, reject: (e: unknown) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Reading the dropped folder stalled. Try clicking the box to pick the folder instead.')),
      10_000,
    );
    run(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Drain ONE directory fully in a single self-contained promise: `readEntries` returns ≤100 entries per
 * call and must be re-invoked until it returns an empty batch. Re-arming inside the success callback (not
 * behind an outer `await`) keeps the whole pagination within one continuation, the most resilient legacy
 * shape against the protected-mode invalidation. Guarded by a timeout so a stalled read fails loudly.
 */
function readAllEntries(reader: ReturnType<FsDirEntry['createReader']>): Promise<FileSystemEntry[]> {
  return entryRead<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const pump = () =>
      reader.readEntries(batch => {
        if (batch.length === 0) { resolve(all); return; }
        all.push(...batch);
        pump(); // re-arm immediately, no outer await between batches of the same reader.
      }, reject);
    pump();
  });
}

/** Recursively walk dropped directory/file entries into a flat File[] (folder drop → all nested files). */
async function collectFilesFromEntries(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await entryRead<File>((resolve, reject) => (entry as FsFileEntry).file(resolve, reject));
      out.push(file);
      return;
    }
    if (entry.isDirectory) {
      const children = await readAllEntries((entry as FsDirEntry).createReader());
      for (const child of children) await visit(child);
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
      // The whole export is read into memory and parsed synchronously, so an accidental or hostile
      // multi-gigabyte drop could lock the tab. Warn (never silently refuse) past a generous threshold
      // — a real single- or multi-patient export is far smaller — and let the user opt in explicitly.
      const totalBytes = ndjson.reduce((sum, f) => sum + f.size, 0);
      const LARGE_INPUT_BYTES = 250 * 1024 * 1024; // 250 MB
      if (totalBytes > LARGE_INPUT_BYTES) {
        const gb = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);
        const proceed = window.confirm(
          `This is a large drop (${ndjson.length} files, ~${gb} GB). It is read entirely into memory and ` +
            `may freeze the browser for a while. Continue?`,
        );
        if (!proceed) {
          setBusy(false);
          return;
        }
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

      // READ THE DRAG DATA STORE SYNCHRONOUSLY, BEFORE ANY `await`. Once the drop handler yields, the
      // browser reverts the drag data store to "protected mode" and its items go invalid — so everything
      // we need from `dataTransfer` must be PULLED OUT now, while it is still live:
      //   • handlePromises — `getAsFileSystemHandle()` returns a Promise we kick off now; the resulting
      //     handle is NOT bound to the drag store, so awaiting + recursing it later is safe (primary).
      //   • entries        — legacy `webkitGetAsEntry()` directory entries (fallback, Safari/Firefox).
      //   • plainFiles     — a plain multi-FILE drop populates `dataTransfer.files` directly.
      const items = Array.from(e.dataTransfer.items);
      const handlePromises = items.every(it => typeof (it as ItemWithHandle).getAsFileSystemHandle === 'function')
        ? items.map(it => (it as ItemWithHandle).getAsFileSystemHandle!())
        : null;
      const entries = items
        .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter((entry): entry is FileSystemEntry => entry !== null);
      const plainFiles = Array.from(e.dataTransfer.files);

      // The whole drop is handled under ONE try/finally so the "Reading…" busy flag is ALWAYS cleared
      // and any failure surfaces as an error instead of an unhandled rejection that strands "Reading…".
      setBusy(true);
      setError(null);
      try {
        let files: File[];
        if (handlePromises) {
          // Primary: File System Access handles — survive the event yield, so no hang is possible.
          const handles = (await Promise.all(handlePromises)).filter((h): h is FsHandle => h !== null);
          files = (await Promise.all(handles.map(collectFilesFromHandle))).flat();
        } else if (entries.length > 0) {
          files = await collectFilesFromEntries(entries); // Fallback: legacy entries (timeout-guarded).
        } else {
          files = plainFiles;
        }
        await loadFiles(files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read the dropped folder.');
      } finally {
        setBusy(false);
      }
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
