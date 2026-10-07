/**
 * Migration witness for `20261007090000_retail_sale_floor` (FLR-01).
 *
 * A sale knows who it was rung for (`customerId`, beside the printed
 * `customerName`), a refund or void knows the manager who approved it, and a
 * refund says whether its goods went back on the shelf. Sales kept before it
 * are linked to a customer only where their name is exactly one live
 * customer's, and the "(approved by …)" a reason carried moves to its own
 * column — run here against sales in the old shape, in a scratch schema,
 * rolled back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261007090000_retail_sale_floor/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function indexDef(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table} AND indexname = ${name}`;
  return row?.indexdef ?? null;
}

async function foreignKey(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ${name}`;
  return row?.def ?? null;
}

describe("a sale's customer, approver and shelf, as stored", () => {
  it("keeps the customer, the approver and whether a refund was restocked", async () => {
    const facts = await columns("RetailSale");
    for (const name of ["customerId", "approvedById", "approvedByName"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    expect(facts.get("restocked")).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
  });

  it("finds a customer's sales and a day's sales of a kind by index", async () => {
    expect(await indexDef("RetailSale", "RetailSale_companyId_customerId_idx")).toMatch(/\("companyId", "customerId"\)/);
    expect(await indexDef("RetailSale", "RetailSale_companyId_saleType_postedAt_idx")).toMatch(
      /\("companyId", "saleType", "postedAt"\)/,
    );
  });

  it("lets go of a customer or an approver who is removed, keeping the sale", async () => {
    expect(await foreignKey("RetailSale_customerId_fkey")).toMatch(/REFERENCES "Customer"\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
    expect(await foreignKey("RetailSale_approvedById_fkey")).toMatch(/REFERENCES "User"\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
  });
});

type OldSale = { id: string; customerName: string | null; overrideReason: string | null };

/** The migration over sales in the old shape, in a scratch schema, rolled back. */
async function migrate(sales: OldSale[]) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `retail_sale_floor_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Customer" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true);
      CREATE TABLE "RetailSale" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "customerName" TEXT,
        "overrideReason" TEXT,
        "saleType" TEXT NOT NULL DEFAULT 'SALE',
        "postedAt" TIMESTAMP(3)
      );
      INSERT INTO "Customer" ("id", "companyId", "name", "isActive") VALUES
        ('c-tapiwa', 'shop-a', 'Tapiwa Marange', true),
        ('c-john-1', 'shop-a', 'John', true),
        ('c-john-2', 'shop-a', 'John', true),
        ('c-other', 'shop-b', 'Rudo', true),
        ('c-gone', 'shop-a', 'Nyasha', false);
    `);
    for (const sale of sales) {
      await client.query(
        `INSERT INTO "RetailSale" ("id", "companyId", "customerName", "overrideReason") VALUES ($1, 'shop-a', $2, $3)`,
        [sale.id, sale.customerName, sale.overrideReason],
      );
    }
    await client.query(readFileSync(MIGRATION, "utf8"));
    const kept = await client.query<{ id: string; customerId: string | null; approvedByName: string | null; overrideReason: string | null }>(
      `SELECT "id", "customerId", "approvedByName", "overrideReason" FROM "RetailSale" ORDER BY "id"`,
    );
    return kept.rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("sales kept before the migration", () => {
  it("link only a name that is exactly one live customer of the shop, and move the approver out of the reason", async () => {
    const rows = await migrate([
      { id: "s1", customerName: "Tapiwa Marange", overrideReason: null },
      { id: "s2", customerName: "John", overrideReason: null },
      { id: "s3", customerName: "Rudo", overrideReason: null },
      { id: "s4", customerName: "Nyasha", overrideReason: null },
      { id: "s5", customerName: null, overrideReason: "Rang up wrong (approved by Tafara Nyathi)" },
      { id: "s6", customerName: null, overrideReason: "Price match" },
    ]);
    expect(rows).toEqual([
      { id: "s1", customerId: "c-tapiwa", approvedByName: null, overrideReason: null },
      { id: "s2", customerId: null, approvedByName: null, overrideReason: null },
      { id: "s3", customerId: null, approvedByName: null, overrideReason: null },
      { id: "s4", customerId: null, approvedByName: null, overrideReason: null },
      { id: "s5", customerId: null, approvedByName: "Tafara Nyathi", overrideReason: "Rang up wrong" },
      { id: "s6", customerId: null, approvedByName: null, overrideReason: "Price match" },
    ]);
  });
});
