import type { RetailImportAction, RetailImportProblem } from "@prisma/client";

/**
 * What the import screen says (SET-11, 10-setup 4.11 and 5.12): each problem's
 * sentence, the cell it is about and its fix, and the shapes the API answers
 * with. Browser-safe.
 */

/** The columns read, in template order. Name and price are needed. */
export const IMPORT_COLUMNS = ["Name", "Price", "Category", "Barcode", "Cost", "Supplier", "Pack size", "Opening stock"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const COLUMNS_READ =
  "Name and price are needed. Category, barcode, cost, supplier, pack size and opening stock are read when present.";
export const HOW_MATCHED = "By barcode first, then by name. A row that matches updates that product; anything else is new.";

export const MAX_ROWS = 5_000;
export const MAX_BYTES = 5 * 1024 * 1024;

export const NEEDS_NAME_AND_PRICE = "Name and price columns are needed.";
export const TOO_MANY_ROWS = "Keep it to 5,000 rows.";
export const TOO_BIG = "The file is over 5 MB.";
export const WRONG_TYPE = "Upload an .xlsx or .csv file.";
export const NOT_CHECKING = "This import is not waiting to be checked.";
export const NOT_FOUND = "Import not found";

/** The order problems are shown in: the first one a row has is the one drawn. */
export const PROBLEM_ORDER: RetailImportProblem[] = [
  "NO_NAME",
  "NO_PRICE",
  "PRICE_COMMA",
  "PRICE_NOT_NUMBER",
  "NEW_CATEGORY",
  "BARCODE_LETTERS",
  "BARCODE_SHORT",
  "BARCODE_LONG",
  "DUPLICATE_IN_FILE",
  "LOOKS_LIKE",
];

export type ImportField = "name" | "category" | "price" | "barcode";
export type ImportFix = "CREATE_CATEGORY" | "UPDATE_MATCH";

/** The cell each problem is about. */
export const PROBLEM_FIELD: Record<RetailImportProblem, ImportField> = {
  NO_NAME: "name",
  LOOKS_LIKE: "name",
  NEW_CATEGORY: "category",
  NO_PRICE: "price",
  PRICE_COMMA: "price",
  PRICE_NOT_NUMBER: "price",
  BARCODE_LETTERS: "barcode",
  BARCODE_SHORT: "barcode",
  BARCODE_LONG: "barcode",
  DUPLICATE_IN_FILE: "barcode",
};

/** The names a problem's sentence needs, and what the commit leaves behind. */
export type ImportRowArgs = {
  category?: string | null;
  matchedName?: string | null;
  duplicateOfRow?: number | null;
  /** "Update that one" was pressed for this product. */
  acceptedMatchId?: string | null;
  /** Set once the commit has dealt with the row, so a retry does not do it twice. */
  done?: "NEW" | "UPDATE" | "SKIPPED";
  productId?: string | null;
  /** Why the commit skipped it, or what it did instead ("imported as an ordinary product"). */
  note?: string | null;
};

export function problemText(problem: RetailImportProblem, args: ImportRowArgs): string {
  switch (problem) {
    case "NO_NAME":
      return "No name";
    case "NO_PRICE":
      return "No price";
    case "PRICE_COMMA":
      return "Price has a comma";
    case "PRICE_NOT_NUMBER":
      return "Price is not a number";
    case "NEW_CATEGORY":
      return `Category “${args.category ?? ""}” is new`;
    case "BARCODE_LETTERS":
      return "Barcode has letters";
    case "BARCODE_SHORT":
      return "Barcode is too short";
    case "BARCODE_LONG":
      return "Barcode is too long";
    case "DUPLICATE_IN_FILE":
      return `Same barcode as row ${args.duplicateOfRow ?? "?"}`;
    case "LOOKS_LIKE":
      return `Looks like ${args.matchedName ?? "another product"}, already in Products`;
  }
}

const FIX: Partial<Record<RetailImportProblem, { fix: ImportFix; label: string }>> = {
  NEW_CATEGORY: { fix: "CREATE_CATEGORY", label: "Create the category" },
  LOOKS_LIKE: { fix: "UPDATE_MATCH", label: "Update that one" },
};

export type ImportProblemView = { field: ImportField; text: string; fix: ImportFix | null; fixLabel: string | null };

export type ImportRow = {
  id: string;
  rowNo: number;
  name: string;
  category: string;
  price: string;
  barcode: string;
  problem: ImportProblemView | null;
  action: RetailImportAction | null;
  matchedName: string | null;
};

export type ImportCounts = { fix: number; new: number; update: number; all: number };

export const IMPORT_TABS = ["fix", "new", "update", "all"] as const;
export type ImportTab = (typeof IMPORT_TABS)[number];

export type ImportPage = {
  id: string;
  fileName: string;
  rowCount: number;
  status: "CHECKING" | "IMPORTED" | "DISCARDED";
  siteName: string;
  counts: ImportCounts;
  rows: ImportRow[];
};

/** The first problem, in the order they are shown. */
export function firstProblem(problems: RetailImportProblem[]): RetailImportProblem | null {
  return PROBLEM_ORDER.find((problem) => problems.includes(problem)) ?? null;
}

export function problemView(problems: RetailImportProblem[], args: ImportRowArgs): ImportProblemView | null {
  const problem = firstProblem(problems);
  if (!problem) return null;
  const fix = FIX[problem] ?? null;
  return { field: PROBLEM_FIELD[problem], text: problemText(problem, args), fix: fix?.fix ?? null, fixLabel: fix?.label ?? null };
}

/** "Import 208, skip 6"; "Import 208" when nothing needs a fix. */
export function importLabel(counts: ImportCounts): string {
  const ok = counts.new + counts.update;
  return counts.fix > 0 ? `Import ${ok}, skip ${counts.fix}` : `Import ${ok}`;
}

/** "211 products imported. 3 rows skipped." — the second sentence only when something was skipped. */
export function importedToast(result: { created: number; updated: number; skipped: number }): string {
  const n = result.created + result.updated;
  const imported = `${n} ${n === 1 ? "product" : "products"} imported.`;
  if (result.skipped === 0) return imported;
  return `${imported} ${result.skipped} ${result.skipped === 1 ? "row" : "rows"} skipped.`;
}
