/**
 * Zero-judgment fidelity regression proofs for buildFhirChart — guarding the two invariants that an
 * independent audit found broken:
 *
 *   1. A categorized lab/vital Observation with NO value[x] (and no valued component) must be COUNTED
 *      in chart.unmapped, never silently dropped from the flowsheet.
 *   2. Resources with NEITHER a code NOR text must stay DISTINCT (one row each), never collapse into a
 *      single shared "Unlabeled" row — collapsing them asserts they are the same thing, a judgment this
 *      viewer must not make.
 *
 * Plus positive controls: coded duplicates still dedupe + count, and valued observations still render.
 *
 * Run: `npm test`
 */
import assert from 'node:assert';
import { test } from 'node:test';
import { buildFhirChart } from '../src/lib/fhir-chart.ts';
import type { PatientBundle } from '../src/lib/fhir-ingest.ts';

const patient = { resourceType: 'Patient', id: 'P', name: [{ family: 'Test' }] };
const bundleOf = (...resources: object[]): PatientBundle => ({
  patientKey: 'P',
  patient,
  resources: [patient, ...resources],
});

const labCategory = [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] },
];
const vitalCategory = [
  { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
];

test('value-less categorized Observation is counted in unmapped, not silently dropped', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'o1', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2025-01-01', valueQuantity: { value: 140, unit: 'mmol/L' } },
      // Categorized laboratory, but NO value[x] at all — must NOT vanish.
      { resourceType: 'Observation', id: 'o2', category: labCategory, code: { text: 'Potassium' }, effectiveDateTime: '2025-01-01' },
    ),
  );
  // Only the valued analyte renders a row.
  assert.deepEqual(chart.labs.rows.map(r => r.label), ['Sodium']);
  // The value-less one is accounted as residual.
  assert.equal(chart.unmapped['Observation (laboratory, no value)'], 1);
});

test('value-less vital-sign Observation is counted under its own residual label', () => {
  const chart = buildFhirChart(
    bundleOf({ resourceType: 'Observation', id: 'v1', category: vitalCategory, code: { text: 'Heart rate' }, effectiveDateTime: '2025-01-01' }),
  );
  assert.equal(chart.vitals.rows.length, 0);
  assert.equal(chart.unmapped['Observation (vital-signs, no value)'], 1);
});

test('code-less, text-less resources stay distinct (no collapse into one Unlabeled row)', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Procedure', id: 'p1', code: {}, performedDateTime: '2025-01-01', status: 'completed' },
      { resourceType: 'Procedure', id: 'p2', code: {}, performedDateTime: '2025-02-01', status: 'completed' },
    ),
  );
  // Two distinct un-coded procedures → two rows, each count 1 (NOT one row with count 2).
  assert.equal(chart.ordersAndProcedures.length, 2);
  assert.ok(chart.ordersAndProcedures.every(r => r.count === 1), 'each un-coded resource keeps count 1');
});

test('code-less resources WITH text still group by text', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Condition', id: 'c1', code: { text: 'Free-text problem' }, onsetDateTime: '2025-01-01' },
      { resourceType: 'Condition', id: 'c2', code: { text: 'Free-text problem' }, onsetDateTime: '2025-02-01' },
    ),
  );
  // Same text ⇒ one grouped row, count 2 (text is a legitimate grouping key).
  assert.equal(chart.problems.length, 1);
  assert.equal(chart.problems[0].count, 2);
});

test('coded duplicates still dedupe by code and count occurrences', () => {
  const coded = (id: string, onset: string) => ({
    resourceType: 'Condition',
    id,
    code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10', display: 'Essential hypertension' }] },
    onsetDateTime: onset,
  });
  const chart = buildFhirChart(bundleOf(coded('a', '2020-01-01'), coded('b', '2021-01-01'), coded('c', '2019-01-01')));
  assert.equal(chart.problems.length, 1);
  assert.equal(chart.problems[0].count, 3);
  assert.equal(chart.problems[0].label, 'Essential hypertension');
  // Latest onset is kept as the row's date.
  assert.equal(chart.problems[0].lastDate, '2021-01-01');
});

