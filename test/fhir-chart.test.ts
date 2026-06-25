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
  const vitalCategory = [
    { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
  ];
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

test('the Patient subject is not counted as an unmapped resource', () => {
  const chart = buildFhirChart(bundleOf());
  assert.equal(chart.unmapped['Patient'], undefined);
});
