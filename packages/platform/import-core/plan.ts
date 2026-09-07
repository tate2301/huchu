/**
 * Working out what an import would do, before it does it.
 *
 * The shape is deliberately two-step: work out what would happen, show it, then
 * do it. An import that writes first and reports afterwards leaves somebody
 * reconciling four thousand rows by hand.
 *
 * Lifted out of lib/crm/import.ts when the schools importer needed the same
 * planning pass. What stayed behind in the CRM module is everything that knows
 * what a person or a deal is: the field tables, the row validator and the
 * duplicate key. Those arrive here as arguments, which is what keeps this file
 * ignorant of any particular entity and therefore reusable by the next one.
 */
import { rowToRecord, type CsvTable } from "./csv";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  aliases?: string[];
};

export type ImportRowIssue = { field: string; message: string };

export type ImportRowPlan = {
  /** 1-based row number in the file, counting the header as row 1. */
  line: number;
  action: "CREATE" | "UPDATE" | "SKIP";
  values: Record<string, string>;
  /** The existing record this row matched, when it did. */
  matchId?: string;
  matchLabel?: string;
  issues: ImportRowIssue[];
};

export type ImportPlan = {
  totals: { create: number; update: number; skip: number };
  rows: ImportRowPlan[];
  /** Columns in the file that no field claimed, so nothing is lost silently. */
  unmappedHeaders: string[];
};

/**
 * What is actually in a column, so a mapping can be checked rather than
 * trusted.
 *
 * The wizard guesses which column is which from the headers, and a guess that
 * is right nine times out of ten is exactly the kind that gets waved through
 * on the tenth. Showing the first few real values turns "Phone → mobile" from
 * a claim into something somebody can see is wrong before importing four
 * thousand rows of it.
 */
export type ColumnPreview = {
  /** The first distinct values, in file order. */
  samples: string[];
  /** How many rows have nothing in this column. */
  blanks: number;
  total: number;
  /** Distinct value count, capped — a hint that a column is a category. */
  distinct: number;
};

export function columnPreview(
  table: { headers: string[]; rows: string[][] },
  header: string,
  limit = 3,
): ColumnPreview | null {
  const index = table.headers.indexOf(header);
  if (index === -1) return null;

  const samples: string[] = [];
  const seen = new Set<string>();
  let blanks = 0;

  for (const row of table.rows) {
    const raw = (row[index] ?? "").trim();
    if (!raw) {
      blanks += 1;
      continue;
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      if (samples.length < limit) samples.push(raw);
    }
  }

  return { samples, blanks, total: table.rows.length, distinct: seen.size };
}

/**
 * Whether the values in a column look like the field they are mapped to.
 *
 * Deliberately shallow: it catches an email column with no `@` and a number
 * column full of words, and says nothing about the rest. A validator that
 * guesses harder starts refusing legitimate data, and a wizard that argues
 * with a correct mapping is worse than one that stays quiet.
 */
export function mappingWarnings(fieldKey: string, preview: ColumnPreview): string[] {
  const warnings: string[] = [];
  const { samples, blanks, total } = preview;
  if (samples.length === 0) {
    return total > 0 ? ["Every row is blank in this column."] : [];
  }

  const lowered = fieldKey.toLowerCase();

  if (lowered.includes("email") && !samples.some((value) => value.includes("@"))) {
    warnings.push("None of these look like email addresses.");
  }

  if (
    (lowered.includes("value") || lowered.includes("amount") || lowered.includes("price")) &&
    samples.every((value) => parseImportNumber(value) === null)
  ) {
    warnings.push("None of these look like numbers.");
  }

  if (blanks > 0 && total > 0 && blanks / total > 0.5) {
    warnings.push(`Blank in ${Math.round((blanks / total) * 100)}% of rows.`);
  }

  return warnings;
}

/**
 * Numbers in exports arrive as "1,250.00", "$1250" or "1 250".
 *
 * Returns a JS number and is therefore only ever used to ANSWER A QUESTION —
 * "is this cell numeric at all?" — never to carry an amount. Money is parsed
 * straight from the trimmed string into a Decimal; see
 * lib/schools/import/money-cell.ts.
 */
export function parseImportNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Tags and services arrive semicolon- or comma-separated inside one cell. */
export function parseImportList(raw: string): string[] {
  return raw
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export type BuildPlanOptions = {
  mapping: Record<string, string>;
  /** What to do when a row matches an existing record. */
  onDuplicate: "SKIP" | "UPDATE";
  /** Entity-specific row checks. Returning any issue makes the row a SKIP. */
  validate: (values: Record<string, string>) => ImportRowIssue[];
  /**
   * A key two rows can share, used to spot duplicates inside the file itself.
   * Return null when this row has nothing worth comparing on.
   */
  rowKey?: (values: Record<string, string>) => string | null;
  /**
   * How to find an existing record. Passed in rather than queried here so this
   * stays pure and the caller decides how hard to look.
   */
  findMatch?: (values: Record<string, string>) => { id: string; label: string } | null;
  /** How a repeat inside the same file is worded. Entities differ. */
  duplicateMessage?: (firstLine: number) => string;
};

export function buildImportPlan(table: CsvTable, options: BuildPlanOptions): ImportPlan {
  const {
    mapping,
    onDuplicate,
    validate,
    rowKey = () => null,
    findMatch = () => null,
    duplicateMessage = (firstLine) => `Same record as row ${firstLine} in this file`,
  } = options;

  const rows: ImportRowPlan[] = [];
  const seen = new Map<string, number>();
  const mappedHeaders = new Set(Object.values(mapping).filter(Boolean));

  table.rows.forEach((cells, index) => {
    const line = index + 2; // header is line 1
    const values = rowToRecord(table.headers, cells, mapping);

    // A row where every mapped cell was blank is padding at the end of a
    // spreadsheet, not a record somebody meant to import.
    if (Object.keys(values).length === 0) return;

    const issues = validate(values);

    const key = rowKey(values);
    if (key) {
      const firstLine = seen.get(key);
      if (firstLine) {
        issues.push({ field: "_row", message: duplicateMessage(firstLine) });
      } else {
        seen.set(key, line);
      }
    }

    const match = issues.length === 0 ? findMatch(values) : null;

    let action: ImportRowPlan["action"];
    if (issues.length > 0) action = "SKIP";
    else if (match) action = onDuplicate === "UPDATE" ? "UPDATE" : "SKIP";
    else action = "CREATE";

    rows.push({
      line,
      action,
      values,
      matchId: match?.id,
      matchLabel: match?.label,
      issues,
    });
  });

  return {
    totals: {
      create: rows.filter((row) => row.action === "CREATE").length,
      update: rows.filter((row) => row.action === "UPDATE").length,
      skip: rows.filter((row) => row.action === "SKIP").length,
    },
    rows,
    unmappedHeaders: table.headers.filter((header) => !mappedHeaders.has(header)),
  };
}
