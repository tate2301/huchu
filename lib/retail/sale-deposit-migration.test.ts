/**
 * Migration witness for `20261003170000_retail_sale_deposit`.
 *
 * A sale's bottle deposits are their own column, beside `totalAmount` and not
 * inside it: money to two places, not null, and nothing on a sale that had no
 * returnable bottles — which is every sale before this column existed.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("RetailSale.depositAmount, as stored", () => {
  it("is money to two places that defaults to nothing", async () => {
    const [column] = await prisma.$queryRaw<
      Array<{ data_type: string; numeric_precision: number; numeric_scale: number; is_nullable: string; column_default: string }>
    >`
      SELECT data_type, numeric_precision, numeric_scale, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'RetailSale' AND column_name = 'depositAmount'`;
    expect(column).toEqual({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "NO",
      column_default: "0",
    });
  });
});
