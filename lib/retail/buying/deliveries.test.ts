/**
 * Receiving a delivery (40-buying W-33, BUY-06). Stock in is what came less
 * what came broken; the broken units are a BROKEN difference at receiving,
 * claimed by a credit, never stock and never GRNI; the order counts what
 * came; Close stops a line being expected and closes the order once nothing
 * is left; a stock clerk only counts (nothing moves) and an owner or manager
 * posts, checking it; the delivered cost becomes the product's (cost
 * followers priced again) and a product with no supplier gets this one; the
 * journal is Σ in stock × cost. Two posts of one count, or two deliveries
 * that together over-fill a line, cannot both go through.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { alreadyInStock, CANNOT_POST, DeliveryRefusal, markReceived, postCountedDelivery, receiveDelivery, type PostJournal } from "./deliveries";
import { closeOrder, raiseOrder } from "./orders";
import { createSupplier } from "./suppliers";

const reprice = vi.hoisted(() => ({ calls: [] as Array<{ companyId: string; productId: string }> }));
vi.mock("@/lib/retail/prices/change", async (original) => {
  const actual = await original<typeof import("@/lib/retail/prices/change")>();
  return {
    ...actual,
    repriceCostFollowers: async (...args: Parameters<typeof actual.repriceCostFollowers>) => {
      reprice.calls.push({ companyId: args[1], productId: args[2] });
      return actual.repriceCostFollowers(...args);
    },
  };
});

type Product = { productId: string; itemId: string };

let shop: TestShop;
let clerkId: string;
let castle: Product;
let chibuku: Product;
let coke: Product;
let sprite: Product;
let delta: string;
const journals: Array<Parameters<PostJournal>[0]> = [];
const post: PostJournal = async (journal) => {
  journals.push(journal);
  return { accountingStatus: "POSTED", accountingError: null };
};
const clerk = () => ({ companyId: shop.companyId, userId: clerkId, userName: "Tendai Sibanda", userRole: "STOCK_CLERK" });
const onHand = async (product: Product) => Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: product.itemId } })).currentStock);
const refusal = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    if (error instanceof DeliveryRefusal) return { status: error.status, message: error.message };
    throw error;
  }
  throw new Error("Expected a refusal");
};

/** PO-0003's lines: Castle 240 at 0.86, Chibuku 240 at 0.82, Coca-Cola 180 at 0.52, Sprite 120 at 0.52. */
const raiseBoardOrder = async (send = true) =>
  (
    await raiseOrder(
      shop.manager(),
      {
        supplierId: delta,
        siteId: shop.mainId,
        lines: [
          { productId: castle.productId, quantity: 240, unitCost: "0.86" },
          { productId: chibuku.productId, quantity: 240, unitCost: "0.82" },
          { productId: coke.productId, quantity: 180, unitCost: "0.52" },
          { productId: sprite.productId, quantity: 120, unitCost: "0.52" },
        ],
        payment: "ON_ACCOUNT",
        send,
      },
      { requestUrl: "http://localhost:3000" },
    )
  ).id;
const orderLines = (orderId: string) => prisma.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: orderId }, orderBy: { sortOrder: "asc" } });

/** One line of a delivery against an order line, at its cost. */
async function against(orderId: string, counts: Array<[Product, number, number?, ("KEEP" | "CLOSE")?]>) {
  const lines = await orderLines(orderId);
  return counts.map(([product, quantity, damaged, rest]) => {
    const line = lines.find((row) => row.inventoryItemId === product.itemId)!;
    return { purchaseOrderLineId: line.id, inventoryItemId: product.itemId, quantity, damaged: damaged ?? 0, unitCost: Number(line.unitCost), rest };
  });
}

