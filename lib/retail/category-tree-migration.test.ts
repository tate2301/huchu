/**
 * Migration witness for `20261005130400_retail_category_tree` (PRD-02).
 *
 * A category can sit inside one other ("Spirits · Liqueur"), says whether its
 * 0% is Zero-rated or Exempt, and remembers which shop type's seed made it.
 * Read off the database, not the schema file; the backfill is run again on a
 * fixture of one liquor store and one general shop.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261005130400_retail_category_tree/migration.sql");

const companies: string[] = [];

async function company(businessType: "LIQUOR" | "GENERAL") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row = await prisma.company.create({
    data: { name: `Tree witness ${stamp}`, slug: `tree-witness-${stamp}` },
    select: { id: true },
  });
  companies.push(row.id);
  await prisma.retailShopProfile.create({ data: { companyId: row.id, businessType } });
  return row.id;
}

let liquor: string;
let general: string;

beforeAll(async () => {
  liquor = await company("LIQUOR");
  general = await company("GENERAL");
});

afterAll(async () => {
  await prisma.retailCategory.updateMany({ where: { companyId: { in: companies } }, data: { parentId: null } });
  await prisma.retailCategory.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId: { in: companies } } });
  await prisma.company.deleteMany({ where: { id: { in: companies } } });
});

describe("the category tree, as stored", () => {
  it("adds parentId, vatExempt and seededFor with their types and defaults", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null }>
    >`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'RetailCategory' AND column_name IN ('parentId', 'vatExempt', 'seededFor')
      ORDER BY column_name`;
    expect(rows).toEqual([
      { column_name: "parentId", data_type: "text", udt_name: "text", is_nullable: "YES", column_default: null },
      { column_name: "seededFor", data_type: "USER-DEFINED", udt_name: "RetailBusinessType", is_nullable: "YES", column_default: null },
      { column_name: "vatExempt", data_type: "boolean", udt_name: "bool", is_nullable: "NO", column_default: "false" },
    ]);
  });

  it("indexes parentId and points it at a category, letting go when the parent is removed", async () => {
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'RetailCategory' AND indexname = 'RetailCategory_parentId_idx'`;
    expect(index?.indexdef).toContain('("parentId")');

    const [fk] = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'RetailCategory_parentId_fkey'`;
    expect(fk?.delete_rule).toBe("SET NULL");

    const spirits = await prisma.retailCategory.create({ data: { companyId: liquor, name: "Spirits (fk)" } });
    const liqueur = await prisma.retailCategory.create({
      data: { companyId: liquor, name: "Liqueur (fk)", parentId: spirits.id },
    });
    await prisma.retailCategory.delete({ where: { id: spirits.id } });
    expect((await prisma.retailCategory.findUniqueOrThrow({ where: { id: liqueur.id } })).parentId).toBeNull();
  });

  it("backfills seededFor on each shop type's seed names, and leaves the shop's own alone", async () => {
    await prisma.retailCategory.createMany({
      data: [
        { companyId: liquor, name: "Beer" },
        { companyId: liquor, name: "Ice and mixers" },
        { companyId: liquor, name: "Groceries" },
        { companyId: liquor, name: "Mixers" },
        { companyId: general, name: "Snacks" },
        { companyId: general, name: "Beer" },
      ],
    });
    const sql = readFileSync(MIGRATION, "utf8");
    const backfill = sql.slice(sql.indexOf("-- Backfill"));
    for (const statement of backfill.split(";").map((part) => part.trim()).filter((part) => part.includes("UPDATE"))) {
      await prisma.$executeRawUnsafe(statement.slice(statement.indexOf("UPDATE")));
    }

    const rows = await prisma.retailCategory.findMany({
      where: { companyId: { in: [liquor, general] }, name: { not: { contains: "(fk)" } } },
      select: { companyId: true, name: true, seededFor: true },
    });
    const seeded = (companyId: string, name: string) =>
      rows.find((row) => row.companyId === companyId && row.name === name)?.seededFor;
    expect(seeded(liquor, "Beer")).toBe("LIQUOR");
    expect(seeded(liquor, "Ice and mixers")).toBe("LIQUOR");
    expect(seeded(liquor, "Groceries")).toBeNull();
    expect(seeded(liquor, "Mixers")).toBeNull();
    expect(seeded(general, "Snacks")).toBe("GENERAL");
    expect(seeded(general, "Beer")).toBeNull();
  });
});
