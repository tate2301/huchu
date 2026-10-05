import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { BinRefusal, moveToBin, restoreFromBin } from "@/lib/retail/bin";

import {
  CATEGORY_SEEDS,
  CategoryRefusal,
  categoryInput,
  categorySubline,
  createCategory,
  deleteCategory,
  getCategory,
  liveCategories,
  mergeCategories,
  nearestByName,
  parseMargin,
  setCategoriesMargin,
  setCategoriesVat,
  updateCategory,
  vatLabelOf,
} from "./categories";

/** W-19 against the test database: add, change, delete with the move, the bulk actions, the bin. */

let companyId: string;
let otherCompanyId: string;

const actor = (role = "OWNER") => ({
  companyId,
  userId: "00000000-0000-0000-0000-0000000000aa",
  userName: "Owner",
  userRole: role,
});

async function refusal(promise: Promise<unknown>): Promise<CategoryRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CategoryRefusal) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

async function product(name: string, categoryId: string, vat = 15) {
  const row = await prisma.product.create({
    data: { companyId, code: `${name.toUpperCase().replace(/\W/g, "-")}-${companyId.slice(0, 4)}`, name, categoryId, defaultTaxRate: vat },
    select: { id: true },
  });
  return row.id;
}

const events = (entityId: string) =>
  prisma.platformAuditEvent.findMany({ where: { companyId, entityId }, orderBy: { createdAt: "asc" } });

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
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.product.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailCategory.updateMany({ where: { companyId: { in: ids } }, data: { parentId: null } });
  await prisma.retailCategory.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
});

describe("words", () => {
  it("reads VAT as the list and the sheet say it", () => {
    expect(vatLabelOf({ vatRate: 15, vatExempt: false })).toBe("15% included");
    expect(vatLabelOf({ vatRate: 0, vatExempt: false })).toBe("Zero-rated");
    expect(vatLabelOf({ vatRate: 0, vatExempt: true })).toBe("Exempt");
    expect(categorySubline({ products: 61, vatRate: 15, vatExempt: false, ageCheck: true })).toBe(
      "61 products · VAT 15% · 18+",
    );
    expect(categorySubline({ products: 1, vatRate: 0, vatExempt: false, ageCheck: false })).toBe("1 product · Zero-rated");
  });

  it("parses a target margin, refusing 100 and over", () => {
    expect(parseMargin("30%")).toBe(30);
    expect(parseMargin("22.5")).toBe(22.5);
    expect(parseMargin("")).toBeNull();
    expect(parseMargin("100%")).toBeUndefined();
    expect(parseMargin("lots")).toBeUndefined();
    expect(categoryInput.safeParse({ name: "Mixers", vat: "STANDARD", targetMargin: "120%" }).success).toBe(false);
  });

  it("defaults the move to the alphabetically nearest other category", () => {
    const others = [{ label: "Beer" }, { label: "Spirits and liqueurs" }, { label: "Wine" }];
    expect(nearestByName("Spirits", others)?.label).toBe("Spirits and liqueurs");
    expect(nearestByName("Zebra", others)?.label).toBe("Wine");
  });

  it("seeds the liquor set at the board's target margins", () => {
    expect(Object.fromEntries(CATEGORY_SEEDS.LIQUOR.map((seed) => [seed.name, seed.targetMarginPercent]))).toEqual({
      Beer: 22,
      Spirits: 25,
      Wine: 30,
      "Ciders and coolers": 25,
      "Soft drinks": 28,
      Snacks: 30,
      "Ice and mixers": 30,
    });
  });
});