test('lab flowsheet maps catalog groups, orders mapped rows by source catalog, and keeps unmapped rows visible', () => {
  const codedLab = (id: string, code: string, display: string) => ({
    resourceType: 'Observation',
    id,
    category: labCategory,
    code: { coding: [{ system: 'http://loinc.org', code, display }] },
    effectiveDateTime: '2025-01-01',
    valueQuantity: { value: 1, unit: 'x' },
  });
  const chart = buildFhirChart(
    bundleOf(
      codedLab('calcium', '17861-6', 'Calcium, Ser/Plas'),
      codedLab('ldl', '2089-1', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay'),
      { resourceType: 'Observation', id: 'poct', category: labCategory, code: { text: 'POCT Comment' }, effectiveDateTime: '2025-01-01', valueString: 'Comment' },
      codedLab('hgb', '718-7', 'Hemoglobin'),
    ),
  );

  assert.deepEqual(chart.labs.rows.map(r => r.label), [
    'Hemoglobin',
    'Calcium, Ser/Plas',
    'Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay',
    'POCT Comment',
  ]);
  assert.equal(chart.labs.rows[0].labGroup?.categoryLabel, 'Hematology');
  assert.equal(chart.labs.rows[0].labGroup?.familyLabel, 'Complete Blood Count (CBC)');
  assert.equal(chart.labs.rows[1].labGroup?.categoryLabel, 'Chemistries');
  assert.equal(chart.labs.rows[1].labGroup?.familyLabel, 'Basic Metabolic Panel (BMP)');
  assert.equal(chart.labs.rows[2].labGroup?.categoryLabel, 'Cardiac Tests');
  assert.equal(chart.labs.rows[2].labGroup?.familyLabel, 'Lipid Panel');
  assert.equal(chart.labs.rows[2].labGroup?.entryLabel, 'Low Density Lipoprotein');
  assert.equal(chart.labs.rows[3].labGroup, null);
});

test('lab flowsheet keeps same-calendar-date different-time observations as separate columns', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'na-am', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 139, unit: 'mmol/L' } },
      { resourceType: 'Observation', id: 'na-pm', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T16:00:00Z', valueQuantity: { value: 141, unit: 'mmol/L' } },
    ),
  );
  const row = chart.labs.rows.find(r => r.label === 'Sodium')!;

  assert.deepEqual(chart.labs.dateKeys, ['2024-01-02T08:00:00Z', '2024-01-02T16:00:00Z']);
  assert.deepEqual(row.cells, {
    '2024-01-02T08:00:00Z': '139',
    '2024-01-02T16:00:00Z': '141',
  });
  assert.deepEqual(row.numeric, [
    { dateKey: '2024-01-02T08:00:00Z', value: 139 },
    { dateKey: '2024-01-02T16:00:00Z', value: 141 },
  ]);
  assert.equal(chart.labs.events.length, 2);
});

test('vital flowsheet keeps same-calendar-date different-time observations as separate columns', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'hr-am', category: vitalCategory, code: { text: 'Heart rate' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 68, unit: '/min' } },
      { resourceType: 'Observation', id: 'hr-pm', category: vitalCategory, code: { text: 'Heart rate' }, effectiveDateTime: '2024-01-02T20:00:00Z', valueQuantity: { value: 74, unit: '/min' } },
    ),
  );
  const row = chart.vitals.rows.find(r => r.label === 'Heart rate')!;

  assert.deepEqual(chart.vitals.dateKeys, ['2024-01-02T08:00:00Z', '2024-01-02T20:00:00Z']);
  assert.deepEqual(row.cells, {
    '2024-01-02T08:00:00Z': '68',
    '2024-01-02T20:00:00Z': '74',
  });
  assert.deepEqual(row.numeric, [
    { dateKey: '2024-01-02T08:00:00Z', value: 68 },
    { dateKey: '2024-01-02T20:00:00Z', value: 74 },
  ]);
  assert.equal(chart.vitals.events.length, 2);
});

test('same-day intraday observations sort chronologically across days', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'late', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-01T23:00:00Z', valueQuantity: { value: 138, unit: 'mmol/L' } },
      { resourceType: 'Observation', id: 'am', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 139, unit: 'mmol/L' } },
      { resourceType: 'Observation', id: 'pm', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T16:00:00Z', valueQuantity: { value: 141, unit: 'mmol/L' } },
    ),
  );

  assert.deepEqual(chart.labs.dateKeys, [
    '2024-01-01T23:00:00Z',
    '2024-01-02T08:00:00Z',
    '2024-01-02T16:00:00Z',
  ]);
});

test('exact same timestamp with different values gets a collision-suffixed second column', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'na-a', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 139, unit: 'mmol/L' } },
      { resourceType: 'Observation', id: 'na-b', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 141, unit: 'mmol/L' } },
    ),
  );
  const row = chart.labs.rows.find(r => r.label === 'Sodium')!;

  assert.deepEqual(chart.labs.dateKeys, ['2024-01-02T08:00:00Z', '2024-01-02T08:00:00Z·2']);
  assert.deepEqual(row.cells, {
    '2024-01-02T08:00:00Z': '139',
    '2024-01-02T08:00:00Z·2': '141',
  });
  assert.equal(chart.labs.events.length, 2);
});

test('exact same timestamp with identical value collapses the cell but retains both events', () => {
  const chart = buildFhirChart(
    bundleOf(
      { resourceType: 'Observation', id: 'na-a', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 139, unit: 'mmol/L' } },
      { resourceType: 'Observation', id: 'na-b', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2024-01-02T08:00:00Z', valueQuantity: { value: 139, unit: 'mmol/L' } },
    ),
  );
  const row = chart.labs.rows.find(r => r.label === 'Sodium')!;

  assert.deepEqual(chart.labs.dateKeys, ['2024-01-02T08:00:00Z']);
  assert.deepEqual(row.cells, { '2024-01-02T08:00:00Z': '139' });
  assert.equal(chart.labs.events.length, 2);
});

test('the Patient subject is not counted as an unmapped resource', () => {
  const chart = buildFhirChart(bundleOf());
  assert.equal(chart.unmapped['Patient'], undefined);
});
