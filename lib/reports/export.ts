import type { AppliedView } from "@/lib/reports/view";
import type { ReportMeta, ReportParams, ReportRow, ReportView } from "@/lib/reports/types";

/**
 * A view, applied, as a CSV of raw values for a spreadsheet. The PDF layouts
 * are in `export-templates.ts`.
 */

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Grouped rows in the order the groups are drawn, so a file reads like the screen. */
function orderedRows(applied: AppliedView): ReportRow[] {
  return applied.groups ? applied.groups.flatMap((group) => group.rows) : applied.rows;
}

export function exportRows(applied: AppliedView, view: ReportView): string {
  const columns = applied.columns;
  const lines = [columns.map((column) => csvCell(column.label)).join(",")];
  for (const row of orderedRows(applied)) {
    lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
  }
  if (Object.keys(applied.totals).length > 0) {
    lines.push(
      columns
        .map((column, index) => {
          const fn = view.totals[column.key];
          if (fn) return csvCell(applied.totals[column.key]);
          return index === 0 ? "Total" : "";
        })
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function exportFileName(
  meta: ReportMeta,
  params: ReportParams,
  format: "csv" | "xlsx" | "pdf",
  /** The layout, when it is not the plain register. */
  layout: string | null = null,
): string {
  const title = layout && layout !== "register" ? `${meta.title} ${layout}` : meta.title;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const dates = meta.params
    .filter((param) => param.type === "date" && params[param.key])
    .map((param) => params[param.key]);
  return `${[slug, ...dates].join("_")}.${format}`;
}
