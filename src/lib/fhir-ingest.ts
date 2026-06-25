/**
 * FHIR R4 NDJSON ingest + per-patient grouping for the local FHIR chart viewer.
 *
 * Pure, client-safe (no node:fs, no network). Parses dropped `*.ndjson` text into resources and
 * groups them by patient, mirroring the validation shape of the gym's
 * `load_fhir_ndjson_directory` (requires `resourceType` + `id`).
 *
 * ZERO-JUDGMENT posture: this layer only PARSES and GROUPS. It carries every resource verbatim,
 * drops nothing, and makes no clinical decision — grouping is purely by `subject.reference`, a
 * field-driven fact. The downstream translator is where FHIR→viewer field mapping happens.
 */

export type FhirResource = {
  resourceType: string;
  id: string;
  [key: string]: unknown;
};

export type PatientBundle = {
  /** Bare patient key, e.g. "MRN00000001" (normalized from "Patient/MRN00000001"). */
  patientKey: string;
  /** The Patient resource itself, if present in the data. */
  patient: FhirResource | null;
  /** Every resource whose subject is this patient (excludes the Patient resource itself). */
  resources: FhirResource[];
};

export type PatientIndexEntry = {
  patientKey: string;
  /** Composed verbatim from Patient.name[0] when present; null otherwise (e.g. anonymized exports). */
  name: string | null;
  gender: string | null;
  birthDate: string | null;
  /** Per-resourceType counts for this patient, e.g. { Condition: 20, Observation: 66 }. */
  counts: Record<string, number>;
};

export type FhirIngestResult = {
  /** patientKey → bundle. */
  patients: Map<string, PatientBundle>;
  /** Lightweight index for the patient picker (one row per patient). */
  index: PatientIndexEntry[];
  /**
   * Subject-less resources kept available for reference resolution (Practitioner, Organization,
   * Medication, Location, …). NOT shown as chart content; never dropped.
   */
  sharedPool: FhirResource[];
  /** Per-file parse problems surfaced to the user; never silently swallowed. */
  warnings: string[];
};

/** A single parseable source file: its name plus its raw NDJSON text. */
export type FhirSourceFile = { name: string; text: string };

/** True when a value is a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate one parsed line as a FHIR resource. Mirrors the gym loader: must be a JSON object with a
 * non-empty `resourceType` and `id`. Returns the resource or an error string.
 */
function validateResource(parsed: unknown): FhirResource | string {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'resource is not a JSON object';
  }
  const record = parsed as Record<string, unknown>;
  if (!isNonEmptyString(record.resourceType)) return 'missing resourceType';
  if (!isNonEmptyString(record.id)) return `missing id on ${String(record.resourceType)}`;
  return record as FhirResource;
}

/**
 * Normalize a subject/patient reference to its bare key: "Patient/MRN00000001" → "MRN00000001".
 * A reference with no slash is returned as-is. Returns null for absent/blank.
 */
function normalizePatientKey(reference: unknown): string | null {
  if (!isNonEmptyString(reference)) return null;
  const trimmed = reference.trim();
  const slash = trimmed.lastIndexOf('/');
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/** Pull the patient key a resource belongs to from `subject.reference` (or `patient.reference`). */
function subjectKeyOf(resource: FhirResource): string | null {
  const subject = resource.subject as { reference?: unknown } | undefined;
  const fromSubject = normalizePatientKey(subject?.reference);
  if (fromSubject) return fromSubject;
  const patient = resource.patient as { reference?: unknown } | undefined;
  return normalizePatientKey(patient?.reference);
}

/** Compose a display name from Patient.name[0], verbatim. Null when absent (anonymized exports). */
function patientDisplayName(patient: FhirResource | null): string | null {
  if (!patient) return null;
  const names = patient.name as Array<{ text?: unknown; family?: unknown; given?: unknown }> | undefined;
  const first = Array.isArray(names) ? names[0] : undefined;
  if (!first) return null;
  if (isNonEmptyString(first.text)) return first.text.trim();
  const given = Array.isArray(first.given) ? first.given.filter(isNonEmptyString).join(' ') : '';
  const family = isNonEmptyString(first.family) ? first.family.trim() : '';
  const composed = [given, family].filter(Boolean).join(' ').trim();
  return composed || null;
}

/**
 * Parse + group dropped FHIR NDJSON files into per-patient bundles.
 *
 * - One JSON object per non-blank line; blank lines skipped; bad lines recorded as warnings (never
 *   silently dropped) and skipped.
 * - A `Patient` resource keys on its own id; every other resource keys on its `subject.reference`.
 * - Subject-less, non-Patient resources go to `sharedPool` (kept for reference resolution).
 */
export function ingestFhirNdjson(files: FhirSourceFile[]): FhirIngestResult {
  const patients = new Map<string, PatientBundle>();
  const sharedPool: FhirResource[] = [];
  const warnings: string[] = [];

  const ensureBundle = (patientKey: string): PatientBundle => {
    let bundle = patients.get(patientKey);
    if (!bundle) {
      bundle = { patientKey, patient: null, resources: [] };
      patients.set(patientKey, bundle);
    }
    return bundle;
  };

  for (const file of files) {
    const lines = file.text.split('\n');
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        warnings.push(`${file.name}:${idx + 1} — invalid JSON, skipped`);
        return;
      }
      const validated = validateResource(parsed);
      if (typeof validated === 'string') {
        warnings.push(`${file.name}:${idx + 1} — ${validated}, skipped`);
        return;
      }
      const resource = validated;

      if (resource.resourceType === 'Patient') {
        const bundle = ensureBundle(resource.id);
        if (bundle.patient) {
          warnings.push(`duplicate Patient ${resource.id} — keeping the first`);
        } else {
          bundle.patient = resource;
        }
        return;
      }

      const key = subjectKeyOf(resource);
      if (!key) {
        // Subject-less resource (Practitioner, Organization, Medication, Location, …) — keep for
        // reference resolution, never shown as chart content, never dropped.
        sharedPool.push(resource);
        return;
      }
      ensureBundle(key).resources.push(resource);
    });
  }

  const index: PatientIndexEntry[] = [];
  for (const bundle of patients.values()) {
    const counts: Record<string, number> = {};
    for (const r of bundle.resources) {
      counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
    }
    if (bundle.patient) counts.Patient = (counts.Patient ?? 0) + 1;
    index.push({
      patientKey: bundle.patientKey,
      name: patientDisplayName(bundle.patient),
      gender: isNonEmptyString(bundle.patient?.gender) ? (bundle.patient!.gender as string) : null,
      birthDate: isNonEmptyString(bundle.patient?.birthDate) ? (bundle.patient!.birthDate as string) : null,
      counts,
    });
  }
  index.sort((a, b) => a.patientKey.localeCompare(b.patientKey));

  return { patients, index, sharedPool, warnings };
}
