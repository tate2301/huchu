/**
 * Reading a bank statement a person uploads (Books → Bank, Upload a statement).
 * CBZ has no feed, so statements arrive as the CSV its online banking exports;
 * the reader takes any CSV with a date, a description and either one signed
 * amount or money in and money out in two columns.
 */

export type StatementRow = {
  /** `YYYY-MM-DD`. */
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  direction: "CREDIT" | "DEBIT";
};

export type StatementRead =
  | { ok: true; rows: StatementRow[]; skipped: number }
  | { ok: false; error: string };

/** One CSV record per line, with quoted fields and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((row) => row.some((cell) => cell.trim() !== ""));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n: number) => String(n).padStart(2, "0");

function realDay(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "2026-10-02", "02/10/2026" (day first, as Zimbabwe's banks write it), "2 Oct 2026", "02-Oct-26". */
export function parseStatementDate(text: string): string | null {
  const value = text.trim();
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (hit) return realDay(Number(hit[1]), Number(hit[2]), Number(hit[3]));
  hit = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(value);
  if (hit) {
    const year = Number(hit[3]) < 100 ? 2000 + Number(hit[3]) : Number(hit[3]);
    return realDay(year, Number(hit[2]), Number(hit[1]));
  }
  hit = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/.exec(value);
  if (hit) {
    const month = MONTHS[hit[2].toLowerCase()];
    if (!month) return null;
    const year = Number(hit[3]) < 100 ? 2000 + Number(hit[3]) : Number(hit[3]);
    return realDay(year, month, Number(hit[1]));
  }
  return null;
}

/** "1,412.50", "(312.40)", "-18.00", "312.40 DR", "$1 412.50". Null when it is not a number. */
export function parseStatementAmount(text: string): number | null {
  let value = text.trim();
  if (value === "" || value === "-") return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (/\s*(dr|db)$/i.test(value)) {
    negative = true;
    value = value.replace(/\s*(dr|db)$/i, "");
  }
  value = value.replace(/\s*cr$/i, "");
  value = value.replace(/US\$|[$\s,]|USD|ZWG|ZiG/gi, "");
  if (value.startsWith("-") || value.startsWith("−")) {
    negative = !negative;
    value = value.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const amount = Number(value);
  return negative ? -amount : amount;
}

const HEADS = {
  date: /^(transaction |txn |value |posting )?date$/i,
  description: /^(description|narration|details|particulars|narrative|transaction details|memo)$/i,
  reference: /^(reference|ref|ref no|reference number|cheque no|cheque number)$/i,
  amount: /^(amount|value|transaction amount)$/i,
  moneyIn: /^(credit|credits|money in|paid in|deposits?|cr)$/i,
  moneyOut: /^(debit|debits|money out|paid out|withdrawals?|dr)$/i,
};

/**
 * Reads the statement: finds the header row, then each transaction under it.
 * Balance rows and lines with no amount are skipped and counted.
 */
export function readStatement(text: string): StatementRead {
  const records = parseCsv(text);
  const headAt = records.findIndex((row) => row.some((cell) => HEADS.date.test(cell.trim())));
  if (headAt < 0) return { ok: false, error: "The file has no Date column. Export the statement as CSV from online banking." };
  const head = records[headAt].map((cell) => cell.trim());
  const col = (pattern: RegExp) => head.findIndex((cell) => pattern.test(cell));
  const at = {
    date: col(HEADS.date),
    description: col(HEADS.description),
    reference: col(HEADS.reference),
    amount: col(HEADS.amount),
    moneyIn: col(HEADS.moneyIn),
    moneyOut: col(HEADS.moneyOut),
  };
  if (at.description < 0) return { ok: false, error: "The file has no Description column." };
  if (at.amount < 0 && (at.moneyIn < 0 || at.moneyOut < 0)) {
    return { ok: false, error: "The file needs an Amount column, or Credit and Debit columns." };
  }

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const record of records.slice(headAt + 1)) {
    const date = parseStatementDate(record[at.date] ?? "");
    const description = (record[at.description] ?? "").trim();
    let signed: number | null = null;
    if (at.moneyIn >= 0 && at.moneyOut >= 0) {
      const moneyIn = parseStatementAmount(record[at.moneyIn] ?? "");
      const moneyOut = parseStatementAmount(record[at.moneyOut] ?? "");
      if (moneyIn) signed = Math.abs(moneyIn);
      else if (moneyOut) signed = -Math.abs(moneyOut);
    } else {
      signed = parseStatementAmount(record[at.amount] ?? "");
    }
    if (!date || !description || !signed || /^(opening|closing|balance)\b/i.test(description)) {
      skipped += 1;
      continue;
    }
    const reference = at.reference >= 0 ? (record[at.reference] ?? "").trim() || null : null;
    rows.push({
      date,
      description,
      reference,
      amount: Math.round(Math.abs(signed) * 100) / 100,
      direction: signed > 0 ? "CREDIT" : "DEBIT",
    });
  }
  if (rows.length === 0) return { ok: false, error: "No transactions were found under the header row." };
  return { ok: true, rows, skipped };
}

/** The same line uploaded twice: same day, same money, same way, same words. */
export function lineKey(row: Pick<StatementRow, "date" | "amount" | "direction" | "description">): string {
  return `${row.date}|${row.direction}|${row.amount.toFixed(2)}|${row.description.trim().toLowerCase()}`;
}
