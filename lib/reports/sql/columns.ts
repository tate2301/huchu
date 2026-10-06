import { isDateType, isNumericType } from "@/lib/reports/sql/engine";
import type { AstNode, SelectAst } from "@/lib/reports/sql/guard";
import type { SqlColumn, SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn } from "@/lib/reports/types";

/**
 * A result's columns, typed the way the report would draw them.
 *
 * Postgres says a column is numeric; the report needs to know it is money, in
 * dollars, called "Value". So each output column is traced back through the
 * query to the source column it came from — passed through, totalled, rounded
 * or defaulted — and takes that column's kind, label and currency. A column
 * made from nothing a source knows falls back to what Postgres says it is.
 */

/** `won_value` reads as "Won value". */
export function humanize(name: string): string {
  const words = name.replace(/[_.]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : name;
}

/** Functions whose answer is the same kind of thing as their first argument. */
const KEEPS_KIND = new Set(["sum", "avg", "min", "max", "round", "trunc", "floor", "ceil", "ceiling", "abs", "coalesce", "greatest", "least", "first_value", "last_value", "lag", "lead", "nth_value", "percentile_cont", "percentile_disc", "mode"]);

function columnRef(node: AstNode): { table: string | null; column: string } | null {
  if (node.type !== "column_ref") return null;
  const column = node.column as { expr?: { value?: string } } | string | undefined;
  const name = typeof column === "string" ? column : column?.expr?.value;
  return name ? { table: (node.table as string | null) ?? null, column: name.toLowerCase() } : null;
}

function firstArgument(node: AstNode): AstNode | null {
  const args = node.args as { expr?: AstNode; value?: AstNode[] } | undefined;
  if (!args) return null;
  if (args.expr) return args.expr;
  return args.value?.[0] ?? null;
}

function nameOf(node: AstNode): string | null {
  if (node.type === "aggr_func" && typeof node.name === "string") return node.name.toLowerCase();
  if (node.type === "function") {
    const name = node.name as { name?: Array<{ value?: string }> } | undefined;
    return name?.name?.map((part) => part.value).join(".").toLowerCase() ?? null;
  }
  return null;
}

/** The source column an expression carries the kind of, if it carries one. */
function sourceOf(node: AstNode | null, find: (table: string | null, column: string) => SqlColumn | null): SqlColumn | null {
  if (!node) return null;
  const ref = columnRef(node);
  if (ref) return find(ref.table, ref.column);
  if (node.type === "cast") return sourceOf(node.expr as AstNode, find);
  const name = nameOf(node);
  if (name && KEEPS_KIND.has(name)) return sourceOf(firstArgument(node), find);
  return null;
}

export function resultColumns(
  ast: SelectAst | null,
  fields: Array<{ name: string; dataTypeID: number }>,
  tables: readonly SqlTable[],
): ReportColumn[] {
  const all = tables.flatMap((table) => table.columns.map((column) => ({ table: table.name, column })));
  const find = (table: string | null, name: string): SqlColumn | null =>
    all.find((entry) => entry.column.sql === name && (!table || entry.table === table))?.column ??
    // An alias (`d.value`) names the table another way; the column name still finds it.
    all.find((entry) => entry.column.sql === name)?.column ??
    null;

  const listed = ast && Array.isArray(ast.columns) ? ast.columns : [];
  const byName = new Map<string, { expr: AstNode; as: string | null }>();
  for (const entry of listed) {
    const ref = columnRef(entry.expr);
    const name = (entry.as ?? ref?.column ?? nameOf(entry.expr) ?? "").toLowerCase();
    if (name && !byName.has(name)) byName.set(name, entry);
  }

  return fields.map((field) => {
    const entry = byName.get(field.name.toLowerCase());
    const name = nameOf(entry?.expr ?? {});
    const counted = name === "count" || name === "row_number" || name === "rank" || name === "dense_rank" || name === "ntile";
    const source = counted ? null : entry ? sourceOf(entry.expr, find) : find(null, field.name.toLowerCase());
    const passedThrough = Boolean(entry && columnRef(entry.expr) && !entry.as) || (!entry && source);

    const kind: ReportColumn["kind"] = source
      ? isNumericType(field.dataTypeID) && source.kind !== "money" && source.kind !== "number"
        ? "number"
        : source.kind
      : isNumericType(field.dataTypeID)
        ? "number"
        : isDateType(field.dataTypeID)
          ? "date"
          : "text";

    return {
      key: field.name,
      label: passedThrough && source ? source.label : humanize(field.name),
      kind,
      ...(source?.currency && (kind === "money") ? { currency: source.currency } : {}),
    };
  });
}
