/**
 * P2's exit test (books-final §8), against the test database:
 *
 *   1. A CRM requisition goes Draft → Accounted for with change returned, and
 *      the trial balance shows the expense by category and nothing in 1150
 *      Cash advances. The requester cannot approve it, and one over the limit
 *      waits for the owner.
 *   2. A retail goods receipt makes a draft bill; recorded with the supplier's
 *      valid FTI (approved first by the owner, being over the limit), it clears
 *      2010 Goods received, not billed and claims its VAT. A payment, sent for
 *      approval, approved (not by its maker) and paid (not by its approver),
 *      shows in Bills, in money out and in supplier aging, and supplier aging
 *      equals the payables control account.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { receiveDelivery } from "@/lib/retail/buying/deliveries";
import { raiseOrder } from "@/lib/retail/buying/orders";
import { createSupplier } from "@/lib/retail/buying/suppliers";

import { readExpenses, readExpenseQuery } from "../expenses";
import { trialBalance } from "../invoice-test-fixtures";
import { approveBill, BillRefusedError, recordBill } from "./bills";
import type { BooksActor } from "./can-do";
import { moneyInOut } from "./money-in-out";
import { payablesControl, supplierAging } from "./payables";
import { decideSupplierPayment, draftSupplierPayment, paySupplierPayment, submitSupplierPayment, SupplierPaymentRefused } from "./supplier-payments";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { PATCH } from "@/app/api/v2/crm/requisitions/[id]/route";
import { POST } from "@/app/api/v2/crm/requisitions/route";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

let shop: TestShop;
let repId: string;
let ecocash: string;
let operating: string;
let supplierId: string;
let castle: { productId: string; itemId: string };

const owner = (): BooksActor => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const manager = (): BooksActor => ({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" });
const code = async (value: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code: value }, select: { id: true } })).id;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  shop = await makeTestShop("P2 exit");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  repId = (await prisma.user.create({ data: { email: `rep-${shop.companyId}@shop.test`, name: "Farai Ncube", role: "SALES_REP", companyId: shop.companyId }, select: { id: true } })).id;
  ecocash = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "EcoCash", kind: "MOBILE", currency: "USD", ledgerAccountId: await code("1016") }, select: { id: true } })).id;
  operating = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "Stanbic USD", kind: "BANK", currency: "USD", ledgerAccountId: await code("1010") }, select: { id: true } })).id;
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.80", categoryId: shop.ciderId }, { siteId: shop.mainId, onHand: 0 });
  supplierId = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Delta Beverages" }))).id;
  await prisma.vendor.update({ where: { id: supplierId }, data: { vatNumber: "220123456" } });
}, 180_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfEntryId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.paymentLedgerEntry.deleteMany({ where: { companyId } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.purchaseBill.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.retailGoodsReceipt.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId } });
  await prisma.crmRequisition.deleteMany({ where: { companyId } });
  await prisma.product.updateMany({ where: { companyId }, data: { supplierId: null } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

const as = (userId: string, role: string) =>
  validateSessionMock.mockResolvedValue({ session: { user: { id: userId, companyId: shop.companyId, role, name: "Someone", email: "someone@shop.test" } } });

async function act(id: string, body: Record<string, unknown>) {
  const response = await PATCH(
    new NextRequest(`http://crm.test/api/v2/crm/requisitions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as { error?: string; requisition?: Record<string, unknown> } };
}

async function raise(body: Record<string, unknown>) {
  const response = await POST(new NextRequest("http://crm.test/api/v2/crm/requisitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return ((await response.json()) as { requisition: { id: string } }).requisition.id;
}

describe("P2 exit: a CRM requisition, Draft to Accounted for", () => {
  it("expenses it by category, brings the change back, and leaves nothing in cash advances", async () => {
    const before = await trialBalance(shop.companyId);
    as(repId, "SALES_REP");
    const id = await raise({ category: "TRANSPORT", purpose: "Fitters to Chinhoyi and back", amount: 300 });
    expect((await act(id, { action: "submit" })).status).toBe(200);
    // The requester cannot approve it.
    expect(await act(id, { action: "decide", approve: true })).toMatchObject({ status: 403, body: { error: "Somebody else has to approve your own request." } });
    as(shop.managerId, "MANAGER");
    expect((await act(id, { action: "decide", approve: true })).status).toBe(200);
    as(shop.ownerId, "SUPERADMIN");
    expect((await act(id, { action: "disburse", bankAccountId: ecocash })).status).toBe(200);
    expect((await trialBalance(shop.companyId))["1150"]).toBe((before["1150"] ?? 0) + 300);

    const log = await prisma.crmDailyLog.create({ data: { companyId: shop.companyId, userId: repId, logDate: new Date(new Date().toISOString().slice(0, 10)) } });
    for (const [category, amount] of [["TRANSPORT", 180], ["SUBSISTENCE", 45.5], ["FUEL", 30]] as const) {
      await prisma.crmDailyCostEntry.create({ data: { companyId: shop.companyId, logId: log.id, direction: "SPENT", category, amount, description: `${category} on the Chinhoyi job`, requisitionId: id, receiptUrl: "https://slips.test/s.jpg" } });
    }
    as(repId, "SALES_REP");
    const done = await act(id, { action: "acquit" });
    expect(done.status).toBe(200);
    expect(Number(done.body.requisition?.changeAmount)).toBe(44.5);

    const after = await trialBalance(shop.companyId);
    const moved = (account: string) => Math.round(((after[account] ?? 0) - (before[account] ?? 0)) * 100) / 100;
    expect(moved("1150")).toBe(0);
    expect(moved("5520")).toBe(180);
    expect(moved("5550")).toBe(45.5);
    expect(moved("5500")).toBe(30);
    expect(moved("1016")).toBe(-255.5);
  });

  it("makes a request over the limit wait for the owner", async () => {
    as(repId, "SALES_REP");
    const id = await raise({ category: "EQUIPMENT", purpose: "Floor grinder, a week's hire", amount: 750, submit: true });
    as(shop.managerId, "MANAGER");
    expect(await act(id, { action: "decide", approve: true })).toMatchObject({ status: 403, body: { error: "Over US$500.00 needs Tendai Mhlanga." } });
    as(shop.ownerId, "SUPERADMIN");
    expect((await act(id, { action: "decide", approve: true })).status).toBe(200);
  });
});

describe("P2 exit: a retail goods receipt to a bill, its payment and supplier aging", () => {
  let billId: string;

  it("makes a draft bill of the goods receipt, against 2010 Goods received, not billed", async () => {
    const order = await raiseOrder(
      shop.manager(),
      { supplierId, siteId: shop.mainId, lines: [{ productId: castle.productId, quantity: 960, unitCost: "0.80" }], payment: "ON_ACCOUNT", send: true },
      { requestUrl: "http://localhost:3000" },
    );
    const line = await prisma.retailPurchaseOrderLine.findFirstOrThrow({ where: { purchaseOrderId: order.id } });
    const received = await receiveDelivery(
      shop.manager(),
      { purchaseOrderId: order.id, noteNumber: "DB-1101", lines: [{ purchaseOrderLineId: line.id, inventoryItemId: castle.itemId, quantity: 960, damaged: 0, unitCost: 0.8 }], post: true },
      (journal) => postRetailJournal(journal),
    );
    expect(received.status).toBe("POSTED");
    expect((await trialBalance(shop.companyId))["2010"]).toBe(-768);

    const bill = await prisma.purchaseBill.findUniqueOrThrow({ where: { goodsReceiptId: received.id }, include: { lines: true } });
    billId = bill.id;
    expect(bill).toMatchObject({ status: "DRAFT", billNumber: null, purchaseOrderId: order.id, vendorId: supplierId, subTotal: 768, fdmsStatus: "NOT_CHECKED" });
    expect(bill.taxTotal).toBe(119.04);
    expect(bill.lines).toHaveLength(1);
  });

  it("records the bill with the supplier's FTI, approved first by the owner, clearing 2010 and claiming the VAT", async () => {
    await expect(recordBill(manager(), billId, { fdmsStatus: "VALID" })).rejects.toThrow(/registered for VAT/);
    await expect(recordBill(manager(), billId, { supplierFtiNumber: "FTI-00010293", fdmsStatus: "VALID" })).rejects.toBeInstanceOf(BillRefusedError);
    await approveBill(owner(), billId);
    const { bill } = await recordBill(manager(), billId, { supplierFtiNumber: "FTI-00010293", fdmsStatus: "VALID" });
    expect(bill).toMatchObject({ status: "RECEIVED", supplierFtiNumber: "FTI-00010293", fdmsStatus: "VALID" });
    expect(bill.billNumber).toMatch(/^BILL-\d{4,}$/);
    const tb = await trialBalance(shop.companyId);
    expect(tb["2010"] ?? 0).toBe(0);
    expect(tb["2210"]).toBe(119.04);
    expect(tb["2000"]).toBe(-887.04);
    expect(await prisma.approvalAction.count({ where: { companyId: shop.companyId, entityType: "PURCHASE_BILL", entityId: billId, action: "APPROVE" } })).toBe(1);
  });

  it("pays it with maker-checker: sent for approval, approved by the owner, paid by somebody else", async () => {
    const draft = await draftSupplierPayment(manager(), { vendorId: supplierId, billId, bankAccountId: operating, amount: 600, paidAt: new Date().toISOString().slice(0, 10) });
    expect(draft).toMatchObject({ status: "DRAFT", paymentNumber: null });
    expect((await submitSupplierPayment(manager(), draft.id)).status).toBe("TO_APPROVE");
    await expect(decideSupplierPayment(manager(), draft.id, { approve: true })).rejects.toThrow("Somebody else has to approve your own request.");
    expect((await decideSupplierPayment(owner(), draft.id, { approve: true })).status).toBe("APPROVED");
    await expect(paySupplierPayment(owner(), draft.id)).rejects.toBeInstanceOf(SupplierPaymentRefused);
    const paid = await paySupplierPayment(manager(), draft.id);
    expect(paid.status).toBe("PAID");
    expect(paid.paymentNumber).toMatch(/^PAY-\d{4,}$/);
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: shop.companyId, sourceType: "PURCHASE_PAYMENT", sourceId: draft.id } })).toMatchObject({ bankAccountId: operating, amount: 600, direction: "DEBIT" });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: shop.companyId, sourceType: "PURCHASE_PAYMENT", sourceId: draft.id } })).toMatchObject({ accountType: "PAYABLE", partyId: supplierId, billId, debit: 600 });
  });

  it("shows the bill and payment in Bills, money out and supplier aging, and aging equals the payables control", async () => {
    const bills = await readExpenses(prisma as never, shop.companyId, readExpenseQuery(new URLSearchParams("view=to-pay")));
    const row = bills.rows.find((candidate) => candidate.id === billId);
    expect(row).toBeTruthy();
    expect(row?.balance ?? (row as unknown as { owed?: number })?.owed).toBe(287.04);

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 2 * 3_600_000);
    const flows = await moneyInOut(prisma, shop.companyId, { from: monthStart }, "USD");
    expect(flows.out.find((flow) => flow.key === "supplier-payments")).toMatchObject({ amount: 600, count: 1 });

    const aging = await supplierAging(shop.companyId);
    expect(aging.rows).toEqual([expect.objectContaining({ vendorId: supplierId, name: "Delta Beverages", total: 287.04 })]);
    expect(await payablesControl(shop.companyId)).toBe(aging.total);
    const tb = await trialBalance(shop.companyId);
    expect(Math.abs(Object.values(tb).reduce((sum, value) => sum + value, 0))).toBeLessThan(0.005);
  });
});
