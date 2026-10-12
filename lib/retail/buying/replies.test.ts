/**
 * A supplier's WhatsApp reply (40-buying W-34, C-04): matched by the sender's
 * number to a contact, a rep or the supplier's own WhatsApp; kept once per
 * event; on the supplier's latest open order, else on the supplier; never
 * queued; the order's sender told.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { raiseOrder } from "./orders";
import { keepSupplierReply, orderReplyHandler } from "./replies";
import { addContact, createSupplier } from "./suppliers";

let shop: TestShop;
let delta: string;
let afdis: string;
let orderId: string;
const stamp = Date.now().toString().slice(-6);
// Numbers no other shop in the test database uses.
const REP = `+263 71 5${stamp.slice(0, 2)} ${stamp.slice(2)}`;
const DESK = `+263 71 6${stamp.slice(0, 2)} ${stamp.slice(2)}`;
const OWN = `+263 71 7${stamp.slice(0, 2)} ${stamp.slice(2)}`;
const digits = (phone: string) => phone.replace(/\D/g, "");

beforeAll(async () => {
  shop = await makeTestShop("Replies");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  const castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId });
  delta = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages", phone: "+263 24 270 1600" }))).id;
  await prisma.$transaction((tx) => addContact(tx, shop.manager(), delta, { name: "Tinashe Moyo", role: "Sales rep", phone: REP, sends: "Orders" }));
  await prisma.$transaction((tx) => addContact(tx, shop.manager(), delta, { name: "Orders desk", role: "Orders desk", phone: DESK, sends: "Nothing" }));
  afdis = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Afdis Distillers" }))).id;
  await prisma.vendor.update({ where: { id: afdis }, data: { whatsapp: OWN } });
  orderId = (
    await raiseOrder(
      shop.manager(),
      { supplierId: delta, siteId: shop.mainId, lines: [{ productId: castle.productId, quantity: 240, unitCost: "0.86" }], payment: "ON_ACCOUNT", send: true },
      { requestUrl: "http://localhost:3000" },
    )
  ).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  await prisma.notification.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.vendor.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("a reply", () => {
  it("lands on the supplier's open order when the rep writes, once, never queued", async () => {
    const event = { id: `wamid.${stamp}.1`, from: digits(REP), text: "Truck on Wednesday, 7 October.", at: new Date("2026-10-02T09:05:00Z") };
    expect(await keepSupplierReply(event)).toBe(1);
    expect(await keepSupplierReply(event)).toBe(0);
    const kept = await prisma.retailMessage.findMany({ where: { companyId: shop.companyId, direction: "IN" } });
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      entityType: "RetailPurchaseOrder",
      entityId: orderId,
      status: "SENT",
      channel: "WHATSAPP",
      externalId: event.id,
      body: "Truck on Wednesday, 7 October.",
      fromNumber: `+${digits(REP)}`,
    });
    const told = await prisma.notification.findFirst({ where: { companyId: shop.companyId, type: "RETAIL_ORDER_FOLLOW_UP" }, include: { recipients: true } });
    expect(told?.title).toMatch(/^Delta Beverages replied about PO-\d{4}\.$/);
    expect(told?.recipients.map((row) => row.userId)).toEqual([shop.managerId]);
  });

  it("matches any contact's phone, and a supplier's own WhatsApp with no open order lands on the supplier", async () => {
    await orderReplyHandler.handle({ kind: "message", id: `wamid.${stamp}.2`, from: digits(DESK), text: "Noted", at: null, phoneNumberId: null });
    expect(await prisma.retailMessage.count({ where: { companyId: shop.companyId, direction: "IN", entityId: orderId } })).toBe(2);
    await orderReplyHandler.handle({ kind: "message", id: `wamid.${stamp}.3`, from: digits(OWN), text: "Price list attached", at: null, phoneNumberId: null });
    const onVendor = await prisma.retailMessage.findFirstOrThrow({ where: { companyId: shop.companyId, externalId: `wamid.${stamp}.3` } });
    expect(onVendor).toMatchObject({ entityType: "Vendor", entityId: afdis, status: "SENT" });
  });

  it("ignores a number nobody here has", async () => {
    expect(await keepSupplierReply({ id: `wamid.${stamp}.4`, from: "263700000000", text: "hi", at: null })).toBe(0);
  });
});
