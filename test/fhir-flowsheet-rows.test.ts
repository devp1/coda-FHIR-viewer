import assert from 'node:assert';
import { test } from 'node:test';
import type { FhirFlowsheetRow } from '../src/lib/fhir-chart.ts';
import { resolveFhirLabGroup } from '../src/lib/fhir-lab-grouping.ts';
import { buildLabFlowsheetDisplayRows } from '../src/viewer/fhir-flowsheet-rows.ts';

function row(label: string, codeKey: string, labGroup = resolveFhirLabGroup(codeKey, label)): FhirFlowsheetRow {
  return { label, codeKey, labGroup, unit: null, cells: { '2026-01-01': '1' }, numeric: [] };
}

test('builds full lab hierarchy with Other labs last', () => {
  const rows = [
    row('Hemoglobin', 'http://loinc.org|718-7'),
    row('Calcium, Ser/Plas', 'http://loinc.org|17861-6'),
    row('Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay', 'http://loinc.org|2089-1'),
    row('POCT Comment', 'text|poct-comment', null),
  ];

  const display = buildLabFlowsheetDisplayRows(rows);
  assert.deepEqual(
    display.map(entry => entry.kind === 'data' ? `data:${entry.row.label}` : `${entry.kind}:${entry.label}`),
    [
      'category:Hematology',
      'family:Complete Blood Count (CBC)',
      'data:Hemoglobin',
      'category:Chemistries',
      'family:Basic Metabolic Panel (BMP)',
      'data:Calcium, Ser/Plas',
      'category:Cardiac Tests',
      'family:Lipid Panel',
      'data:Cholesterol in LDL [Mass/volume] in Serum or Plasma by Direct assay',
      'category:Other labs',
      'data:POCT Comment',
    ],
  );
});

test('category and family collapse remove indexed rows, while search force-opens matches', () => {
  const rows = [
    row('Hemoglobin', 'http://loinc.org|718-7'),
    row('Hematocrit', 'http://loinc.org|4544-3'),
  ];

  const collapsedCategory = buildLabFlowsheetDisplayRows(rows, ['hematology']);
  assert.deepEqual(collapsedCategory.map(entry => entry.kind), ['category']);

  const collapsedFamily = buildLabFlowsheetDisplayRows(rows, [], ['hematology::complete-blood-count-cbc']);
  assert.deepEqual(collapsedFamily.map(entry => entry.kind), ['category', 'family']);

  const forceOpened = buildLabFlowsheetDisplayRows(rows, ['hematology'], ['hematology::complete-blood-count-cbc'], true);
  assert.deepEqual(forceOpened.map(entry => entry.kind), ['category', 'family', 'data', 'data']);
});
