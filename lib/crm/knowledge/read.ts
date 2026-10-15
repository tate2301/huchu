import { Readable } from "node:stream";

import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

import { cellText } from "@/lib/retail/buying/supplier-import";

/**
 * Reading a file for the CRM's knowledge base: its words, and, for a
 * spreadsheet, its prices. A spreadsheet row with a name and a price is a
 * price, kept as it stands; prose (PDF, Word, text) is read for its words, and
 * Vane finds the prices in it later for a person to keep (`find-prices.ts`).
 */

/** The files the knowledge base takes, by extension: browsers disagree about the type of a spreadsheet, so the name decides. */
export const KNOWLEDGE_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
} as const;

export type KnowledgeExtension = keyof typeof KNOWLEDGE_TYPES;

export function knowledgeExtension(fileName: string): KnowledgeExtension | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext in KNOWLEDGE_TYPES ? (ext as KnowledgeExtension) : null;
}

/** Why a file could not go into the knowledge base, in a sentence. */
export class KnowledgeRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeRefused";
  }
}

export type KnowledgePriceRow = {
  name: string;
  description: string | null;
  code: string | null;
  unit: string | null;
  unitPrice: number;
  currency: string;
  /** Where it is, as it reads there: "Rates, row 14: Vinyl sheet | m² | 62.00". */
  source: string;
};

export type ReadKnowledge = {
  kind: "PRICE_LIST" | "DOCUMENT";
  text: string;
  pages: number | null;
  prices: KnowledgePriceRow[];
};

/** The words kept from one file: enough for a long rate card, not a library. */
export const MAX_TEXT = 1_000_000;

const label = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

const HEADERS = {
  name: /^(item|items|name|product|products|service|services|material|materials|description|work|task|line|particulars)$/,
  description: /^(description|details|detail|notes|spec|specification)$/,
  code: /^(code|sku|item code|product code|ref|reference|part no\.?|part number)$/,
  unit: /^(unit|units|uom|per|unit of measure|measure)$/,
  price: /^(price|prices|rate|rates|unit price|unit rate|amount|cost|selling price|sell price|price each|each|charge|fee|usd|zwg|zar|price \((usd|zwg|zar|\$)\)|rate \((usd|zwg|zar|\$)\)|price per unit|price \/ unit|\$)$/,
};

/** "$1,240.50", "USD 62", "62.00/m²", "R 1 200" → the amount and the currency it says, if any. */
export function readAmount(text: string): { value: number; currency: string | null } | null {
  const cleaned = text.replace(/ /g, " ").trim();
  const currency = /\bZWG\b|ZiG/i.test(cleaned) ? "ZWG" : /\bZAR\b|^R\s?\d/.test(cleaned) ? "ZAR" : /\bUSD\b|US\$|\$/.test(cleaned) ? "USD" : null;
  const match = cleaned.match(/-?\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/[ ,]/g, ""));
  return Number.isFinite(value) && value >= 0 ? { value: Math.round(value * 100) / 100, currency } : null;
}

const headerCurrency = (header: string) => (/zwg|zig/i.test(header) ? "ZWG" : /zar|\br\b/i.test(header) ? "ZAR" : /usd|\$/i.test(header) ? "USD" : null);

type Columns = { name: number; price: number; description?: number; code?: number; unit?: number; currency: string | null };

/** The header row of a sheet, within its first ten rows: a name column and a price column, and whichever of the others are there. */
function findColumns(rows: string[][]): { at: number; columns: Columns } | null {
  for (let at = 0; at < Math.min(rows.length, 10); at += 1) {
    const cells = rows[at]!.map(label);
    const find = (pattern: RegExp, skip: number[] = []) => cells.findIndex((cell, index) => !skip.includes(index) && pattern.test(cell));
    const price = find(HEADERS.price);
    if (price < 0) continue;
    // "Item" and "Description" both present: the item is the name, the description describes it.
    let name = cells.findIndex((cell, index) => index !== price && /^(item|items|name|product|products|service|services|material|materials|work|task|line|particulars)$/.test(cell));
    if (name < 0) name = find(HEADERS.name, [price]);
    if (name < 0) continue;
    const description = find(HEADERS.description, [name, price]);
    const code = find(HEADERS.code, [name, price]);
    const unit = find(HEADERS.unit, [name, price]);
    return {
      at,
      columns: {
        name,
        price,
        ...(description >= 0 ? { description } : {}),
        ...(code >= 0 ? { code } : {}),
        ...(unit >= 0 ? { unit } : {}),
        currency: headerCurrency(rows[at]![price] ?? ""),
      },
    };
  }
  return null;
}

