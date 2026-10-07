/**
 * Migration witness for `20261005142607_retail_category_live_name` (PRD-02).
 *
 * A category's name is unique among the shop's live categories, whatever its
 * case; one in the bin does not hold it. Read off the database, not the
 * schema file, which cannot express a partial index.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

let companyId: string;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (
    await prisma.company.create({ data: { name: `Live name ${stamp}`, slug: `live-name-${stamp}` }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("a category's name, as stored", () => {
  it("drops the old unique on every row and indexes live names, case folded", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'RetailCategory' AND indexname IN ('RetailCategory_companyId_name_key', 'RetailCategory_live_name_key')`;
    expect(indexes.map((row) => row.indexname)).toEqual(["RetailCategory_live_name_key"]);
    const def = indexes[0]!.indexdef;
    expect(def).toContain("CREATE UNIQUE INDEX");
    expect(def).toContain('"companyId", lower(name)');
    expect(def).toContain('WHERE ("archivedAt" IS NULL)');
  });

  it("lets a binned name be taken again, and refuses two live ones in any case", async () => {
    await prisma.retailCategory.create({ data: { companyId, name: "Mixers", archivedAt: new Date() } });
    await prisma.retailCategory.create({ data: { companyId, name: "Mixers" } });
    await expect(prisma.retailCategory.create({ data: { companyId, name: "MIXERS" } })).rejects.toMatchObject({
      code: "P2002",
    });
    expect(await prisma.retailCategory.count({ where: { companyId, name: "Mixers" } })).toBe(2);
  });
});
