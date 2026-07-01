import assert from 'node:assert';
import { test } from 'node:test';
import { buildFhirChart } from '../src/lib/fhir-chart.ts';
import type { PatientBundle } from '../src/lib/fhir-ingest.ts';
import { getDashboardChartSections, getVisibleChartSections } from '../src/viewer/fhir-chart-sections.ts';

const patient = { resourceType: 'Patient', id: 'P', name: [{ family: 'Sections' }] };
const bundleOf = (...resources: object[]): PatientBundle => ({
  patientKey: 'P',
  patient,
  resources: [patient, ...resources],
});

test('Allergies is a first-class visible section even when no AllergyIntolerance resources are present', () => {
  const chart = buildFhirChart(bundleOf());

  const navSections = getVisibleChartSections(chart);
  const dashboardSections = getDashboardChartSections(chart);

  assert.deepEqual(navSections.map(section => section.key), ['dashboard', 'allergies']);
  assert.deepEqual(dashboardSections.map(section => section.key), ['allergies']);
  assert.equal(navSections.find(section => section.key === 'allergies')?.count, 0);
  assert.equal(dashboardSections[0].emptyLabel, 'No AllergyIntolerance resources in this export.');
});

test('Allergies count reflects AllergyIntolerance resources when populated', () => {
  const chart = buildFhirChart(
    bundleOf({
      resourceType: 'AllergyIntolerance',
      id: 'a1',
      code: { text: 'Penicillin' },
      recordedDate: '2022-01-05',
      clinicalStatus: { text: 'active' },
    }),
  );

  assert.equal(getVisibleChartSections(chart).find(section => section.key === 'allergies')?.count, 1);
  assert.equal(getDashboardChartSections(chart).find(section => section.key === 'allergies')?.count(chart), 1);
});

test('non-core chart sections remain hidden until populated', () => {
  const chart = buildFhirChart(bundleOf());

  assert.ok(!getVisibleChartSections(chart).some(section => section.key === 'problems'));
  assert.ok(!getDashboardChartSections(chart).some(section => section.key === 'problems'));
});
