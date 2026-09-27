import type { ListColumn } from "@/lib/documents/types";

/**
 * A spreadsheet opens a CSV by evaluating it, so a cell that starts like a
 * formula is one: `=HYPERLINK(...)` typed into a company name runs on the
 * machine of whoever opens the export (OWASP "CSV injection"). Such cells get
 * a leading apostrophe, which a spreadsheet shows as text. A signed number or
 * a phone number is left alone — `+263 77 123 4567` is not an attack, and
 * prefixing every phone number would ruin the column it is in.
 */
function guardFormula(text: string): string {
  if (/^[=@\t\r]/.test(text)) return `'${text}`;
  if (/^[+-]/.test(text) && !/^[+-][\d\s().,-]*$/.test(text)) return `'${text}`;
  return text;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (Array.isArray(value)) return value.map(cellText).join(", ");
  return guardFormula(String(value));
}

function escapeCsvValue(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows as CSV: labelled headers, CRLF line ends and a byte-order mark, which is
 * what Excel needs to read UTF-8 — without it "Chitungwiza — Unit 4" opens as
 * mojibake on every Windows machine a client is likely to own.
 */
export function renderCsv(
  rows: Array<Record<string, unknown>>,
  columns?: ReadonlyArray<ListColumn>,
): string {
  const heads: ListColumn[] =
    columns && columns.length > 0
      ? [...columns]
      : Object.keys(rows[0] ?? {}).map((key) => ({ key, label: key }));
  if (heads.length === 0) return "";

  const lines = [
    heads.map((column) => escapeCsvValue(guardFormula(column.label))).join(","),
    ...rows.map((row) => heads.map((column) => escapeCsvValue(cellText(row[column.key]))).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
