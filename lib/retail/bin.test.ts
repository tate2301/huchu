/**
 * The bin, against a real database: a removed product, promotion and category
 * are listed, newest first, and each comes back — the product off sale and
 * priced at its last standard price, the promotion inactive.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { listBin, restoreFromBin } from "./bin";
import { archiveShelfListing, loadShelfListing, upsertShelfListing } from "./shelf-listing";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let productId: string;
let promotionId: string;
let categoryId: string;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Bin ${stamp}`, slug: `bin-${stamp}` }, select: { id: true } })).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `B-${stamp}`, name: "Borrowdale" }, select: { id: true } })).id;
  const locationId = (
    await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })
  ).id;
  const item = await prisma.inventoryItem.create({
    data: { itemCode: `BIN-${stamp}`, name: "Gin", category: "OTHER", unit: "bottle", siteId, locationId, currentStock: quantity(4) },
    select: { id: true },
  });
  productId = await upsertShelfListing({
    companyId, productId: null, sku: `GIN-${stamp}`, name: "Gordon's Gin 750ml", inventoryItemId: item.id, unitPrice: 16.4, taxPercent: 15,
  });
  promotionId = (
    await prisma.retailPromotion.create({
      data: { companyId, promoCode: `P-${stamp}`, name: "Case of Castle 5% off", type: "PERCENT", value: money(5) },
      select: { id: true },
    })
  ).id;
  categoryId = (await prisma.retailCategory.create({ data: { companyId, name: "Craft gin" }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.productPrice.deleteMany({ where: { companyId } });
  await prisma.priceList.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.retailPromotion.deleteMany({ where: { companyId } });
  await prisma.retailCategory.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("the bin", () => {
  it("lists what was removed, and nothing that was not", async () => {
    expect(await listBin(companyId)).toEqual([]);
    await archiveShelfListing({ companyId, productId });
    await prisma.retailPromotion.update({ where: { id: promotionId }, data: { archivedAt: new Date(), status: "INACTIVE" } });
    await prisma.retailCategory.update({ where: { id: categoryId }, data: { archivedAt: new Date() } });

    const entries = await listBin(companyId);
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["category", "product", "promotion"]);
    expect(entries.find((entry) => entry.kind === "product")?.detail).toBe(`GIN-${stamp} · last priced 16.40`);
  });

  it("brings a product back off sale, priced at its last price", async () => {
    expect(await loadShelfListing(companyId, productId)).toBeNull();
    expect(await restoreFromBin(companyId, { kind: "product", id: productId })).toBe(true);
    expect(await loadShelfListing(companyId, productId)).toMatchObject({
      status: "INACTIVE",
      unitPrice: 16.4,
      priceSource: "PRICE_LIST",
    });
  });

  it("brings a promotion back inactive, and a category back in use", async () => {
    expect(await restoreFromBin(companyId, { kind: "promotion", id: promotionId })).toBe(true);
    expect(await prisma.retailPromotion.findUniqueOrThrow({ where: { id: promotionId } })).toMatchObject({
      archivedAt: null,
      status: "INACTIVE",
    });
    expect(await restoreFromBin(companyId, { kind: "category", id: categoryId })).toBe(true);
    expect(await listBin(companyId)).toEqual([]);
  });

  it("restores nothing twice, and nothing of another company's", async () => {
    expect(await restoreFromBin(companyId, { kind: "product", id: productId })).toBe(false);
    await archiveShelfListing({ companyId, productId });
    expect(
      await restoreFromBin("00000000-0000-0000-0000-000000000000", { kind: "product", id: productId }),
    ).toBe(false);
  });
});
