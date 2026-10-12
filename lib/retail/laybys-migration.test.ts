/**
 * Migration witness for `20261012130500_retail_laybys` (FLR-06, 58-floor-laybys).
 *
 * The lay-by's two enums, its three tables with their uniques, indexes and
 * links, the new values on the tender, stock reason, drawer movement type and
 * reason and posting source enums, and the till rules' three lay-by columns
 * with their defaults. Read off the database.
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
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null; precision: number | null; scale: number | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback,
           numeric_precision AS precision, numeric_scale AS scale
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row
    ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback, precision: row.precision, scale: row.scale }
    : null;
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

describe("lay-bys, as stored", () => {
  it("names a lay-by's states and its payments' kinds", async () => {
    expect(await enumLabels("RetailLaybyStatus")).toEqual(["PAYING", "READY", "COLLECTED", "CANCELLED"]);
    expect(await enumLabels("RetailLaybyPaymentKind")).toEqual(["DEPOSIT", "PAYMENT", "REFUND"]);
  });

  it("adds the new values to the five existing enums", async () => {
    expect(await enumLabels("RetailTenderType")).toContain("LAYBY");
    expect(await enumLabels("StockMovementReason")).toEqual(expect.arrayContaining(["LAYBY_ASIDE", "LAYBY_BACK"]));
    expect(await enumLabels("RetailCashMovementType")).toContain("TAKEN_IN");
    expect(await enumLabels("RetailCashMovementReason")).toEqual(expect.arrayContaining(["LAYBY_PAYMENT", "LAYBY_REFUND"]));
    expect(await enumLabels("AccountingSourceType")).toEqual(expect.arrayContaining(["RETAIL_LAYBY_PAYMENT", "RETAIL_LAYBY_CANCEL"]));
  });

  it("keeps the lay-by: its number, customer, held total, what is paid and the due day", async () => {
    expect(await column("RetailLayby", "laybyNo")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailLayby", "status")).toMatchObject({ type: "RetailLaybyStatus", nullable: false, fallback: "'PAYING'::\"RetailLaybyStatus\"" });
    expect(await column("RetailLayby", "total")).toMatchObject({ type: "numeric", nullable: false, precision: 14, scale: 2 });
    expect(await column("RetailLayby", "paid")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await column("RetailLayby", "dueOn")).toMatchObject({ type: "date", nullable: false });
    expect(await column("RetailLayby", "remindWeekly")).toMatchObject({ type: "bool", nullable: false, fallback: "true" });
    for (const name of ["lastRemindedAt", "collectedAt", "collectedById", "saleId", "cancelledAt", "cancelledById", "cancelFee"]) {
      expect(await column("RetailLayby", name)).toMatchObject({ nullable: true });
    }
    expect(await indexDef("RetailLayby_companyId_laybyNo_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("RetailLayby_companyId_laybyNo_key")).toContain(`("companyId", "laybyNo")`);
    expect(await indexDef("RetailLayby_saleId_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("RetailLayby_companyId_status_dueOn_idx")).toContain(`("companyId", status, "dueOn")`);
    expect(await indexDef("RetailLayby_customerId_idx")).toContain(`("customerId")`);
    expect(await foreignKey("RetailLayby_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailLayby_siteId_fkey")).toEqual({ rule: "RESTRICT", target: "Site" });
    expect(await foreignKey("RetailLayby_customerId_fkey")).toEqual({ rule: "RESTRICT", target: "Customer" });
    expect(await foreignKey("RetailLayby_createdById_fkey")).toEqual({ rule: "RESTRICT", target: "User" });
    expect(await foreignKey("RetailLayby_collectedById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
    expect(await foreignKey("RetailLayby_cancelledById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
    expect(await foreignKey("RetailLayby_saleId_fkey")).toEqual({ rule: "SET NULL", target: "RetailSale" });
  });

  it("keeps each line at its held price with its VAT and cost", async () => {
    expect(await column("RetailLaybyLine", "quantity")).toMatchObject({ type: "numeric", nullable: false, precision: 12, scale: 4 });
    for (const name of ["unitPrice", "lineTotal", "taxAmount", "costUnit"]) {
      expect(await column("RetailLaybyLine", name)).toMatchObject({ type: "numeric", nullable: false, precision: 14, scale: 2 });
    }
    expect(await column("RetailLaybyLine", "priceListId")).toMatchObject({ type: "text", nullable: true });
    expect(await indexDef("RetailLaybyLine_laybyId_idx")).toContain(`("laybyId")`);
    expect(await indexDef("RetailLaybyLine_companyId_productId_idx")).toContain(`("companyId", "productId")`);
    expect(await foreignKey("RetailLaybyLine_laybyId_fkey")).toEqual({ rule: "CASCADE", target: "RetailLayby" });
    expect(await foreignKey("RetailLaybyLine_productId_fkey")).toEqual({ rule: "RESTRICT", target: "Product" });
    expect(await foreignKey("RetailLaybyLine_inventoryItemId_fkey")).toEqual({ rule: "RESTRICT", target: "InventoryItem" });
  });

  it("keeps each payment with its tender, drawer and cash movement", async () => {
    expect(await column("RetailLaybyPayment", "kind")).toMatchObject({ type: "RetailLaybyPaymentKind", nullable: false });
    expect(await column("RetailLaybyPayment", "tenderType")).toMatchObject({ type: "RetailTenderType", nullable: false });
    expect(await column("RetailLaybyPayment", "amount")).toMatchObject({ type: "numeric", nullable: false });
    expect(await column("RetailLaybyPayment", "currency")).toMatchObject({ type: "text", fallback: "'USD'::text" });
    expect(await column("RetailLaybyPayment", "exchangeRate")).toMatchObject({ type: "numeric", precision: 12, scale: 4, fallback: "1" });
    expect(await column("RetailLaybyPayment", "baseAmount")).toMatchObject({ type: "numeric", nullable: false });
    expect(await indexDef("RetailLaybyPayment_cashMovementId_key")).toContain("UNIQUE INDEX");
    expect(await indexDef("RetailLaybyPayment_laybyId_createdAt_idx")).toContain(`("laybyId", "createdAt")`);
    expect(await indexDef("RetailLaybyPayment_companyId_shiftId_idx")).toContain(`("companyId", "shiftId")`);
    expect(await foreignKey("RetailLaybyPayment_laybyId_fkey")).toEqual({ rule: "CASCADE", target: "RetailLayby" });
    expect(await foreignKey("RetailLaybyPayment_shiftId_fkey")).toEqual({ rule: "SET NULL", target: "RetailShift" });
    expect(await foreignKey("RetailLaybyPayment_cashMovementId_fkey")).toEqual({ rule: "SET NULL", target: "RetailCashMovement" });
    expect(await foreignKey("RetailLaybyPayment_receivedById_fkey")).toEqual({ rule: "RESTRICT", target: "User" });
  });

  it("gives Till rules the smallest deposit, the cancel fee and the longest time to pay", async () => {
    expect(await column("RetailTillRules", "laybyMinDepositPercent")).toMatchObject({ type: "numeric", nullable: false, precision: 5, scale: 2, fallback: "20" });
    expect(await column("RetailTillRules", "laybyCancelFee")).toMatchObject({ type: "numeric", nullable: false, precision: 14, scale: 2, fallback: "0" });
    expect(await column("RetailTillRules", "laybyMaxDays")).toMatchObject({ type: "int4", nullable: false, fallback: "90" });
  });
});