async function readSheets(bytes: Buffer, ext: "xlsx" | "csv"): Promise<Array<{ name: string; rows: string[][] }>> {
  const workbook = new ExcelJS.Workbook();
  try {
    if (ext === "csv") {
      const sheet = await workbook.csv.read(Readable.from([bytes]), { map: (value: unknown) => value } as never);
      return [{ name: "Sheet", rows: sheetRows(sheet) }];
    }
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
    return workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheetRows(sheet) }));
  } catch {
    throw new KnowledgeRefused(400, `It does not open as a ${ext === "csv" ? "CSV file" : "spreadsheet"}. Save it again as .xlsx or .csv.`);
  }
}

function sheetRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const raw = cell.value;
      const value = typeof raw === "object" && raw !== null && "result" in raw ? (raw.result as ExcelJS.CellValue) : raw;
      cells[column - 1] = typeof value === "number" ? String(value) : cellText(value).trim();
    });
    rows.push(Array.from(cells, (cell) => cell ?? ""));
  });
  return rows;
}

/** A spreadsheet's prices, sheet by sheet, and its rows as words to search. A sheet with no name and price columns is words only. */
export function pricesFromSheets(sheets: Array<{ name: string; rows: string[][] }>): { prices: KnowledgePriceRow[]; text: string } {
  const prices: KnowledgePriceRow[] = [];
  const text: string[] = [];
  for (const sheet of sheets) {
    const nonEmpty = sheet.rows.filter((row) => row.some((cell) => cell.trim()));
    if (nonEmpty.length === 0) continue;
    text.push(sheets.length > 1 ? `## ${sheet.name}` : "");
    const found = findColumns(nonEmpty);
    if (!found) {
      text.push(...nonEmpty.map((row) => row.filter(Boolean).join(" | ")));
      continue;
    }
    const { at, columns } = found;
    text.push(nonEmpty[at]!.filter(Boolean).join(" | "));
    for (let index = at + 1; index < nonEmpty.length; index += 1) {
      const row = nonEmpty[index]!;
      const line = row.filter(Boolean).join(" | ");
      text.push(line);
      const name = (row[columns.name] ?? "").trim();
      const amount = readAmount(row[columns.price] ?? "");
      if (!name || !amount) continue;
      const cell = (column?: number) => (column === undefined ? null : (row[column] ?? "").trim() || null);
      prices.push({
        name: name.slice(0, 300),
        description: cell(columns.description)?.slice(0, 500) ?? null,
        code: cell(columns.code)?.slice(0, 60) ?? null,
        unit: cell(columns.unit)?.slice(0, 40) ?? null,
        unitPrice: amount.value,
        currency: amount.currency ?? columns.currency ?? "USD",
        source: `${sheets.length > 1 ? `${sheet.name}, ` : ""}row ${index + 1}: ${line}`.slice(0, 500),
      });
    }
  }
  return { prices, text: text.filter((line, index) => line || index > 0).join("\n").trim() };
}

/** Reads one uploaded file: its words, its pages when it has them, and a spreadsheet's prices. */
export async function readKnowledgeFile(bytes: Buffer, fileName: string): Promise<ReadKnowledge> {
  const ext = knowledgeExtension(fileName);
  if (!ext) throw new KnowledgeRefused(400, "Upload a PDF, a Word document (.docx), a spreadsheet (.xlsx or .csv) or a text file.");

  let read: ReadKnowledge;
  if (ext === "xlsx" || ext === "csv") {
    const { prices, text } = pricesFromSheets(await readSheets(bytes, ext));
    read = { kind: prices.length ? "PRICE_LIST" : "DOCUMENT", text, pages: null, prices };
  } else if (ext === "pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      read = { kind: "DOCUMENT", text: (text as string[]).map((page) => page.trim()).join("\n\n"), pages: totalPages, prices: [] };
    } catch {
      throw new KnowledgeRefused(400, "It does not open as a PDF. Save it again from where it came from.");
    }
  } else if (ext === "docx") {
    try {
      read = { kind: "DOCUMENT", text: (await mammoth.extractRawText({ buffer: bytes })).value, pages: null, prices: [] };
    } catch {
      throw new KnowledgeRefused(400, "It does not open as a Word document. Save it again as .docx.");
    }
  } else {
    read = { kind: "DOCUMENT", text: bytes.toString("utf8"), pages: null, prices: [] };
  }

  const text = read.text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 20) {
    throw new KnowledgeRefused(
      422,
      ext === "pdf" ? "No words could be read from it: a scanned PDF is pictures of pages. Upload the original file, or the price list as a spreadsheet." : "There are no words in it to read.",
    );
  }
  return { ...read, text: text.slice(0, MAX_TEXT) };
}

/** A document's words in passages of a few paragraphs: what a search finds and Vane reads. */
export function passages(text: string, size = 1200): string[] {
  const out: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  for (const paragraph of text.split(/\n{2,}/)) {
    const pieces = paragraph.length > size ? paragraph.match(new RegExp(`[\\s\\S]{1,${size}}(?=\\s|$)`, "g")) ?? [paragraph] : [paragraph];
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > size) push();
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  push();
  return out.slice(0, 5000);
}
