/**
 * Migration witness for `20261012130100_retail_empties` (STK-09, 30-stock §3.2).
 *
 * The Empties ledger: its kinds, its table (bottles, crates and deposit signed,
 * the running afters, the sale, customer, supplier, delivery and the return a
 * credit settles), its indexes, the shop's bottle and crate deposits, the
 * till's "Bottles back" payout reason and its posting source. Read off the database.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function indexDef(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = ${name}`;
  return row?.def ?? null;
}

async function foreignKey(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
    SELECT rc.delete_rule AS rule, ccu.table_name AS target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${constraint}`;
  return row ?? null;
}

describe("the Empties ledger, as stored", () => {
  it("adds the five kinds", async () => {
    expect(await enumLabels("RetailEmptiesKind")).toEqual([
      "DEPOSIT_CHARGED",
      "DEPOSIT_REFUNDED",
      "BOTTLES_BACK",
      "RETURNED_TO_SUPPLIER",
      "CREDIT_RECEIVED",
    ]);
  });

  it("keeps signed bottles, crates and deposit with the running afters", async () => {
    expect(await column("RetailEmptiesEntry", "kind")).toMatchObject({ type: "RetailEmptiesKind", nullable: false });
    expect(await column("RetailEmptiesEntry", "bottles")).toMatchObject({ type: "int4", nullable: false, fallback: "0" });
    expect(await column("RetailEmptiesEntry", "crates")).toMatchObject({ type: "int4", nullable: false, fallback: "0" });
    expect(await column("RetailEmptiesEntry", "deposit")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await column("RetailEmptiesEntry", "bottlesAfter")).toMatchObject({ type: "int4", nullable: false });
    expect(await column("RetailEmptiesEntry", "cratesAfter")).toMatchObject({ type: "int4", nullable: false });
    for (const name of ["saleId", "customerId", "supplierId", "supplierName", "goodsReceiptId", "returnId", "reference", "note", "createdById"]) {
      expect(await column("RetailEmptiesEntry", name)).toMatchObject({ type: "text", nullable: true });
    }
    // The old per-supplier table's columns are gone.
    expect(await column("RetailEmptiesEntry", "productId")).toBeNull();
    expect(await column("RetailEmptiesEntry", "quantity")).toBeNull();
  });

  it("links what each entry is about, and a credit to its return with RESTRICT", async () => {
    expect(await foreignKey("RetailEmptiesEntry_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailEmptiesEntry_siteId_fkey")).toEqual({ rule: "RESTRICT", target: "Site" });
    expect(await foreignKey("RetailEmptiesEntry_saleId_fkey")).toEqual({ rule: "SET NULL", target: "RetailSale" });
    expect(await foreignKey("RetailEmptiesEntry_customerId_fkey")).toEqual({ rule: "SET NULL", target: "Customer" });
    expect(await foreignKey("RetailEmptiesEntry_supplierId_fkey")).toEqual({ rule: "SET NULL", target: "Vendor" });
    expect(await foreignKey("RetailEmptiesEntry_goodsReceiptId_fkey")).toEqual({ rule: "SET NULL", target: "RetailGoodsReceipt" });
    expect(await foreignKey("RetailEmptiesEntry_returnId_fkey")).toEqual({ rule: "RESTRICT", target: "RetailEmptiesEntry" });
    expect(await foreignKey("RetailEmptiesEntry_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("is read newest first per shop, per kind, per site and per supplier", async () => {
    expect(await indexDef("RetailEmptiesEntry_companyId_createdAt_idx")).toMatch(/\("companyId", "createdAt"\)/);
    expect(await indexDef("RetailEmptiesEntry_companyId_kind_createdAt_idx")).toMatch(/\("companyId", kind, "createdAt"\)/);
    expect(await indexDef("RetailEmptiesEntry_siteId_createdAt_idx")).toMatch(/\("siteId", "createdAt"\)/);
    expect(await indexDef("RetailEmptiesEntry_supplierId_idx")).toMatch(/\("supplierId"\)/);
  });

  it("gives the shop a bottle deposit of 0.10 and a crate deposit of 3.00", async () => {
    expect(await column("RetailShopProfile", "bottleDeposit")).toMatchObject({ type: "numeric", nullable: false, fallback: "0.10" });
    expect(await column("RetailShopProfile", "crateDeposit")).toMatchObject({ type: "numeric", nullable: false, fallback: "3.00" });
  });

  it("adds the till's Bottles back payout and its posting source", async () => {
    expect(await enumLabels("RetailCashMovementReason")).toContain("BOTTLES_BACK");
    expect(await enumLabels("AccountingSourceType")).toContain("RETAIL_BOTTLES_BACK");
  });
});
