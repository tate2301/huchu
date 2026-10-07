import { Readable } from "node:stream";

import ExcelJS from "exceljs";

import { cellText } from "@/lib/retail/buying/supplier-import";

import { ImportRefusal } from "./refusal";
import { IMPORT_COLUMNS, MAX_BYTES, MAX_ROWS, NEEDS_NAME_AND_PRICE, TOO_BIG, TOO_MANY_ROWS, WRONG_TYPE, type ImportColumn } from "./words";

/**
 * Read a products spreadsheet (SET-11): the first sheet of an .xlsx, or a
 * .csv, through `exceljs`. The header row is the first of the top ten that
 * names both Name and Price (the template keeps a note above it), its labels
 * matched in any case and order. Each data row keeps its own row number and
 * its cells as typed; blank rows are left out.
 */

export type ParsedRow = {
  rowNo: number;
  name: string | null;
  category: string | null;
  price: string | null;
  barcode: string | null;
  cost: string | null;
  supplier: string | null;
  packSize: string | null;
  openingStock: string | null;
};

const KEY: Record<ImportColumn, Exclude<keyof ParsedRow, "rowNo">> = {
  Name: "name",
  Price: "price",
  Category: "category",
  Barcode: "barcode",
  Cost: "cost",
  Supplier: "supplier",
  "Pack size": "packSize",
  "Opening stock": "openingStock",
};

const label = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
const COLUMN_BY_LABEL = new Map(IMPORT_COLUMNS.map((column) => [label(column), column]));

/** A money cell typed as a number reads as money ("2.1" → "2.10"); anything else as it shows. */
function valueText(value: ExcelJS.CellValue, money: boolean): string | null {
  const raw = typeof value === "object" && value !== null && "result" in value ? (value.result as ExcelJS.CellValue) : value;
  if (typeof raw === "number" && money && Number.isFinite(raw) && Math.abs(raw * 100 - Math.round(raw * 100)) < 1e-9) {
    return raw.toFixed(2);
  }
  const text = cellText(raw).trim();
  return text === "" ? null : text;
}

async function readFirstSheet(bytes: Buffer, fileName: string): Promise<ExcelJS.Worksheet> {
  const lower = fileName.toLowerCase();
  const workbook = new ExcelJS.Workbook();
  try {
    if (lower.endsWith(".csv")) {
      // Every cell as typed: "2.10" stays "2.10", "12,60" stays "12,60".
      return await workbook.csv.read(Readable.from([bytes]), { map: (value: unknown) => value } as never);
    }
    if (lower.endsWith(".xlsx")) {
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
      const sheet = workbook.worksheets[0];
      if (sheet) return sheet;
    }
  } catch {
    // Not what its name says it is.
  }
  throw new ImportRefusal(400, WRONG_TYPE);
}

export async function parseSheet(bytes: Buffer, fileName: string): Promise<ParsedRow[]> {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) throw new ImportRefusal(400, WRONG_TYPE);
  if (bytes.byteLength > MAX_BYTES) throw new ImportRefusal(400, TOO_BIG);
  const sheet = await readFirstSheet(bytes, fileName);

  let headerRow = 0;
  let at = new Map<ImportColumn, number>();
  for (let rowNo = 1; rowNo <= Math.min(10, sheet.rowCount); rowNo += 1) {
    const found = new Map<ImportColumn, number>();
    sheet.getRow(rowNo).eachCell((cell, column) => {
      const match = COLUMN_BY_LABEL.get(label(cellText(cell.value)));
      if (match && !found.has(match)) found.set(match, column);
    });
    if (found.has("Name") && found.has("Price")) {
      headerRow = rowNo;
      at = found;
      break;
    }
  }
  if (!headerRow) throw new ImportRefusal(400, NEEDS_NAME_AND_PRICE);

  const rows: ParsedRow[] = [];
  for (let rowNo = headerRow + 1; rowNo <= sheet.rowCount; rowNo += 1) {
    const sheetRow = sheet.getRow(rowNo);
    const row: ParsedRow = {
      rowNo,
      name: null,
      category: null,
      price: null,
      barcode: null,
      cost: null,
      supplier: null,
      packSize: null,
      openingStock: null,
    };
    let any = false;
    for (const [column, index] of at) {
      const key = KEY[column];
      const text = valueText(sheetRow.getCell(index).value, key === "price" || key === "cost");
      if (text !== null) any = true;
      row[key] = text;
    }
    if (!any) continue;
    rows.push(row);
    if (rows.length > MAX_ROWS) throw new ImportRefusal(400, TOO_MANY_ROWS);
  }
  return rows;
}
