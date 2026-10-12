/**
 * Receiving a delivery, first layer (40-buying W-33, BUY-02): the old
 * receipts route's posting as a service. Stock comes in as RECEIVED
 * movements under the GRN number, the order's lines fill and its state
 * follows, a draft taken in counts as sent by hand, a delivery with no order
 * names its supplier, "close the rest" stops waiting, a closed order or too
 * much on a line is refused, and the journal is posted after the goods.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { OrderRefused } from "@/lib/retail/purchase-orders";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { DeliveryRefusal, receiveDelivery, type PostJournal } from "./deliveries";
import { closeOrder, raiseOrder } from "./orders";
import { createSupplier } from "./suppliers";

let shop: TestShop;
let castle: { productId: string; itemId: string };
let delta: string;
const journals: Array<Parameters<PostJournal>[0]> = [];
const post: PostJournal = async (journal) => {
  journals.push(journal);
  return { accountingStatus: "POSTED", accountingError: null };
};

const order = async (send: boolean) =>
  (
    await raiseOrder(
      shop.manager(),
      { supplierId: delta, siteId: shop.mainId, lines: [{ productId: castle.productId, quantity: 240, unitCost: "0.86" }], payment: "ON_ACCOUNT", send },
      { requestUrl: "http://localhost:3000" },
    )
  ).id;
const take = (purchaseOrderId: string | null, quantity: number, extra: Record<string, unknown> = {}) =>
  receiveDelivery(shop.manager(), { purchaseOrderId, siteId: shop.mainId, vendorId: delta, lines: [{ inventoryItemId: castle.itemId, quantity, unitCost: 0.86 }], ...extra }, post);

beforeAll(async () => {
  shop = await makeTestShop("Deliveries");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 0 });
  delta = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages" }))).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.retailGoodsReceipt.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("receiving against an order", () => {
  it("posts stock under the GRN number, fills the order, and books the journal after", async () => {
    const id = await order(true);
    const before = Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: castle.itemId } })).currentStock);
    const receipt = await take(id, 120);
    expect(receipt.receiptNo).toMatch(/^GRN-\d{4}$/);
    expect(receipt.vendorId).toBe(delta);
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: castle.itemId, reference: receipt.receiptNo } });
    expect(movement.reason).toBe("RECEIVED");
    expect(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: castle.itemId } })).currentStock)).toBe(before + 120);
    const after = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(after.status).toBe("PARTIAL");
    expect(Number(after.lines[0]!.receivedQuantity)).toBe(120);
    expect(journals.at(-1)).toMatchObject({ sourceType: "RETAIL_GOODS_RECEIPT", sourceId: receipt.id, amount: 103.2 });
  });

  it("refuses more than is still to come", async () => {
    const id = await order(true);
    await expect(take(id, 300)).rejects.toBeInstanceOf(OrderRefused);
  });

  it("marks a draft taken in as sent by hand", async () => {
    const id = await order(false);
    await take(id, 240);
    const after = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ status: "RECEIVED", sentVia: "BY_HAND" });
    expect(after.sentAt).not.toBeNull();
  });

  it("closes the rest when asked, and refuses a closed order", async () => {
    const id = await order(true);
    await take(id, 100, { closeRest: true });
    const closed = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.lines[0]!.closedShortAt).not.toBeNull();
    await expect(take(id, 10)).rejects.toMatchObject({ status: 409 });

    const other = await order(true);
    await take(other, 50);
    await closeOrder(shop.manager(), other, null);
    await expect(take(other, 10)).rejects.toBeInstanceOf(DeliveryRefusal);
  });
});

describe("a delivery with no order", () => {
  it("names its supplier, and needs one", async () => {
    const receipt = await take(null, 24);
    expect(receipt).toMatchObject({ purchaseOrderId: null, vendorId: delta });
    await expect(
      receiveDelivery(shop.manager(), { siteId: shop.mainId, lines: [{ inventoryItemId: castle.itemId, quantity: 1, unitCost: 1 }] }, post),
    ).rejects.toMatchObject({ status: 400, message: "Say who it came from." });
  });
});
