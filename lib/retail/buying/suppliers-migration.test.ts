/**
 * Migration witness for `20261006115736_retail_suppliers` (BUY-01).
 *
 * A supplier is the accounting module's `Vendor`, now with the shop's terms
 * (pays, delivers, lead time, minimum), its WhatsApp number, its number
 * ("SUP-0001", once per company), whether it is still bought from, and its
 * people (`VendorContact`). A message knows whether it went out or came in,
 * and which record it is about. Suppliers kept before it get their number, a
 * WhatsApp number from their phone, and their named contact as the rep — run
 * here against vendors in the old shape, in a scratch schema rolled back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261006115736_retail_suppliers/migration.sql");

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
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function indexDef(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table} AND indexname = ${name}`;
  return row?.indexdef ?? null;
}

describe("suppliers, as stored", () => {
  it("names who a contact is sent and which way a message went", async () => {
    expect(await enumLabels("VendorContactSends")).toEqual(["ORDERS", "STATEMENTS", "NOTHING"]);
    expect(await enumLabels("RetailMessageDirection")).toEqual(["OUT", "IN"]);
  });

  it("keeps a supplier's number, WhatsApp, terms, bank and whether it is still bought from", async () => {
    const facts = await columns("Vendor");
    for (const name of ["code", "whatsapp", "deliversOn", "bankDetails", "stoppedById", "createdById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["payTermsDays", "leadTimeDays"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "integer", is_nullable: "YES" });
    }
    expect(facts.get("minimumOrder")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "YES",
    });
    expect(facts.get("sendOrdersOnWhatsapp")).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
    expect(facts.get("stoppedAt")).toMatchObject({ is_nullable: "YES" });
  });

  it("numbers suppliers once per company", async () => {
    expect(await indexDef("Vendor", "Vendor_companyId_code_key")).toMatch(/CREATE UNIQUE INDEX .* \("companyId", code\)/);
  });

  it("keeps a supplier's people with what they are sent", async () => {
    const facts = await columns("VendorContact");
    for (const name of ["companyId", "vendorId", "name"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "NO" });
    }
    for (const name of ["role", "phone", "email"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    expect(facts.get("sends")).toMatchObject({
      udt_name: "VendorContactSends",
      is_nullable: "NO",
      column_default: "'ORDERS'::\"VendorContactSends\"",
    });
    expect(facts.get("removedAt")).toMatchObject({ is_nullable: "YES" });
    expect(await indexDef("VendorContact", "VendorContact_vendorId_idx")).toMatch(/\("vendorId"\)/);
  });

  it("links a message to what it is about, and says which way it went", async () => {
    const facts = await columns("RetailMessage");
    expect(facts.get("direction")).toMatchObject({
      udt_name: "RetailMessageDirection",
      is_nullable: "NO",
      column_default: "'OUT'::\"RetailMessageDirection\"",
    });
    for (const name of ["entityType", "entityId", "fromNumber"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    expect(facts.has("attachmentUrl")).toBe(false);
    expect(await indexDef("RetailMessage", "RetailMessage_companyId_entityType_entityId_createdAt_idx")).toMatch(
      /\("companyId", "entityType", "entityId", "createdAt"\)/,
    );
  });
});

type OldVendor = { id: string; companyId: string; name: string; contactName: string | null; phone: string | null; email: string | null; createdAt: string };

/** The migration over vendors in the old shape, in a scratch schema, rolled back. */
async function migrate(vendors: OldVendor[]) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `retail_suppliers_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "Company" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "RetailMessage" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE "Vendor" (
        "id" TEXT PRIMARY KEY,
        "companyId" TEXT NOT NULL REFERENCES "Company"("id"),
        "name" TEXT NOT NULL,
        "contactName" TEXT,
        "phone" TEXT,
        "email" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL
      );
      INSERT INTO "Company" ("id") VALUES ('shop-a'), ('shop-b');
    `);
    for (const vendor of vendors) {
      await client.query(
        `INSERT INTO "Vendor" ("id", "companyId", "name", "contactName", "phone", "email", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [vendor.id, vendor.companyId, vendor.name, vendor.contactName, vendor.phone, vendor.email, vendor.createdAt],
      );
    }
    await client.query(readFileSync(MIGRATION, "utf8"));
    const kept = await client.query<{ id: string; code: string; whatsapp: string | null }>(
      `SELECT "id", "code", "whatsapp" FROM "Vendor" ORDER BY "id"`,
    );
    const contacts = await client.query<{ vendorId: string; name: string; role: string; phone: string | null; email: string | null; sends: string }>(
      `SELECT "vendorId", "name", "role", "phone", "email", "sends"::text AS sends FROM "VendorContact" ORDER BY "vendorId"`,
    );
    return { vendors: kept.rows, contacts: contacts.rows };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("suppliers kept before the migration", () => {
  it("are numbered per company in the order they were added, WhatsApp from their phone, the named contact as rep", async () => {
    const result = await migrate([
      { id: "v1", companyId: "shop-a", name: "Afdis", contactName: "Ruvimbo Sithole", phone: "+263 24 266 8001", email: "orders@afdis.co.zw", createdAt: "2026-02-01" },
      { id: "v2", companyId: "shop-a", name: "Delta", contactName: null, phone: "+263 24 270 1600", email: null, createdAt: "2026-01-01" },
      { id: "v3", companyId: "shop-b", name: "Pamela", contactName: "  ", phone: null, email: null, createdAt: "2026-03-01" },
    ]);
    expect(result.vendors).toEqual([
      { id: "v1", code: "SUP-0002", whatsapp: "+263 24 266 8001" },
      { id: "v2", code: "SUP-0001", whatsapp: "+263 24 270 1600" },
      { id: "v3", code: "SUP-0001", whatsapp: null },
    ]);
    expect(result.contacts).toEqual([
      { vendorId: "v1", name: "Ruvimbo Sithole", role: "Sales rep", phone: "+263 24 266 8001", email: "orders@afdis.co.zw", sends: "ORDERS" },
    ]);
  });
});
