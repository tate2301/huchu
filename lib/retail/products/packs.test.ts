import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

import { ProductRefusal } from "./create";
import { createPack } from "./packs";
import { addTestProduct, makeTestShop, type TestShop } from "./test-fixtures";

/**
 * Sell by the case (PRD-08, W-12) against the test database: a case is made
 * from its single at every site the single is kept, empty, its unit "case",
 * its cost the single's times how many; a second case of that size (even
 * two asked for at once), a case of a case and a single off sale are
 * refused; the crate deposit is kept only while the shop charges deposits.
 */

let shop: TestShop;
let castle: string;

beforeAll(async () => {
  shop = await makeTestShop("Packs", { twoSites: true });
  const beer = await prisma.retailCategory.create({ data: { companyId: shop.companyId, name: "Beer", ageRestricted: true }, select: { id: true } });
  const made = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: beer.id }, { siteId: shop.mainId, onHand: 50 });
  castle = made.productId;
  // Borrowdale keeps Castle too.
  const place = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: shop.secondId! }, select: { id: true } });
  await prisma.inventoryItem.create({
    data: { itemCode: made.code, name: "Castle Lager 340ml", category: "RETAIL", unit: "bottle", siteId: shop.secondId!, locationId: place.id, productId: castle },
  });
}, 60_000);

afterAll(async () => {
  if (shop) await destroyProvisionedTenant(shop.companyId);
});

describe("a case made from its single", () => {
  it("is on sale at its price, kept empty at the single's sites, a case each, at the single's cost times its size", async () => {
    const made = await createPack(shop.manager(), { singleId: castle, size: 24, price: "26.00", breakAtTill: true, crateDeposit: "3.00" });
    expect(made.message).toBe("Castle Lager 340ml, case of 24, is on sale at US$26.00.");
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: made.productId },
      select: { name: true, packOfId: true, packSize: true, breakAtTill: true, returnable: true, depositAmount: true, costPrice: true, categoryId: true },
    });
    expect(product).toMatchObject({ name: "Castle Lager 340ml, case of 24", packOfId: castle, packSize: 24, breakAtTill: true, returnable: true });
    expect(product.depositAmount?.toFixed(2)).toBe("3.00");
    expect(product.costPrice?.toFixed(2)).toBe("20.64");
    const lines = await prisma.inventoryItem.findMany({ where: { productId: made.productId }, select: { siteId: true, unit: true, currentStock: true } });
    expect(lines.map((line) => line.siteId).sort()).toEqual([shop.mainId, shop.secondId].sort());
    expect(lines.every((line) => line.unit === "case" && line.currentStock.isZero())).toBe(true);
    const price = await prisma.productPrice.findFirstOrThrow({ where: { productId: made.productId, priceList: { isDefault: true } } });
    expect(price.unitPrice.toFixed(2)).toBe("26.00");
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: shop.companyId, entityId: made.productId, eventType: "RETAIL_PRODUCT.CREATED" } });
    expect(event.payloadJson).toContain('"packSize":24');
  });

  it("refuses a second case of the same size", async () => {
    const refused = await createPack(shop.manager(), { singleId: castle, size: 24, price: "25.00", breakAtTill: true }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ProductRefusal);
    expect(refused).toMatchObject({ status: 409, message: "Castle Lager 340ml already has a case of 24." });
  });

  it("refuses a case as the single", async () => {
    const theCase = await prisma.product.findFirstOrThrow({ where: { companyId: shop.companyId, packOfId: castle }, select: { id: true } });
    const refused = await createPack(shop.manager(), { singleId: theCase.id, size: 6, price: "120.00", breakAtTill: true }).catch((error: unknown) => error);
    expect(refused).toMatchObject({ status: 400, field: "single", message: "Castle Lager 340ml, case of 24 is a case. Choose the single." });
  });

  it("makes one case when two ask for the same size at once", async () => {
    const both = await Promise.allSettled([
      createPack(shop.manager(), { singleId: castle, size: 12, price: "13.50", breakAtTill: true }),
      createPack(shop.manager(), { singleId: castle, size: 12, price: "13.50", breakAtTill: true }),
    ]);
    expect(both.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const refused = both.find((entry): entry is PromiseRejectedResult => entry.status === "rejected")!;
    expect(refused.reason).toMatchObject({ status: 409, message: "Castle Lager 340ml already has a case of 12." });
    expect(await prisma.product.count({ where: { companyId: shop.companyId, packOfId: castle, packSize: 12, archivedAt: null } })).toBe(1);
  });

  it("refuses a single that is not on sale", async () => {
    const off = await addTestProduct(shop.companyId, { name: "Zambezi Lager 340ml", price: "1.10", cost: "0.80" }, { siteId: shop.mainId, onHand: 10 });
    await prisma.product.update({ where: { id: off.productId }, data: { isActive: false } });
    const refused = await createPack(shop.manager(), { singleId: off.productId, size: 24, price: "24.00", breakAtTill: true }).catch((error: unknown) => error);
    expect(refused).toMatchObject({ status: 400, field: "single", message: "Zambezi Lager 340ml is not on sale. Put it on sale first." });
  });

  it("keeps no crate deposit while empties and deposits are off", async () => {
    await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { emptiesAndDeposits: false } });
    try {
      const made = await createPack(shop.manager(), { singleId: castle, size: 6, price: "7.00", breakAtTill: false, crateDeposit: "3.00" });
      const product = await prisma.product.findUniqueOrThrow({ where: { id: made.productId }, select: { returnable: true, depositAmount: true } });
      expect(product).toEqual({ returnable: false, depositAmount: null });
    } finally {
      await prisma.retailShopProfile.update({ where: { companyId: shop.companyId }, data: { emptiesAndDeposits: true } });
    }
  });
});
