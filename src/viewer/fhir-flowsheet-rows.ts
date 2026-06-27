import type { FhirFlowsheetRow } from '../lib/fhir-chart';

export type FhirFlowsheetDisplayRow =
  | {
      kind: 'category';
      key: string;
      id: string;
      label: string;
      count: number;
      expanded: boolean;
      mapped: boolean;
    }
  | {
      kind: 'family';
      key: string;
      id: string;
      categoryId: string;
      label: string;
      count: number;
      expanded: boolean;
    }
  | { kind: 'data'; key: string; row: FhirFlowsheetRow };

type FamilyBucket = {
  id: string;
  label: string;
  order: number;
  rows: FhirFlowsheetRow[];
};

type CategoryBucket = {
  id: string;
  label: string;
  order: number;
  mapped: boolean;
  families: Map<string, FamilyBucket>;
  otherRows: FhirFlowsheetRow[];
};

const OTHER_CATEGORY_ID = 'other-labs';
const OTHER_CATEGORY_LABEL = 'Other labs';
const OTHER_ORDER = Number.MAX_SAFE_INTEGER;

export function buildLabFlowsheetDisplayRows(
  rows: FhirFlowsheetRow[],
  collapsedCategoryIds: readonly string[] = [],
  collapsedFamilyIds: readonly string[] = [],
  forceOpen = false,
): FhirFlowsheetDisplayRow[] {
  const categories = new Map<string, CategoryBucket>();
  for (const row of rows) {
    const group = row.labGroup ?? null;
    const categoryId = group?.categoryId ?? OTHER_CATEGORY_ID;
    const category = categories.get(categoryId) ?? {
      id: categoryId,
      label: group?.categoryLabel ?? OTHER_CATEGORY_LABEL,
      order: group?.sourceRow ?? OTHER_ORDER,
      mapped: Boolean(group),
      families: new Map<string, FamilyBucket>(),
      otherRows: [],
    };
    if (!categories.has(categoryId)) categories.set(categoryId, category);

    if (!group) {
      category.otherRows.push(row);
      continue;
    }

    const family = category.families.get(group.familyId) ?? {
      id: group.familyId,
      label: group.familyLabel,
      order: group.sourceRow,
      rows: [],
    };
    family.rows.push(row);
    category.families.set(group.familyId, family);
    category.order = Math.min(category.order, group.sourceRow);
  }

  const categoryList = Array.from(categories.values()).sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label),
  );
  const displayRows: FhirFlowsheetDisplayRow[] = [];

  for (const category of categoryList) {
    const families = Array.from(category.families.values()).sort(
      (a, b) => a.order - b.order || a.label.localeCompare(b.label),
    );
    const count = families.reduce((sum, family) => sum + family.rows.length, 0) + category.otherRows.length;
    const categoryExpanded = forceOpen || !collapsedCategoryIds.includes(category.id);
    displayRows.push({
      kind: 'category',
      key: `category:${category.id}`,
      id: category.id,
      label: category.label,
      count,
      expanded: categoryExpanded,
      mapped: category.mapped,
    });
    if (!categoryExpanded) continue;

    for (const family of families) {
      const familyKey = `${category.id}::${family.id}`;
      const familyExpanded = forceOpen || !collapsedFamilyIds.includes(familyKey);
      displayRows.push({
        kind: 'family',
        key: `family:${familyKey}`,
        id: familyKey,
        categoryId: category.id,
        label: family.label,
        count: family.rows.length,
        expanded: familyExpanded,
      });
      if (familyExpanded) {
        for (const row of family.rows) displayRows.push({ kind: 'data', key: row.codeKey, row });
      }
    }

    for (const row of category.otherRows) displayRows.push({ kind: 'data', key: row.codeKey, row });
  }

  return displayRows;
}