beforeAll(async () => {
  shop = await makeTestShop("Deliveries");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  clerkId = (await prisma.user.create({ data: { email: `clerk-${shop.companyId}@shop.test`, name: "Tendai Sibanda", role: "STOCK_CLERK" as never, companyId: shop.companyId }, select: { id: true } })).id;
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.80" }, { siteId: shop.mainId, onHand: 0 });
  chibuku = await addTestProduct(shop.companyId, { name: "Chibuku Scud 1L", price: "1.10", cost: "0.82" }, { siteId: shop.mainId, onHand: 0 });
  coke = await addTestProduct(shop.companyId, { name: "Coca-Cola 500ml", price: "0.75", cost: "0.52" }, { siteId: shop.mainId, onHand: 0 });
  sprite = await addTestProduct(shop.companyId, { name: "Sprite 500ml", price: "0.75", cost: "0.52" }, { siteId: shop.mainId, onHand: 0 });
  delta = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages" }))).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.retailGoodsReceipt.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.product.updateMany({ where: { companyId }, data: { supplierId: null } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("the board's second delivery against PO-0003", () => {
  it("puts what came less what broke into stock, claims the broken, keeps or closes the rest, and books Σ in stock × cost", async () => {
    const orderId = await raiseBoardOrder();
    reprice.calls.length = 0;
    // The first delivery: 120, 60, 90 and 30 came on 13 August, at the order's costs.
    await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[castle, 120], [chibuku, 60], [coke, 90], [sprite, 30]]), post: true }, post);
    const before = await Promise.all([castle, chibuku, coke, sprite].map(onHand));
    const receivedBefore = (await orderLines(orderId)).reduce((sum, line) => sum + Number(line.receivedQuantity), 0);

    const done = await receiveDelivery(
      shop.manager(),
      {
        purchaseOrderId: orderId,
        noteNumber: "DB-778233",
        lines: await against(orderId, [
          [castle, 120, 6, "KEEP"],
          [chibuku, 144, 0, "KEEP"],
          [coke, 90, 0, "KEEP"],
          [sprite, 72, 0, "CLOSE"],
        ]),
        post: true,
      },
      post,
    );

    expect(done).toMatchObject({ status: "POSTED", units: 420, value: 300.36, stillOnOrder: 36, orderClosed: false });
    // Stock in = Σ (this time − damaged): the six broken Castle never enter stock.
    const after = await Promise.all([castle, chibuku, coke, sprite].map(onHand));
    expect(after.map((value, index) => value - before[index]!)).toEqual([114, 144, 90, 72]);
    const castleIn = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: castle.itemId, reference: done.receiptNo } });
    expect(Number(castleIn.quantity)).toBe(114);
    expect(castleIn.reason).toBe("RECEIVED");

    // The order counts what came, damaged included; Sprite stops being expected.
    const lines = await orderLines(orderId);
    expect(lines.map((line) => Number(line.receivedQuantity))).toEqual([240, 204, 180, 102]);
    expect(lines.reduce((sum, line) => sum + Number(line.receivedQuantity), 0) - receivedBefore).toBe(426);
    expect(lines.map((line) => line.closedShortAt !== null)).toEqual([false, false, false, true]);
    expect((await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PARTIAL");

    // The broken units are a claim: BROKEN at receiving, value damaged × cost, settled by a credit.
    const differences = await prisma.retailDeliveryDifference.findMany({ where: { receiptId: done.id } });
    expect(differences).toHaveLength(1);
    expect(differences[0]).toMatchObject({ kind: "BROKEN", settle: "CREDIT", atReceiving: true });
    expect(Number(differences[0]!.quantity)).toBe(-6);
    expect(Number(differences[0]!.value)).toBe(5.16);

    // GRNI is credited with what went into stock, never the claim.
    const journal = journals.find((entry) => entry.sourceId === done.id)!;
    expect(journal).toMatchObject({ sourceType: "RETAIL_GOODS_RECEIPT", amount: 300.36, netAmount: 300.36 });
    expect(journal.inventory.totalCost).toBe(300.36);
    expect(journal.inventory.lines.map((line) => line.quantity)).toEqual([114, 144, 90, 72]);

    // The delivered cost is the product's, cost followers priced again; a product with no supplier gets Delta.
    const castleProduct = await prisma.product.findUniqueOrThrow({ where: { id: castle.productId } });
    expect(Number(castleProduct.costPrice)).toBe(0.86);
    expect(castleProduct.supplierId).toBe(delta);
    expect(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: castle.itemId } })).unitCost)).toBe(0.86);
    expect(reprice.calls.some((call) => call.productId === castle.productId && call.companyId === shop.companyId)).toBe(true);

    const receipt = await prisma.retailGoodsReceipt.findUniqueOrThrow({ where: { id: done.id }, include: { lines: { orderBy: { createdAt: "asc" } } } });
    expect(receipt).toMatchObject({ status: "POSTED", noteNumber: "DB-778233", countedById: shop.managerId, checkedById: shop.managerId });
    expect(receipt.lines.map((line) => [Number(line.noteQuantity), Number(line.damagedQuantity), Number(line.quantity)])).toEqual([
      [120, 6, 114],
      [144, 0, 144],
      [90, 0, 90],
      [72, 0, 72],
    ]);
  });
});