describe("a shop's categories", () => {
  it("start as the general set, stamped with the type that seeded them", async () => {
    const rows = await liveCategories(companyId);
    expect(rows.map((row) => row.name)).toEqual(CATEGORY_SEEDS.GENERAL.map((seed) => seed.name));
    const seeded = await prisma.retailCategory.findMany({ where: { companyId }, select: { seededFor: true } });
    expect(seeded.every((row) => row.seededFor === "GENERAL")).toBe(true);
  });

  it("adds Mixers, zero-rated at 30%, with its event", async () => {
    const mixers = await createCategory(
      actor("MANAGER"),
      categoryInput.parse({ name: "Mixers", vat: "ZERO_RATED", targetMargin: "30%" }),
    );
    expect(mixers).toMatchObject({
      name: "Mixers",
      vat: "ZERO_RATED",
      vatLabel: "Zero-rated",
      targetMargin: "30",
      ageCheck: false,
      products: 0,
      sub: "0 products · Zero-rated",
    });
    const stored = await prisma.retailCategory.findUniqueOrThrow({ where: { id: mixers.id } });
    expect(stored.vatRate.toFixed(2)).toBe("0.00");
    expect(stored.vatExempt).toBe(false);
    expect(stored.seededFor).toBeNull();
    const [created] = await events(mixers.id);
    expect(created).toMatchObject({ eventType: "RETAIL_CATEGORY.CREATED", entityType: "RetailCategory" });
  });

  it("refuses a second Mixers under Name, whatever its case", async () => {
    const answer = await refusal(createCategory(actor(), categoryInput.parse({ name: "mixers", vat: "STANDARD" })));
    expect(answer).toMatchObject({ status: 409, field: "name", message: "There is already a category called Mixers." });
  });

  it("nests one level only", async () => {
    const drinks = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Drinks" } })).id;
    const juice = await createCategory(actor(), categoryInput.parse({ name: "Juice", vat: "STANDARD", parentId: drinks }));
    expect(juice.path).toBe("Drinks · Juice");
    expect((await liveCategories(companyId)).find((row) => row.id === juice.id)?.path).toBe("Drinks · Juice");

    const answer = await refusal(
      createCategory(actor(), categoryInput.parse({ name: "Orange", vat: "STANDARD", parentId: juice.id })),
    );
    expect(answer).toMatchObject({
      status: 400,
      field: "parentId",
      message: "Juice is already inside Drinks. Choose a top-level category.",
    });
  });

  it("rewrites every product's VAT with the category's, and says how many", async () => {
    const groceries = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Groceries" } })).id;
    const bread = await product("Bread", groceries);
    const milk = await product("Milk", groceries);

    const answer = await updateCategory(actor("MANAGER"), groceries, { vat: "EXEMPT", targetMargin: "20%" });
    expect(answer.changed).toEqual(["vat", "targetMargin"]);
    expect(answer.products).toBe(2);
    expect(answer.data).toMatchObject({ vat: "EXEMPT", vatLabel: "Exempt", targetMargin: "20", products: 2 });
    const rates = await prisma.product.findMany({ where: { id: { in: [bread, milk] } }, select: { defaultTaxRate: true } });
    expect(rates.map((row) => row.defaultTaxRate.toFixed(2))).toEqual(["0.00", "0.00"]);

    const changed = (await events(groceries)).find((event) => event.eventType === "RETAIL_CATEGORY.CHANGED");
    expect(JSON.parse(changed!.payloadJson!)).toMatchObject({ products: 2 });
  });

  it("changes nothing, and writes nothing, when nothing differs", async () => {
    const groceries = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Groceries" } })).id;
    const before = (await events(groceries)).length;
    const answer = await updateCategory(actor(), groceries, { vat: "EXEMPT" });
    expect(answer.changed).toEqual([]);
    expect((await events(groceries)).length).toBe(before);
  });

  it("refuses another company's category", async () => {
    const theirs = await prisma.retailCategory.create({ data: { companyId: otherCompanyId, name: "Theirs" } });
    expect(await getCategory(companyId, theirs.id)).toBeNull();
    expect(await refusal(updateCategory(actor(), theirs.id, { name: "Stolen" }))).toMatchObject({ status: 404 });
  });

  it("bulk: changes VAT on several and target margin on several", async () => {
    const [household, care] = await Promise.all(
      ["Household", "Personal care"].map(async (name) => (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name } })).id),
    );
    await product("Soap", care!);
    expect(await setCategoriesVat(actor(), [household!, care!], "ZERO_RATED")).toEqual({ changed: 2, products: 1 });
    expect(await setCategoriesMargin(actor(), [household!, care!], "26%")).toEqual({ changed: 2 });
    expect(await setCategoriesMargin(actor(), [household!, care!], "26%")).toEqual({ changed: 0 });
  });
});

describe("deleting moves the products first", () => {
  it("asks where the products go, then moves them with the target's VAT and bins it", async () => {
    const groceries = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Groceries" } })).id;
    const snacks = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Snacks" } })).id;

    const asked = await refusal(deleteCategory(actor(), groceries, null));
    expect(asked).toMatchObject({ status: 400, field: "moveTo", message: "Choose where its 2 products go." });

    // The bin will not take it straight while products are filed under it.
    await expect(moveToBin(actor(), { kind: "category", id: groceries })).rejects.toBeInstanceOf(BinRefusal);

    expect(await deleteCategory(actor(), groceries, snacks)).toEqual({ moved: 2, into: "Snacks" });
    const moved = await prisma.product.findMany({ where: { companyId, categoryId: snacks }, select: { defaultTaxRate: true } });
    expect(moved).toHaveLength(2);
    expect(moved.every((row) => row.defaultTaxRate.toFixed(2) === "15.00")).toBe(true);
    expect((await prisma.retailCategory.findUniqueOrThrow({ where: { id: groceries } })).archivedAt).not.toBeNull();
    const deleted = (await events(groceries)).find((event) => event.eventType === "RETAIL_CATEGORY.DELETED");
    expect(JSON.parse(deleted!.payloadJson!)).toMatchObject({ moved: 2, into: "Snacks" });

    // A new Groceries waits for the binned one.
    expect(await refusal(createCategory(actor(), categoryInput.parse({ name: "Groceries", vat: "STANDARD" })))).toMatchObject({
      status: 409,
      message: "Groceries is in the bin. Restore it from Setup › Bin.",
    });

    // Restore brings it back empty.
    await restoreFromBin(actor(), { kind: "category", id: groceries });
    const back = await getCategory(companyId, groceries);
    expect(back).toMatchObject({ archived: false, products: 0 });
  });

  it("moves the categories inside it too, and will not move into one of them", async () => {
    const drinks = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Drinks" } })).id;
    const juice = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Juice" } })).id;
    const other = (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name: "Other" } })).id;
    expect(await refusal(deleteCategory(actor(), drinks, juice))).toMatchObject({
      field: "moveTo",
      message: "Juice is inside Drinks. Choose a category outside it.",
    });
    expect(await deleteCategory(actor(), drinks, other)).toEqual({ moved: 0, into: "Other" });
    expect((await prisma.retailCategory.findUniqueOrThrow({ where: { id: juice } })).parentId).toBe(other);
  });

  it("merges several into one", async () => {
    const [household, care, snacks] = await Promise.all(
      ["Household", "Personal care", "Snacks"].map(
        async (name) => (await prisma.retailCategory.findFirstOrThrow({ where: { companyId, name } })).id,
      ),
    );
    expect(await mergeCategories(actor(), [household!, care!, snacks!], snacks!)).toEqual({ merged: 2, moved: 1 });
    const live = await liveCategories(companyId);
    expect(live.map((row) => row.name)).not.toContain("Household");
    expect(live.map((row) => row.name)).not.toContain("Personal care");
  });
});
