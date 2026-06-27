import assert from 'node:assert';
import { test } from 'node:test';
import { buildFhirChart } from '../src/lib/fhir-chart.ts';
import type { PatientBundle } from '../src/lib/fhir-ingest.ts';
import { buildFhirTimelineEntries, firstNoteLine, noteSummaryLine } from '../src/lib/fhir-timeline.ts';

const patient = { resourceType: 'Patient', id: 'P', name: [{ family: 'Timeline' }] };
const bundleOf = (...resources: object[]): PatientBundle => ({
  patientKey: 'P',
  patient,
  resources: [patient, ...resources],
});

const labCategory = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }];
const vitalCategory = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }];
const socialCategory = [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'social-history' }] }];

test('FHIR timeline spans every dated chart family without plotting undated rows', () => {
  const chart = buildFhirChart(bundleOf(
    { resourceType: 'Condition', id: 'c1', code: { text: 'Hypertension' }, onsetDateTime: '2022-01-04' },
    { resourceType: 'AllergyIntolerance', id: 'a1', code: { text: 'Penicillin' }, recordedDate: '2022-01-05', clinicalStatus: { text: 'active' } },
    { resourceType: 'Condition', id: 'c2', code: { text: 'Undated problem' } },
    { resourceType: 'MedicationRequest', id: 'm1', medicationCodeableConcept: { text: 'Lisinopril' }, authoredOn: '2022-02-03' },
    { resourceType: 'Observation', id: 'v1', category: vitalCategory, code: { text: 'Heart rate' }, effectiveDateTime: '2022-03-01T09:00:00Z', valueQuantity: { value: 72, unit: '/min' } },
    { resourceType: 'Observation', id: 'l1', category: labCategory, code: { text: 'Sodium' }, effectiveDateTime: '2022-04-02', valueQuantity: { value: 140, unit: 'mmol/L' } },
    { resourceType: 'Procedure', id: 'p1', code: { text: 'Appendectomy' }, performedDateTime: '2022-05-06', status: 'completed' },
    {
      resourceType: 'DocumentReference',
      id: 'n1',
      type: { text: 'Progress Note' },
      date: '2022-06-07T12:00:00Z',
      author: [{ display: 'Dr. Timeline' }],
      content: [{ attachment: { contentType: 'text/plain', data: 'Rmlyc3QgbGluZQoKU2Vjb25kIGxpbmU=' } }],
    },
    { resourceType: 'Observation', id: 's1', category: socialCategory, code: { text: 'Tobacco use' }, effectiveDateTime: '2022-07-08', valueString: 'Never smoker' },
  ));

  const entries = buildFhirTimelineEntries(chart);
  const families = new Set(entries.map(entry => entry.family));
  assert.deepEqual([...families], ['problems', 'allergies', 'medications', 'vitals', 'labs', 'orders', 'notes', 'social']);
  assert.ok(!entries.some(entry => entry.allLines.some(line => line.includes('Undated problem'))));
  assert.equal(entries.find(entry => entry.family === 'labs')?.summaryLines[0], 'Sodium: 140 mmol/L');
  assert.equal(entries.find(entry => entry.family === 'vitals')?.totalCount, 1);
});

test('deduped list rows retain every dated occurrence for timeline chronology', () => {
  const chart = buildFhirChart(bundleOf(
    {
      resourceType: 'Condition',
      id: 'c-old',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }] },
      onsetDateTime: '2020-01-02',
      clinicalStatus: { text: 'active' },
    },
    {
      resourceType: 'Condition',
      id: 'c-new',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertension' }] },
      onsetDateTime: '2023-04-05',
      clinicalStatus: { text: 'active' },
    },
  ));

  assert.equal(chart.problems.length, 1);
  assert.equal(chart.problems[0].count, 2);
  assert.deepEqual(chart.problems[0].occurrences.map(occurrence => occurrence.date), ['2023-04-05', '2020-01-02']);

  const problemEntries = buildFhirTimelineEntries(chart).filter(entry => entry.family === 'problems');
  assert.deepEqual(problemEntries.map(entry => entry.dateKey), ['2020-01-02', '2023-04-05']);
  assert.deepEqual(problemEntries.map(entry => entry.totalCount), [1, 1]);
});

