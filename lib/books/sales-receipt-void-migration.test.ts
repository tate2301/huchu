/**
 * Migration witness for `20261016170000_sales_receipt_void` (approved 16 Oct, the owner's request).
 *
 * A receipt can be voided and stay: when, by whom and why are kept on it, the
 * person who voided it can leave without the receipt going, and Vane's and
 * Explore's readers see the new columns, so a question can leave void receipts out.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("a void receipt, as stored", () => {
  it("keeps when, by whom and why, all empty until it is voided", async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'SalesReceipt' AND column_name IN ('voidedAt', 'voidedById', 'voidReason')
      ORDER BY column_name`;
    expect(rows).toEqual([
      { column_name: "voidReason", data_type: "text", is_nullable: "YES" },
      { column_name: "voidedAt", data_type: "timestamp without time zone", is_nullable: "YES" },
      { column_name: "voidedById", data_type: "text", is_nullable: "YES" },
    ]);
  });

  it("keeps the receipt when the person who voided it leaves", async () => {
    const rows = await prisma.$queryRaw<Array<{ on_delete: string; target: string }>>`
      SELECT rc.delete_rule AS on_delete, ccu.table_name AS target
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = kcu.constraint_name
      WHERE kcu.table_name = 'SalesReceipt' AND kcu.column_name = 'voidedById'`;
    expect(rows).toEqual([{ on_delete: "SET NULL", target: "User" }]);
  });

  it("lets Vane's and Explore's readers read the new columns", async () => {
    const grants = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT grantee || '.' || column_name AS name FROM information_schema.column_privileges
      WHERE grantee IN ('vane_reader', 'explore_reader') AND privilege_type = 'SELECT'
        AND table_name = 'SalesReceipt' AND column_name IN ('voidedAt', 'voidedById', 'voidReason')
      ORDER BY 1`;
    expect(grants.map((row) => row.name)).toEqual([
      "explore_reader.voidReason",
      "explore_reader.voidedAt",
      "explore_reader.voidedById",
      "vane_reader.voidReason",
      "vane_reader.voidedAt",
      "vane_reader.voidedById",
    ]);
  });
});
