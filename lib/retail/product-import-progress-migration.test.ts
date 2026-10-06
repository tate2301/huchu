/**
 * Migration witness for `20261006150000_retail_product_import_progress` (SET-11).
 *
 * An import goes into Products a batch per call, so it can be part in: it is
 * IMPORTING from its first batch until the last, and while it is its rows
 * cannot change and it cannot be thrown away. The Check step flags what the
 * commit would otherwise skip without a word: a cost, opening stock or pack
 * size that is not a figure, a name twice in the file, and two rows for one
 * product.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function enumLabels(name: string) {
  const labels = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return labels.map((row) => row.label);
}

describe("product imports, part in and checked further", () => {
  it("names the state between checking and imported", async () => {
    expect(await enumLabels("RetailImportStatus")).toEqual(["CHECKING", "IMPORTING", "IMPORTED", "DISCARDED"]);
  });

  it("names the five problems the Check step now flags, after the first ten", async () => {
    const labels = await enumLabels("RetailImportProblem");
    expect(labels.slice(10)).toEqual(["COST_NOT_NUMBER", "STOCK_NOT_NUMBER", "PACK_NOT_NUMBER", "SAME_NAME_IN_FILE", "SAME_PRODUCT_IN_FILE"]);
  });

  it("keeps a status the new value can be stored in", async () => {
    const [row] = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT 'IMPORTING'::"RetailImportStatus" IS NOT NULL AS ok`;
    expect(row?.ok).toBe(true);
  });
});
