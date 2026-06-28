import assert from 'node:assert';
import { test } from 'node:test';
import {
  formatFlowsheetDateTimeLabel,
  formatFlowsheetTimeLabel,
} from '../src/viewer/fhir-flowsheet.tsx';

test('flowsheet time labels normalize US offsets to daylight-time labels', () => {
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00Z'), '08:00 UTC');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-04:00'), '08:00 EDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-05:00'), '08:00 CDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-06:00'), '08:00 MDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-07:00'), '08:00 PDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-08:00'), '08:00 AKDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-09:00'), '08:00 HDT');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:30+05:30'), '08:00:30 UTC+05:30');
  assert.equal(formatFlowsheetTimeLabel('2024-01-02T08:00:00-0400'), '08:00 EDT');
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
