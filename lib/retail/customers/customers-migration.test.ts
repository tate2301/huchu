/**
 * Migration witness for `20261012130200_retail_customers` (CUS-01, 60-customers §3.1).
 *
 * The customer's thirteen new columns, its code and card uniques, the phone
 * and bin indexes, the three links that let go (`SET NULL`), the notes table,
 * and the data step: customers numbered per company in the order they were
 * created, cards to match, phones written +263. Read off the database.
 */

import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop } from "@/lib/retail/products/test-fixtures";

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

const made: string[] = [];
afterAll(async () => {
  for (const companyId of made) await destroyProvisionedTenant(companyId);
});

describe("customers, as stored", () => {
  it("adds the thirteen columns with their types and defaults", async () => {
    for (const name of ["code", "whatsapp", "area", "cardNo", "tierHeld", "priceListId", "mergedIntoId", "createdById"]) {
      expect(await column("Customer", name)).toMatchObject({ type: "text", nullable: true });
    }
    expect(await column("Customer", "dateOfBirth")).toMatchObject({ type: "date", nullable: true });
    expect(await column("Customer", "tierHeldUntil")).toMatchObject({ type: "date", nullable: true });
    expect(await column("Customer", "marketingConsent")).toMatchObject({ type: "bool", nullable: false, fallback: "false" });
    expect(await column("Customer", "consentChangedAt")).toMatchObject({ type: "timestamp", nullable: true });
    expect(await column("Customer", "archivedAt")).toMatchObject({ type: "timestamp", nullable: true });
  });

  it("keys the code and the card per company and indexes phone and the bin", async () => {
    expect(await indexDef("Customer_companyId_code_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("Customer_companyId_code_key")).toContain(`("companyId", code)`);
    expect(await indexDef("Customer_companyId_cardNo_key")).toContain(`UNIQUE INDEX`);
    expect(await indexDef("Customer_companyId_cardNo_key")).toContain(`("companyId", "cardNo")`);
    expect(await indexDef("Customer_companyId_phone_idx")).toContain(`("companyId", phone)`);
    expect(await indexDef("Customer_companyId_archivedAt_idx")).toContain(`("companyId", "archivedAt")`);
  });

  it("lets go of a price list, a merged customer and the person who added it", async () => {
    expect(await foreignKey("Customer_priceListId_fkey")).toEqual({ rule: "SET NULL", target: "PriceList" });
    expect(await foreignKey("Customer_mergedIntoId_fkey")).toEqual({ rule: "SET NULL", target: "Customer" });
    expect(await foreignKey("Customer_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("creates the notes table, held to its customer", async () => {
    expect(await column("RetailCustomerNote", "body")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailCustomerNote", "createdById")).toMatchObject({ type: "text", nullable: true });
    expect(await indexDef("RetailCustomerNote_customerId_createdAt_idx")).toContain(`("customerId", "createdAt")`);
    expect(await foreignKey("RetailCustomerNote_customerId_fkey")).toEqual({ rule: "CASCADE", target: "Customer" });
    expect(await foreignKey("RetailCustomerNote_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("numbers customers in the order they were created and writes phones +263, as the data step does", async () => {
    const shop = await makeTestShop("Customer codes");
    made.push(shop.companyId);
    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 8, minutes));
    // Created out of order: the numbers follow `createdAt`, not the insert.
    const second = await prisma.customer.create({ data: { companyId: shop.companyId, name: "Rudo", phone: "263 77 555 1234", createdAt: at(2) } });
    const first = await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa", phone: "0774 123 388", createdAt: at(1) } });
    const third = await prisma.customer.create({ data: { companyId: shop.companyId, name: "Nyasha", phone: "+44-20-7946-0000", createdAt: at(3) } });

    const sql = readFileSync(`${process.cwd()}/prisma/migrations/20261012130200_retail_customers/migration.sql`, "utf8");
    const data = sql.slice(sql.indexOf("WITH numbered AS"));
    // The data step, kept to this shop so other tenants in the test database are left as they are.
    const scoped = data
      .replace(`FROM "Customer"\n)`, `FROM "Customer" WHERE "companyId" = '${shop.companyId}'\n)`)
      .replace(`WHERE "phone" IS NOT NULL;`, `WHERE "phone" IS NOT NULL AND "companyId" = '${shop.companyId}';`);
    const statements = scoped
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    const read = async (id: string) => prisma.customer.findUniqueOrThrow({ where: { id }, select: { code: true, cardNo: true, phone: true } });
    expect(await read(first.id)).toEqual({ code: "CUS-00001", cardNo: "600914000001", phone: "+263774123388" });
    expect(await read(second.id)).toEqual({ code: "CUS-00002", cardNo: "600914000002", phone: "+263775551234" });
    expect(await read(third.id)).toEqual({ code: "CUS-00003", cardNo: "600914000003", phone: "+442079460000" });
  });
});
