/**
 * Requisitions (40-buying W-31, W-32, W-72, BUY-04), against the test
 * database: asking for an order's cash (the total with VAT at most, one live
 * per order) and for an expense, Pay from in the currency asked, the owner
 * limit snapshotted when asked and who it waits for; an owner approves
 * anything, their own too, a manager only at or under the limit and never
 * their own; approving less needs a note; rejecting for Other needs a
 * message; nothing is cancelled once paid out; a cashier reads only her own;
 * the bulk approve skips what a manager may not decide.
 */
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { raiseOrder } from "./orders";
import { loadRequisitionView } from "./requisition-view";
import {
  approveMany,
  approveRequisition,
  askForMoney,
  askQuestion,
  cancelRequisition,
  changeRequisition,
  rejectRequisition,
  RequisitionRefusal,
} from "./requisitions";
import { createSupplier } from "./suppliers";
import { decidableRequisitions } from "./waiting";

let shop: TestShop;
let cashier: { companyId: string; userId: string; userName: string; userRole: string };
let afdis: string;
let safe: string;
let zigSafe: string;
let fuel: string;
let castle: { productId: string; itemId: string };

const deps = { requestUrl: "http://localhost:3000/retail/buying/requisitions" };

async function refusal(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof RequisitionRefusal) return { status: error.status, message: error.message, fieldErrors: error.fieldErrors };
    throw error;
  }
  throw new Error("Expected a refusal");
}

const order = async (quantity: number) =>
  raiseOrder(
    shop.manager(),
    { supplierId: afdis, siteId: shop.mainId, expectedDate: "2026-12-01", lines: [{ productId: castle.productId, quantity, unitCost: "10.00" }], payment: "CASH_ON_DELIVERY", send: false },
    deps,
  );

const expense = (actor: typeof cashier | ReturnType<TestShop["manager"]>, amount: string) =>
  askForMoney(actor, { for: "expense", expenseTypeId: fuel, whatFor: "Generator diesel, 40 litres", amount, currency: "US$", payFromId: safe }, deps);

beforeAll(async () => {
  shop = await makeTestShop("Requisitions");
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  const cashierId = (
    await prisma.user.create({ data: { email: `cashier-${shop.companyId}@shop.test`, name: "Chipo Dube", role: "CASHIER", companyId: shop.companyId }, select: { id: true } })
  ).id;
  cashier = { companyId: shop.companyId, userId: cashierId, userName: "Chipo Dube", userRole: "CASHIER" };
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: shop.ciderId }, { siteId: shop.mainId, onHand: 10 });
  afdis = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Afdis Distillers" }))).id;
  safe = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "Office safe", kind: "CASH", currency: "USD" }, select: { id: true } })).id;
  zigSafe = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "ZiG box", kind: "CASH", currency: "ZWG" }, select: { id: true } })).id;
  fuel = (await prisma.retailExpenseType.create({ data: { companyId: shop.companyId, name: "Fuel and transport", category: "FUEL" }, select: { id: true } })).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.crmRequisition.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("asking for an order's cash", () => {
  it("asks for the total with VAT at most, over the limit for the owner, and one at a time", async () => {
    const draft = await order(100); // US$1,000.00 + VAT at 15.5% = US$1,155.00
    expect(await refusal(askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "1155.01", currency: "US$", payFromId: safe }, deps))).toMatchObject({
      status: 400,
      fieldErrors: { amt: "Ask for the order total or less." },
    });

    const asked = await askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "1155.00", currency: "US$", payFromId: safe, why: "Cash only." }, deps);
    expect(asked.requisitionNo).toMatch(/^REQ-\d{4}$/);
    expect(asked.waitsFor).toBe("Tendai Mhlanga");
    expect(asked.message).toBe(`${asked.requisitionNo} sent to Tendai Mhlanga for approval.`);
    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } });
    expect(row).toMatchObject({ status: "SUBMITTED", category: "STOCK", purchaseOrderId: draft.id, payeeVendorId: afdis, approverId: shop.ownerId, notes: "Cash only." });
    expect(row.purpose).toBe(`Cash to pay Afdis for order ${draft.poNo}`);
    expect(row.approvalLimit?.toFixed(2)).toBe("500.00");

    expect(await refusal(askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "10.00", currency: "US$", payFromId: safe }, deps))).toMatchObject({
      status: 409,
      message: `${asked.requisitionNo} already asks for ${draft.poNo}.`,
    });
  });

  it("needs Pay from in the currency asked", async () => {
    expect(await refusal(askForMoney(shop.manager(), { for: "expense", expenseTypeId: fuel, whatFor: "Diesel", amount: "10.00", currency: "ZiG", payFromId: safe }, deps))).toMatchObject({
      status: 400,
      fieldErrors: { from: "Office safe holds US dollars." },
    });
    const zig = await askForMoney(shop.manager(), { for: "expense", expenseTypeId: fuel, whatFor: "Diesel", amount: "10.00", currency: "ZiG", payFromId: zigSafe }, deps);
    expect((await prisma.crmRequisition.findUniqueOrThrow({ where: { id: zig.id } })).currency).toBe("ZWG");
  });
});

