import type { ListColumn, ListFilter, ReportFace, ReportRow, ReportValue } from "@/lib/reports/types";
import { aggregate, compareValues, isNumeric, ratioOf } from "@/lib/reports/view";

/**
 * "One row for each" (70-insights-reports 4.3): a report face's rows rolled up
 * by one or more of its rollup keys, for sources the engine holds in memory.
 * Sources paged by the database roll up with `GROUP BY` and build each rolled
 * row with `rolledRow`, so both give the same rows.
 *
 * A rolled row's id is its key values joined with "|"; its key cells are the
 * group's values; its count column (`rollupOnly`) is how many source rows it
 * holds; its money and number columns are summed (or their declared total);
 * every other column is dropped. Rows are rolled after tab, filters and search
 * narrowed them, and sorted, totalled, grouped and paged afterwards.
 *
 * Pure.
 */

/** The unrolled row's entry in `rollups` ("Sale", "Payment"). */
export const UNROLLED = "none";

/** The rollup keys asked for, when every one is one of the face's; else none. */
export function rollupKeys(face: ReportFace, asked: readonly string[] | undefined): string[] {
  const offered = new Set(face.rollups.map((rollup) => rollup.key).filter((key) => key !== UNROLLED));
  const keys = [...new Set((asked ?? []).filter((key) => key !== UNROLLED))];
  return keys.length > 0 && keys.every((key) => offered.has(key)) ? keys : [];
}

/** A column that is summed when rows roll up. */
function summed(column: ListColumn, face: ReportFace): boolean {
  return column.key !== face.rollupOnly && (isNumeric(column.kind) || Boolean(column.ratio));
}

/** The row key a key cell's link carries: the choice or parent filter with the key's name, by its column. */
function filterFor(face: ReportFace, key: string): Extract<ListFilter, { type: "choice" | "parent" }> | null {
  const filter = face.filters.find((candidate) => candidate.key === key);
  return filter && filter.type !== "period" ? filter : null;
}

const hrefKey = (key: string) => `${key}Href`;

/**
 * The face as it reads rolled up: the key columns first (shown, the key cell a
 * link where it is words), then the count, then the summed columns. The rest
 * are gone, and so are filters' columns that are not keys.
 */
export function rolledFace(face: ReportFace, keys: string[]): ReportFace {
  const byKey = new Map(face.columns.map((column) => [column.key, column]));
  const keyColumns = keys.flatMap((key) => {
    const column = byKey.get(key);
    if (!column) return [];
    const words = column.cell === "text" || column.cell === "muted" || column.cell === "link" || column.cell === "ref";
    return [
      {
        ...column,
        hidden: false,
        ...(words ? { cell: "link" as const, href: `{${hrefKey(key)}}` } : {}),
      },
    ];
  });
  const count = face.rollupOnly ? byKey.get(face.rollupOnly) : undefined;
  const sums = face.columns.filter((column) => !keys.includes(column.key) && summed(column, face));
  const columns = [...keyColumns, ...(count ? [{ ...count, hidden: false }] : []), ...sums];
  const kept = new Set(columns.map((column) => column.key));
  return {
    ...face,
    columns,
    rowHref: keyColumns[0]?.href ?? "",
    groups: face.groups?.filter((key) => keys.includes(key)),
    defaultGroup: face.defaultGroup && keys.includes(face.defaultGroup) ? face.defaultGroup : undefined,
    // The phone card names the group and shows its first summed figure.
    card: {
      title: keys[0]!,
      figure: sums.find((column) => !column.hidden)?.key ?? count?.key ?? keys[0]!,
      meta: count ? `{${count.key}} ${count.label.toLowerCase()}` : "",
    },
    rowMenu: undefined,
    bulk: face.bulk?.filter((action) => "key" in action && action.key === "export"),
    search: { ...face.search, keys: face.search.keys.filter((key) => kept.has(key)) },
  };
}

/** Where a key cell leads: the same template, narrowed to that value, over the same period. */
export type RollupLink = { template: string | null; filters: Record<string, string> };

