import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { CATEGORY_LOADERS, marginNow } from "./categories";

/** `retail-categories`: the shop-type filter and the 30-day margin. */

let companyId: string;
const loader = CATEGORY_LOADERS["retail-categories"]!;
const ctx = () => ({ companyId, userId: "u", role: "SUPERADMIN" });

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (await prisma.company.create({ data: { name: `Cats ${stamp}`, slug: `cats-${stamp}` }, select: { id: true } })).id;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "LIQUOR" } });
  const spirits = await prisma.retailCategory.create({
    data: { companyId, name: "Spirits", seededFor: "LIQUOR", ageRestricted: true, targetMarginPercent: 25 },
  });
  await prisma.retailCategory.createMany({
    data: [
      { companyId, name: "Groceries", seededFor: "GENERAL", vatRate: 0, vatExempt: true },
      { companyId, name: "Mixers", vatRate: 0 },
      { companyId, name: "Liqueur", parentId: spirits.id },
    ],
  });
});

afterAll(async () => {
  await prisma.retailCategory.updateMany({ where: { companyId }, data: { parentId: null } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("retail-categories", () => {
  it("works the margin over the takings, one place", () => {
    expect(marginNow(8371.2, 6506.7)).toBe(22.3);
    expect(marginNow(0, 0)).toBeNull();
  });

  it("starts on the shop's own type: its seed and the shop's own, never the other type's", async () => {
    const own = await loader.load(ctx(), { shopType: "own" });
    expect(own.rows.map((row) => row.name).sort()).toEqual(["Mixers", "Spirits", "Spirits · Liqueur"]);
    const other = await loader.load(ctx(), { shopType: "other" });
    expect(other.rows.map((row) => row.name).sort()).toEqual(["Groceries", "Mixers", "Spirits · Liqueur"]);
    const any = await loader.load(ctx(), {});
    expect(any.rows).toHaveLength(4);
    const groceries = any.rows.find((row) => row.name === "Groceries")!;
    expect(groceries).toMatchObject({ vat: "Exempt", ageCheck: "No", marginNow: null, sold30: 0, marginTone: null });
    expect(any.rows.find((row) => row.name === "Spirits")).toMatchObject({ vat: "15% included", ageCheck: "Yes", targetMargin: "25%" });
    expect(any.rows.find((row) => row.name === "Spirits · Liqueur")).toMatchObject({ parent: "Spirits" });
    expect(await loader.options!(ctx())).toEqual({
      shopType: [
        { value: "own", label: "Liquor store" },
        { value: "other", label: "General retail" },
      ],
    });
  });
});