test('lab timeline day-buckets intraday measurement events without dropping counts', () => {
  const chart = buildFhirChart(bundleOf(
    {
      resourceType: 'Observation',
      id: 'sodium-am',
      category: labCategory,
      code: { text: 'Sodium', coding: [{ system: 'http://loinc.org', code: '2951-2', display: 'Sodium' }] },
      effectiveDateTime: '2024-01-02T08:00:00Z',
      valueQuantity: { value: 139, unit: 'mmol/L' },
    },
    {
      resourceType: 'Observation',
      id: 'sodium-pm',
      category: labCategory,
      code: { text: 'Sodium', coding: [{ system: 'http://loinc.org', code: '2951-2', display: 'Sodium' }] },
      effectiveDateTime: '2024-01-02T16:00:00Z',
      valueQuantity: { value: 141, unit: 'mmol/L' },
    },
  ));

  const labEntries = buildFhirTimelineEntries(chart).filter(entry => entry.family === 'labs');
  assert.equal(chart.labs.events.length, 2);
  assert.equal(labEntries.length, 1);
  assert.equal(labEntries[0].dateKey, '2024-01-02');
  assert.equal(labEntries[0].totalCount, 2);
  assert.deepEqual(labEntries[0].allLines, ['Sodium: 139 mmol/L', 'Sodium: 141 mmol/L']);
  assert.deepEqual(labEntries[0].detail?.groups[0].items, [
    { name: 'Sodium', value: '139', unit: 'mmol/L' },
    { name: 'Sodium', value: '141', unit: 'mmol/L' },
  ]);
});

test('vital timeline counts one multi-component Observation as one event', () => {
  const chart = buildFhirChart(bundleOf({
    resourceType: 'Observation',
    id: 'bp',
    category: vitalCategory,
    code: { text: 'Blood pressure', coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
    effectiveDateTime: '2024-01-02T09:00:00Z',
    component: [
      { code: { text: 'Systolic blood pressure' }, valueQuantity: { value: 128, unit: 'mmHg' } },
      { code: { text: 'Diastolic blood pressure' }, valueQuantity: { value: 76, unit: 'mmHg' } },
    ],
  }));

  const vitalEntry = buildFhirTimelineEntries(chart).find(entry => entry.family === 'vitals');
  assert.equal(chart.vitals.events.length, 1);
  assert.equal(vitalEntry?.dateKey, '2024-01-02');
  assert.equal(vitalEntry?.totalCount, 1);
  assert.equal(vitalEntry?.allLines[0], 'Blood pressure: Systolic blood pressure: 128 mmHg; Diastolic blood pressure: 76 mmHg');
  assert.deepEqual(vitalEntry?.detail?.groups[0].items, [
    { name: 'Systolic blood pressure', value: '128', unit: 'mmHg' },
    { name: 'Diastolic blood pressure', value: '76', unit: 'mmHg' },
  ]);
});

test('DocumentReference notes expose type, first line, date, and author for summaries', () => {
  const chart = buildFhirChart(bundleOf({
    resourceType: 'DocumentReference',
    id: 'note',
    type: { text: 'Progress Note' },
    date: '2024-01-02',
    author: [{ display: 'Nursing Team' }],
    content: [{ attachment: { contentType: 'text/plain', data: 'TlVSU0lORyBQUk9HUkVTUyBOT1RFCgpCb2R5IHRleHQ=' } }],
  }));

  assert.equal(chart.notes[0].author, 'Nursing Team');
  assert.equal(firstNoteLine(chart.notes[0]), 'NURSING PROGRESS NOTE');
  assert.equal(noteSummaryLine(chart.notes[0]), 'Progress Note - NURSING PROGRESS NOTE');

  const noteEntry = buildFhirTimelineEntries(chart)[0];
  assert.equal(noteEntry.family, 'notes');
  assert.equal(noteEntry.dateKey, '2024-01-02');
  assert.equal(noteEntry.summaryLines[0], 'Progress Note - NURSING PROGRESS NOTE');
  assert.deepEqual(noteEntry.detail?.groups[0], {
    label: 'Progress Note',
    items: [{ name: 'NURSING PROGRESS NOTE' }, { name: 'Author · Nursing Team' }],
  });
});
