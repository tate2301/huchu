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
import { expectedCashForShift } from "@/lib/retail/cash-up";

import { moneyAccountBalance } from "./money-accounts";
import {
  accountFor,
  approveMany,
  approveRequisition,
  askForMoney,
  askQuestion,
  cancelRequisition,
  changeRequisition,
  payOut,
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
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.retailAttachment.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
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

/* ── Paying out and accounting for it (BUY-05) ─────────────────────────── */

const RECEIPT = { url: "/demo/receipts/fuel-receipt.png", name: "Fuel receipt.png", contentType: "image/png", size: 683 };

/** A cash account holding `opening`, in US dollars. */
const cashBox = async (name: string, opening: number) =>
  (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name, kind: "CASH", currency: "USD", openingBalance: opening }, select: { id: true } })).id;

const approvedExpense = async (amount: string, from: string) => {
  const asked = await askForMoney(cashier, { for: "expense", expenseTypeId: fuel, whatFor: "Generator diesel", amount, currency: "US$", payFromId: from }, deps);
  await approveRequisition(shop.owner(), asked.id, {}, deps);
  return asked;
};

describe("paying out", () => {
  it("pays the approved amount or less, from an account in its currency, with a reference unless cash", async () => {
    const box = await cashBox("Pay box", 500);
    const asked = await approvedExpense("80.00", box);
    const pay = (input: Partial<Parameters<typeof payOut>[2]>) =>
      payOut(shop.manager(), asked.id, { paid: "80.00", fromId: box, toId: cashier.userId, how: "Cash", ...input }, deps);
    expect(await refusal(pay({ paid: "80.01" }))).toMatchObject({ status: 400, fieldErrors: { paid: "Pay the approved amount or less." } });
    expect(await refusal(pay({ paid: "0" }))).toMatchObject({ status: 400, fieldErrors: { paid: "Write an amount." } });
    expect(await refusal(pay({ fromId: zigSafe }))).toMatchObject({ status: 400, fieldErrors: { from: "ZiG box holds ZiG." } });
    expect(await refusal(pay({ how: "Bank transfer" }))).toMatchObject({ status: 400, fieldErrors: { ref: "Add the reference." } });
    expect(await refusal(pay({ how: "EcoCash", reference: " " }))).toMatchObject({ status: 400, fieldErrors: { ref: "Add the reference." } });
    expect(await refusal(payOut(cashier, asked.id, { paid: "80.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps))).toMatchObject({
      status: 403,
      message: "Your role cannot change requisitions",
    });
  });

  it("refuses more than a cash account holds, saying what it holds", async () => {
    const box = await cashBox("Small box", 50);
    const asked = await approvedExpense("62.00", box);
    expect(await refusal(payOut(shop.manager(), asked.id, { paid: "62.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps))).toEqual({
      status: 409,
      message: "Small box has US$50.00.",
      fieldErrors: { from: "Small box has US$50.00." },
    });
    expect((await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } })).status).toBe("APPROVED");
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: box } })).toBe(0);
  });

  it("credits the money account and moves no drawer: an open shift's expected cash stays where it was", async () => {
    const till = await prisma.retailRegister.create({ data: { companyId: shop.companyId, siteId: shop.mainId, code: `T-${shop.companyId.slice(0, 6)}`, name: "Front till" } });
    const shift = await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-${Date.now() % 100000}`,
        registerId: till.id,
        registerCode: till.code,
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: cashier.userId,
        cashierName: "Chipo Dube",
        openingFloat: "120.00",
        expectedCash: "120.00",
      },
    });
    const expectedNow = async () => {
      const row = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
      const movements = await prisma.retailCashMovement.findMany({ where: { shiftId: shift.id } });
      return { stored: row.expectedCash.toFixed(2), computed: expectedCashForShift({ openingFloat: row.openingFloat, openingFloatZigBase: row.openingFloatZigBase, cashTakings: 0, movements }).toFixed(2) };
    };
    const before = await expectedNow();
    const movementsBefore = await prisma.retailCashMovement.count({ where: { companyId: shop.companyId } });

    const box = await cashBox("Front till float", 120);
    const asked = await approvedExpense("85.00", box);
    const done = await payOut(shop.manager(), asked.id, { paid: "85.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps);
    expect(done.message).toMatch(/^US\$85\.00 paid out\. Receipts due by \d{1,2} [A-Z][a-z]+\.$/);

    expect(await prisma.retailCashMovement.count({ where: { companyId: shop.companyId } })).toBe(movementsBefore);
    expect(await expectedNow()).toEqual(before);
    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } });
    expect(row).toMatchObject({ status: "DISBURSED", disbursedById: shop.managerId, paidToId: cashier.userId, payoutMethod: "CASH", bankAccountId: box });
    expect(row.paidAmount?.toFixed(2)).toBe("85.00");
    expect(row.receiptsDueAt!.getTime() - row.disbursedAt!.getTime()).toBe(3 * 86_400_000);
    const moves = await prisma.bankTransaction.findMany({ where: { sourceId: asked.id } });
    expect(moves.map((move) => [move.direction, move.amount, move.bankAccountId, move.sourceType])).toEqual([["CREDIT", 85, box, "RETAIL_REQUISITION_PAYOUT"]]);
    expect((await moneyAccountBalance(box)).toFixed(2)).toBe("35.00");
    // An expense puts nothing on a supplier's account.
    expect(await prisma.purchasePayment.count({ where: { requisitionId: asked.id } })).toBe(0);
    expect(await refusal(payOut(shop.manager(), asked.id, { paid: "85.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps))).toMatchObject({
      status: 409,
      message: `${asked.requisitionNo} has been paid out.`,
    });
  });

  it("puts an order's cash on the supplier's account as a credit with no bill", async () => {
    const box = await cashBox("Order box", 1000);
    const draft = await order(10); // US$115.50 with VAT
    const asked = await askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "115.50", currency: "US$", payFromId: box }, deps);
    await approveRequisition(shop.owner(), asked.id, {}, deps);
    await payOut(shop.owner(), asked.id, { paid: "115.50", fromId: box, toId: shop.managerId, how: "Cash" }, deps);
    const credits = await prisma.purchasePayment.findMany({ where: { requisitionId: asked.id } });
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ billId: null, vendorId: afdis, method: "Cash", reference: asked.requisitionNo, amount: 115.5, bankAccountId: box });
    expect(credits[0]!.groupNo).toMatch(/^PAY-\d{4}$/);
    expect(credits[0]!.paymentNumber).toBe(`${credits[0]!.groupNo}/1`);
  });

  it("lets only one of two payouts from an account holding enough for one through", async () => {
    const box = await cashBox("Race box", 100);
    const first = await approvedExpense("60.00", box);
    const second = await approvedExpense("60.00", box);
    const results = await Promise.allSettled(
      [first, second].map((asked) => payOut(shop.manager(), asked.id, { paid: "60.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(RequisitionRefusal);
    expect((failed.reason as RequisitionRefusal).message).toBe("Race box has US$40.00.");
    expect((await moneyAccountBalance(box)).toFixed(2)).toBe("40.00");
  });
});

describe("accounting for it", () => {
  it("needs what was spent within what was paid out, and a receipt", async () => {
    const box = await cashBox("Acquit box", 300);
    const asked = await approvedExpense("100.00", box);
    await payOut(shop.manager(), asked.id, { paid: "100.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps);
    expect(await refusal(accountFor(cashier, asked.id, { spent: "100.01", changeIntoId: box, receipts: [RECEIPT] }, deps))).toMatchObject({
      fieldErrors: { spent: "Spent is more than was paid out. Ask for the rest as a new requisition." },
    });
    expect(await refusal(accountFor(cashier, asked.id, { spent: "90.00", changeIntoId: box, receipts: [] }, deps))).toMatchObject({ fieldErrors: { rec: "Add the receipt." } });
    const other = await prisma.user.create({ data: { email: `stock-${shop.companyId}@shop.test`, name: "Tendai Sibanda", role: "STOCK_CLERK", companyId: shop.companyId }, select: { id: true } });
    expect(await refusal(accountFor({ companyId: shop.companyId, userId: other.id, userName: "Tendai Sibanda", userRole: "STOCK_CLERK" }, asked.id, { spent: "90.00", changeIntoId: box, receipts: [RECEIPT] }, deps))).toMatchObject({
      status: 404,
    });
  });

  it("puts the change back, cuts the supplier's credit to what was spent, and leaves the money accounts down by what was spent", async () => {
    const box = await cashBox("Change box", 1000);
    const draft = await order(20); // US$231.00 with VAT
    const asked = await askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "231.00", currency: "US$", payFromId: box }, deps);
    await approveRequisition(shop.owner(), asked.id, {}, deps);
    await payOut(shop.owner(), asked.id, { paid: "231.00", fromId: box, toId: shop.managerId, how: "Cash" }, deps);
    const done = await accountFor(shop.manager(), asked.id, { spent: "193.40", changeIntoId: box, receipts: [RECEIPT, { ...RECEIPT, name: "Invoice.png" }], note: "Short delivery." }, deps);
    expect(done.message).toBe(`${asked.requisitionNo} accounted for. US$37.60 back in the change box.`);

    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.id } });
    expect(row).toMatchObject({ status: "ACQUITTED", acquittedById: shop.managerId, changeAccountId: box, acquittalNote: "Short delivery." });
    expect([row.acquittedAmount?.toFixed(2), row.changeAmount?.toFixed(2)]).toEqual(["193.40", "37.60"]);
    const moves = await prisma.bankTransaction.findMany({ where: { sourceId: asked.id }, orderBy: { createdAt: "asc" } });
    expect(moves.map((move) => [move.direction, move.amount, move.sourceType])).toEqual([
      ["CREDIT", 231, "RETAIL_REQUISITION_PAYOUT"],
      ["DEBIT", 37.6, "RETAIL_REQUISITION_CHANGE"],
    ]);
    const net = moves.reduce((sum, move) => sum.plus(new Prisma.Decimal(move.amount).times(move.direction === "DEBIT" ? 1 : -1)), new Prisma.Decimal(0));
    expect(net.toFixed(2)).toBe("-193.40");
    const credits = await prisma.purchasePayment.findMany({ where: { requisitionId: asked.id } });
    expect(credits.map((credit) => credit.amount)).toEqual([193.4]);
    expect(await prisma.retailAttachment.count({ where: { entityType: "CrmRequisition", entityId: asked.id, kind: "RECEIPT" } })).toBe(2);
    expect(await refusal(accountFor(shop.manager(), asked.id, { spent: "193.40", changeIntoId: box, receipts: [RECEIPT] }, deps))).toMatchObject({
      status: 409,
      message: `${asked.requisitionNo} has been accounted for.`,
    });
  });

  it("lets the asker account for her own, spending all of it", async () => {
    const box = await cashBox("Own box", 200);
    const asked = await approvedExpense("40.00", box);
    await payOut(shop.manager(), asked.id, { paid: "40.00", fromId: box, toId: cashier.userId, how: "Cash" }, deps);
    const done = await accountFor(cashier, asked.id, { spent: "40.00", receipts: [RECEIPT] }, deps);
    expect(done.message).toBe(`${asked.requisitionNo} accounted for.`);
    expect(await prisma.bankTransaction.count({ where: { sourceId: asked.id, direction: "DEBIT" } })).toBe(0);
  });
});

describe("receipts that are late", () => {
  it("tells the asker once, the morning after the receipts day", async () => {
    const { runBuyingFollowUps, receiptsOverdueTitle } = await import("./follow-ups");
    const box = await cashBox("Late box", 200);
    const asked = await approvedExpense("30.00", box);
    const paidAt = new Date(Date.now() - 6 * 86_400_000);
    await payOut(shop.manager(), asked.id, { paid: "30.00", fromId: box, toId: cashier.userId, how: "Cash" }, { ...deps, now: paidAt });
    const first = await runBuyingFollowUps(shop.companyId);
    expect(first.receiptsOverdue).toBeGreaterThanOrEqual(1);
    const notices = await prisma.notification.findMany({ where: { entityId: asked.id, title: { contains: "receipts were due" } }, include: { recipients: true } });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.title).toMatch(new RegExp(`^${asked.requisitionNo}: receipts were due on \\d{1,2} [A-Z][a-z]+\\.$`));
    expect(notices[0]!.recipients.map((row) => row.userId)).toEqual([cashier.userId]);
    expect((await runBuyingFollowUps(shop.companyId)).receiptsOverdue).toBe(0);

    const now = new Date("2026-10-03T07:00:00+02:00");
    expect(receiptsOverdueTitle("REQ-0012", new Date("2026-10-02T09:00:00+02:00"), now)).toBe("REQ-0012: receipts were due yesterday.");
    expect(receiptsOverdueTitle("REQ-0012", new Date("2026-09-30T09:00:00+02:00"), now)).toBe("REQ-0012: receipts were due on 30 September.");
  });
});
