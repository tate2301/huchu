/**
 * The one movement service, against a real Postgres.
 *
 * S-2. Everything here is a rule that used to be written twice — once in
 * `recordRetailInventoryMovement` and once inline in the core movements route —
 * or a rule that was written nowhere at all. `TRANSFER` is the second kind: it
 * fell through every branch, so a transfer wrote a movement row, posted an
 * accounting event, and moved nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { recordStockMovement } from "./stock-movements";

let companyId: string;
let otherCompanyId: string;
let userId: string;
let siteId: string;
let otherSiteId: string;
let storeroomId: string;
let shopFloorId: string;
/** A location at the *other* site, for the cross-site refusal. */
let otherSiteLocationId: string;
let itemId: string;

const UNIT = "EACH";

async function onHand(id: string) {
  const item = await prisma.inventoryItem.findUniqueOrThrow({
    where: { id },
    select: { currentStock: true, locationId: true },
  });
  return item;
}

/** Put the fixture item back where the previous test found it. */
async function resetItem(stock: number, locationId: string) {
  await prisma.inventoryItem.update({
    where: { id: itemId },
    data: { currentStock: stock, locationId },
  });
}

beforeAll(async () => {
  const stamp = String(Date.now());

  const shop = await prisma.company.create({
    data: { name: `Bottle store ${stamp}`, slug: `bottle-store-${stamp}` },
    select: { id: true },
  });
  const rival = await prisma.company.create({
    data: { name: `Rival store ${stamp}`, slug: `rival-store-${stamp}` },
    select: { id: true },
  });
  companyId = shop.id;
  otherCompanyId = rival.id;

  const user = await prisma.user.create({
    data: {
      companyId,
      email: `stock-clerk-${stamp}@example.test`,
      name: "Tendai",
      password: "not-a-real-hash",
      role: "STOCK_CLERK",
    },
    select: { id: true },
  });
  userId = user.id;

  const site = await prisma.site.create({
    data: { companyId, name: "Avondale branch", code: `AV-${stamp}` },
    select: { id: true },
  });
  siteId = site.id;

  // A second branch, to prove a transfer between sites is refused rather than
  // quietly halving one balance.
  const secondSite = await prisma.site.create({
    data: { companyId, name: "Mbare branch", code: `MB-${stamp}` },
    select: { id: true },
  });
  otherSiteId = secondSite.id;

  const storeroom = await prisma.stockLocation.create({
    data: { siteId, name: "Storeroom", code: `STORE-${stamp}` },
    select: { id: true },
  });
  storeroomId = storeroom.id;

  const shopFloor = await prisma.stockLocation.create({
    data: { siteId, name: "Shop floor", code: `FLOOR-${stamp}` },
    select: { id: true },
  });
  shopFloorId = shopFloor.id;

  const mbareStore = await prisma.stockLocation.create({
    data: { siteId: otherSiteId, name: "Mbare storeroom", code: `MBSTORE-${stamp}` },
    select: { id: true },
  });
  otherSiteLocationId = mbareStore.id;

  const item = await prisma.inventoryItem.create({
    data: {
      siteId,
      locationId: storeroomId,
      itemCode: `CASTLE-330-${stamp}`,
      name: "Castle Lager 330ml",
      category: "CONSUMABLES",
      unit: UNIT,
      currentStock: 24,
      unitCost: 0.8,
    },
    select: { id: true },
  });
  itemId = item.id;
});

afterAll(async () => {
  // Filter before querying. These ids are assigned in `beforeAll`, so if setup
  // dies partway one of them is still `undefined` — and Prisma answers an
  // `undefined` inside an `in` array with a validation error thrown from the
  // teardown, which is then the only failure reported. The real cause is buried
  // and the message points at the wrong hook entirely.
  const ids = [companyId, otherCompanyId].filter(Boolean);
  if (ids.length === 0) return;

  const companies = { in: ids };
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId: companies } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId: companies } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId: companies } } });
  await prisma.site.deleteMany({ where: { companyId: companies } });
  await prisma.user.deleteMany({ where: { companyId: companies } });
  await prisma.company.deleteMany({ where: { id: companies } });
});

