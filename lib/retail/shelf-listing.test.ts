/**
 * A shelf line filed under the shop's own category.
 *
 * The product form writes the category, the cost, and the deposit on an empty
 * through `upsertShelfListing`; the till and the back-office list read them back
 * through `loadShelfListings`. These pin the round trip: the category comes back
 * by name, an age-restricted category makes its products ask for ID, the till's
 * category chip filters by it, and a deposit only survives on a returnable line.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { loadSellableProducts, loadShelfListing, loadShelfListings, upsertShelfListing } from "./shelf-listing";

let companyId: string;
let siteId: string;
let locationId: string;
let beerId: string;
let snacksId: string;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function stockLine(index: number) {
  const item = await prisma.inventoryItem.create({
    data: {
      itemCode: `SL-${stamp}-${index}`,
      name: `Shelf line ${index}`,
      category: "OTHER",
      unit: "each",
      siteId,
      locationId,
      currentStock: quantity(24),
      minStock: quantity(6),
    },
    select: { id: true },
  });
  return item.id;
}

beforeAll(async () => {
  const company = await prisma.company.create({
    data: { name: `Shelf listing ${stamp}`, slug: `shelf-listing-${stamp}` },
    select: { id: true },
  });
  companyId = company.id;
  const site = await prisma.site.create({
    data: { companyId, code: `SL-${stamp}`, name: "Borrowdale", isActive: true },
    select: { id: true },
  });
  siteId = site.id;
  const location = await prisma.stockLocation.create({
    data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor", isActive: true },
    select: { id: true },
  });
  locationId = location.id;
  const beer = await prisma.retailCategory.create({
    data: { companyId, name: "Beer", ageRestricted: true, returnable: true },
    select: { id: true },
  });
  beerId = beer.id;
  const snacks = await prisma.retailCategory.create({
    data: { companyId, name: "Snacks" },
    select: { id: true },
  });
  snacksId = snacks.id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.productPrice.deleteMany({ where: { companyId } });
  await prisma.priceList.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("a shelf line in the shop's own category", () => {
  let castleId: string;

  it("comes back with its category, its cost and its deposit", async () => {
    castleId = await upsertShelfListing({
      companyId,
      productId: null,
      sku: `CASTLE-${stamp}`,
      name: "Castle Lager 340ml",
      inventoryItemId: await stockLine(1),
      unitPrice: 1.2,
      taxPercent: 15,
      categoryId: beerId,
      costPrice: 0.85,
      returnable: true,
      depositAmount: 0.1,
    });

    const listing = await loadShelfListing(companyId, castleId);
    expect(listing).toMatchObject({
      categoryId: beerId,
      category: "Beer",
      returnable: true,
      depositAmount: 0.1,
      inventoryItem: { reorderLevel: 6 },
    });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: castleId } });
    expect(product.costPrice?.toFixed(2)).toBe("0.85");
  });

  it("asks for ID because its category does, while the product follows it", async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: castleId } });
    expect(product.ageRestricted).toBeNull();
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({
      ageRestricted: true,
      ownAgeRestricted: null,
      categoryAgeRestricted: true,
    });
  });

  it("asks for ID at the till too, where the sale is checked", async () => {
    const { products } = await loadSellableProducts({ companyId, siteId, productIds: [castleId] });
    expect(products.get(castleId)?.ageRestricted).toBe(true);
  });

  it("lets the product's own no beat its 18+ category, and carries its discount ceiling", async () => {
    await prisma.product.update({ where: { id: castleId }, data: { ageRestricted: false, maxDiscountPercent: 5 } });
    try {
      expect(await loadShelfListing(companyId, castleId)).toMatchObject({
        ageRestricted: false,
        ownAgeRestricted: false,
        maxDiscountPercent: 5,
      });
      const { products } = await loadSellableProducts({ companyId, siteId, productIds: [castleId] });
      expect(products.get(castleId)?.ageRestricted).toBe(false);
    } finally {
      await prisma.product.update({ where: { id: castleId }, data: { ageRestricted: null, maxDiscountPercent: null } });
    }
  });

  it("is what the till's category chip finds, and nothing else is", async () => {
    await upsertShelfListing({
      companyId,
      productId: null,
      sku: `CHIPS-${stamp}`,
      name: "Simba Chips 125g",
      inventoryItemId: await stockLine(2),
      unitPrice: 1,
      taxPercent: 15,
      categoryId: snacksId,
    });

    const beer = await loadShelfListings(companyId, { category: "Beer" });
    expect(beer.map((line) => line.name)).toEqual(["Castle Lager 340ml"]);
    const snacks = await loadShelfListings(companyId, { category: "Snacks" });
    expect(snacks.map((line) => line.name)).toEqual(["Simba Chips 125g"]);
  });

  it("drops the deposit when the line stops being returnable", async () => {
    await upsertShelfListing({
      companyId,
      productId: castleId,
      sku: `CASTLE-${stamp}`,
      name: "Castle Lager 340ml",
      inventoryItemId: (await loadShelfListing(companyId, castleId))!.inventoryItemId,
      unitPrice: 1.2,
      taxPercent: 15,
      returnable: false,
      depositAmount: 0.1,
    });
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({
      returnable: false,
      depositAmount: null,
      // Untouched fields stay where they were.
      category: "Beer",
    });
  });

  it("leaves its category when the form sends none", async () => {
    await upsertShelfListing({
      companyId,
      productId: castleId,
      sku: `CASTLE-${stamp}`,
      name: "Castle Lager 340ml",
      inventoryItemId: (await loadShelfListing(companyId, castleId))!.inventoryItemId,
      unitPrice: 1.2,
      taxPercent: 15,
      categoryId: null,
    });
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({
      categoryId: null,
      category: null,
      ageRestricted: false,
    });
  });
});
