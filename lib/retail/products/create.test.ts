/**
 * Adding a product (W-09, PRD-03), against the test database: one record —
 * the product, its line at the default site, its price on the default list and
 * the ADDED history row; VAT from its category; a code from its name; a name
 * and a barcode no other live product has; opening stock as one OPENING
 * receipt worth quantity × cost; and two adds of one name at once, of which
 * exactly one lands.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { productNewContext } from "@/lib/retail/products/context";

import { createProduct, ProductRefusal } from "./create";
import { productFieldErrors, productInput } from "./input";
import { makeTestShop, type TestShop } from "./test-fixtures";

let shop: TestShop;
let oneSite: TestShop;

beforeAll(async () => {
  shop = await makeTestShop("Create", { twoSites: true });
  oneSite = await makeTestShop("CreateOne");
}, 60_000);

afterAll(async () => {
  for (const each of [shop, oneSite]) if (each) await destroyProvisionedTenant(each.companyId);
});

const add = (fields: Record<string, unknown>, on: TestShop = shop) =>
  prisma.$transaction((tx) => createProduct(tx, { actor: on.manager(), input: productInput.parse(fields), source: "ADDED" }));

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProductRefusal) return { status: error.status, field: error.field, message: error.message };
    throw error;
  }
  return null;
}

describe("adding a product", () => {
  it("makes the product, its line at the default site, its price on the default list and its history", async () => {
    const created = await add({ name: "Savanna Light 330ml", categoryId: shop.ciderId, price: "2.10" });
    expect(created.code).toBe("SAVANNA-LIGHT-330ML");

    const product = await prisma.product.findUniqueOrThrow({ where: { id: created.productId } });
    expect(product).toMatchObject({ isActive: true, categoryId: shop.ciderId, createdById: shop.managerId, ageRestricted: false });
    expect(product.defaultTaxRate.toFixed(2)).toBe("15.50");
    expect(product.standardPrice.toFixed(2)).toBe("2.10");

    const line = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: created.productId } });
    expect(line).toMatchObject({ siteId: shop.mainId, itemCode: "SAVANNA-LIGHT-330ML", unit: "bottle", category: "RETAIL" });

    const prices = await prisma.productPrice.findMany({ where: { productId: created.productId }, include: { priceList: true } });
    expect(prices).toHaveLength(1);
    expect(prices[0]!.priceList.isDefault).toBe(true);
    expect(prices[0]!.unitPrice.toFixed(2)).toBe("2.10");

    const history = await prisma.productPriceChange.findMany({ where: { productId: created.productId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ source: "ADDED", fromPrice: null, createdById: shop.managerId });
    expect(history[0]!.toPrice?.toFixed(2)).toBe("2.10");
    expect(history[0]!.appliedAt).not.toBeNull();

    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { companyId: shop.companyId, entityId: created.productId, eventType: "RETAIL_PRODUCT.CREATED" },
    });
    expect(JSON.parse(event.payloadJson!)).toMatchObject({ code: "SAVANNA-LIGHT-330ML", price: "2.10", category: "Ciders and coolers", site: "Harare Main Branch" });
  });

  it("cuts the code to 20 and adds -2 when it is taken", async () => {
    // "SAVANNA-LIGHT-330ML-DRY-CIDER-EXTRA" cut to 20 is SAVANNA-LIGHT-330ML, which the first one has.
    const created = await add({ name: "Savanna light 330ml dry cider extra", price: "2.30" });
    expect(created.code).toBe("SAVANNA-LIGHT-330ML-2");
  });

  it("refuses a name a live product has, whatever its case, and frees a binned product's", async () => {
    expect(await refusal(add({ name: "savanna LIGHT 330ml", price: "2.10" }))).toEqual({
      status: 400,
      field: "name",
      // The name the shop already has, not the one typed.
      message: "There is already a product called Savanna Light 330ml.",
    });
    const binned = await add({ name: "Zambezi Lager 375ml", price: "1.35" });
    await prisma.product.update({ where: { id: binned.productId }, data: { archivedAt: new Date(), isActive: false } });
    expect((await add({ name: "Zambezi Lager 375ml", price: "1.35" })).code).toBe("ZAMBEZI-LAGER-375ML-2");
  });

  it("keeps a barcode's digits without spaces, refuses one of 7 digits and one another product has", async () => {
    const created = await add({ name: "Castle Lager 340ml", price: "1.20", barcode: "6001108 01234" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: created.productId } })).barcode).toBe("600110801234");
    const short = productInput.safeParse({ name: "Short", price: "1.00", barcode: "1234567" });
    expect(short.success).toBe(false);
    expect(productFieldErrors(short.error!).fieldErrors).toEqual({ barcode: "A barcode has 8 to 14 digits." });
    expect(await refusal(add({ name: "Castle Lite 340ml", price: "1.20", barcode: "600110801234" }))).toEqual({
      status: 400,
      field: "barcode",
      message: "Castle Lager 340ml already has this barcode.",
    });
  });

  it("refuses a manager's first price below its cost under Price, and takes the owner's", async () => {
    const below = { name: "Cheap Wine 750ml", price: "1.00", cost: "5.00" };
    const withLimits = (actor: ReturnType<TestShop["owner"]>, belowCostNeedsOwner: boolean) =>
      prisma.$transaction((tx) =>
        createProduct(tx, { actor, input: productInput.parse(below), source: "ADDED", limits: { belowCostNeedsOwner } }),
      );
    expect(await refusal(withLimits(shop.manager(), true))).toEqual({
      status: 400,
      field: "price",
      message: "Below cost needs the owner. It costs US$5.00.",
    });
    expect(await prisma.product.count({ where: { companyId: shop.companyId, name: below.name } })).toBe(0);
    // A shop that lets managers price below cost; and the owner, always.
    const managers = await withLimits(shop.manager(), false);
    await prisma.product.update({ where: { id: managers.productId }, data: { archivedAt: new Date(), isActive: false } });
    expect((await withLimits(shop.owner(), true)).name).toBe(below.name);
  });

  it("answers a figure too big for its column, and a body that is not fields, in words", () => {
    const big = productInput.safeParse({
      name: "Big",
      price: "99999999999999.99",
      cost: "9999999999999999",
      openingStock: "12345678901234567890",
    });
    expect(productFieldErrors(big.error!).fieldErrors).toEqual({
      price: "Price is too big. Keep it under 10,000,000,000.",
      cost: "Cost is too big. Keep it under 10,000,000,000.",
      openingStock: "Opening stock is too big. Keep it under 10,000,000.",
    });
    expect(productInput.safeParse({ name: "Fits", price: "9999999999.99", openingStock: "9999999" }).success).toBe(true);
    expect(productFieldErrors(productInput.safeParse("a string").error!)).toEqual({ error: "Check the fields.", fieldErrors: {} });
  });

  it("refuses a category that is not the shop's", async () => {
    expect(await refusal(add({ name: "Stray", price: "1.00", categoryId: oneSite.ciderId }))).toMatchObject({
      field: "categoryId",
      message: "That category is not one of this shop's.",
    });
  });

  it("records opening stock as one OPENING receipt, worth quantity × cost", async () => {
    const created = await add({ name: "Hunter's Gold 330ml", categoryId: shop.ciderId, price: "1.85", cost: "1.38", openingStock: "48", reorderAt: "24" });
    expect(created.opening?.amount?.toFixed(2)).toBe("66.24");
    const line = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: created.itemId } });
    expect(line.currentStock.toNumber()).toBe(48);
    expect(line.minStock?.toNumber()).toBe(24);
    expect(line.unitCost?.toFixed(2)).toBe("1.38");
    const movements = await prisma.stockMovement.findMany({ where: { itemId: created.itemId } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ movementType: "RECEIPT", reason: "OPENING", reference: "Opening", sourceType: "RETAIL_OPENING_STOCK", sourceId: created.productId });
    expect(movements[0]!.balanceAfter?.toNumber()).toBe(48);
  });

  it("records opening stock with no cost and nothing to post", async () => {
    const created = await add({ name: "Ice 5kg bag", price: "3.00", openingStock: "10" });
    expect(created.opening).toMatchObject({ quantity: "10", amount: null });
  });

  it("refuses part of a bottle and keeps part of a kilo", async () => {
    const bottle = productInput.safeParse({ name: "Half", price: "1.00", openingStock: "1.5" });
    expect(productFieldErrors(bottle.error!).fieldErrors).toEqual({ openingStock: "Opening stock is a whole number." });
    expect(productInput.safeParse({ name: "Biltong", price: "30.00", openingStock: "1.25", soldAs: "BY_WEIGHT" }).success).toBe(true);
  });

  it("keeps stock at the site asked for, and asks only a shop with two sites", async () => {
    const created = await add({ name: "Bernini Blush 275ml", price: "1.75", siteId: shop.secondId });
    expect(created.site.name).toBe("Borrowdale");
    expect((await productNewContext(shop.companyId)).oneSite).toBe(false);
    const context = await productNewContext(oneSite.companyId);
    expect(context).toMatchObject({ oneSite: true, defaultSiteId: oneSite.mainId, depositsOn: true, listName: "Shelf prices" });
    expect((await add({ name: "Coca-Cola 500ml", price: "0.75" }, oneSite)).site.id).toBe(oneSite.mainId);
  });

  it("lets exactly one of two adds of the same name land", async () => {
    const results = await Promise.allSettled([
      add({ name: "Two Keys Whisky 750ml", price: "9.75" }),
      add({ name: "Two Keys Whisky 750ml", price: "9.75" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ProductRefusal);
    expect(await prisma.product.count({ where: { companyId: shop.companyId, name: "Two Keys Whisky 750ml" } })).toBe(1);
  });
});
