/**
 * Migration witness for `20261008010000_retail_price_list_rules` (PRD-05, 20-products 3.5).
 *
 * A price list carries its rules (who, when, where, what it follows) and a
 * state instead of `isActive`; a list may name the categories it applies to;
 * a price row says whether it follows its base; a sale line records the list
 * it was priced from; "Shelf prices" becomes the default "Retail", and one
 * company has one live default.
 *
 * Read off the database; the rename is run again on a fixture inside a
 * transaction that is rolled back.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = join(process.cwd(), "prisma/migrations/20261008010000_retail_price_list_rules/migration.sql");

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

async function deleteRule(constraint: string): Promise<string | undefined> {
  const [row] = await prisma.$queryRaw<Array<{ rule: string }>>`
    SELECT delete_rule AS rule FROM information_schema.referential_constraints WHERE constraint_name = ${constraint}`;
  return row?.rule;
}

/** The statements of the migration that start with `prefix`, comments stripped. */
function statements(prefix: string): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split(/;\s*\n/)
    .map((part) => part.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim())
    .filter((part) => part.startsWith(prefix));
}

class RolledBack extends Error {}

describe("a price list's rules, as stored", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let companyId: string;

  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: `Price Rules ${stamp}`, slug: `price-rules-${stamp}` } })).id;
  });

  afterAll(async () => {
    await prisma.priceList.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("adds the state, audience, when and basis enums", async () => {
    expect(await enumLabels("PriceListState")).toEqual(["DRAFT", "ON", "PAUSED"]);
    expect(await enumLabels("PriceListAudience")).toEqual(["EVERYONE", "ACCOUNT_CUSTOMERS", "LOYALTY_MEMBERS", "STAFF"]);
    expect(await enumLabels("PriceListWhen")).toEqual(["ALWAYS", "DAYS_AND_HOURS", "BETWEEN_DATES"]);
    expect(await enumLabels("PriceListBasis")).toEqual(["OWN", "LIST", "COST"]);
  });

  it("gives a list its rules and drops isActive", async () => {
    expect(await column("PriceList", "isActive")).toBeNull();
    expect(await column("PriceList", "state")).toMatchObject({ type: "PriceListState", nullable: false, fallback: "'ON'::\"PriceListState\"" });
    expect(await column("PriceList", "audience")).toMatchObject({ type: "PriceListAudience", nullable: false });
    expect(await column("PriceList", "whenKind")).toMatchObject({ type: "PriceListWhen", nullable: false });
    expect(await column("PriceList", "daysOfWeek")).toMatchObject({ type: "_int4" });
    expect(await column("PriceList", "fromTime")).toMatchObject({ type: "text", nullable: true });
    expect(await column("PriceList", "toTime")).toMatchObject({ type: "text", nullable: true });
    expect(await column("PriceList", "startsOn")).toMatchObject({ type: "date", nullable: true });
    expect(await column("PriceList", "endsOn")).toMatchObject({ type: "date", nullable: true });
    expect(await column("PriceList", "minQuantity")).toMatchObject({ type: "int4", nullable: false, fallback: "1" });
    expect(await column("PriceList", "basis")).toMatchObject({ type: "PriceListBasis", nullable: false });
    expect(await column("PriceList", "adjustPercent")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("PriceList", "archivedAt")).toMatchObject({ type: "timestamp", nullable: true });
    expect(await deleteRule("PriceList_siteId_fkey")).toBe("SET NULL");
    expect(await deleteRule("PriceList_basisListId_fkey")).toBe("SET NULL");
    expect(await deleteRule("PriceList_updatedById_fkey")).toBe("SET NULL");
    const indexes = await prisma.$queryRaw<Array<{ name: string; def: string }>>`
      SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE tablename = 'PriceList' ORDER BY indexname`;
    const names = indexes.map((index) => index.name);
    expect(names).toContain("PriceList_companyId_state_kind_idx");
    expect(names).not.toContain("PriceList_companyId_isActive_kind_idx");
    const oneDefault = indexes.find((index) => index.name === "PriceList_one_default");
    expect(oneDefault?.def).toMatch(/UNIQUE INDEX .* WHERE \("isDefault" AND \("archivedAt" IS NULL\)\)/);
  });

  it("names a list's categories, a row's following and a sale line's list", async () => {
    expect(await column("PriceListCategory", "priceListId")).toMatchObject({ type: "text", nullable: false });
    expect(await column("PriceListCategory", "categoryId")).toMatchObject({ type: "text", nullable: false });
    expect(await deleteRule("PriceListCategory_priceListId_fkey")).toBe("CASCADE");
    expect(await deleteRule("PriceListCategory_categoryId_fkey")).toBe("CASCADE");
    expect(await column("ProductPrice", "followsBase")).toMatchObject({ type: "bool", nullable: false, fallback: "false" });
    expect(await column("RetailSaleLine", "priceListId")).toMatchObject({ type: "text", nullable: true });
    expect(await deleteRule("RetailSaleLine_priceListId_fkey")).toBe("SET NULL");
  });

  it("allows one live default per company, a binned one aside", async () => {
    await prisma.priceList.create({ data: { companyId, name: `One ${stamp}`, isDefault: true } });
    await expect(prisma.priceList.create({ data: { companyId, name: `Two ${stamp}`, isDefault: true } })).rejects.toThrow();
    const binned = await prisma.priceList.create({ data: { companyId, name: `Binned ${stamp}`, isDefault: true, archivedAt: new Date() } });
    expect(binned.isDefault).toBe(true);
    await prisma.priceList.deleteMany({ where: { companyId } });
  });

  it("renames Shelf prices to the default Retail and clears the company's other defaults", async () => {
    let after: Array<{ name: string; isDefault: boolean }> = [];
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`DROP INDEX "PriceList_one_default"`);
        await tx.priceList.create({ data: { companyId, name: "Trade", kind: "TRADE", isDefault: true } });
        await tx.priceList.create({ data: { companyId, name: "Shelf prices", kind: "RETAIL", isDefault: false } });
        for (const sql of statements('UPDATE "PriceList" SET "isDefault" = false')) await tx.$executeRawUnsafe(sql);
        for (const sql of statements('UPDATE "PriceList" SET "name" = \'Retail\'')) await tx.$executeRawUnsafe(sql);
        after = await tx.priceList.findMany({ where: { companyId }, select: { name: true, isDefault: true }, orderBy: { name: "asc" } });
        throw new RolledBack();
      }),
    ).rejects.toBeInstanceOf(RolledBack);
    expect(after).toEqual([
      { name: "Retail", isDefault: true },
      { name: "Trade", isDefault: false },
    ]);
  });
});
