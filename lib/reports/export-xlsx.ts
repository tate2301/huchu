import ExcelJS from "exceljs";

import { formatDate, totalCaption } from "@/lib/reports/format";
import {
  breakdown,
  breakdownColumn,
  leadFigure,
  narrowing,
  period,
  type ExportInput,
} from "@/lib/reports/export-templates";
import type { Aggregate, ReportColumn, ReportRow, ReportValue } from "@/lib/reports/types";
import { isNumeric } from "@/lib/reports/view";

/**
 * A report as a workbook somebody can keep working in.
 *
 * A PDF is for reading; this is for doing something next — a pivot, a chart, a
 * reconciliation. So the rows are real values in real types (a date is a date
 * Excel can sort, money is a number with two places, a reference stays text so
 * its leading zeros survive), the header is frozen and filterable, and the
 * totals are `SUBTOTAL` formulas: filter the sheet in Excel and they follow.
 */

const MONEY = "#,##0.00";
const NUMBER = "#,##0.####";
const DATE = "d mmm yyyy";
const SHARE = "0.0%";

/** Excel's SUBTOTAL function numbers, the kind that ignore rows a filter hid. */
const SUBTOTAL: Partial<Record<Aggregate, number>> = { avg: 101, count: 103, max: 104, min: 105, sum: 109 };

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
const RULE: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD4D4D8" } };
const STRONG_RULE: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FF18181B" } };

/** Sheet names are 31 characters at most and refuse a handful of symbols. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim() || "Report";
}

function formatFor(column: ReportColumn): string | undefined {
  if (column.kind === "money") return MONEY;
  if (column.kind === "number") return NUMBER;
  if (column.kind === "date") return DATE;
  return undefined;
}

/** A value as the cell should hold it: numbers as numbers, days as dates, the rest as text. */
export function cellValue(value: ReportValue | undefined, column: ReportColumn): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (isNumeric(column.kind)) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (column.kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Midnight UTC is the day itself in Excel, which has no time zones.
    return new Date(`${value}T00:00:00.000Z`);
  }
  return String(value);
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FF3F3F46" } };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: RULE };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { top: STRONG_RULE };
  });
}

/** Wide enough for the label and the longest of the first few hundred values, within reason. */
function fitWidths(sheet: ExcelJS.Worksheet, labels: string[], sample: string[][]) {
  labels.forEach((label, index) => {
    const longest = Math.max(label.length, ...sample.map((row) => (row[index] ?? "").length));
    sheet.getColumn(index + 1).width = Math.min(48, Math.max(8, longest + 2));
  });
}

function orderedRows(input: ExportInput): ReportRow[] {
  return input.applied.groups ? input.applied.groups.flatMap((group) => group.rows) : input.applied.rows;
}

function sampleText(value: ReportValue | undefined, column: ReportColumn): string {
  if (value === null || value === undefined) return "";
  if (column.kind === "date" && typeof value === "string") return formatDate(value);
  if (column.kind === "money" && typeof value === "number") return value.toFixed(2) + "000";
  return String(value);
}

/* ──────────────────────────────────────────────────────────────────────────
   The sheets
   ────────────────────────────────────────────────────────────────────────── */

