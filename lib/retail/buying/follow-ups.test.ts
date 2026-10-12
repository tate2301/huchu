/**
 * The morning's order follow-ups (40-buying W-34, 4.9), against the test
 * database with a fixed clock: "Remind me" tells the chaser once and marks the
 * order followed up; "Cancel the rest" cancels what is left as "Automatic"
 * (no actor) and queues the supplier's message; an order promised for today is
 * left alone; a second run does nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { runBuyingFollowUps } from "./follow-ups";
import { chaseOrder, raiseOrder } from "./orders";
import { addContact, createSupplier } from "./suppliers";

let shop: TestShop;
let castle: { productId: string; itemId: string };
let delta: string;

const deps = { requestUrl: "http://localhost:3000/retail/buying/orders" };
// Chased on 15 October; the follow-ups run at 07:00 in Harare on 20 October.
const chasedAt = new Date("2026-10-15T08:00:00Z");
const morning = new Date("2026-10-20T05:00:00Z");

async function chased(promisedFor: string, then: "REMIND" | "CANCEL_REST") {
  const order = await raiseOrder(
    shop.manager(),
    { supplierId: delta, siteId: shop.mainId, expectedDate: "2026-10-14", lines: [{ productId: castle.productId, quantity: 240, unitCost: "0.86" }], payment: "ON_ACCOUNT", send: true },
    { ...deps, now: new Date("2026-10-10T08:00:00Z") },
  );
  await chaseOrder(shop.manager(), order.id, { contactId: null, message: "When can you deliver?", promisedFor, then }, chasedAt);
  return order;
}

const followUpNotices = (orderId: string) =>
  prisma.notification.findMany({ where: { companyId: shop.companyId, type: "RETAIL_ORDER_FOLLOW_UP", entityId: orderId }, include: { recipients: true } });

beforeAll(async () => {
  shop = await makeTestShop("Follow-ups");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86" }, { siteId: shop.mainId, onHand: 26 });
  delta = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages", phone: "+263 77 214 9080" }))).id;
  await prisma.vendor.update({ where: { id: delta }, data: { whatsapp: "+263 77 214 9080" } });
  await prisma.$transaction((tx) => addContact(tx, shop.manager(), delta, { name: "Tinashe Moyo", role: "Sales rep", phone: "+263 77 214 9080", sends: "Orders" }));
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendorContact.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("runBuyingFollowUps", () => {
  it("reminds the chaser once, cancels the rest automatically, and leaves today's promise alone", async () => {
    const remind = await chased("2026-10-18", "REMIND");
    const cancel = await chased("2026-10-19", "CANCEL_REST");
    const today = await chased("2026-10-20", "REMIND");

    expect(await runBuyingFollowUps(shop.companyId, morning)).toEqual({ reminded: 1, cancelled: 1, receiptsOverdue: 0 });

    // Remind me: Tafara is told, and the order is followed up.
    const notices = await followUpNotices(remind.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.title).toBe(`${remind.poNo} has not come. Delta Beverages promised it for 18 October.`);
    expect(notices[0]!.recipients.map((row) => row.userId)).toEqual([shop.managerId]);
    expect((await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: remind.id } })).followUpDoneAt?.toISOString()).toBe(morning.toISOString());

    // Cancel the rest: nothing came, so it is cancelled, by nobody, and Delta is asked to cancel it.
    const cancelled = await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: cancel.id }, include: { lines: true } });
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledById: null });
    expect(cancelled.lines.map((line) => Number(line.quantity))).toEqual([0]);
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: cancel.id, eventType: "RETAIL_PURCHASE_ORDER.REST_CANCELLED" } });
    expect(event.actor).toBeNull();
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ units: 240, automatic: true });
    expect(await prisma.retailMessage.findFirst({ where: { entityId: cancel.id, template: "order-cancel-rest" } })).toMatchObject({
      to: "+263772149080",
      createdById: null,
      body: `Please cancel what is left of ${cancel.poNo}: Castle 340ml 240. Thank you.`,
    });

    // Promised for today: not late until tomorrow.
    expect(await prisma.retailPurchaseOrder.findUniqueOrThrow({ where: { id: today.id } })).toMatchObject({ status: "SENT", followUpDoneAt: null });
    expect(await followUpNotices(today.id)).toHaveLength(0);
  });

  it("does nothing on a second run", async () => {
    expect(await runBuyingFollowUps(shop.companyId, morning)).toEqual({ reminded: 0, cancelled: 0, receiptsOverdue: 0 });
    expect(await runBuyingFollowUps(shop.companyId, new Date(morning.getTime() + 60_000))).toEqual({ reminded: 0, cancelled: 0, receiptsOverdue: 0 });
  });
});