describe("what is refused", () => {
  it("refuses more damaged than came, and more than is still to come", async () => {
    const orderId = await raiseBoardOrder();
    await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[castle, 120]]), post: true }, post);
    expect(await refusal(receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[castle, 6, 7]]), post: true }, post))).toEqual({
      status: 400,
      message: "More damaged than came on Castle Lager 340ml.",
    });
    expect(await refusal(receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[castle, 121]]), post: true }, post))).toEqual({
      status: 409,
      message: "Only 120 of Castle Lager 340ml are still to come on this order.",
    });
  });

  it("refuses a stock clerk posting, and a closed order", async () => {
    const orderId = await raiseBoardOrder();
    expect(await refusal(receiveDelivery(clerk(), { purchaseOrderId: orderId, lines: await against(orderId, [[coke, 10]]), post: true }, post))).toEqual({
      status: 403,
      message: CANNOT_POST,
    });
    await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[coke, 10]]), post: true }, post);
    await closeOrder(shop.manager(), orderId, null);
    const refused = await refusal(receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[coke, 10]]), post: true }, post));
    expect(refused.status).toBe(409);
    expect(refused.message).toMatch(/is closed\. Reopen it to book a delivery against it\.$/);
  });
});

describe("keep or close", () => {
  it("closes the order when every line still owed is closed", async () => {
    const orderId = (
      await raiseOrder(
        shop.manager(),
        { supplierId: delta, siteId: shop.mainId, lines: [{ productId: coke.productId, quantity: 100, unitCost: "0.52" }], payment: "ON_ACCOUNT", send: true },
        { requestUrl: "http://localhost:3000" },
      )
    ).id;
    const done = await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[coke, 60, 0, "CLOSE"]]), post: true }, post);
    expect(done).toMatchObject({ orderClosed: true, stillOnOrder: 0 });
    const order = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    expect(order.status).toBe("CLOSED");
    expect(order.lines[0]!.closedShortAt).not.toBeNull();
  });

  it("marks a draft received against as sent by hand", async () => {
    const orderId = await raiseBoardOrder(false);
    await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[coke, 30]]), post: true }, post);
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: "PARTIAL", sentVia: "BY_HAND" });
  });
});

