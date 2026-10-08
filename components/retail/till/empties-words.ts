/**
 * Empties at the till, as the cashier counts them and the Paid screen says
 * them. Pure, so the counting is tested without a till around it.
 */

import type { SaleEmpties } from "@/lib/retail/empties";

import { count, whole } from "./format";

/** What a row of the count needs from a line on the sale. */
export type EmptiesLine = {
  catalogItemId: string;
  name: string;
  quantity: number;
  depositAmount: number | null;
  /** What the shop calls this deposit ("Bottles, 340 to 375ml"); null when unnamed. */
  depositName?: string | null;
};

/**
 * One row of the Bottles back count: a kind of deposit the shop has named,
 * across every line that charges it, or one line on its own where its
 * deposit has no name. `most` is what those lines sell, in whole bottles.
 */
export type EmptiesRow<T extends EmptiesLine = EmptiesLine> = { key: string; label: string; each: number; lines: T[]; most: number };

/** The rows, in the order their first line is on the sale. */
export function emptiesRows<T extends EmptiesLine>(lines: readonly T[]): EmptiesRow<T>[] {
  const rows: EmptiesRow<T>[] = [];
  for (const item of lines) {
    const each = item.depositAmount ?? 0;
    const kind = item.depositName?.trim() || null;
    // The same name at another value is another kind: what comes off has to match what was charged.
    const key = kind ? `kind:${kind}:${Math.round(each * 100)}` : `line:${item.catalogItemId}`;
    const row = rows.find((entry) => entry.key === key);
    if (row) {
      row.lines.push(item);
      row.most += Math.floor(item.quantity);
    } else {
      rows.push({ key, label: kind ?? item.name.split(",")[0]!, each, lines: [item], most: Math.floor(item.quantity) });
    }
  }
  return rows;
}

/** A row's count spread over its lines, first line first, none past what a line sells. */
export function spreadEmpties(row: EmptiesRow, n: number): Array<[string, number]> {
  let left = Math.max(Math.floor(n), 0);
  return row.lines.map((item) => {
    const here = Math.min(left, Math.floor(item.quantity));
    left -= here;
    return [item.catalogItemId, here];
  });
}

/**
 * The empties on the Paid screen, by the supplier whose ledger they went on:
 * "12 bottles on the ledger for Delta", "… and 4 for Schweppes". Bottles of a
 * product with no supplier go on no ledger and are counted on their own.
 */
export function emptiesWords(taken: number, ledger: SaleEmpties | null | undefined): string {
  const rows = (ledger ?? []).filter((row) => row.quantity > 0);
  if (rows.length === 0) return count(taken, "bottle");
  const parts = rows.map((row, index) =>
    index === 0 ? `${count(row.quantity, "bottle")} on the ledger for ${row.supplierName}` : `${whole(row.quantity)} for ${row.supplierName}`,
  );
  const listed = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]!;
  const rest = taken - rows.reduce((sum, row) => sum + row.quantity, 0);
  return rest > 0 ? `${listed}, ${whole(rest)} with no supplier` : listed;
}
