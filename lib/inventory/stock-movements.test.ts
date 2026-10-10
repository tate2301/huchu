/**
 * The one movement service, against a real Postgres.
 *
 * S-2. Everything here is a rule that used to be written twice — once in
 * `recordRetailInventoryMovement` and once inline in the core movements route —
 * or a rule that was written nowhere at all. `TRANSFER` is the second kind: it
 * fell through every branch, so a transfer wrote a movement row, posted an
 * accounting event, and moved nothing.
 *
 * ## Quantities are `Decimal`, and the assertions say so
 *
 * S-1 moved `InventoryItem.currentStock` and `StockMovement.quantity` off
 * `Float`. Every assertion below reads through `qty()`, which compares with
 * `Decimal.equals` and renders both sides at four places on failure.
 *
 * `toBe(36)` would not merely fail — it would fail *misleadingly*, printing
 * "expected 36 to be 36" beside a Decimal object. Worse, `toEqual` on a Decimal
 * and a number passes for the wrong reason on some shapes. An exact comparison
 * is the point of the conversion; the test has to make it.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { quantity, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { recordStockMovement, type RecordStockMovementInput } from "./stock-movements";

let companyId: string;
let otherCompanyId: string;
let userId: string;
let siteId: string;
let otherSiteId: string;
let storeroomId: string;
let shopFloorId: string;
/** A location at the *other* site, for the cross-site refusal. */
let otherSiteLocationId: string;
let stamp: string;
let lines = 0;

const UNIT = "EACH";

/**
 * A quantity, at four places, as a string.
 *
 * Both sides go through the same rounding, so the comparison is exact and a
 * failure prints two readable numbers rather than two Decimal internals.
 */
function qty(value: MoneyLike | null): string {
  return value === null ? "null" : quantity(value).toFixed(4);
}

async function onHand(id: string) {
  return prisma.inventoryItem.findUniqueOrThrow({
    where: { id },
    select: { currentStock: true, locationId: true },
  });
}

/** A new stock line in the storeroom holding `stock`, with no history. */
async function freshItem(stock: number) {
  lines += 1;
  const item = await prisma.inventoryItem.create({
    data: {
      siteId,
      locationId: storeroomId,
      itemCode: `CASTLE-330-${stamp}-${lines}`,
      name: "Castle Lager 330ml",
      category: "CONSUMABLES",
      unit: UNIT,
      currentStock: stock,
      unitCost: 0.8,
    },
    select: { id: true },
  });
  return item.id;
}

/** A retail movement on `itemId`; everything not given is a sale's. */
function move(itemId: string, input: Partial<RecordStockMovementInput>) {
  return recordStockMovement({
    companyId,
    userId,
    itemId,
    movementType: "ISSUE",
    quantity: 1,
    unit: UNIT,
    sourceType: "RETAIL_SALE",
    reason: "SALE",
    reference: "S-000001",
    ...input,
  });
}

beforeAll(async () => {
  stamp = String(Date.now());

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
  // Reversals first: a reversed movement cannot go while its reversal stands.
  await prisma.stockMovement.deleteMany({ where: { reversesId: { not: null }, item: { site: { companyId: companies } } } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId: companies } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId: companies } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId: companies } } });
  await prisma.site.deleteMany({ where: { companyId: companies } });
  await prisma.user.deleteMany({ where: { companyId: companies } });
  await prisma.company.deleteMany({ where: { id: companies } });
});

