import type { FhirChart, FhirFlowsheet, FhirListRow, FhirMeasurementEvent, FhirMeasurementEventItem, FhirNote, FhirSocialLine } from './fhir-chart';

export type FhirTimelineFamily = 'problems' | 'allergies' | 'medications' | 'labs' | 'vitals' | 'orders' | 'notes' | 'social';
export type FhirTimelineDatePrecision = 'year' | 'month' | 'day';

export const FHIR_TIMELINE_FAMILIES: FhirTimelineFamily[] = ['problems', 'allergies', 'medications', 'vitals', 'labs', 'orders', 'notes', 'social'];

export const FHIR_TIMELINE_FAMILY_LABEL: Record<FhirTimelineFamily, string> = {
  problems: 'Problems',
  allergies: 'Allergies',
  medications: 'Meds',
  vitals: 'Vitals',
  labs: 'Labs',
  orders: 'Orders',
  notes: 'Notes',
  social: 'Social',
};

export type FhirTimelineEntry = {
  dateKey: string;
  dateLabel: string;
  datePrecision: FhirTimelineDatePrecision;
  family: FhirTimelineFamily;
  summaryLines: string[];
  allLines: string[];
  totalCount: number;
  navSection: 'allergies' | 'problems' | 'medications' | 'labs' | 'vitals' | 'orders' | 'notes' | 'social';
  detail?: FhirTimelineDetail;
};

const MAX_SUMMARY_LINES = 4;

type ParsedDate = { dateKey: string; dateLabel: string; datePrecision: FhirTimelineDatePrecision };
type TimelineListOccurrence = { label: string; detail: string | null; count: number };

export type FhirTimelineDetailItem = {
  name: string;
  value?: string;
  unit?: string;
};

export type FhirTimelineDetailGroup = {
  label?: string;
  items: FhirTimelineDetailItem[];
};

export type FhirTimelineDetail = { groups: FhirTimelineDetailGroup[] };

export function buildFhirTimelineEntries(chart: FhirChart): FhirTimelineEntry[] {
  const entries: FhirTimelineEntry[] = [
    ...listEntries(chart.problems, 'problems', 'problems'),
    ...listEntries(chart.allergies, 'allergies', 'allergies'),
    ...listEntries(chart.medications, 'medications', 'medications'),
    ...listEntries(chart.ordersAndProcedures, 'orders', 'orders'),
    ...flowsheetEntries(chart.vitals, 'vitals'),
    ...flowsheetEntries(chart.labs, 'labs'),
    ...noteEntries(chart.notes),
    ...socialEntries(chart.social),
  ];
  entries.sort((a, b) =>
    a.dateKey.localeCompare(b.dateKey) ||
    FHIR_TIMELINE_FAMILIES.indexOf(a.family) - FHIR_TIMELINE_FAMILIES.indexOf(b.family) ||
    a.summaryLines.join(' ').localeCompare(b.summaryLines.join(' ')),
  );
  return entries;
}

function listEntries(
  rows: FhirListRow[],
  family: FhirTimelineFamily,
  navSection: FhirTimelineEntry['navSection'],
): FhirTimelineEntry[] {
  const byDate = new Map<string, { parsed: ParsedDate; rows: TimelineListOccurrence[] }>();
  for (const row of rows) {
    for (const occurrence of row.occurrences) {
      const parsed = parseFhirTimelineDate(occurrence.date);
      if (!parsed) continue;
      const occurrenceRow = { label: occurrence.label, detail: occurrence.detail, count: 1 };
      const bucket = byDate.get(parsed.dateKey);
      if (bucket) bucket.rows.push(occurrenceRow);
      else byDate.set(parsed.dateKey, { parsed, rows: [occurrenceRow] });
    }
  }
  return Array.from(byDate.values()).map(({ parsed, rows: datedRows }) => {
    const lines = datedRows.map(row => [row.label, row.detail].filter(Boolean).join(' · '));
    return {
      ...parsed,
      family,
      summaryLines: lines.slice(0, MAX_SUMMARY_LINES),
      allLines: lines,
      totalCount: datedRows.reduce((sum, row) => sum + row.count, 0),
      navSection,
      detail: { groups: [{ items: lines.map(line => ({ name: line })) }] },
    };
  });
}

function flowsheetEntries(flowsheet: FhirFlowsheet, family: Extract<FhirTimelineFamily, 'labs' | 'vitals'>): FhirTimelineEntry[] {
  const byDate = new Map<string, { parsed: ParsedDate; events: FhirMeasurementEvent[] }>();
  for (const event of flowsheet.events) {
    const parsed = parseFhirTimelineDate(event.date);
    if (!parsed) continue;
    const bucket = byDate.get(parsed.dateKey);
    if (bucket) bucket.events.push(event);
    else byDate.set(parsed.dateKey, { parsed, events: [event] });
  }
  return Array.from(byDate.values()).map(({ parsed, events }) => {
    const allLines = events.map(formatMeasurementEvent);
    return {
      ...parsed,
      family,
      summaryLines: allLines.slice(0, MAX_SUMMARY_LINES),
      allLines,
      totalCount: events.length,
      navSection: family,
      detail: { groups: measurementDetailGroups(events, family) },
    };
  });
}

