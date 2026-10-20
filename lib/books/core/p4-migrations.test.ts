/**
 * Migration witness for `20261020100000_books_revise_test_device` (books-final
 * §7, P4): Revise links the new draft to the document it replaces (D7), and a
 * fiscal device can be marked as ZIMRA's test environment (D18), off for
 * every device; and what Vane's and Explore's readers may read of them.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

const columns = async (table: string) => {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY column_name`;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

const REVISED = ["SalesInvoice", "SalesQuotation", "PurchaseBill", "CreditNote"];

describe("undo everywhere, as stored", () => {
  it("links a revision to the document it replaces, on its own table (D7)", async () => {
    for (const table of REVISED) {
      expect((await columns(table)).supersedesId, table).toMatchObject({ data_type: "text", is_nullable: "YES" });
      const [fk] = await prisma.$queryRaw<Array<{ target: string; on_delete: string }>>`
        SELECT ccu.table_name AS target, rc.delete_rule AS on_delete
        FROM information_schema.referential_constraints rc
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name
        WHERE rc.constraint_name = ${`${table}_supersedesId_fkey`}`;
      expect(fk, table).toMatchObject({ target: table, on_delete: "SET NULL" });
      const [index] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_indexes WHERE indexname = ${`${table}_companyId_supersedesId_idx`}`;
      expect(Number(index!.n), table).toBe(1);
    }
  });

  it("marks a test device, off for every device (D18)", async () => {
    expect((await columns("FiscalisationProviderConfig")).isTestDevice).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "false" });
    const [on] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM "FiscalisationProviderConfig" WHERE "isTestDevice" AND "createdAt" < '2026-10-20'`;
    expect(Number(on!.n)).toBe(0);
  });

  it("lets Vane's and Explore's readers read the new columns", async () => {
    for (const reader of ["vane_reader", "explore_reader"]) {
      const rows = await prisma.$queryRaw<Array<{ name: string }>>`
        SELECT table_name || '.' || column_name AS name FROM information_schema.column_privileges
        WHERE grantee = ${reader} AND privilege_type = 'SELECT'
          AND ((column_name = 'supersedesId' AND table_name IN ('SalesInvoice', 'SalesQuotation', 'PurchaseBill', 'CreditNote'))
            OR (table_name = 'FiscalisationProviderConfig' AND column_name = 'isTestDevice'))
        ORDER BY 1`;
      expect(rows.map((row) => row.name), reader).toEqual([
        "CreditNote.supersedesId",
        "FiscalisationProviderConfig.isTestDevice",
        "PurchaseBill.supersedesId",
        "SalesInvoice.supersedesId",
        "SalesQuotation.supersedesId",
      ]);
    }
  });
});
