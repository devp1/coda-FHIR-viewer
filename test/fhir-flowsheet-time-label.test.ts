import assert from 'node:assert';
import { test } from 'node:test';
import {
  formatFlowsheetDateTimeLabel,
  formatFlowsheetTimeLabel,
} from '../src/viewer/fhir-flowsheet.tsx';

test('flowsheet time labels include the source timezone when the timestamp provides one', () => {
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00Z'), '08:00 UTC');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-04:00'), '08:00 UTC-04:00');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:30+05:30'), '08:00:30 UTC+05:30');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-0400'), '08:00 UTC-04:00');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00'), '08:00');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02'), null);
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00Z·2'), '08:00 UTC ·2');
});

test('flowsheet date-time labels keep date-only columns compact and expose collision suffixes', () => {
  assert.equal(formatFlowsheetDateTimeLabel('2024-01-02T08:00:00Z'), 'Jan 2 ’24 08:00 UTC');
  assert.equal(formatFlowsheetDateTimeLabel('2024-01-02'), 'Jan 2 ’24');
  assert.equal(
    formatFlowsheetDateTimeLabel('2024-01-02T08:00:00Z·2'),
    'Jan 2 ’24 08:00 UTC ·2 (2024-01-02T08:00:00Z·2)',
  );
});