function measurementDetailGroups(
  events: FhirMeasurementEvent[],
  family: Extract<FhirTimelineFamily, 'labs' | 'vitals'>,
): FhirTimelineDetailGroup[] {
  if (family === 'vitals') {
    return [{
      items: events.flatMap(event => event.items.map(item => ({
        name: item.label,
        value: item.value,
        unit: item.unit ?? undefined,
      }))),
    }];
  }

  const byGroup = new Map<string, FhirTimelineDetailGroup>();
  for (const event of events) {
    for (const item of event.items) {
      const label = item.labGroup?.familyLabel ?? item.labGroup?.categoryLabel ?? event.label;
      const key = label || 'Labs';
      const group = byGroup.get(key) ?? { label: key, items: [] };
      group.items.push({ name: item.label, value: item.value, unit: item.unit ?? undefined });
      byGroup.set(key, group);
    }
  }
  return Array.from(byGroup.values());
}

function formatMeasurementItem(item: FhirMeasurementEventItem): string {
  return `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ''}`;
}

function formatMeasurementEvent(event: FhirMeasurementEvent): string {
  if (event.items.length === 1) return formatMeasurementItem(event.items[0]);
  const values = event.items.map(formatMeasurementItem).join('; ');
  return `${event.label}: ${values}`;
}

function noteEntries(notes: FhirNote[]): FhirTimelineEntry[] {
  const byDate = new Map<string, { parsed: ParsedDate; notes: FhirNote[] }>();
  for (const note of notes) {
    const parsed = parseFhirTimelineDate(note.date);
    if (!parsed) continue;
    const bucket = byDate.get(parsed.dateKey);
    if (bucket) bucket.notes.push(note);
    else byDate.set(parsed.dateKey, { parsed, notes: [note] });
  }
  return Array.from(byDate.values()).map(({ parsed, notes: datedNotes }) => {
    const lines = datedNotes.map(note => noteSummaryLine(note));
    return {
      ...parsed,
      family: 'notes',
      summaryLines: lines.slice(0, MAX_SUMMARY_LINES),
      allLines: lines,
      totalCount: datedNotes.length,
      navSection: 'notes',
      detail: {
        groups: datedNotes.map(note => ({
          label: note.typeLabel,
          items: [
            { name: firstNoteLine(note) || note.typeLabel },
            ...(note.author ? [{ name: `Author · ${note.author}` }] : []),
          ],
        })),
      },
    };
  });
}

function socialEntries(lines: FhirSocialLine[]): FhirTimelineEntry[] {
  const byDate = new Map<string, { parsed: ParsedDate; lines: FhirSocialLine[] }>();
  for (const line of lines) {
    const parsed = parseFhirTimelineDate(line.date);
    if (!parsed) continue;
    const bucket = byDate.get(parsed.dateKey);
    if (bucket) bucket.lines.push(line);
    else byDate.set(parsed.dateKey, { parsed, lines: [line] });
  }
  return Array.from(byDate.values()).map(({ parsed, lines: datedLines }) => {
    const allLines = datedLines.map(line => `${line.label}: ${line.value}`);
    return {
      ...parsed,
      family: 'social',
      summaryLines: allLines.slice(0, MAX_SUMMARY_LINES),
      allLines,
      totalCount: datedLines.length,
      navSection: 'social',
      detail: { groups: [{ items: datedLines.map(line => ({ name: line.label, value: line.value })) }] },
    };
  });
}

export function firstNoteLine(note: FhirNote): string {
  return firstNonEmptyLine(note.body);
}

export function noteSummaryLine(note: FhirNote): string {
  const first = firstNoteLine(note);
  return first ? `${note.typeLabel} - ${first}` : note.typeLabel;
}

export function firstNonEmptyLine(value: string): string {
  return value.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '';
}

export function parseFhirTimelineDate(value: string | null | undefined): ParsedDate | null {
  if (!value || value === 'undated') return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (day) {
    const dateKey = `${day[1]}-${day[2]}-${day[3]}`;
    return { dateKey, dateLabel: formatDayLabel(dateKey), datePrecision: 'day' };
  }
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month) {
    const dateKey = `${month[1]}-${month[2]}-01`;
    return { dateKey, dateLabel: monthLabelOf(dateKey), datePrecision: 'month' };
  }
  const year = /^(\d{4})$/.exec(value);
  if (year) return { dateKey: `${year[1]}-01-01`, dateLabel: year[1], datePrecision: 'year' };
  return null;
}

export function formatDayLabel(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return dateKey;
  return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}`;
}

export function monthLabelOf(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dateKey);
  if (!m) return dateKey;
  const mon = SHORT_MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${mon.charAt(0)}${mon.slice(1).toLowerCase()} ${m[1]}`;
}

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
