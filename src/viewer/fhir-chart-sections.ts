import type { FhirChart } from '../lib/fhir-chart';

export type SectionKey = 'dashboard' | 'allergies' | 'problems' | 'medications' | 'labs' | 'vitals' | 'orders' | 'notes' | 'social';
export type ChartSectionKey = Exclude<SectionKey, 'dashboard'>;

type SectionVisibility = 'always' | 'when-populated' | 'never';

export type ChartSectionDefinition = {
  key: ChartSectionKey;
  label: string;
  emptyLabel: string;
  count: (chart: FhirChart) => number;
  navVisibility: SectionVisibility;
  dashboardVisibility: SectionVisibility;
};

export type VisibleChartSection = {
  key: SectionKey;
  label: string;
  count: number;
};

export const CHART_SECTION_REGISTRY: ChartSectionDefinition[] = [
  {
    key: 'allergies',
    label: 'Allergies',
    emptyLabel: 'No AllergyIntolerance resources in this export.',
    count: chart => chart.allergies.length,
    navVisibility: 'always',
    dashboardVisibility: 'always',
  },
  {
    key: 'problems',
    label: 'Problems',
    emptyLabel: 'No problems recorded.',
    count: chart => chart.problems.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'medications',
    label: 'Medications',
    emptyLabel: 'No medications recorded.',
    count: chart => chart.medications.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'orders',
    label: 'Orders & Procedures',
    emptyLabel: 'None recorded.',
    count: chart => chart.ordersAndProcedures.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'labs',
    label: 'Labs',
    emptyLabel: 'No lab rows in this export.',
    count: chart => chart.labs.rows.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'vitals',
    label: 'Vitals',
    emptyLabel: 'No vital rows in this export.',
    count: chart => chart.vitals.rows.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'notes',
    label: 'Notes',
    emptyLabel: 'No notes recorded.',
    count: chart => chart.notes.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'when-populated',
  },
  {
    key: 'social',
    label: 'Social',
    emptyLabel: 'No social history recorded.',
    count: chart => chart.social.length,
    navVisibility: 'when-populated',
    dashboardVisibility: 'never',
  },
];

function isVisible(visibility: SectionVisibility, count: number): boolean {
  if (visibility === 'always') return true;
  if (visibility === 'when-populated') return count > 0;
  return false;
}

export function getVisibleChartSections(chart: FhirChart): VisibleChartSection[] {
  return [
    { key: 'dashboard', label: 'Dashboard', count: 0 },
    ...CHART_SECTION_REGISTRY.flatMap(section => {
      const count = section.count(chart);
      return isVisible(section.navVisibility, count) ? [{ key: section.key, label: section.label, count }] : [];
    }),
  ];
}

export function getDashboardChartSections(chart: FhirChart): ChartSectionDefinition[] {
  return CHART_SECTION_REGISTRY.filter(section => isVisible(section.dashboardVisibility, section.count(chart)));
}
