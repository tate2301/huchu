import type { TemplateRunLayout } from "@/lib/reports/definitions/retail/templates";
import type { ListColumn, ListGroup, ReportRow, ReportValue, ResolvedListQuery } from "@/lib/reports/types";

/**
 * A shop template, run (PageRetailTemplate): what its chips say, which
 * columns it draws, the figures and charts over its rows, and the footer's
 * words. Pure; the rows are the source's face, rolled up by the API.
 */

const num = (value: ReportValue | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/**
 * A choice chip at rest names what it covers: "Every till", "Every cashier";
 * a filter named for a question reads "Paid with: any".
 */
export function chipAtRest(filter: { label?: string }): string {
  const label = filter.label ?? "";
  return /\s/.test(label) ? `${label}: any` : `Every ${label.toLowerCase()}`;
}

/** The columns drawn, in the template's order: those it names first, then any others the query does not hide. */
export function shownColumns(columns: readonly ListColumn[], query: Pick<ResolvedListQuery, "cols" | "hidden">): ListColumn[] {
  const hidden = new Set(query.hidden ?? []);
  const order = query.cols ?? [];
  const named = order.map((key) => columns.find((column) => column.key === key)).filter((column): column is ListColumn => Boolean(column));
  const rest = columns.filter((column) => !order.includes(column.key) && !hidden.has(column.key));
  return [...named, ...rest];
}

export type RunFigure = { key: string; label: string; value: number; kind: ListColumn["kind"]; share: number | null };

/**
 * The figures over every row: the layout's, or else each summed column shown
 * (at most five). After the first, each says its share of the first when
 * they are the same kind.
 */
export function runFigures(columns: readonly ListColumn[], totals: Record<string, ReportValue>, layout: TemplateRunLayout | null, shown: readonly ListColumn[]): RunFigure[] {
  const keys = layout?.figures ?? shown.filter((column) => column.total === "sum").map((column) => column.key).slice(0, 5);
  const figures = keys
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is ListColumn => Boolean(column))
    .map((column) => ({ key: column.key, label: column.label, value: num(totals[column.key]), kind: column.kind, share: null as number | null }));
  const [whole] = figures;
  if (!whole || whole.value === 0) return figures;
  return figures.map((figure, index) => (index > 0 && figure.kind === whole.kind ? { ...figure, share: figure.value / whole.value } : figure));
}

/** The parts of one whole, largest first: the bars of "Taken, by how people paid". */
export function runParts(columns: readonly ListColumn[], totals: Record<string, ReportValue>, keys: readonly string[]): Array<{ key: string; label: string; value: number }> {
  return keys
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is ListColumn => Boolean(column))
    .map((column) => ({ key: column.key, label: column.label, value: num(totals[column.key]) }))
    .sort((a, b) => b.value - a.value);
}

/** One column summed by another, in the order of `by` (oldest day first). */
export function runTrend(rows: readonly ReportRow[], by: string, column: string): Array<{ label: string; value: number }> {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const key = row[by];
    if (typeof key !== "string" && typeof key !== "number") continue;
    sums.set(String(key), (sums.get(String(key)) ?? 0) + num(row[column]));
  }
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "22 rows · 11 days, 2 tills": how many rows, and how many of each thing a row is one of. */
export function footWords(rows: readonly ReportRow[], rollupLabels: ReadonlyArray<{ key: string; label: string }>, total: number): string {
  const parts = rollupLabels.map(({ key, label }) => {
    const distinct = new Set(rows.map((row) => row[key]).filter((value) => value !== null && value !== undefined)).size;
    const noun = label.toLowerCase();
    return plural(distinct, noun, noun.endsWith("y") && !/[aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`);
  });
  const head = plural(total, "row");
  return parts.length ? `${head} · ${parts.join(", ")}` : head;
}

/** A group's total in the column the template sums as its whole. */
export function groupTotal(group: Pick<ListGroup, "totals">, column: string | null): number | null {
  if (!column) return null;
  const value = group.totals?.[column];
  return typeof value === "number" ? value : null;
}