describe("asking for an expense", () => {
  it("is under the limit for any manager: named when exactly one can decide it", async () => {
    const asked = await expense(cashier, "62.00");
    expect(asked.waitsFor).toBe("Tafara Nyathi");
    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } });
    expect(row).toMatchObject({ category: "FUEL", expenseTypeId: fuel, approverId: null, purpose: "Generator diesel, 40 litres" });

    const second = await prisma.user.create({ data: { email: `manager2-${shop.companyId}@shop.test`, name: "Rudo Moyo", role: "MANAGER", companyId: shop.companyId }, select: { id: true } });
    expect((await expense(cashier, "20.00")).waitsFor).toBeNull();
    await prisma.user.update({ where: { id: second.id }, data: { isActive: false } });
  });

  it("refuses an empty what for and an amount of nought", async () => {
    expect(await refusal(askForMoney(cashier, { for: "expense", expenseTypeId: fuel, whatFor: " ", amount: "5", currency: "US$", payFromId: safe }, deps))).toMatchObject({
      fieldErrors: { what: "Say what the money is for." },
    });
    expect(await refusal(expense(cashier, "0"))).toMatchObject({ fieldErrors: { amt: "Ask for more than nought." } });
  });

  it("keeps the limit it was asked under, whatever the setting says later", async () => {
    const asked = await expense(cashier, "450.00");
    await prisma.retailApprovalSettings.upsert({
      where: { companyId: shop.companyId },
      create: { companyId: shop.companyId, requisitionOwnerOver: new Prisma.Decimal("100.00") },
      update: { requisitionOwnerOver: new Prisma.Decimal("100.00") },
    });
    // Asked under US$500.00: the manager may still decide it.
    expect((await approveRequisition(shop.manager(), asked.id, {}, deps)).message).toBe("US$450.00 approved. It can be paid out now.");
    await prisma.retailApprovalSettings.update({ where: { companyId: shop.companyId }, data: { requisitionOwnerOver: new Prisma.Decimal("500.00") } });
  });
});

