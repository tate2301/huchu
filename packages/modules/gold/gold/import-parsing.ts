/**
 * Ledger CSV import parsing helpers.
 *
 * Expected ledger columns (case-insensitive, order flexible):
 *   Date, Name, Tonn, Grams, Diesel, Shoots, LCD, Tot Exp, Boys, Mdara, Total (g), Bal
 *
 * - Date: Excel serial number (e.g., 46116) OR ISO date (YYYY-MM-DD) OR D/M/YY
 * - Name: shift-leader name, normalized via {@link normalizeLeaderName}
 * - Tonn: ore tonnes (context only) → ShiftReport.outputTonnes
 * - Grams: gross gold output (g) → allocation.totalWeight
 * - Diesel/Shoots/LCD: per-row expense weights (g)
 * - Tot Exp: validation only (must equal Σ expenses)
 * - Boys: worker share (g) — drives allocation override
 * - Mdara: company/owner share (g)
 * - Total (g): system recomputes
 * - Bal: negative => sale weight (g); positive => running balance, ignored.
 */

export type ParsedLedgerRow = {
  lineNo: number;
  rawJson: string;
  parsedDate: Date | null;
  parsedName: string | null;
  gramsTotal: number | null;
  expenses: Array<{ type: string; weight: number }>;
  totalExpense: number | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
  outputTonnes: number | null;
  warnings: string[];
};

export type ParseLedgerResult = {
  rows: ParsedLedgerRow[];
  distinctNames: string[];
  warnings: string[];
};

const EXPENSE_COLUMNS = ["diesel", "shoots", "lcd"] as const;

const NAME_NORMALIZATIONS: Array<{ test: RegExp; canonical: string }> = [
  { test: /(mhutemen|mubemen|mtemer|mutemen|mhutemheni|mtombeni|mutemen).*/i, canonical: "Mutemeri" },
  { test: /(wideo|widzo[\s-]*kiff|vidae|hidzo|widzo[\s-]*gift)$/i, canonical: "Widzo" },
  { test: /^sronde$/i, canonical: "Svondo" },
  { test: /^nkosi$/i, canonical: "Nkosilathi" },
  { test: /^marv$/i, canonical: "Marve" },
  { test: /^(mhusa|nhusa)$/i, canonical: "Musa" },
];

export function normalizeLeaderName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Try canonical normalizations first.
  for (const rule of NAME_NORMALIZATIONS) {
    if (rule.test.test(cleaned)) return rule.canonical;
  }
  // Compound names: take the first word.
  const first = cleaned.split(/\s+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Convert Excel serial date to UTC Date.
 * Excel epoch is 1899-12-30 (accounting for the Lotus 1900 leap-year bug).
 */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86400000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseLedgerDate(value: string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return excelSerialToDate(value);
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Plain integer? treat as Excel serial.
  if (/^\d{4,6}$/.test(trimmed)) return excelSerialToDate(Number(trimmed));
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // D/M/YY or D/M/YYYY
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Fallback to Date.parse
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

/**
 * Lightweight CSV splitter that handles double-quoted fields and embedded commas.
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((c) => c.trim());
}

export function parseLedgerCsv(text: string): ParseLedgerResult {
  const warnings: string[] = [];
  const rows: ParsedLedgerRow[] = [];
  const namesSet = new Set<string>();

  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], distinctNames: [], warnings: ["File is empty"] };
  }

  // Find header row — first row with "name" + "grams" columns
  let headerIndex = -1;
  let headerCols: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 5); i += 1) {
    const cells = splitCsvLine(lines[i]).map((c) => c.toLowerCase());
    if (cells.includes("name") && cells.includes("grams")) {
      headerIndex = i;
      headerCols = cells;
      break;
    }
  }
  if (headerIndex === -1) {
    return {
      rows: [],
      distinctNames: [],
      warnings: ["Could not find header row (must contain Name + Grams)"],
    };
  }

  const findColumn = (...candidates: string[]) =>
    headerCols.findIndex((col) => candidates.some((cand) => col === cand.toLowerCase()));

  const dateCol = findColumn("date");
  const nameCol = findColumn("name");
  const tonnCol = findColumn("tonn", "tonnes", "tonne");
  const gramsCol = findColumn("grams", "gold (g)", "gold_g");
  const dieselCol = findColumn("diesel");
  const shootsCol = findColumn("shoots");
  const lcdCol = findColumn("lcd");
  const totExpCol = findColumn("tot exp", "total exp", "totalexp");
  const boysCol = findColumn("boys");
  const mdaraCol = findColumn("mdara");
  const balCol = findColumn("bal", "balance");

  if (nameCol === -1 || gramsCol === -1) {
    return {
      rows: [],
      distinctNames: [],
      warnings: ["Header missing Name or Grams column"],
    };
  }

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const rowWarnings: string[] = [];
    const get = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : "");

    const rawName = get(nameCol);
    if (!rawName || /^totals?$/i.test(rawName.trim())) continue;

    const date = parseLedgerDate(get(dateCol));
    if (!date) rowWarnings.push("Date could not be parsed");
    const normalizedName = normalizeLeaderName(rawName);
    if (normalizedName) namesSet.add(normalizedName);

    const grams = parseNumber(get(gramsCol));
    const tonn = parseNumber(get(tonnCol));
    const expenses: Array<{ type: string; weight: number }> = [];
    for (const col of EXPENSE_COLUMNS) {
      const idx = headerCols.indexOf(col);
      const w = parseNumber(get(idx));
      if (w != null && w > 0) {
        expenses.push({
          type: col.charAt(0).toUpperCase() + col.slice(1),
          weight: w,
        });
      }
    }
    const totExp = parseNumber(get(totExpCol));
    const expenseSum = expenses.reduce((s, e) => s + e.weight, 0);
    if (totExp != null && Math.abs(totExp - expenseSum) > 0.01) {
      rowWarnings.push(
        `Tot Exp ${totExp.toFixed(2)} does not match column sum ${expenseSum.toFixed(2)}`,
      );
    }

    const boys = parseNumber(get(boysCol));
    const mdara = parseNumber(get(mdaraCol));
    const bal = parseNumber(get(balCol));

    rows.push({
      lineNo: i - headerIndex,
      rawJson: JSON.stringify(cells),
      parsedDate: date,
      parsedName: normalizedName || null,
      gramsTotal: grams,
      expenses,
      totalExpense: totExp ?? expenseSum,
      boysGrams: boys,
      mdaraGrams: mdara,
      balGrams: bal,
      outputTonnes: tonn,
      warnings: rowWarnings,
    });
  }

  return {
    rows,
    distinctNames: Array.from(namesSet).sort(),
    warnings,
  };
}
