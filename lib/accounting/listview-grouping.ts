export type GroupedRows<TData> = {
  group: string;
  rows: TData[];
};

type BuildGroupedRowsOptions = {
  groupOrder?: string[];
  fallbackGroup?: string;
};

export function buildGroupedRows<TData>(
  rows: TData[],
  getGroupKey: (row: TData) => string | null | undefined,
  options: BuildGroupedRowsOptions = {},
): GroupedRows<TData>[] {
  const fallbackGroup = options.fallbackGroup ?? "Other";
  const grouped = new Map<string, TData[]>();

  for (const row of rows) {
    const rawGroup = getGroupKey(row);
    const group = rawGroup && rawGroup.trim() ? rawGroup : fallbackGroup;
    const existing = grouped.get(group);
    if (existing) {
      existing.push(row);
      continue;
    }
    grouped.set(group, [row]);
  }

  const explicitOrder = options.groupOrder ?? [];
  const output: GroupedRows<TData>[] = [];

  for (const groupName of explicitOrder) {
    const rowsForGroup = grouped.get(groupName);
    if (!rowsForGroup) continue;
    output.push({ group: groupName, rows: rowsForGroup });
    grouped.delete(groupName);
  }

  const remaining = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [group, rowsForGroup] of remaining) {
    output.push({ group, rows: rowsForGroup });
  }

  return output;
}