describe("recordStockMovement", () => {
  it("raises on-hand for a receipt, and writes +change and the balance after", async () => {
    const itemId = await freshItem(24);

    const { movement, previousStock, nextStock } = await move(itemId, {
      movementType: "RECEIPT",
      quantity: 12,
      sourceType: "RETAIL_GOODS_RECEIPT",
      sourceId: "receipt-1",
      reason: "RECEIVED",
      reference: "GRN-0004",
    });

    expect(qty(previousStock)).toBe(qty(24));
    expect(qty(nextStock)).toBe(qty(36));
    expect(qty(movement.quantity)).toBe(qty(12));
    expect(qty(movement.change)).toBe(qty(12));
    expect(qty(movement.balanceAfter)).toBe(qty(36));
    expect(movement).toMatchObject({ reason: "RECEIVED", reference: "GRN-0004", reversesId: null });
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(36));
  });

  it("lowers on-hand for an issue, with a negative change", async () => {
    const itemId = await freshItem(36);

    const { movement, nextStock } = await move(itemId, { quantity: 6, sourceId: "sale-1", reference: "S-000930" });

    expect(qty(nextStock)).toBe(qty(30));
    expect(qty(movement.change)).toBe(qty(-6));
    expect(qty(movement.balanceAfter)).toBe(qty(30));
    expect(movement).toMatchObject({ reason: "SALE", reference: "S-000930" });
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(30));
  });

  it("refuses to issue more than is on the shelf", async () => {
    const itemId = await freshItem(30);

    await expect(move(itemId, { quantity: 31, sourceId: "sale-2" })).rejects.toThrow("Insufficient stock.");

    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(30));
    expect(await prisma.stockMovement.count({ where: { itemId } })).toBe(0);
  });

  it("sells the last one once when two tills sell it at the same moment", async () => {
    const itemId = await freshItem(1);

    const results = await Promise.allSettled([
      move(itemId, { sourceId: "sale-a", reference: "S-000101" }),
      move(itemId, { sourceId: "sale-b", reference: "S-000102" }),
    ]);

    const sold = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(sold).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(String(refused[0].reason)).toContain("Insufficient stock.");

    // No lost update: one movement, and on hand is 0, not a second sale's -1
    // clamped back to 0 by a write that never saw the first.
    const movements = await prisma.stockMovement.findMany({ where: { itemId }, select: { balanceAfter: true } });
    expect(movements.map((row) => qty(row.balanceAfter))).toEqual([qty(0)]);
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(0));
  });

  it("moves a same-site transfer's location, leaves the count alone, and changes nothing", async () => {
    const itemId = await freshItem(30);

    const { movement, nextStock, locationId } = await move(itemId, {
      movementType: "TRANSFER",
      // A transfer moves the whole line: on-hand is held per site, not per
      // location, so there is nowhere to leave a remainder.
      quantity: 30,
      toLocationId: shopFloorId,
      sourceType: "RETAIL_STOCK_TRANSFER",
      sourceId: "transfer-1",
      reason: "PLACE_MOVE",
      reference: null,
    });

    const after = await onHand(itemId);
    expect(qty(nextStock)).toBe(qty(30));
    expect(qty(after.currentStock)).toBe(qty(30));
    expect(locationId).toBe(shopFloorId);
    expect(after.locationId).toBe(shopFloorId);
    expect(movement.toLocationId).toBe(shopFloorId);
    expect(qty(movement.change)).toBe(qty(0));
    expect(qty(movement.balanceAfter)).toBe(qty(30));
    expect(movement).toMatchObject({ reason: "PLACE_MOVE", reference: null });
  });

  it("refuses to transfer part of a line, because there is nowhere to leave the rest", async () => {
    const itemId = await freshItem(30);

    await expect(
      move(itemId, {
        movementType: "TRANSFER",
        quantity: 5,
        toLocationId: shopFloorId,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: "transfer-2",
        reason: "PLACE_MOVE",
        reference: null,
      }),
    ).rejects.toThrow("A transfer moves the whole stock line");

    expect((await onHand(itemId)).locationId).toBe(storeroomId);
  });

  it("refuses a transfer to another site", async () => {
    const itemId = await freshItem(30);

    await expect(
      move(itemId, {
        movementType: "TRANSFER",
        quantity: 30,
        toLocationId: otherSiteLocationId,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: "transfer-3",
        reason: "PLACE_MOVE",
        reference: null,
      }),
    ).rejects.toThrow("Stock cannot be transferred between sites");

    const after = await onHand(itemId);
    expect(after.locationId).toBe(storeroomId);
    expect(qty(after.currentStock)).toBe(qty(30));
  });

  it("refuses a movement in the wrong unit", async () => {
    const itemId = await freshItem(30);

    await expect(
      move(itemId, {
        movementType: "RECEIPT",
        unit: "CASE",
        sourceType: "RETAIL_GOODS_RECEIPT",
        sourceId: "receipt-2",
        reason: "RECEIVED",
      }),
    ).rejects.toThrow("Stock unit mismatch.");

    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(30));
  });

  it("refuses to touch another tenant's stock", async () => {
    const itemId = await freshItem(30);

    await expect(move(itemId, { companyId: otherCompanyId, sourceId: "sale-3" })).rejects.toThrow(
      "Invalid inventory item.",
    );

    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(30));
  });

  it("writes what caused the movement onto the row, with a signed adjustment", async () => {
    const itemId = await freshItem(30);

    const { movement } = await move(itemId, {
      movementType: "ADJUSTMENT",
      quantity: -2,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: "stock-count-1",
      reason: "BROKEN",
      reference: "ADJ-0031",
    });

    // Read it back rather than trusting the object the create returned.
    const stored = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: movement.id },
      select: {
        sourceType: true,
        sourceId: true,
        quantity: true,
        change: true,
        balanceAfter: true,
        reason: true,
        reference: true,
      },
    });

    expect(stored).toMatchObject({
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: "stock-count-1",
      reason: "BROKEN",
      reference: "ADJ-0031",
    });
    // An adjustment keeps its sign: a count that came up short is a negative.
    expect(qty(stored.quantity)).toBe(qty(-2));
    expect(qty(stored.change)).toBe(qty(-2));
    expect(qty(stored.balanceAfter)).toBe(qty(28));
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(28));
  });

  it("slots a back-dated movement into its place and keeps the newest balance on hand", async () => {
    const itemId = await freshItem(10);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await move(itemId, { quantity: 3, reference: "S-000201" }); // now: 10 → 7
    const late = await move(itemId, {
      movementType: "RECEIPT",
      quantity: 5,
      sourceType: "RETAIL_GOODS_RECEIPT",
      reason: "RECEIVED",
      reference: "GRN-0005",
      entryDate: hourAgo,
    }); // an hour ago: 10 → 15, so the sale after it leaves 12

    expect(qty(late.movement.balanceAfter)).toBe(qty(15));
    const ledger = await prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { reference: true, change: true, balanceAfter: true },
    });
    expect(ledger.map((row) => [row.reference, qty(row.change), qty(row.balanceAfter)])).toEqual([
      ["GRN-0005", qty(5), qty(15)],
      ["S-000201", qty(-3), qty(12)],
    ]);
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(12));
  });

  it("reverses a movement once, and refuses a second reversal of it on the unique key", async () => {
    const itemId = await freshItem(13);
    const { movement: broken } = await move(itemId, {
      movementType: "ADJUSTMENT",
      quantity: -2,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      reason: "BROKEN",
      reference: "ADJ-0032",
    });

    const putBack = {
      movementType: "ADJUSTMENT" as const,
      quantity: 2,
      sourceType: "RETAIL_STOCK_ADJUSTMENT" as const,
      reason: "REVERSAL" as const,
      reference: "ADJ-0032",
      reversesId: broken.id,
    };
    const { movement: reversal } = await move(itemId, putBack);
    expect(reversal.reversesId).toBe(broken.id);
    expect(qty(reversal.balanceAfter)).toBe(qty(13));

    await expect(move(itemId, putBack)).rejects.toMatchObject({ code: "P2002" });
    expect(qty((await onHand(itemId)).currentStock)).toBe(qty(13));
  });

  it("refuses a reversal of a movement on another line", async () => {
    const itemId = await freshItem(5);
    const otherId = await freshItem(5);
    const { movement } = await move(otherId, { reference: "S-000301" });

    await expect(
      move(itemId, {
        movementType: "RECEIPT",
        reason: "REVERSAL",
        reference: "S-000301",
        reversesId: movement.id,
      }),
    ).rejects.toThrow("A reversal puts back a movement on the same stock line.");
  });
});
