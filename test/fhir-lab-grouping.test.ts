import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FHIR_LAB_REFERENCE_ENTRIES,
  LAB_REFERENCE_SOURCE_SHA256,
  resolveFhirLabGroup,
} from '../src/lib/fhir-lab-grouping.ts';

test('resolves common PhysicianBench LOINCs to Roger catalog groups', () => {
  const calcium = resolveFhirLabGroup('http://loinc.org|17861-6', 'Calcium, Ser/Plas');
  assert.equal(calcium?.categoryLabel, 'Chemistries');
  assert.equal(calcium?.familyLabel, 'Basic Metabolic Panel (BMP)');
  assert.equal(calcium?.sourceRow, 38);
  assert.equal(calcium?.match, 'loinc');

  const hgb = resolveFhirLabGroup('http://loinc.org|718-7', 'Hemoglobin');
  assert.equal(hgb?.categoryLabel, 'Hematology');
  assert.equal(hgb?.familyLabel, 'Complete Blood Count (CBC)');
  assert.equal(hgb?.sourceRow, 4);
});

test('reviewed display aliases avoid known fuzzy-mapping traps', () => {
  const serumProtein = resolveFhirLabGroup('text|protein-total-ser-plas', 'Protein, Total, Ser/Plas');
  assert.equal(serumProtein?.categoryLabel, 'Chemistries');
  assert.equal(serumProtein?.familyLabel, 'Hepatic Panel (LFT)');
  assert.equal(serumProtein?.sourceRow, 47);

  const absoluteEosinophils = resolveFhirLabGroup('http://loinc.org|713-8', 'Eosinophil, Absolute');
  assert.equal(absoluteEosinophils?.entryLabel, 'Eos #');
  assert.equal(absoluteEosinophils?.sourceRow, 26);

  const eosPercent = resolveFhirLabGroup('http://loinc.org|714-6', 'Eosinophil %');
  assert.equal(eosPercent?.entryLabel, 'Eosinophils %');
  assert.equal(eosPercent?.sourceRow, 16);
});

test('unreviewed labels remain unmapped instead of being fuzzily classified', () => {
  assert.equal(resolveFhirLabGroup('text|poct-comment', 'POCT Comment'), null);
  assert.equal(resolveFhirLabGroup('text|globulin', 'Globulin'), null);
});

test('local Lab snapshot source rows still match the embedded grouping identities', t => {
  const labSnapshotPath = '/Users/dpatale/Downloads/Lab/data/lab-reference-ranges/2026-06-10/lab_reference_ranges_260610.json';
  if (!existsSync(labSnapshotPath)) {
    t.skip('Lab repository snapshot not available on this machine');
    return;
  }

  const snapshot = JSON.parse(readFileSync(labSnapshotPath, 'utf8')) as {
    source_sha256: string;
    records: Array<{ source_row: number; category: string; family: string }>;
  };
  assert.equal(snapshot.source_sha256, LAB_REFERENCE_SOURCE_SHA256);
  const bySourceRow = new Map(snapshot.records.map(record => [record.source_row, record]));

  for (const entry of FHIR_LAB_REFERENCE_ENTRIES) {
    const source = bySourceRow.get(entry.sourceRow);
    assert.ok(source, `source_row ${entry.sourceRow} missing from Lab reference snapshot`);
    assert.equal(source.category, entry.categoryLabel, `source_row ${entry.sourceRow} category drifted`);
    assert.equal(source.family, entry.familyLabel, `source_row ${entry.sourceRow} family drifted`);
  }
});