function addRows(workbook: ExcelJS.Workbook, input: ExportInput) {
  const sheet = workbook.addWorksheet(sheetName(input.meta.title), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const columns = input.applied.columns;
  const rows = orderedRows(input);

  styleHeader(sheet.addRow(columns.map((column) => column.label)));
  for (const row of rows) {
    const added = sheet.addRow(columns.map((column) => cellValue(row[column.key], column)));
    columns.forEach((column, index) => {
      const format = formatFor(column);
      if (format) added.getCell(index + 1).numFmt = format;
    });
  }

  const last = rows.length + 1;
  if (rows.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: columns.length } };
  }

  // Totals as formulas over the rows above, so a filter in Excel moves them.
  const totals = input.view.totals;
  if (Object.keys(totals).length > 0 && rows.length > 0) {
    const totalRow = sheet.addRow(
      columns.map((column, index) => {
        const fn = totals[column.key];
        if (!fn) return index === 0 ? "Total" : null;
        const code = SUBTOTAL[fn];
        const range = `${columnLetter(index)}2:${columnLetter(index)}${last}`;
        const result = input.applied.totals[column.key];
        // Distinct has no SUBTOTAL; it is written as the value it was.
        if (!code) return typeof result === "number" ? result : null;
        return { formula: `SUBTOTAL(${code},${range})`, result: typeof result === "number" ? result : undefined };
      }),
    );
    columns.forEach((column, index) => {
      const fn = totals[column.key];
      if (!fn) return;
      const cell = totalRow.getCell(index + 1);
      cell.numFmt = fn === "count" || fn === "distinct" ? "0" : formatFor(column) ?? NUMBER;
      cell.note = totalCaption(fn);
    });
    styleTotal(totalRow);
  }

  fitWidths(
    sheet,
    columns.map((column) => column.label),
    rows.slice(0, 300).map((row) => columns.map((column) => sampleText(row[column.key], column))),
  );
}

function addSummary(workbook: ExcelJS.Workbook, input: ExportInput) {
  const by = breakdownColumn(input);
  if (!by) return;
  const lines = breakdown(input, by);
  if (lines.length < 2) return;

  const byKey = new Map(input.meta.columns.map((column) => [column.key, column]));
  const totals = Object.entries(input.view.totals)
    .map(([key, fn]) => ({ column: byKey.get(key)!, fn }))
    .filter((entry) => Boolean(entry.column));
  const figure = leadFigure(input);
  const whole = figure ? Number(input.applied.totals[figure.key] ?? 0) : input.applied.rows.length;

  const sheet = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  const labels = [
    by.label,
    "Rows",
    ...totals.map(({ column, fn }) => (fn === "sum" ? column.label : `${column.label} (${totalCaption(fn).toLowerCase()})`)),
    figure ? `Share of ${figure.label.toLowerCase()}` : "Share of rows",
  ];
  styleHeader(sheet.addRow(labels));

  for (const line of lines) {
    const part = figure ? Number(line.totals[figure.key] ?? 0) : line.count;
    const added = sheet.addRow([
      line.name,
      line.count,
      ...totals.map(({ column }) => cellValue(line.totals[column.key], column)),
      whole > 0 ? part / whole : null,
    ]);
    totals.forEach(({ column, fn }, index) => {
      added.getCell(index + 3).numFmt = fn === "count" || fn === "distinct" ? "0" : formatFor(column) ?? NUMBER;
    });
    added.getCell(labels.length).numFmt = SHARE;
  }

  const total = sheet.addRow([
    "Total",
    input.applied.rows.length,
    ...totals.map(({ column }) => cellValue(input.applied.totals[column.key], column)),
    null,
  ]);
  totals.forEach(({ column, fn }, index) => {
    total.getCell(index + 3).numFmt = fn === "count" || fn === "distinct" ? "0" : formatFor(column) ?? NUMBER;
  });
  styleTotal(total);
  fitWidths(sheet, labels, lines.map((line) => [line.name, String(line.count), ...totals.map(() => "000,000,000.00"), "100.0%"]));
}

function addAbout(workbook: ExcelJS.Workbook, input: ExportInput) {
  const sheet = workbook.addWorksheet("About");
  const facts: Array<[string, string]> = [
    ["Report", input.meta.title],
    ...(period(input.meta, input.params) ? ([["Period", period(input.meta, input.params)!]] as Array<[string, string]>) : []),
    ...narrowing(input).map((line): [string, string] => ["Showing", line]),
    ["Rows", input.applied.rows.length.toLocaleString("en-US")],
    ["Generated", formatDate(input.generatedAt.toISOString().slice(0, 10))],
  ];
  for (const [label, value] of facts) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true, color: { argb: "FF71717A" } };
  }
  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 60;
}

export async function buildWorkbook(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = input.generatedAt;
  workbook.title = input.meta.title;
  addRows(workbook, input);
  addSummary(workbook, input);
  addAbout(workbook, input);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
