/**
 * Migration witness for `20261003160000_retail_sale_id_checked`.
 *
 * A sale with alcohol in it records when the cashier confirmed the customer's
 * ID. The column is a nullable timestamp: every sale before it, and every sale
 * with nothing age-restricted, has none.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("RetailSale.idCheckedAt, as stored", () => {
  it("is a nullable timestamp", async () => {
    const [column] = await prisma.$queryRaw<Array<{ data_type: string; is_nullable: string }>>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailSale' AND column_name = 'idCheckedAt'`;
    expect(column).toEqual({ data_type: "timestamp without time zone", is_nullable: "YES" });
  });
});
