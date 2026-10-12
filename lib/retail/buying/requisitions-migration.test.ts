/**
 * Migration witness for `20261012130700_retail_requisitions` (BUY-04).
 *
 * A requisition can be for stock (`STOCK`), names the order or the expense
 * type it pays, who it is paid to, who it waits for and the limit it was
 * asked under, why it was turned down, and how it was cancelled; the payout
 * and acquittal columns packet 36 fills are there too. A shop's expense
 * types and the files the buying screens keep are tables of their own. A
 * money account (`BankAccount`) is cash, bank or mobile and sits in a ledger
 * account. Run against tables in the old shape, in a scratch schema rolled
 * back: the five expense types for a retail company, kept requisitions on
 * their type, kept bank accounts on 1010.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261012130700_retail_requisitions/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null; numeric_scale: number | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, is_nullable, column_default, numeric_scale
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

describe("requisitions, as stored", () => {
  it("has the stock category, the reasons to reject, the payout methods, the file kinds and the money-account kinds", async () => {
    expect(await enumLabels("CrmRequisitionCategory")).toContain("STOCK");
    expect(await enumLabels("CrmRequisitionRejectReason")).toEqual(["NOT_NEEDED_NOW", "TOO_MUCH", "PAY_ANOTHER_WAY", "OTHER"]);
    expect(await enumLabels("RetailPayoutMethod")).toEqual(["CASH", "BANK_TRANSFER", "ECOCASH"]);
    expect(await enumLabels("RetailAttachmentKind")).toEqual(["QUOTE", "RECEIPT", "BILL", "DELIVERY_NOTE", "PHOTO"]);
    expect(await enumLabels("MoneyAccountKind")).toEqual(["CASH", "BANK", "MOBILE"]);
    const types = await enumLabels("NotificationType");
    expect(types).toContain("CRM_REQUISITION_CANCELLED");
    expect(types).toContain("CRM_REQUISITION_QUESTION");
  });

  it("names the order, the expense type, the payee, the approver and the limit it was asked under", async () => {
    const facts = await columns("CrmRequisition");
    for (const name of ["purchaseOrderId", "expenseTypeId", "payeeVendorId", "approverId", "paidToId", "acquittedById", "changeAccountId", "cancelledById", "payoutReference", "acquittalNote"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["approvalLimit", "paidAmount", "changeAmount"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "numeric", numeric_scale: 2, is_nullable: "YES" });
    }
    expect(facts.get("rejectReason")).toMatchObject({ udt_name: "CrmRequisitionRejectReason", is_nullable: "YES" });
    expect(facts.get("payoutMethod")).toMatchObject({ udt_name: "RetailPayoutMethod", is_nullable: "YES" });
    expect(facts.get("cancelledAt")).toMatchObject({ is_nullable: "YES" });
    expect(facts.get("receiptsDueAt")).toMatchObject({ is_nullable: "YES" });
    expect(await indexDef("CrmRequisition", "CrmRequisition_companyId_purchaseOrderId_idx")).toContain('("companyId", "purchaseOrderId")');
  });

  it("keeps expense types one name per company and files by the record they belong to", async () => {
    const types = await columns("RetailExpenseType");
    expect(types.get("category")).toMatchObject({ udt_name: "CrmRequisitionCategory", is_nullable: "NO", column_default: "'OTHER'::\"CrmRequisitionCategory\"" });
    expect(types.get("ledgerAccountId")).toMatchObject({ is_nullable: "YES" });
    expect(await indexDef("RetailExpenseType", "RetailExpenseType_companyId_name_key")).toContain('UNIQUE INDEX');
    const files = await columns("RetailAttachment");
    expect(files.get("kind")).toMatchObject({ udt_name: "RetailAttachmentKind", is_nullable: "NO" });
    expect(files.get("size")).toMatchObject({ data_type: "integer", is_nullable: "NO" });
    expect(await indexDef("RetailAttachment", "RetailAttachment_companyId_entityType_entityId_idx")).toContain('("companyId", "entityType", "entityId")');
  });

  it("makes a money account cash, bank or mobile, in a ledger account", async () => {
    const facts = await columns("BankAccount");
    expect(facts.get("kind")).toMatchObject({ udt_name: "MoneyAccountKind", is_nullable: "NO", column_default: "'BANK'::\"MoneyAccountKind\"" });
    expect(facts.get("ledgerAccountId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });
});

/** The migration over a retail company and a mining one, in the old shape, in a scratch schema, rolled back. */
async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const schema = `witness_req_${process.pid}_${Date.now()}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(`
      CREATE TYPE "CrmRequisitionCategory" AS ENUM ('FUEL', 'AIRTIME', 'TRANSPORT', 'MATERIALS', 'EQUIPMENT', 'LABOUR', 'SUBSISTENCE', 'ACCOMMODATION', 'OTHER');
      CREATE TYPE "NotificationType" AS ENUM ('CRM_REQUISITION_SUBMITTED');
      CREATE TABLE "Company" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Vendor" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "RetailPurchaseOrder" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "RetailShopProfile" ("companyId" TEXT PRIMARY KEY);
      CREATE TABLE "ChartOfAccount" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "code" TEXT NOT NULL);
      CREATE TABLE "BankAccount" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "name" TEXT NOT NULL);
      CREATE TABLE "CrmRequisition" (
        "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "siteId" TEXT, "category" "CrmRequisitionCategory" NOT NULL
      );
      INSERT INTO "Company" VALUES ('shop'), ('mine');
      INSERT INTO "RetailShopProfile" VALUES ('shop');
      INSERT INTO "ChartOfAccount" VALUES
        ('shop-1010', 'shop', '1010'), ('shop-5300', 'shop', '5300'), ('shop-5500', 'shop', '5500'), ('shop-5100', 'shop', '5100'),
        ('mine-1010', 'mine', '1010');
      INSERT INTO "BankAccount" VALUES ('b-shop', 'shop', 'Operating Bank'), ('b-mine', 'mine', 'Payroll account');
      INSERT INTO "CrmRequisition" VALUES
        ('r-repair', 'shop', 'site-1', 'EQUIPMENT'), ('r-taxi', 'shop', 'site-1', 'TRANSPORT'), ('r-airtime', 'shop', 'site-1', 'AIRTIME'),
        ('r-crm', 'shop', NULL, 'FUEL');
    `);
    await client.query(readFileSync(MIGRATION, "utf8"));
    const types = await client.query<{ companyId: string; name: string; category: string; code: string | null }>(
      `SELECT e."companyId", e."name", e."category"::text AS category, a."code"
       FROM "RetailExpenseType" e LEFT JOIN "ChartOfAccount" a ON a."id" = e."ledgerAccountId" ORDER BY e."companyId", e."name"`,
    );
    const requisitions = await client.query<{ id: string; type: string | null }>(
      `SELECT r."id", e."name" AS type FROM "CrmRequisition" r LEFT JOIN "RetailExpenseType" e ON e."id" = r."expenseTypeId" ORDER BY r."id"`,
    );
    const accounts = await client.query<{ id: string; kind: string; ledger: string | null }>(
      `SELECT "id", "kind"::text AS kind, "ledgerAccountId" AS ledger FROM "BankAccount" ORDER BY "id"`,
    );
    return { types: types.rows, requisitions: requisitions.rows, accounts: accounts.rows };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

describe("a shop kept before the migration", () => {
  it("gets the five expense types, each on its account where the chart has it", async () => {
    const { types } = await migrate();
    expect(types).toEqual([
      { companyId: "shop", name: "Cleaning", category: "MATERIALS", code: "5100" },
      { companyId: "shop", name: "Electricity and water", category: "OTHER", code: null },
      { companyId: "shop", name: "Fuel and transport", category: "FUEL", code: "5500" },
      { companyId: "shop", name: "Licences and fees", category: "OTHER", code: null },
      { companyId: "shop", name: "Repairs and maintenance", category: "EQUIPMENT", code: "5300" },
    ]);
  });

  it("puts its requisitions on their type by category, and leaves a CRM one alone", async () => {
    const { requisitions } = await migrate();
    expect(requisitions).toEqual([
      { id: "r-airtime", type: null },
      { id: "r-crm", type: null },
      { id: "r-repair", type: "Repairs and maintenance" },
      { id: "r-taxi", type: "Fuel and transport" },
    ]);
  });

  it("makes every kept account a bank account in the company's 1010", async () => {
    const { accounts } = await migrate();
    expect(accounts).toEqual([
      { id: "b-mine", kind: "BANK", ledger: "mine-1010" },
      { id: "b-shop", kind: "BANK", ledger: "shop-1010" },
    ]);
  });
});