describe("recordStockMovement", () => {
  it("raises on-hand for a receipt", async () => {
    await resetItem(24, storeroomId);

    const { movement, previousStock, nextStock } = await recordStockMovement({
      companyId,
      userId,
      itemId,
      movementType: "RECEIPT",
      quantity: 12,
      unit: UNIT,
      sourceType: "RETAIL_GOODS_RECEIPT",
      sourceId: "receipt-1",
    });

    expect(previousStock).toBe(24);
    expect(nextStock).toBe(36);
    expect(movement.quantity).toBe(12);
    expect((await onHand(itemId)).currentStock).toBe(36);
  });

  it("lowers on-hand for an issue", async () => {
    await resetItem(36, storeroomId);

    const { nextStock } = await recordStockMovement({
      companyId,
      userId,
      itemId,
      movementType: "ISSUE",
      quantity: 6,
      unit: UNIT,
      sourceType: "RETAIL_SALE",
      sourceId: "sale-1",
    });

    expect(nextStock).toBe(30);
    expect((await onHand(itemId)).currentStock).toBe(30);
  });

  it("refuses to issue more than is on the shelf", async () => {
    await resetItem(30, storeroomId);

    await expect(
      recordStockMovement({
        companyId,
        userId,
        itemId,
        movementType: "ISSUE",
        quantity: 31,
        unit: UNIT,
        sourceType: "RETAIL_SALE",
        sourceId: "sale-2",
      }),
    ).rejects.toThrow("Insufficient stock.");

    expect((await onHand(itemId)).currentStock).toBe(30);
  });

  it("moves a same-site transfer's location and leaves the count alone", async () => {
    await resetItem(30, storeroomId);

    const { movement, nextStock, locationId } = await recordStockMovement({
      companyId,
      userId,
      itemId,
      movementType: "TRANSFER",
      // A transfer moves the whole line: on-hand is held per site, not per
      // location, so there is nowhere to leave a remainder.
      quantity: 30,
      unit: UNIT,
      toLocationId: shopFloorId,
      sourceType: "RETAIL_STOCK_TRANSFER",
      sourceId: "transfer-1",
    });

    const after = await onHand(itemId);
    expect(nextStock).toBe(30);
    expect(after.currentStock).toBe(30);
    expect(locationId).toBe(shopFloorId);
    expect(after.locationId).toBe(shopFloorId);
    expect(movement.toLocationId).toBe(shopFloorId);
  });

  it("refuses to transfer part of a line, because there is nowhere to leave the rest", async () => {
    await resetItem(30, storeroomId);

    await expect(
      recordStockMovement({
        companyId,
        userId,
        itemId,
        movementType: "TRANSFER",
        quantity: 5,
        unit: UNIT,
        toLocationId: shopFloorId,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: "transfer-2",
      }),
    ).rejects.toThrow("A transfer moves the whole stock line");

    expect((await onHand(itemId)).locationId).toBe(storeroomId);
  });

  it("refuses a transfer to another site", async () => {
    await resetItem(30, storeroomId);

    await expect(
      recordStockMovement({
        companyId,
        userId,
        itemId,
        movementType: "TRANSFER",
        quantity: 30,
        unit: UNIT,
        toLocationId: otherSiteLocationId,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: "transfer-3",
      }),
    ).rejects.toThrow("Stock cannot be transferred between sites");

    const after = await onHand(itemId);
    expect(after.locationId).toBe(storeroomId);
    expect(after.currentStock).toBe(30);
  });

  it("refuses a movement in the wrong unit", async () => {
    await resetItem(30, storeroomId);

    await expect(
      recordStockMovement({
        companyId,
        userId,
        itemId,
        movementType: "RECEIPT",
        quantity: 1,
        unit: "CASE",
        sourceType: "RETAIL_GOODS_RECEIPT",
        sourceId: "receipt-2",
      }),
    ).rejects.toThrow("Stock unit mismatch.");

    expect((await onHand(itemId)).currentStock).toBe(30);
  });

  it("refuses to touch another tenant's stock", async () => {
    await resetItem(30, storeroomId);

    await expect(
      recordStockMovement({
        companyId: otherCompanyId,
        userId,
        itemId,
        movementType: "ISSUE",
        quantity: 1,
        unit: UNIT,
        sourceType: "RETAIL_SALE",
        sourceId: "sale-3",
      }),
    ).rejects.toThrow("Invalid inventory item.");

    expect((await onHand(itemId)).currentStock).toBe(30);
  });

  it("writes what caused the movement onto the row", async () => {
    await resetItem(30, storeroomId);

    const { movement } = await recordStockMovement({
      companyId,
      userId,
      itemId,
      movementType: "ADJUSTMENT",
      quantity: -2,
      unit: UNIT,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: "stock-count-1",
    });

    // Read it back rather than trusting the object the create returned.
    const stored = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: movement.id },
      select: { sourceType: true, sourceId: true, quantity: true },
    });

    expect(stored.sourceType).toBe("RETAIL_STOCK_ADJUSTMENT");
    expect(stored.sourceId).toBe("stock-count-1");
    // An adjustment keeps its sign: a count that came up short is a negative.
    expect(stored.quantity).toBe(-2);
    expect((await onHand(itemId)).currentStock).toBe(28);
  });
});
