/**
 * Migration witness for `20261003140707_retail_shop_profile_and_categories`.
 *
 * Required by `CONTRIBUTING.md`: a schema change ships with a test that reads
 * the database, not the schema file. These assert what the migration promises —
 * the business type is an enum with exactly two labels, a category's
 * percentages stay in range, a product survives its category being removed,
 * and a company cannot have two categories with one name. The licence-hours
 * columns it added went in `20261006090000_retail_licence_hours_and_held_release`.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

let companyId: string;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const company = await prisma.company.create({
    data: { name: `Witness ${stamp}`, slug: `shop-witness-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("retail shop profile and categories, as stored", () => {
  it("keeps the business type as an enum of exactly two labels", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'RetailBusinessType'
      ORDER BY e.enumsortorder`;
    expect(labels.map((row) => row.label)).toEqual(["GENERAL", "LIQUOR"]);

    const [column] = await prisma.$queryRaw<Array<{ udt_name: string }>>`
      SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'RetailShopProfile' AND column_name = 'businessType'`;
    expect(column.udt_name).toBe("RetailBusinessType");
  });

  it("keeps a category's VAT, margin and deposit in range", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "RetailCategory" ("id", "companyId", "name", "vatRate", "updatedAt")
        VALUES (gen_random_uuid()::text, ${companyId}, 'Bad VAT', 115, now())`,
    ).rejects.toThrow(/RetailCategory_vatRate_range/);
    await expect(
      prisma.$executeRaw`
        INSERT INTO "RetailCategory" ("id", "companyId", "name", "targetMarginPercent", "updatedAt")
        VALUES (gen_random_uuid()::text, ${companyId}, 'Bad margin', 100, now())`,
    ).rejects.toThrow(/RetailCategory_targetMargin_range/);
    await expect(
      prisma.$executeRaw`
        INSERT INTO "RetailCategory" ("id", "companyId", "name", "depositAmount", "updatedAt")
        VALUES (gen_random_uuid()::text, ${companyId}, 'Bad deposit', -0.1, now())`,
    ).rejects.toThrow(/RetailCategory_deposit_positive/);
  });

  it("allows one category per name in a company", async () => {
    await prisma.retailCategory.create({ data: { companyId, name: "Beer" } });
    await expect(prisma.retailCategory.create({ data: { companyId, name: "Beer" } })).rejects.toThrow();
  });

  it("leaves a product uncategorised, not deleted, when its category goes", async () => {
    const category = await prisma.retailCategory.create({ data: { companyId, name: "Going" } });
    const product = await prisma.product.create({
      data: { companyId, code: `GOING-${Date.now()}`, name: "Kept", categoryId: category.id },
    });
    await prisma.retailCategory.delete({ where: { id: category.id } });
    const kept = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(kept.categoryId).toBeNull();
  });
});