/** A key cell's link, or null with no template to open. */
export function keyHref(face: ReportFace, key: string, row: ReportRow, link: RollupLink): string | null {
  if (!link.template) return null;
  const params = new URLSearchParams();
  const period = face.filters.find((filter) => filter.type === "period");
  const filter = filterFor(face, key);
  const value = row[key];
  if (filter) {
    const id = row[filter.column ?? key];
    if (id === null || id === undefined || id === "") return null;
    params.set(filter.key, String(id));
  } else if (period?.type === "period" && period.column === key && typeof value === "string") {
    params.set(period.key, `${value}..${value}`);
  } else if (value !== null && value !== undefined && value !== "") {
    params.set("q", String(value));
  }
  if (period && !params.has(period.key)) {
    const when = link.filters[period.key];
    if (when && when !== "any") params.set(period.key, when);
  }
  return `/retail/reports/${encodeURIComponent(link.template)}?${params.toString()}`;
}

/**
 * One rolled row, from its key values, the count, the summed figures and the
 * row keys a link and a sort read. The database-side sources build theirs here
 * too, so `GROUP BY` and `rollUp` cannot drift apart.
 */
export function rolledRow(
  face: ReportFace,
  keys: string[],
  values: Record<string, ReportValue>,
  link: RollupLink,
): ReportRow {
  const row: ReportRow = { id: keys.map((key) => String(values[key] ?? "")).join("|"), ...values };
  for (const key of keys) {
    const href = keyHref(face, key, row, link);
    if (href) row[hrefKey(key)] = href;
  }
  return row;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The rows rolled up by `keys`, in no particular order. `columns` are the face's columns this caller may see. */
export function rollUp(
  rows: ReportRow[],
  face: ReportFace,
  keys: string[],
  columns: ListColumn[],
  link: RollupLink = { template: null, filters: {} },
): ReportRow[] {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const id = keys.map((key) => String(row[key] ?? "")).join("|");
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }

  const sums = columns.filter((column) => !keys.includes(column.key) && summed(column, face));
  const carried = keys.map((key) => filterFor(face, key)?.column).filter((key): key is string => Boolean(key));
  const sortKeys = [...new Set(face.sorts.flatMap((sort) => sort.rules.map((rule) => rule.column)))].filter(
    (key) => key !== "id" && !keys.includes(key) && !sums.some((column) => column.key === key) && key !== face.rollupOnly,
  );
  const kindOf = (key: string) => face.columns.find((column) => column.key === key)?.kind ?? "text";

  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const values: Record<string, ReportValue> = {};
    for (const key of keys) values[key] = first[key] ?? null;
    // What a key cell's link narrows by: the filter's column (a shop's id), when the group has one.
    for (const key of carried) {
      const ids = new Set(group.map((row) => row[key] ?? null));
      if (ids.size === 1) values[key] = first[key] ?? null;
    }
    if (face.rollupOnly) {
      values[face.rollupOnly] = group.reduce((total, row) => total + (typeof row[face.rollupOnly!] === "number" ? (row[face.rollupOnly!] as number) : 1), 0);
    }
    for (const column of sums) {
      if (column.ratio) values[column.key] = ratioOf(group, column.ratio);
      else if (column.total && column.total !== "sum") values[column.key] = aggregate(group, column, column.total);
      else {
        const total = group.reduce((sum, row) => sum + (typeof row[column.key] === "number" ? (row[column.key] as number) : 0), 0);
        values[column.key] = column.kind === "money" ? round2(total) : Math.round(total * 10_000) / 10_000;
      }
    }
    // "Newest first" rolled up is by the latest date in each group.
    for (const key of sortKeys) {
      let latest: ReportValue = null;
      for (const row of group) {
        const value = row[key];
        if (value === null || value === undefined || value === "") continue;
        if (latest === null || compareValues(value, latest, kindOf(key)) > 0) latest = value;
      }
      values[key] = latest;
    }
    return rolledRow(face, keys, values, link);
  });
}
