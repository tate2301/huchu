/**
 * A shelf line filed under the shop's own category.
 *
 * New product and Edit a product write the category, the cost, and the deposit
 * on an empty (`createProduct`, `updateProduct`); the till and the back-office list read them back
 * through `loadShelfListings`. These pin the round trip: the category comes back
 * by name, an age-restricted category makes its products ask for ID, the till's
 * category chip filters by it, and a deposit only survives on a returnable line.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { productPatch } from "./products/input";
import { addTestProduct } from "./products/test-fixtures";
import { updateProduct } from "./products/update";
import { loadSellableProducts, loadShelfListing, loadShelfListings } from "./shelf-listing";

let companyId: string;
let siteId: string;
let beerId: string;
let snacksId: string;
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const actor = () => ({ companyId, userId: "00000000-0000-0000-0000-0000000000aa", userName: "Tafara Nyathi", userRole: "MANAGER" });

/** Edit a product the way the Edit sheet does. */
async function edit(id: string, fields: Record<string, unknown>) {
  await prisma.$transaction((tx) =>
    updateProduct(tx, {
      actor: actor(),
      id,
      input: productPatch.parse(fields),
      limits: { priceChanges: "MANAGERS", belowCostNeedsOwner: true },
    }),
  );
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
  await prisma.stockLocation.create({
    data: { siteId, code: `FLOOR-${stamp}`, name: "Shop floor", isActive: true },
    select: { id: true },
  });
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
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
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
    castleId = (
      await addTestProduct(
        companyId,
        { name: "Castle Lager 340ml", price: "1.20", categoryId: beerId, cost: "0.85", returnable: true, depositAmount: "0.10" },
        { siteId, onHand: 24, reorderAt: 6 },
      )
    ).productId;

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
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({ ageRestricted: true });
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
        maxDiscountPercent: 5,
      });
      const { products } = await loadSellableProducts({ companyId, siteId, productIds: [castleId] });
      expect(products.get(castleId)?.ageRestricted).toBe(false);
    } finally {
      await prisma.product.update({ where: { id: castleId }, data: { ageRestricted: null, maxDiscountPercent: null } });
    }
  });

  it("is what the till's category chip finds, and nothing else is", async () => {
    await addTestProduct(companyId, { name: "Simba Chips 125g", price: "1.00", categoryId: snacksId }, { siteId, onHand: 24 });

    const beer = await loadShelfListings(companyId, { category: "Beer" });
    expect(beer.map((line) => line.name)).toEqual(["Castle Lager 340ml"]);
    const snacks = await loadShelfListings(companyId, { category: "Snacks" });
    expect(snacks.map((line) => line.name)).toEqual(["Simba Chips 125g"]);
  });

  it("drops the deposit when the line stops being returnable", async () => {
    await edit(castleId, { returnable: false, depositAmount: "0.10" });
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({
      returnable: false,
      depositAmount: null,
      // Untouched fields stay where they were.
      category: "Beer",
    });
  });

  it("leaves its category when the change takes it out of one", async () => {
    await edit(castleId, { categoryId: null });
    expect(await loadShelfListing(companyId, castleId)).toMatchObject({
      categoryId: null,
      category: null,
      ageRestricted: false,
    });
  });
});
