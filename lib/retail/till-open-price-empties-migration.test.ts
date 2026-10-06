/**
 * Migration witness for `20261006130000_retail_till_open_price_approver_empties`.
 *
 * A product may have an open price, off by default. A sale names the manager
 * who approved it, and keeps the name when the person goes. A shop names each
 * deposit value once. Empties brought back go on a ledger per supplier, which
 * keeps its rows when their sale goes and refuses a zero count.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

let companyId: string;

async function columns(table: string): Promise<Record<string, { type: string; nullable: boolean; default: string | null }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; type: string; nullable: string; default: string | null }>>`
    SELECT column_name AS name, udt_name AS type, is_nullable AS nullable, column_default AS default
    FROM information_schema.columns WHERE table_name = ${table}`;
  return Object.fromEntries(rows.map((row) => [row.name, { type: row.type, nullable: row.nullable === "YES", default: row.default }]));
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE tablename = ${table}`;
  return rows.map((row) => row.indexname);
}

const insertKind = (amount: number, name: string) => prisma.$executeRaw`
  INSERT INTO "RetailDepositKind" ("id", "companyId", "amount", "name", "updatedAt")
  VALUES (gen_random_uuid()::text, ${companyId}, ${amount}, ${name}, now())`;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (
    await prisma.company.create({ data: { name: `Empties ${stamp}`, slug: `empties-witness-${stamp}` }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.retailDepositKind.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("an open price, as stored", () => {
  it("is a product's own switch, off unless set", async () => {
    expect((await columns("Product")).openPrice).toMatchObject({ type: "bool", nullable: false, default: "false" });
  });
});

describe("the manager who approved a sale, as stored", () => {
  it("is optional, and keeps the name when the person goes", async () => {
    const cols = await columns("RetailSale");
    expect(cols.approvedById).toMatchObject({ type: "text", nullable: true });
    expect(cols.approvedByName).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("RetailSale_approvedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });
});

describe("a named deposit value, as stored", () => {
  it("has one name per amount in a shop, and only for an amount above nothing", async () => {
    const cols = await columns("RetailDepositKind");
    expect(cols.amount).toMatchObject({ type: "numeric", nullable: false });
    expect(cols.name).toMatchObject({ type: "text", nullable: false });
    await insertKind(0.1, "Bottles, 340 to 375ml");
    await expect(insertKind(0.1, "Quarts")).rejects.toThrow(/Unique constraint|duplicate key/);
    await expect(insertKind(0, "Nothing")).rejects.toThrow(/RetailDepositKind_amount_positive/);
    expect(await foreignKey("RetailDepositKind_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
  });
});

describe("the empties ledger, as stored", () => {
  it("counts whole bottles at a deposit each, never zero", async () => {
    const cols = await columns("RetailEmptiesEntry");
    expect(cols.quantity).toMatchObject({ type: "int4", nullable: false });
    expect(cols.depositAmount).toMatchObject({ type: "numeric", nullable: false });
    expect(cols.saleId).toMatchObject({ type: "text", nullable: true });
    const [check] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'RetailEmptiesEntry_quantity_nonzero'`;
    expect(check?.def).toMatch(/quantity <> 0/);
  });

  it("is kept by supplier, product and site, and outlives its sale", async () => {
    expect(await foreignKey("RetailEmptiesEntry_supplierId_fkey")).toEqual({ foreign_table: "Vendor", delete_rule: "RESTRICT" });
    expect(await foreignKey("RetailEmptiesEntry_productId_fkey")).toEqual({ foreign_table: "Product", delete_rule: "RESTRICT" });
    expect(await foreignKey("RetailEmptiesEntry_siteId_fkey")).toEqual({ foreign_table: "Site", delete_rule: "RESTRICT" });
    expect(await foreignKey("RetailEmptiesEntry_saleId_fkey")).toEqual({ foreign_table: "RetailSale", delete_rule: "SET NULL" });
    expect(await foreignKey("RetailEmptiesEntry_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
  });

  it("is read by supplier within a shop", async () => {
    expect(await indexes("RetailEmptiesEntry")).toEqual(
      expect.arrayContaining(["RetailEmptiesEntry_companyId_supplierId_idx", "RetailEmptiesEntry_saleId_idx"]),
    );
  });
});
