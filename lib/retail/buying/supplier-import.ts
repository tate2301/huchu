import { Readable } from "node:stream";

import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";

import { createSupplier, PAYS, SupplierRefusal, type PaysWord, type SupplierInput } from "./suppliers";

/**
 * Import suppliers (40-buying 5.14, **Defined here**): a spreadsheet with a
 * Name column and any of the others, each row through the same rules as New
 * supplier, each in its own transaction so one bad row does not stop the
 * rest. A row refused is skipped with its row number and why.
 */

export const COLUMNS = [
  "Name",
  "Phone",
  "Email",
  "Pays",
  "Delivers",
  "Lead time",
  "Minimum order",
  "VAT number",
  "BP number",
  "Bank account",
  "Address",
] as const;
type Column = (typeof COLUMNS)[number];

const KEY: Record<Column, keyof SupplierInput> = {
  Name: "name",
  Phone: "phone",
  Email: "email",
  Pays: "pays",
  Delivers: "delivers",
  "Lead time": "leadTime",
  "Minimum order": "minimumOrder",
  "VAT number": "vatNumber",
  "BP number": "bpNumber",
  "Bank account": "bank",
  Address: "address",
};

export const NO_NAME_COLUMN = "That file has no Name column.";
export const NOT_A_SPREADSHEET = "That file is not a spreadsheet. Use .xlsx or .csv.";

export type ImportResult = { added: number; skipped: Array<{ row: number; why: string }> };

/** "30", "30 days", "cash", "on delivery" → the Pays word; anything else refused. */
function paysOf(raw: string): PaysWord | null {
  const text = raw.trim().toLowerCase();
  if (!text || text === "cash" || text === "on delivery" || text === "cod") return "On delivery";
  const days = /^(\d+)(\s*days?)?$/.exec(text)?.[1];
  const word = days ? `${days} days` : null;
  return PAYS.find((option) => option === word) ?? null;
}

/** A cell as the text it shows: rich text joined, a formula's result, a date as its day. */
export function cellText(cell: ExcelJS.CellValue): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") {
    if ("text" in cell && typeof cell.text === "string") return cell.text;
    if ("result" in cell) return cellText(cell.result as ExcelJS.CellValue);
    if ("richText" in cell) return cell.richText.map((part) => part.text).join("");
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  }
  return String(cell);
}

async function readSheet(file: { name: string; bytes: ArrayBuffer }): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  const lower = file.name.toLowerCase();
  try {
    if (lower.endsWith(".csv")) {
      return await workbook.csv.read(Readable.from([Buffer.from(file.bytes)]));
    }
    if (lower.endsWith(".xlsx")) {
      await workbook.xlsx.load(file.bytes);
      const sheet = workbook.worksheets[0];
      if (sheet) return sheet;
    }
  } catch {
    // Unreadable as what its name says it is.
  }
  throw new SupplierRefusal(400, NOT_A_SPREADSHEET, { file: NOT_A_SPREADSHEET });
}

/** Lower-case first letter, for "Row 4: there is already a supplier called Pamela." */
const lowerFirst = (text: string) => (text ? text[0]!.toLowerCase() + text.slice(1) : text);

export async function importSuppliers(actor: RetailAuditActor, file: { name: string; bytes: ArrayBuffer }): Promise<ImportResult> {
  const sheet = await readSheet(file);
  const header = sheet.getRow(1);
  const at = new Map<Column, number>();
  header.eachCell((cell, column) => {
    const label = cellText(cell.value).trim().toLowerCase();
    const match = COLUMNS.find((name) => name.toLowerCase() === label);
    if (match && !at.has(match)) at.set(match, column);
  });
  if (!at.has("Name")) throw new SupplierRefusal(400, NO_NAME_COLUMN, { file: NO_NAME_COLUMN });

  const result: ImportResult = { added: 0, skipped: [] };
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(
      [...at.entries()].map(([column, index]) => [column, cellText(row.getCell(index).value).trim()]),
    ) as Partial<Record<Column, string>>;
    if (Object.values(values).every((value) => !value)) continue;

    const input: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(values) as Array<[Column, string]>) {
      if (column === "Pays") continue;
      input[KEY[column]] = value;
    }
    const pays = paysOf(values.Pays ?? "");
    if (!pays) {
      result.skipped.push({ row: rowNumber, why: "Pays is on delivery, 7, 14 or 30 days." });
      continue;
    }
    input.pays = pays;
    try {
      await prisma.$transaction((tx) => createSupplier(tx, actor, input as SupplierInput));
      result.added += 1;
    } catch (error) {
      if (!(error instanceof SupplierRefusal)) throw error;
      const why = error.fieldErrors ? Object.values(error.fieldErrors)[0]! : error.message;
      result.skipped.push({ row: rowNumber, why: lowerFirst(why) });
    }
  }
  return result;
}

/** The template: the columns, under a frozen header, for the shop to fill in. */
export async function importTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Suppliers");
  sheet.addRow([...COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 20;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