describe("counting, then checking", () => {
  it("moves nothing while counted, tells the checkers, and posts later with the poster as checker", async () => {
    const orderId = await raiseBoardOrder();
    const before = await onHand(chibuku);
    const counted = await receiveDelivery(clerk(), { purchaseOrderId: orderId, lines: await against(orderId, [[chibuku, 48]]), post: false }, post);
    expect(counted).toMatchObject({ status: "COUNTED", units: 48 });
    expect(counted.checkers).toEqual(expect.arrayContaining(["Tafara Nyathi", "Tendai Mhlanga"]));
    expect(await onHand(chibuku)).toBe(before);
    expect(await prisma.stockMovement.count({ where: { reference: counted.receiptNo } })).toBe(0);
    expect(Number((await orderLines(orderId))[1]!.receivedQuantity)).toBe(0);
    expect(journals.some((entry) => entry.sourceId === counted.id)).toBe(false);
    const told = await prisma.notification.findMany({ where: { type: "RETAIL_DELIVERY_TO_CHECK", entityId: counted.id } });
    expect(told.length).toBeGreaterThan(0);
    expect(told[0]!.summary).toBe(`${counted.receiptNo} from Delta Beverages is counted and waiting to be checked.`);

    expect(await refusal(postCountedDelivery(clerk(), counted.id, post))).toEqual({ status: 403, message: CANNOT_POST });
    const posted = await postCountedDelivery(shop.manager(), counted.id, post);
    expect(posted).toMatchObject({ status: "POSTED", units: 48 });
    expect(await onHand(chibuku)).toBe(before + 48);
    expect(await prisma.retailGoodsReceipt.findUniqueOrThrow({ where: { id: counted.id } })).toMatchObject({ countedById: clerkId, checkedById: shop.managerId });
    expect(await refusal(postCountedDelivery(shop.manager(), counted.id, post))).toEqual({ status: 409, message: alreadyInStock(counted.receiptNo) });
  });
});

describe("at the same time", () => {
  it("posts a count once when two people post it at once", async () => {
    const orderId = await raiseBoardOrder();
    const counted = await receiveDelivery(clerk(), { purchaseOrderId: orderId, lines: await against(orderId, [[sprite, 20]]), post: false }, post);
    const before = await onHand(sprite);
    const results = await Promise.allSettled([postCountedDelivery(shop.manager(), counted.id, post), postCountedDelivery(shop.owner(), counted.id, post)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, message: alreadyInStock(counted.receiptNo) });
    expect(await onHand(sprite)).toBe(before + 20);
  });

  it("refuses one of two deliveries that together over-fill a line", async () => {
    const orderId = await raiseBoardOrder();
    const lines = await against(orderId, [[coke, 100]]);
    const results = await Promise.allSettled([
      receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines, post: true }, post),
      receiveDelivery(shop.owner(), { purchaseOrderId: orderId, lines, post: true }, post),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409, message: "Only 80 of Coca-Cola 500ml are still to come on this order." });
    expect(Number((await orderLines(orderId))[2]!.receivedQuantity)).toBe(100);
  });
});

describe("mark received, and a delivery with no order", () => {
  it("receives everything still to come as ordered", async () => {
    const orderId = await raiseBoardOrder();
    await receiveDelivery(shop.manager(), { purchaseOrderId: orderId, lines: await against(orderId, [[castle, 40]]), post: true }, post);
    const done = await markReceived(shop.manager(), [orderId], post);
    expect(done.posted).toHaveLength(1);
    expect((await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("RECEIVED");
    expect((await orderLines(orderId)).map((line) => Number(line.receivedQuantity))).toEqual([240, 240, 180, 120]);
    expect((await markReceived(shop.manager(), [orderId], post)).skipped).toHaveLength(1);
  });

  it("names its supplier, and needs one", async () => {
    const done = await receiveDelivery(shop.manager(), { siteId: shop.mainId, supplierId: delta, lines: [{ inventoryItemId: coke.itemId, quantity: 24, unitCost: 0.52 }], post: true }, post);
    expect(await prisma.retailGoodsReceipt.findUniqueOrThrow({ where: { id: done.id } })).toMatchObject({ purchaseOrderId: null, vendorId: delta, status: "POSTED" });
    expect(await refusal(receiveDelivery(shop.manager(), { siteId: shop.mainId, lines: [{ inventoryItemId: coke.itemId, quantity: 1, unitCost: 1 }], post: true }, post))).toEqual({
      status: 400,
      message: "Say who it came from.",
    });
  });
});