describe("deciding", () => {
  it("lets a manager approve under the limit, not over it, and never their own", async () => {
    const small = await expense(cashier, "62.00");
    const big = await expense(cashier, "620.00");
    const own = await expense(shop.manager(), "30.00");
    expect(await refusal(approveRequisition(shop.manager(), big.id, {}, deps))).toEqual({ status: 403, message: "Over US$500.00 needs Tendai Mhlanga.", fieldErrors: null });
    expect(await refusal(approveRequisition(shop.manager(), own.id, {}, deps))).toMatchObject({ status: 403, message: "Somebody else has to approve your own request." });
    const done = await approveRequisition(shop.manager(), small.id, {}, deps);
    expect(done.message).toBe("US$62.00 approved. It can be paid out now.");
    expect(await refusal(approveRequisition(shop.owner(), small.id, {}, deps))).toMatchObject({ status: 409, message: `${small.requisitionNo} has already been approved.` });
  });

  it("lets the owner approve anything, their own too, and approve less with a note", async () => {
    const own = await expense(shop.owner(), "900.00");
    expect((await approveRequisition(shop.owner(), own.id, {}, deps)).requisitionNo).toBe(own.requisitionNo);

    const asked = await expense(shop.manager(), "800.00");
    expect(await refusal(approveRequisition(shop.owner(), asked.id, { amount: "900.00", note: "x" }, deps))).toMatchObject({
      fieldErrors: { amt: "Approve the amount asked for, or less." },
    });
    expect(await refusal(approveRequisition(shop.owner(), asked.id, { amount: "600.00" }, deps))).toMatchObject({ fieldErrors: { why: "Tell Tafara why." } });
    const done = await approveRequisition(shop.owner(), asked.id, { amount: "600.00", note: "The rest on Friday." }, deps);
    expect(done.message).toBe("US$600.00 approved. Tafara can pay it out.");
    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } });
    expect(row).toMatchObject({ status: "APPROVED", approvedById: shop.ownerId, decisionNote: "The rest on Friday." });
    expect(row.approvedAmount?.toFixed(2)).toBe("600.00");
  });

  it("needs a message to reject for Other, and tells the asker", async () => {
    const asked = await expense(cashier, "40.00");
    expect(await refusal(rejectRequisition(shop.owner(), asked.id, { reason: "Other" }, deps))).toMatchObject({ fieldErrors: { msg: "Tell Chipo why." } });
    const done = await rejectRequisition(shop.owner(), asked.id, { reason: "Pay another way", message: "Use the float." }, deps);
    expect(done.message).toBe(`${asked.requisitionNo} rejected. Chipo has been told why.`);
    expect(await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } })).toMatchObject({ status: "REJECTED", rejectReason: "PAY_ANOTHER_WAY", decisionNote: "Use the float." });
    expect(await prisma.notification.count({ where: { entityId: asked.id, type: "CRM_REQUISITION_DECIDED" } })).toBe(1);
  });

  it("approves several at once, skipping what a manager may not decide", async () => {
    const ok = await expense(cashier, "15.00");
    const over = await expense(cashier, "700.00");
    const answer = await approveMany(shop.manager(), [ok.id, over.id], deps);
    expect(answer.approved).toEqual([ok.requisitionNo]);
    expect(answer.skipped).toEqual([{ requisitionNo: over.requisitionNo, why: "Over US$500.00 needs Tendai Mhlanga." }]);
  });

  it("counts what each person may decide now", async () => {
    const mine = await decidableRequisitions({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" });
    const owners = await decidableRequisitions({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
    expect(owners.length).toBeGreaterThan(mine.length);
    expect(mine.every((row) => row.requestedById !== shop.managerId && row.amount.lessThanOrEqualTo(row.approvalLimit ?? 0))).toBe(true);
  });

  it("asks the asker a question, and lets them answer", async () => {
    const asked = await expense(cashier, "25.00");
    expect((await askQuestion(shop.owner(), asked.id, { message: "Which generator?" }, deps)).message).toBe("Question sent to Chipo.");
    expect((await askQuestion(cashier, asked.id, { message: "The back one." }, deps)).message).toBe("Answer sent to Tendai.");
    expect(await refusal(askQuestion(shop.owner(), asked.id, { message: "" }, deps))).toMatchObject({ fieldErrors: { q: "Write the question." } });
  });
});

describe("cancelling and changing", () => {
  it("cancels before it is paid out, and not after", async () => {
    const asked = await expense(cashier, "33.00");
    expect((await cancelRequisition(cashier, asked.id, deps)).message).toBe(`${asked.requisitionNo} cancelled.`);
    expect(await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } })).toMatchObject({ status: "CANCELLED", cancelledById: cashier.userId });

    const paid = await expense(cashier, "34.00");
    await prisma.crmRequisition.update({ where: { id: paid.id }, data: { status: "DISBURSED" } });
    expect(await refusal(cancelRequisition(shop.manager(), paid.id, deps))).toEqual({
      status: 409,
      message: `${paid.requisitionNo} has been paid out. Account for it instead.`,
      fieldErrors: null,
    });
  });

  it("changes what waits, and only Pay from once approved", async () => {
    const asked = await expense(cashier, "35.00");
    const changed = await changeRequisition(cashier, asked.id, { amount: "36.50" });
    expect(changed.changes).toEqual([{ field: "amount", from: "35.00", to: "36.50" }]);
    await approveRequisition(shop.manager(), asked.id, {}, deps);
    expect(await refusal(changeRequisition(cashier, asked.id, { amount: "40.00" }))).toMatchObject({ status: 409, message: `${asked.requisitionNo} has been approved. Ask again to change it.` });
    expect((await changeRequisition(cashier, asked.id, { payFromId: safe })).changes).toEqual([]);
  });

  it("cancels an order's requisition with the order's rest, and says so", async () => {
    const draft = await order(5);
    const asked = await askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "20.00", currency: "US$", payFromId: safe }, deps);
    await prisma.retailPurchaseOrder.update({ where: { id: draft.id }, data: { status: "SENT" } });
    const { cancelRest } = await import("./orders");
    await cancelRest(shop.manager(), draft.id);
    expect((await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } })).status).toBe("CANCELLED");
  });
});

describe("who reads what", () => {
  it("gives a cashier her own and not another's", async () => {
    const theirs = await expense(shop.manager(), "12.00");
    const hers = await expense(cashier, "13.00");
    expect(await loadRequisitionView(cashier, theirs.id)).toBeNull();
    expect((await loadRequisitionView(cashier, hers.id))?.requisitionNo).toBe(hers.requisitionNo);
    expect(await refusal(cancelRequisition(cashier, theirs.id, deps))).toMatchObject({ status: 404 });
    const view = await loadRequisitionView(shop.owner(), theirs.id);
    expect(view?.can).toMatchObject({ approve: true, cancel: true, payOut: false });
  });
});
