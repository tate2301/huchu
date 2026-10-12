/**
 * Orders (40-buying W-30, W-70, BUY-02), against the test database: raising
 * one as a draft and sent, who the order goes to (a contact who gets orders on
 * WhatsApp, else email, else by hand with no message), a stopped supplier
 * refused, the lines rule on an edit, the site locked once something came, a
 * change told to the supplier, a duplicate at today's cost, closing with what
 * came and reopening, and a supplier with an open order not stopped.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { receiveDelivery } from "./deliveries";
import { changeOrder, closeOrder, duplicateOrder, OrderRefusal, orderRecipients, raiseOrder, reopenOrder, sendOrder } from "./orders";
import { addContact, createSupplier, stopSupplier, SupplierRefusal } from "./suppliers";

let shop: TestShop;
let castle: { productId: string; itemId: string };
let coke: { productId: string; itemId: string };
let delta: string;
let pamela: string;
let quiet: string;

const deps = { requestUrl: "http://localhost:3000/retail/buying/orders" };
const noJournal = async () => ({ accountingStatus: "POSTED", accountingError: null });
const refusal = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    if (error instanceof OrderRefusal || error instanceof SupplierRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors };
    throw error;
  }
  throw new Error("Expected a refusal");
};
const raise = (supplierId: string, send: boolean, quantity = 240) =>
  raiseOrder(
    shop.manager(),
    {
      supplierId,
      siteId: shop.mainId,
      expectedDate: "2026-10-16",
      lines: [
        { productId: castle.productId, quantity, unitCost: "0.86" },
        { productId: coke.productId, quantity: 180, unitCost: "0.52" },
      ],
      payment: "ON_ACCOUNT",
      send,
    },
    deps,
  );

beforeAll(async () => {
  shop = await makeTestShop("Orders");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: shop.ciderId }, { siteId: shop.mainId, onHand: 26 });
  coke = await addTestProduct(shop.companyId, { name: "Coca-Cola 500ml", price: "0.75", cost: "0.52" }, { siteId: shop.mainId, onHand: 180 });
  const make = async (name: string, extra: Record<string, unknown> = {}) =>
    (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name, ...extra }))).id;
  delta = await make("Delta Beverages", { phone: "+263 24 270 1600", email: "orders@delta.co.zw", pays: "30 days", leadTime: "2" });
  await prisma.vendor.update({ where: { id: delta }, data: { whatsapp: "+263 77 214 9080" } });
  await prisma.$transaction((tx) => addContact(tx, shop.manager(), delta, { name: "Tinashe Moyo", role: "Sales rep", phone: "+263 77 214 9080", sends: "Orders" }));
  pamela = await make("Pamela", { phone: "+263 77 330 1922", email: "pamela@example.com", sendOrdersOnWhatsapp: false });
  quiet = await make("Quiet Traders");
  await prisma.vendor.update({ where: { id: quiet }, data: { whatsapp: null, phone: null, email: null } });
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.retailGoodsReceipt.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("raising an order", () => {
  it("saves a draft with lines at cost ex VAT and the product's VAT rate, and sends nothing", async () => {
    const draft = await raise(delta, false);
    expect(draft.poNo).toMatch(/^PO-\d{4}$/);
    const order = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: draft.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    expect(order.status).toBe("DRAFT");
    expect(order.sentAt).toBeNull();
    expect(order.lines.map((line) => [line.itemName, Number(line.lineTotal)])).toEqual([
      ["Castle Lager 340ml", 206.4],
      ["Coca-Cola 500ml", 93.6],
    ]);
    // The product's rate when the line was made: Castle is in Ciders and coolers, at 15.5%.
    expect(Number(order.lines[0]!.vatRate)).toBe(15.5);
    expect(await prisma.retailMessage.count({ where: { entityId: draft.id } })).toBe(0);
  });

  it("sends to the contact who gets orders on WhatsApp, with the order's PDF link", async () => {
    const sent = await raise(delta, true);
    expect(sent.sentVia).toBe("WHATSAPP");
    const order = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: sent.id }, include: { lines: true } });
    expect(order.status).toBe("SENT");
    expect(order.firstExpectedDate?.toISOString()).toBe(order.expectedDate?.toISOString());
    expect(order.lines.every((line) => Number(line.sentQuantity) === Number(line.quantity))).toBe(true);
    const messages = await prisma.retailMessage.findMany({ where: { entityType: "RetailPurchaseOrder", entityId: sent.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: "WHATSAPP", to: "+263772149080", direction: "OUT", status: "QUEUED", template: "purchase-order", mediaKind: "DOCUMENT", mediaName: `${sent.poNo}.pdf` });
    expect(messages[0]!.mediaUrl).toContain(`/api/v2/retail/records/RetailPurchaseOrder/${sent.id}/pdf?token=`);
    expect(messages[0]!.body).toMatch(/^Hello Tinashe, here is order PO-\d{4} from .+ for Harare Main Branch, expected Friday 16 October: Castle Lager 340ml 240, Coca-Cola 500ml 180\. Total US\$[\d,]+\.\d\d, on account, 30 days\. The order is attached\.$/);
  });

  it("emails a supplier who does not take orders on WhatsApp, and sends nothing by hand when there is neither", async () => {
    const emailed = await raise(pamela, true);
    expect(emailed.sentVia).toBe("EMAIL");
    const mail = await prisma.retailMessage.findFirstOrThrow({ where: { entityId: emailed.id } });
    expect(mail).toMatchObject({ channel: "EMAIL", to: "pamela@example.com" });
    expect(mail.body).toContain("The order: http://localhost:3000/api/v2/retail/records/RetailPurchaseOrder/");

    const byHand = await raise(quiet, true);
    expect(byHand.sentVia).toBe("BY_HAND");
    expect(await prisma.retailMessage.count({ where: { entityId: byHand.id } })).toBe(0);
  });

  it("refuses a stopped supplier, a quantity of nought, and sending nothing", async () => {
    const stopped = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Gone Ltd" }))).id;
    await prisma.$transaction((tx) => stopSupplier(tx, shop.manager(), stopped));
    expect(await refusal(raise(stopped, true))).toMatchObject({ status: 409, message: "You stopped buying from Gone Ltd." });
    expect(await refusal(raise(delta, true, 0))).toMatchObject({ status: 400, fieldErrors: { lines: "Each line needs a quantity." } });
    expect(
      await refusal(raiseOrder(shop.manager(), { supplierId: delta, siteId: shop.mainId, lines: [], payment: "ON_ACCOUNT", send: true }, deps)),
    ).toMatchObject({ status: 400, message: "Add at least one line." });
  });

  it("picks recipients: orders contacts, else the supplier's WhatsApp, else its email", () => {
    const base = { name: "X", whatsapp: "+263 77 000 0001", email: "x@example.com", sendOrdersOnWhatsapp: true, contactName: null };
    expect(orderRecipients({ ...base, contacts: [{ name: "Rudo Banda", phone: "+263 77 111 2222", email: null, sends: "ORDERS" }] })).toEqual([
      { name: "Rudo Banda", firstName: "Rudo", channel: "WHATSAPP", to: "+263771112222" },
    ]);
    expect(orderRecipients({ ...base, contacts: [] })[0]).toMatchObject({ channel: "WHATSAPP", to: "+263770000001" });
    expect(orderRecipients({ ...base, whatsapp: null, contacts: [] })[0]).toMatchObject({ channel: "EMAIL", to: "x@example.com" });
    expect(orderRecipients({ ...base, whatsapp: null, email: null, contacts: [] })).toEqual([]);
  });
});

describe("a draft sent later", () => {
  it("sends once, and refuses a second send", async () => {
    const draft = await raise(delta, false);
    const sent = await sendOrder(shop.manager(), draft.id, null, deps);
    expect(sent.sentVia).toBe("WHATSAPP");
    expect(await refusal(sendOrder(shop.manager(), draft.id, null, deps))).toMatchObject({ status: 409, message: `${draft.poNo} has already been sent.` });
  });
});

describe("changing, duplicating, closing and reopening", () => {
  it("keeps what came, locks the site, tells the supplier, closes short and reopens", async () => {
    const order = await raise(delta, true);
    const lines = await prisma.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    await receiveDelivery(
      shop.manager(),
      { purchaseOrderId: order.id, siteId: shop.mainId, lines: [{ inventoryItemId: castle.itemId, quantity: 120, unitCost: 0.86, purchaseOrderLineId: lines[0]!.id }] },
      noJournal,
    );
    const [castleLine, cokeLine] = lines;
    const edit = (castleQty: number, extra: Record<string, unknown> = {}) =>
      changeOrder(
        shop.manager(),
        order.id,
        {
          lines: [
            { id: castleLine!.id, productId: castle.productId, quantity: castleQty, unitCost: "0.86" },
            { id: cokeLine!.id, productId: coke.productId, quantity: 180, unitCost: "0.52" },
          ],
          ...extra,
        },
        deps,
      );
    expect(await refusal(edit(100))).toMatchObject({ status: 409, message: "120 of Castle Lager 340ml have already come; the order cannot ask for fewer." });

    const second = await prisma.site.create({ data: { companyId: shop.companyId, code: `S-${Date.now()}`, name: "Borrowdale" }, select: { id: true } });
    expect(await refusal(changeOrder(shop.manager(), order.id, { siteId: second.id }, deps))).toMatchObject({ status: 409 });

    const before = await prisma.retailMessage.count({ where: { entityId: order.id } });
    const told = await edit(300, { tell: true, expectedDate: "2026-10-07" });
    expect(told.changes).toEqual([{ item: "Castle Lager 340ml", from: 240, to: 300 }]);
    const changed = await prisma.retailMessage.findFirstOrThrow({ where: { entityId: order.id, template: "order-changed" } });
    expect(changed.body).toBe(`${order.poNo} has changed: Castle Lager 340ml 240 → 300. Expected 7 October. The new order is attached.`);
    expect(await prisma.retailMessage.count({ where: { entityId: order.id } })).toBe(before + 1);
    expect(Number((await prisma.retailPurchaseOrderLine.findUniqueOrThrow({ where: { id: castleLine!.id } })).sentQuantity)).toBe(300);
    expect(await prisma.platformAuditEvent.count({ where: { entityId: order.id, eventType: "RETAIL_PURCHASE_ORDER.CHANGED" } })).toBe(1);

    const closed = await closeOrder(shop.manager(), order.id, null);
    expect(closed.message).toBe(`${order.poNo} closed with what came. 360 units are no longer expected.`);
    const after = await prisma.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    expect(after.map((line) => line.closedShortAt !== null)).toEqual([true, true]);
    expect((await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CLOSED");
    expect(await refusal(closeOrder(shop.manager(), order.id, null))).toMatchObject({ status: 409, message: "This order is already closed" });

    const reopened = await reopenOrder(shop.manager(), order.id);
    expect(reopened.message).toBe(`${order.poNo} reopened. 360 units are expected again.`);
    const back = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(back.status).toBe("PARTIAL");
    expect(back.lines.every((line) => line.closedShortAt === null)).toBe(true);
  });

  it("closes only the lines still owed", async () => {
    const order = await raise(delta, true);
    const lines = await prisma.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    await receiveDelivery(
      shop.manager(),
      { purchaseOrderId: order.id, siteId: shop.mainId, lines: [{ inventoryItemId: coke.itemId, quantity: 180, unitCost: 0.52, purchaseOrderLineId: lines[1]!.id }] },
      noJournal,
    );
    await closeOrder(shop.manager(), order.id, null);
    const after = await prisma.retailPurchaseOrderLine.findMany({ where: { purchaseOrderId: order.id }, orderBy: { sortOrder: "asc" } });
    expect(after.map((line) => line.closedShortAt !== null)).toEqual([true, false]);
  });

  it("duplicates at today's cost as a new draft", async () => {
    const order = await raise(delta, true);
    await prisma.inventoryItem.update({ where: { id: coke.itemId }, data: { unitCost: 0.55 } });
    const copy = await duplicateOrder(shop.manager(), order.id, deps);
    const made = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: copy.id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    expect(made).toMatchObject({ status: "DRAFT", duplicatedFromId: order.id, vendorId: delta });
    expect(made.lines.map((line) => [line.itemName, Number(line.quantity)])).toEqual([
      ["Castle Lager 340ml", 240],
      ["Coca-Cola 500ml", 180],
    ]);
    // Coke was last delivered from Delta at 0.52 (above); Castle too, at 0.86.
    expect(made.lines.map((line) => Number(line.unitCost))).toEqual([0.86, 0.52]);
  });

  it("refuses to stop buying from a supplier while an order of theirs is open", async () => {
    const open = await prisma.retailPurchaseOrder.findFirstOrThrow({
      where: { companyId: shop.companyId, vendorId: delta, status: { in: ["DRAFT", "SENT", "PARTIAL"] }, archivedAt: null },
      orderBy: { poNo: "asc" },
    });
    expect(await refusal(prisma.$transaction((tx) => stopSupplier(tx, shop.manager(), delta)))).toMatchObject({
      status: 409,
      message: `${open.poNo} is still open with Delta Beverages. Close or cancel it first.`,
    });
  });
});
