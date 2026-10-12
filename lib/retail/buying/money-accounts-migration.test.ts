/**
 * Migration witness for `20261012130800_retail_money_accounts` (BUY-05).
 *
 * A posting rule line can post to an account the event names
 * (`EVENT_ACCOUNT`, by `eventAccountKey`); a supplier payment names its
 * supplier, the payment it is one row of (`groupNo`) and the requisition whose
 * cash it is; three retail source types carry a requisition's payout, its
 * change and a supplier payment to the books. Run against tables in the old
 * shape, in a scratch schema rolled back: a payment kept before this names its
 * bill's supplier after it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261012130800_retail_money_accounts/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable
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

describe("money out, as stored", () => {
  it("posts to an account the event names, and carries payouts, change and supplier payments to the books", async () => {
    expect(await enumLabels("PostingRuleLineAccountSource")).toContain("EVENT_ACCOUNT");
    const types = await enumLabels("AccountingSourceType");
    for (const type of ["RETAIL_REQUISITION_PAYOUT", "RETAIL_REQUISITION_CHANGE", "RETAIL_SUPPLIER_PAYMENT"]) expect(types, type).toContain(type);
    expect((await columns("PostingRuleLine")).get("eventAccountKey")).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });

  it("names a payment's supplier, its payment group and the requisition whose cash it is", async () => {
    const facts = await columns("PurchasePayment");
    for (const name of ["vendorId", "groupNo", "requisitionId"]) expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(await indexDef("PurchasePayment", "PurchasePayment_companyId_vendorId_billId_idx")).toContain('("companyId", "vendorId", "billId")');
    expect(await indexDef("PurchasePayment", "PurchasePayment_companyId_groupNo_idx")).toContain('("companyId", "groupNo")');
  });
});

/** The migration over payments in the old shape, in a scratch schema, rolled back. */
async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `witness_money_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "AccountingSourceType" AS ENUM ('RETAIL_GOODS_RECEIPT');
      CREATE TYPE "PostingRuleLineAccountSource" AS ENUM ('FIXED_ACCOUNT', 'TENDER_MAPPING', 'ROLE_MAPPING');
      CREATE TABLE "Vendor" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "CrmRequisition" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "PostingRuleLine" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "PurchaseBill" ("id" TEXT PRIMARY KEY, "vendorId" TEXT NOT NULL);
      CREATE TABLE "PurchasePayment" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "billId" TEXT);
      INSERT INTO "Vendor" VALUES ('afdis'), ('delta');
      INSERT INTO "PurchaseBill" VALUES ('bill-afdis', 'afdis'), ('bill-delta', 'delta');
      INSERT INTO "PurchasePayment" VALUES ('pay-1', 'shop', 'bill-afdis'), ('pay-2', 'shop', 'bill-delta'), ('pay-3', 'shop', NULL);
    `);
    await client.query(readFileSync(MIGRATION, "utf8"));
    const payments = await client.query<{ id: string; vendorId: string | null }>(`SELECT "id", "vendorId" FROM "PurchasePayment" ORDER BY "id"`);
    return payments.rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("payments kept before the migration", () => {
  it("name the supplier of the bill they paid", async () => {
    expect(await migrate()).toEqual([
      { id: "pay-1", vendorId: "afdis" },
      { id: "pay-2", vendorId: "delta" },
      { id: "pay-3", vendorId: null },
    ]);
  });
});
