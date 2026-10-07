import type { RetailImportAction, RetailImportProblem } from "@prisma/client";

import { PRICE_DIGITS } from "@/lib/retail/prices/figure";
import { productInput } from "@/lib/retail/products/input";

import { barcodeKey, matchRow, nameKey, type CatalogIndex } from "./match";
import { PROBLEM_ORDER, type ImportRowArgs } from "./words";

/**
 * What stands between an import row and Products (SET-11, 10-setup W-08 4):
 * every problem a row has, in the order they are shown, and what the row
 * will do once they are fixed. Pure: the shop's categories and products come
 * in as `ctx`, and the whole file is checked at once, since a barcode, a new
 * product's name or a product to update repeated in the file is a problem
 * only of the rows after the first. Everything the commit would refuse in a
 * row is flagged here, so no row counted under New or Will update is skipped
 * without a word.
 */

export type CheckedFields = {
  rowNo: number;
  name: string | null;
  category: string | null;
  price: string | null;
  barcode: string | null;
  cost?: string | null;
  packSize?: string | null;
  openingStock?: string | null;
};

export type CheckContext = {
  /** Live category names and paths ("Spirits · Liqueur"), lower-cased. */
  categories: Set<string>;
  catalog: CatalogIndex;
};

export type Checked = {
  problems: RetailImportProblem[];
  action: RetailImportAction;
  matchedProductId: string | null;
  args: ImportRowArgs;
};

const MONEY = /^\d+(\.\d{1,2})?$/;
const COMMA = /^\d+,\d{1,2}$/;

export const categoryKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** The problems of one row's own cells, before the file and the shop are looked at. */
function cellProblems(row: CheckedFields, ctx: CheckContext): RetailImportProblem[] {
  const problems: RetailImportProblem[] = [];
  if (!row.name?.trim()) problems.push("NO_NAME");

  const price = row.price?.trim() ?? "";
  if (price === "" || (MONEY.test(price) && Number(price) === 0)) problems.push("NO_PRICE");
  else if (COMMA.test(price)) problems.push("PRICE_COMMA");
  else if (!MONEY.test(price) || price.split(".")[0]!.replace(/^0+(?=\d)/, "").length > PRICE_DIGITS) problems.push("PRICE_NOT_NUMBER");

  if (row.category?.trim() && !ctx.categories.has(categoryKey(row.category))) problems.push("NEW_CATEGORY");

  const barcode = row.barcode?.trim() ?? "";
  if (barcode) {
    const digits = barcodeKey(barcode);
    if (!/^\d+$/.test(digits)) problems.push("BARCODE_LETTERS");
    else if (digits.length < 8) problems.push("BARCODE_SHORT");
    else if (digits.length > 14) problems.push("BARCODE_LONG");
  }
  return problems;
}

/** A cost the commit takes: blank, or money as New product reads it. */
const costOk = (cost: string | null | undefined) => !cost?.trim() || productInput.shape.cost.safeParse(cost).success;
/** Opening stock the commit takes: blank, or a whole count New product reads. */
const stockOk = (stock: string | null | undefined) =>
  !stock?.trim() || (/^\d+$/.test(stock.trim()) && productInput.shape.openingStock.safeParse(stock).success);
/** A pack size: blank, or a whole number (2 or more makes the row a case). */
const packOk = (size: string | null | undefined) => !size?.trim() || /^\d+$/.test(size.trim());

/** A barcode good enough to match and to count as repeated: 8–14 digits once spaces go. */
export function goodBarcode(barcode: string | null): string | null {
  if (!barcode?.trim()) return null;
  const digits = barcodeKey(barcode);
  return /^\d{8,14}$/.test(digits) ? digits : null;
}

/**
 * Check every row of a file. `accepted` carries each row's "Update that one":
 * the product it was told to update, kept while the row still looks like it.
 */
export function checkRows(
  rows: Array<CheckedFields & { acceptedMatchId?: string | null }>,
  ctx: CheckContext,
): Checked[] {
  const firstWith = new Map<string, number>();
  const firstNamed = new Map<string, number>();
  const firstFor = new Map<string, number>();
  return rows.map((row) => {
    const problems = cellProblems(row, ctx);
    const args: ImportRowArgs = {};
    if (problems.includes("NEW_CATEGORY")) args.category = row.category!.trim();
    if (!costOk(row.cost)) {
      problems.push("COST_NOT_NUMBER");
      args.cost = row.cost!.trim();
    }

    const barcode = goodBarcode(row.barcode);
    if (barcode) {
      const first = firstWith.get(barcode);
      if (first === undefined) firstWith.set(barcode, row.rowNo);
      else {
        problems.push("DUPLICATE_IN_FILE");
        args.duplicateOfRow = first;
      }
    }

    const match = matchRow({ name: row.name, barcode }, ctx.catalog);
    let action: RetailImportAction = "NEW";
    let matchedProductId: string | null = null;
    if (match.kind !== "NEW") {
      matchedProductId = match.product.id;
      args.matchedName = match.product.name;
      if (match.kind === "UPDATE" || row.acceptedMatchId === match.product.id) {
        action = "UPDATE";
        if (match.kind === "LOOKS_LIKE") args.acceptedMatchId = match.product.id;
      } else {
        problems.push("LOOKS_LIKE");
      }
    }

    if (action === "UPDATE" && matchedProductId) {
      // Two rows for one product: the second would overwrite the first's price.
      const first = firstFor.get(matchedProductId);
      if (first === undefined) firstFor.set(matchedProductId, row.rowNo);
      else {
        problems.push("SAME_PRODUCT_IN_FILE");
        args.sameProductAsRow = first;
      }
    } else {
      // Opening stock and pack size are read only for a new product.
      if (!stockOk(row.openingStock)) {
        problems.push("STOCK_NOT_NUMBER");
        args.openingStock = row.openingStock!.trim();
      }
      if (!packOk(row.packSize)) {
        problems.push("PACK_NOT_NUMBER");
        args.packSize = row.packSize!.trim();
      }
      // Two new products cannot share a name: the second would be refused.
      const key = match.kind === "NEW" && row.name?.trim() ? nameKey(row.name) : null;
      if (key) {
        const first = firstNamed.get(key);
        if (first === undefined) firstNamed.set(key, row.rowNo);
        else {
          problems.push("SAME_NAME_IN_FILE");
          args.sameNameAsRow = first;
        }
      }
    }

    problems.sort((a, b) => PROBLEM_ORDER.indexOf(a) - PROBLEM_ORDER.indexOf(b));
    return { problems, action, matchedProductId, args };
  });
}
