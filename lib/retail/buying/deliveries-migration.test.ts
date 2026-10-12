/**
 * Migration witness for `20261012080000_retail_deliveries` (BUY-06).
 *
 * A delivery is counted before it is posted: the status gains `COUNTED`
 * before `POSTED` (and `REVERSED` after), and a new delivery starts counted.
 * A receipt names its note number, driver, counter, checker, how it was paid
 * and the requisition whose cash paid it; a line keeps what came on the note,
 * what came broken and its VAT rate; differences are their own table. Run
 * against tables in the old shape, in a scratch schema rolled back: a line
 * kept before this has what went into stock as what came, at its product's
 * VAT rate, and its receipt was counted and checked by whoever booked it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261012080000_retail_deliveries/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumLabels(name: string) {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = ${name} AND n.nspname = 'public'
    ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

describe("deliveries, as stored", () => {
  it("counts a delivery before it is posted, and can reverse one", async () => {
    expect(await enumLabels("RetailGoodsReceiptStatus")).toEqual(["COUNTED", "POSTED", "REVERSED"]);
    expect((await columns("RetailGoodsReceipt")).get("status")?.column_default).toContain("COUNTED");
    expect(await enumLabels("RetailDeliveryDifferenceKind")).toEqual(["SHORT", "BROKEN", "WRONG_ITEM", "EXTRA"]);
    expect(await enumLabels("RetailDeliverySettle")).toEqual(["CREDIT", "NEXT_TIME", "WRITE_OFF"]);
    expect(await enumLabels("RetailDeliveryPaying")).toEqual(["ON_ACCOUNT", "NOT_YET", "CASH_NOW"]);
    expect(await enumLabels("AccountingSourceType")).toContain("RETAIL_DELIVERY_DIFFERENCE");
    expect(await enumLabels("NotificationType")).toContain("RETAIL_DELIVERY_TO_CHECK");
    expect(await enumLabels("NotificationEntityType")).toContain("RETAIL_GOODS_RECEIPT");
  });

  it("names the note, the driver, who counted and who checked, and how it was paid", async () => {
    const facts = await columns("RetailGoodsReceipt");
    for (const name of ["noteNumber", "driver", "countedById", "checkedById", "requisitionId", "reversedById", "reverseReason"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["checkedAt", "reversedAt"]) expect(facts.get(name), name).toMatchObject({ is_nullable: "YES" });
    expect(facts.get("paying")).toMatchObject({ data_type: "USER-DEFINED", is_nullable: "YES" });
  });

  it("keeps what came, what came broken and the VAT rate on each line, and differences apart", async () => {
    const lines = await columns("RetailGoodsReceiptLine");
    for (const name of ["noteQuantity", "damagedQuantity", "vatRate"]) {
      expect(lines.get(name), name).toMatchObject({ data_type: "numeric", is_nullable: "NO" });
    }
    const differences = await columns("RetailDeliveryDifference");
    for (const name of ["receiptId", "receiptLineId", "kind", "quantity", "value", "atReceiving"]) {
      expect(differences.get(name), name).toMatchObject({ is_nullable: "NO" });
    }
    for (const name of ["settle", "settledAt", "returnId", "createdById"]) expect(differences.get(name), name).toMatchObject({ is_nullable: "YES" });
  });
});

/** The migration over deliveries in the old shape, in a scratch schema, rolled back. */
async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `witness_deliveries_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "AccountingSourceType" AS ENUM ('RETAIL_GOODS_RECEIPT');
      CREATE TYPE "NotificationType" AS ENUM ('RETAIL_ORDER_FOLLOW_UP');
      CREATE TYPE "NotificationEntityType" AS ENUM ('RETAIL_PURCHASE_ORDER');
      CREATE TYPE "RetailGoodsReceiptStatus" AS ENUM ('POSTED');
      CREATE TABLE "Company" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "CrmRequisition" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0);
      CREATE TABLE "InventoryItem" ("id" TEXT PRIMARY KEY, "productId" TEXT);
      CREATE TABLE "RetailGoodsReceipt" (
        "id" TEXT PRIMARY KEY, "status" "RetailGoodsReceiptStatus" NOT NULL DEFAULT 'POSTED',
        "receivedById" TEXT, "postedAt" TIMESTAMP(3)
      );
      CREATE TABLE "RetailGoodsReceiptLine" (
        "id" TEXT PRIMARY KEY, "receiptId" TEXT NOT NULL, "inventoryItemId" TEXT NOT NULL,
        "quantity" DECIMAL(12,4) NOT NULL DEFAULT 0
      );
      INSERT INTO "User" VALUES ('tafara');
      INSERT INTO "Product" VALUES ('castle', 15.5), ('ice', 0);
      INSERT INTO "InventoryItem" VALUES ('castle-main', 'castle'), ('ice-main', 'ice'), ('loose', NULL);
      INSERT INTO "RetailGoodsReceipt" VALUES ('grn-1', 'POSTED', 'tafara', '2026-08-13 10:42:00');
      INSERT INTO "RetailGoodsReceiptLine" VALUES ('l-1', 'grn-1', 'castle-main', 120), ('l-2', 'grn-1', 'ice-main', 25), ('l-3', 'grn-1', 'loose', 4);
    `);
    await client.query(readFileSync(MIGRATION, "utf8"));
    const lines = await client.query<{ id: string; noteQuantity: string; damagedQuantity: string; vatRate: string }>(
      `SELECT "id", "noteQuantity"::text, "damagedQuantity"::text, "vatRate"::text FROM "RetailGoodsReceiptLine" ORDER BY "id"`,
    );
    const receipts = await client.query<{ status: string; countedById: string; checkedById: string; checkedAt: string }>(
      `SELECT "status"::text, "countedById", "checkedById", "checkedAt"::text FROM "RetailGoodsReceipt"`,
    );
    await client.query(`INSERT INTO "RetailGoodsReceipt" ("id") VALUES ('grn-2')`);
    const fresh = await client.query<{ status: string }>(`SELECT "status"::text FROM "RetailGoodsReceipt" WHERE "id" = 'grn-2'`);
    return { lines: lines.rows, receipts: receipts.rows, fresh: fresh.rows[0]?.status };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("deliveries kept before the migration", () => {
  it("came as they went into stock, at the product's VAT, counted and checked by whoever booked them", async () => {
    const { lines, receipts, fresh } = await migrate();
    expect(lines).toEqual([
      { id: "l-1", noteQuantity: "120.0000", damagedQuantity: "0.0000", vatRate: "15.50" },
      { id: "l-2", noteQuantity: "25.0000", damagedQuantity: "0.0000", vatRate: "0.00" },
      { id: "l-3", noteQuantity: "4.0000", damagedQuantity: "0.0000", vatRate: "0.00" },
    ]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ status: "POSTED", countedById: "tafara", checkedById: "tafara" });
    expect(receipts[0]!.checkedAt).toBe("2026-08-13 10:42:00");
    expect(fresh).toBe("COUNTED");
  });
});
