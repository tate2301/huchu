/**
 * Migration witness for `20261012130000_retail_purchase_orders` (BUY-02).
 *
 * An order names its supplier (`vendorId`, replacing the typed
 * `supplierName`), is sent before anything comes (`SENT`), can be cancelled
 * (`CANCELLED`), knows how it is paid, who sent it and how, its chase, its
 * first expected date, and whether it is in the bin. A line keeps its VAT rate,
 * what the supplier was told to send, and whether it was closed short. A
 * delivery names its supplier too and links its order. Orders and deliveries
 * kept before it point at a supplier of the typed name, made when none was —
 * run here against tables in the old shape, in a scratch schema rolled back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261012130000_retail_purchase_orders/migration.sql");

type ColumnFacts = {
  column_name: string;
  data_type: string;
  udt_name: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
};

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, numeric_precision, numeric_scale, is_nullable, column_default
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

async function indexDef(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table} AND indexname = ${name}`;
  return row?.indexdef ?? null;
}

describe("orders, as stored", () => {
  it("has an order's states in order, how it is paid and sent, and what a chase does next", async () => {
    expect(await enumLabels("RetailPurchaseOrderStatus")).toEqual(["DRAFT", "TO_APPROVE", "SENT", "PARTIAL", "RECEIVED", "CLOSED", "CANCELLED"]);
    expect(await enumLabels("RetailOrderPayment")).toEqual(["ON_ACCOUNT", "CASH_ON_DELIVERY"]);
    expect(await enumLabels("RetailOrderSentVia")).toEqual(["WHATSAPP", "EMAIL", "BY_HAND"]);
    expect(await enumLabels("RetailOrderChaseAction")).toEqual(["REMIND", "CANCEL_REST"]);
    expect(await enumLabels("NotificationType")).toContain("RETAIL_ORDER_FOLLOW_UP");
    expect(await enumLabels("NotificationEntityType")).toContain("RETAIL_PURCHASE_ORDER");
  });

  it("names the supplier, not a typed name, and keeps the order's sending, chasing and bin", async () => {
    const facts = await columns("RetailPurchaseOrder");
    expect(facts.has("supplierName")).toBe(false);
    expect(facts.has("notes")).toBe(false);
    expect(facts.get("vendorId")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(facts.get("noteToSupplier")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("payment")).toMatchObject({
      udt_name: "RetailOrderPayment",
      is_nullable: "NO",
      column_default: "'ON_ACCOUNT'::\"RetailOrderPayment\"",
    });
    expect(facts.get("sentVia")).toMatchObject({ udt_name: "RetailOrderSentVia", is_nullable: "YES" });
    expect(facts.get("chaseAction")).toMatchObject({ udt_name: "RetailOrderChaseAction", is_nullable: "YES" });
    for (const name of ["sentById", "chasedById", "cancelledById", "duplicatedFromId"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["firstExpectedDate", "sentAt", "chasedAt", "followUpDoneAt", "cancelledAt", "archivedAt"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "YES" });
    }
    expect(await indexDef("RetailPurchaseOrder", "RetailPurchaseOrder_companyId_vendorId_status_idx")).toMatch(
      /\("companyId", "vendorId", status\)/,
    );
  });

  it("keeps a line's VAT rate, what was sent, whether it was closed short, and its place", async () => {
    const facts = await columns("RetailPurchaseOrderLine");
    expect(facts.get("vatRate")).toMatchObject({ data_type: "numeric", numeric_precision: 5, numeric_scale: 2, is_nullable: "NO" });
    expect(facts.get("sentQuantity")).toMatchObject({ data_type: "numeric", numeric_precision: 12, numeric_scale: 4, is_nullable: "YES" });
    expect(facts.get("closedShortAt")).toMatchObject({ is_nullable: "YES" });
    expect(facts.get("closedShortById")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("sortOrder")).toMatchObject({ data_type: "integer", is_nullable: "NO", column_default: "0" });
  });

  it("names a delivery's supplier and links its order", async () => {
    const facts = await columns("RetailGoodsReceipt");
    expect(facts.has("supplierName")).toBe(false);
    expect(facts.get("vendorId")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(await indexDef("RetailGoodsReceipt", "RetailGoodsReceipt_companyId_vendorId_idx")).toMatch(/\("companyId", "vendorId"\)/);
    const [fk] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) AS count FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'RetailGoodsReceipt' AND constraint_name = 'RetailGoodsReceipt_purchaseOrderId_fkey'`;
    expect(Number(fk.count)).toBe(1);
  });
});

/** The migration over orders and deliveries in the old shape, in a scratch schema, rolled back. */
async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `retail_purchase_orders_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "RetailPurchaseOrderStatus" AS ENUM ('DRAFT', 'PARTIAL', 'RECEIVED', 'CLOSED');
      CREATE TYPE "NotificationType" AS ENUM ('RETAIL_STAFF_MESSAGE');
      CREATE TYPE "NotificationEntityType" AS ENUM ('RETAIL_SETTINGS');
      CREATE TABLE "Company" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "IdSequence" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "entityKey" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "lastNumber" INT NOT NULL);
      CREATE TABLE "Vendor" (
        "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
      );
      CREATE TABLE "Product" ("id" TEXT PRIMARY KEY, "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0);
      CREATE TABLE "InventoryItem" ("id" TEXT PRIMARY KEY, "productId" TEXT);
      CREATE TABLE "RetailPurchaseOrder" (
        "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "poNo" TEXT NOT NULL, "supplierName" TEXT NOT NULL,
        "status" "RetailPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT', "expectedDate" TIMESTAMP(3), "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL
      );
      CREATE TABLE "RetailPurchaseOrderLine" (
        "id" TEXT PRIMARY KEY, "purchaseOrderId" TEXT NOT NULL, "inventoryItemId" TEXT,
        "quantity" DECIMAL(12,4) NOT NULL
      );
      CREATE TABLE "RetailGoodsReceipt" (
        "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "purchaseOrderId" TEXT, "supplierName" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '2026-08-13'
      );
      INSERT INTO "Company" ("id") VALUES ('shop-a'), ('shop-b');
      INSERT INTO "Vendor" ("id", "companyId", "name", "code", "createdAt", "updatedAt") VALUES
        ('afdis', 'shop-a', 'Afdis Distillers', 'SUP-0003', '2026-01-01', '2026-01-01');
      INSERT INTO "IdSequence" VALUES ('seq-sup', 'shop-a', 'RETAIL_SUPPLIER', 'GLOBAL', 3),
        ('seq-po', 'shop-a', 'RETAIL_PURCHASE_ORDER', 'site-1', 9), ('seq-other', 'shop-a', 'RETAIL_SALE', 'site-1', 4);
      INSERT INTO "Product" VALUES ('castle', 15.50);
      INSERT INTO "InventoryItem" VALUES ('castle-line', 'castle'), ('loose-line', NULL);
      INSERT INTO "RetailPurchaseOrder" ("id", "companyId", "poNo", "supplierName", "status", "expectedDate", "notes", "createdAt") VALUES
        ('o1', 'shop-a', 'PO-00001', 'Delta Beverages', 'PARTIAL', '2026-08-16', 'Back door', '2026-08-10'),
        ('o2', 'shop-a', 'PO-00002', 'afdis distillers ', 'DRAFT', NULL, NULL, '2026-08-11'),
        ('o3', 'shop-b', 'PO-00001', 'Delta Beverages', 'RECEIVED', '2026-08-01', NULL, '2026-07-30');
      INSERT INTO "RetailPurchaseOrderLine" VALUES ('l1', 'o1', 'castle-line', 240), ('l2', 'o1', 'loose-line', 12), ('l3', 'o2', NULL, 6);
      INSERT INTO "RetailGoodsReceipt" ("id", "companyId", "purchaseOrderId", "supplierName") VALUES
        ('r1', 'shop-a', 'o1', 'DELTA BEVERAGES'), ('r2', 'shop-a', 'gone', 'Mutare Wholesalers');
    `);
    await client.query(readFileSync(MIGRATION, "utf8"));
    const vendors = await client.query<{ id: string; companyId: string; name: string; code: string }>(
      `SELECT "id", "companyId", "name", "code" FROM "Vendor" ORDER BY "companyId", "code"`,
    );
    const orders = await client.query<{
      id: string; vendor: string; noteToSupplier: string | null; firstExpectedDate: Date | null; sentAt: Date | null; sentVia: string | null;
    }>(
      `SELECT o."id", v."name" AS vendor, o."noteToSupplier", o."firstExpectedDate", o."sentAt", o."sentVia"::text AS "sentVia"
       FROM "RetailPurchaseOrder" o JOIN "Vendor" v ON v."id" = o."vendorId" ORDER BY o."id"`,
    );
    const lines = await client.query<{ id: string; vatRate: string; sentQuantity: string }>(
      `SELECT "id", "vatRate"::text AS "vatRate", "sentQuantity"::text AS "sentQuantity" FROM "RetailPurchaseOrderLine" ORDER BY "id"`,
    );
    const receipts = await client.query<{ id: string; vendor: string; purchaseOrderId: string | null }>(
      `SELECT r."id", v."name" AS vendor, r."purchaseOrderId" FROM "RetailGoodsReceipt" r JOIN "Vendor" v ON v."id" = r."vendorId" ORDER BY r."id"`,
    );
    const sequences = await client.query<{ entityKey: string }>(`SELECT "entityKey" FROM "IdSequence" ORDER BY "entityKey"`);
    return { vendors: vendors.rows, orders: orders.rows, lines: lines.rows, receipts: receipts.rows, sequences: sequences.rows };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("orders and deliveries kept before the migration", () => {
  it("point at a supplier of the typed name, made and numbered when none was", async () => {
    const result = await migrate();
    expect(result.vendors.map(({ companyId, name, code }) => ({ companyId, name, code }))).toEqual([
      { companyId: "shop-a", name: "Afdis Distillers", code: "SUP-0003" },
      { companyId: "shop-a", name: "Delta Beverages", code: "SUP-0004" },
      { companyId: "shop-a", name: "Mutare Wholesalers", code: "SUP-0005" },
      { companyId: "shop-b", name: "Delta Beverages", code: "SUP-0001" },
    ]);
    expect(result.orders.map(({ id, vendor }) => ({ id, vendor }))).toEqual([
      { id: "o1", vendor: "Delta Beverages" },
      { id: "o2", vendor: "Afdis Distillers" },
      { id: "o3", vendor: "Delta Beverages" },
    ]);
    expect(result.receipts).toEqual([
      { id: "r1", vendor: "Delta Beverages", purchaseOrderId: "o1" },
      { id: "r2", vendor: "Mutare Wholesalers", purchaseOrderId: null },
    ]);
  });

  it("keep the note, count lateness from the expected date, and are sent by hand once something came", async () => {
    const { orders } = await migrate();
    const [o1, o2, o3] = orders;
    expect(o1.noteToSupplier).toBe("Back door");
    expect(o1.firstExpectedDate?.toISOString().slice(0, 10)).toBe("2026-08-16");
    expect(o1.sentAt?.toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(o1.sentVia).toBe("BY_HAND");
    expect(o2.sentAt).toBeNull();
    expect(o2.sentVia).toBeNull();
    expect(o3.sentVia).toBe("BY_HAND");
  });

  it("take each line's VAT rate from its product and what was sent from what was ordered", async () => {
    const { lines } = await migrate();
    expect(lines).toEqual([
      { id: "l1", vatRate: "15.50", sentQuantity: "240.0000" },
      { id: "l2", vatRate: "0.00", sentQuantity: "12.0000" },
      { id: "l3", vatRate: "0.00", sentQuantity: "6.0000" },
    ]);
  });

  it("drop the per-site order sequences and the supplier sequence so numbers follow the highest kept", async () => {
    const { sequences } = await migrate();
    expect(sequences).toEqual([{ entityKey: "RETAIL_SALE" }]);
  });
});
