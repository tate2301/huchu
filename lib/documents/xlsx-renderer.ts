import ExcelJS from "exceljs";

import type { ListColumn, ListColumnKind } from "@/lib/documents/types";

/** Characters Excel refuses in a sheet name, and its length limit. */
const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g;
const SHEET_NAME_MAX = 31;

const WIDTH: Record<ListColumnKind, number> = {
  text: 28,
  code: 14,
  email: 30,
  phone: 18,
  relation: 24,
  date: 12,
  datetime: 17,
  number: 10,
  money: 14,
  percent: 9,
  status: 14,
  boolean: 8,
};

const NUMBER_FORMAT: Partial<Record<ListColumnKind, string>> = {
  date: "yyyy-mm-dd",
  datetime: "yyyy-mm-dd hh:mm",
  number: "#,##0.##",
  money: "#,##0.00",
  percent: '0.##"%"',
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

/**
 * A day or a wall-clock time as the date Excel stores. The payload carries
 * them already in the reader's zone, so they are written as those same
 * figures — a sheet has no zone, and converting again would move every
 * evening deal onto the next day.
 */
function excelDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const match = DAY.exec(value);
  if (!match) return null;
  const [, y, m, d, hh = "0", mm = "0"] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
}

function cellValue(kind: ListColumnKind, value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  switch (kind) {
    case "number":
    case "money":
    case "percent": {
      const number = typeof value === "number" ? value : Number(value);
      return Number.isFinite(number) ? number : String(value);
    }
    case "date":
    case "datetime":
      return excelDate(value) ?? String(value);
    case "boolean":
      return value === true || value === "true" ? "Yes" : value === false || value === "false" ? "No" : String(value);
    default:
      // Plain text, always: exceljs writes a string as a string, and only an
      // explicit `{ formula }` object as a formula, so a company called
      // "=SUM(A1)" stays a company.
      return Array.isArray(value) ? value.map(String).join(", ") : String(value);
  }
}

export function sheetName(title: string): string {
  const cleaned = title.replace(SHEET_NAME_FORBIDDEN, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "Export").slice(0, SHEET_NAME_MAX);
}

/**
 * Rows as an Excel workbook: one sheet, a bold header frozen at the top with
 * a filter on it, cells typed by column so figures sum and dates sort.
 */
export async function renderXlsx(params: {
  title: string;
  columns: ReadonlyArray<ListColumn>;
  rows: ReadonlyArray<Record<string, unknown>>;
  author?: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = params.author ?? "Huchu";
  workbook.title = params.title;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName(params.title), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const columns: ReadonlyArray<ListColumn> = params.columns.length
    ? params.columns
    : Object.keys(params.rows[0] ?? {}).map((key) => ({ key, label: key }));

  sheet.columns = columns.map((column) => {
    const kind = column.kind ?? "text";
    return {
      header: column.label,
      key: column.key,
      width: Math.max(WIDTH[kind], Math.min(40, column.label.length + 2)),
      style: NUMBER_FORMAT[kind] ? { numFmt: NUMBER_FORMAT[kind] } : {},
    };
  });

  for (const row of params.rows) {
    const values: Record<string, ExcelJS.CellValue> = {};
    for (const column of columns) {
      values[column.key] = cellValue(column.kind ?? "text", row[column.key]);
    }
    sheet.addRow(values);
  }

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  if (columns.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}
