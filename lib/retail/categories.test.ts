import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import {
  CATEGORY_SEEDS,
  CategoryNameTaken,
  categoryInput,
  createRetailCategory,
  listRetailCategories,
  updateRetailCategory,
} from "./categories";

let companyId: string;
let otherCompanyId: string;

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [shop, rival] = await Promise.all([
    prisma.company.create({ data: { name: `Categories ${stamp}`, slug: `categories-${stamp}` }, select: { id: true } }),
    prisma.company.create({ data: { name: `Rival ${stamp}`, slug: `categories-rival-${stamp}` }, select: { id: true } }),
  ]);
  companyId = shop.id;
  otherCompanyId = rival.id;
});

afterAll(async () => {
  const ids = [companyId, otherCompanyId].filter(Boolean);
  await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailCategory.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
});

describe("a shop's categories", () => {
  it("start as the general set for a shop that never chose a type", async () => {
    const rows = await listRetailCategories(companyId);
    expect(rows.map((row) => row.name)).toEqual(CATEGORY_SEEDS.GENERAL.map((seed) => seed.name));
    expect(rows.every((row) => row.productCount === 0)).toBe(true);
  });

  it("take a new one at the end of the list", async () => {
    const mixers = await createRetailCategory(
      companyId,
      categoryInput.parse({ name: "Mixers", returnable: true, depositAmount: 0.1 }),
    );
    expect(mixers).toMatchObject({ name: "Mixers", vatRate: "15.00", returnable: true, depositAmount: "0.10" });
    const rows = await listRetailCategories(companyId);
    expect(rows.at(-1)?.name).toBe("Mixers");
  });

  it("refuse a second category with the same name", async () => {
    await expect(createRetailCategory(companyId, categoryInput.parse({ name: "Mixers" }))).rejects.toBeInstanceOf(
      CategoryNameTaken,
    );
  });

  it("drop the deposit when a category stops being returnable", async () => {
    const [mixers] = (await listRetailCategories(companyId)).filter((row) => row.name === "Mixers");
    const updated = await updateRetailCategory(companyId, mixers.id, { returnable: false });
    expect(updated).toMatchObject({ returnable: false, depositAmount: null });
  });

  it("hide an archived category but keep it on its products", async () => {
    const [snacks] = (await listRetailCategories(companyId)).filter((row) => row.name === "Snacks");
    const product = await prisma.product.create({
      data: { companyId, code: `SIMBA-${Date.now()}`, name: "Simba Chips 125g", categoryId: snacks.id },
      select: { id: true },
    });

    await updateRetailCategory(companyId, snacks.id, { archived: true });
    expect((await listRetailCategories(companyId)).some((row) => row.id === snacks.id)).toBe(false);
    const all = await listRetailCategories(companyId, { includeArchived: true });
    expect(all.find((row) => row.id === snacks.id)?.archivedAt).not.toBeNull();

    const kept = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: { categoryId: true } });
    expect(kept.categoryId).toBe(snacks.id);

    const restored = await updateRetailCategory(companyId, snacks.id, { archived: false });
    expect(restored?.archivedAt).toBeNull();
    expect(restored?.productCount).toBe(1);
  });

  it("are not another company's to change", async () => {
    const [groceries] = await listRetailCategories(companyId);
    expect(await updateRetailCategory(otherCompanyId, groceries.id, { name: "Stolen" })).toBeNull();
  });
});
