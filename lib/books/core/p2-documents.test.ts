/**
 * P2's documents through the Books core, against the test database (books-final
 * §4.7–4.12, §5.3, §5.4): each state machine's moves, its guards (nobody
 * approves or pays their own; over the limit only the owner) and what it posts.
 *
 *   - a purchase order over the limit waits for the owner and never posts
 *   - a bill's VAT waits in 2215 until its FTI is valid, then moves to 2210;
 *     voiding the bill mirrors both
 *   - a supplier payment voided: mirror, payables line VOIDED, bank side off,
 *     the bill owing again
 *   - a claim from a cost-tracker day: draft, flagged; approved against 2190,
 *     reimbursed out of a money account
 *   - petty cash: under the holder's limit a voucher posts at once, over it
 *     waits for somebody else; a top-up brings the float back to its imprest
 *   - commission approved posts to 2195 and paid clears it; paid is never voided
 *   - a project's cost is read from its cost centre's ledger lines
 *   - a requisition accounted for before cash advances is settled by the drain
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordPurchasePayment } from "@/lib/accounting/payments";
import { createProject, projectCostSummary } from "@/lib/crm/projects";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { checkBillFti, recordBill, voidBillPostings } from "./bills";
import type { BooksActor } from "./can-do";
import { claimFromDailyLog, decideClaim, reimburseClaim, submitClaim } from "./claims";
import { approveCommission, payCommission, voidCommission } from "./commission";
import { approveVoucher, setUpFloat, spentSinceTopUp, topUpFloat, writeVoucher } from "./petty-cash";
import { postMoney } from "./post-money";
import { createPurchaseOrder, decidePurchaseOrder, submitPurchaseOrder } from "./purchase-orders";
import { settleAdvances } from "./requisitions";
import { voidSupplierPayment } from "./supplier-payments";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

let fixture: BooksFixture;
let accountantId: string;
let repId: string;
let operating: string;
let vendorId: string;

const owner = (): BooksActor => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });
const manager = (): BooksActor => ({ companyId: fixture.companyId, userId: fixture.managerId, role: "MANAGER" });
const accountant = (): BooksActor => ({ companyId: fixture.companyId, userId: accountantId, role: "FINANCE_OFFICER" });
const rep = (): BooksActor => ({ companyId: fixture.companyId, userId: repId, role: "SALES_REP" });
const code = async (value: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: value }, select: { id: true } })).id;
const moved = (before: Record<string, number>, after: Record<string, number>, account: string) => Math.round(((after[account] ?? 0) - (before[account] ?? 0)) * 100) / 100;

beforeAll(async () => {
  fixture = await makeBooksFixture("P2 documents");
  const { companyId, stamp } = fixture;
  accountantId = (await prisma.user.create({ data: { email: `acc-${stamp}@books.test`, name: "Rudo Chari", role: "FINANCE_OFFICER", companyId }, select: { id: true } })).id;
  repId = (await prisma.user.create({ data: { email: `rep-${stamp}@books.test`, name: "Farai Ncube", role: "SALES_REP", companyId }, select: { id: true } })).id;
  operating = (await prisma.bankAccount.create({ data: { companyId, name: "Stanbic USD", kind: "BANK", currency: "USD", ledgerAccountId: await code("1010") }, select: { id: true } })).id;
  vendorId = (await prisma.vendor.create({ data: { companyId, name: "Msasa Adhesives", vatNumber: "220998877" }, select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  if (fixture) {
    const { companyId } = fixture;
    await prisma.approvalAction.deleteMany({ where: { companyId } });
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.pettyCashVoucher.deleteMany({ where: { companyId } });
    await prisma.expenseClaim.deleteMany({ where: { companyId } });
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId } });
    await prisma.crmCommissionEntry.deleteMany({ where: { companyId } });
    await prisma.crmRequisition.deleteMany({ where: { companyId } });
    await prisma.purchasePayment.deleteMany({ where: { companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId } });
    await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
    await prisma.crmProject.deleteMany({ where: { companyId } });
    await prisma.crmDeal.deleteMany({ where: { companyId } });
    await prisma.crmPipelineStage.deleteMany({ where: { companyId } });
    await prisma.crmPipeline.deleteMany({ where: { companyId } });
    await prisma.crmClient.deleteMany({ where: { companyId } });
    await prisma.vendor.deleteMany({ where: { companyId } });
    await prisma.bankAccount.deleteMany({ where: { companyId } });
    await prisma.idSequence.deleteMany({ where: { companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("a purchase order", () => {
  it("waits for the owner over the limit, is not approved by its maker, and posts nothing", async () => {
    const order = await createPurchaseOrder(manager(), {
      vendorId,
      lines: [
        { itemName: "Contact adhesive, 20 L", quantity: 10, unitCost: 52, vatRate: 15.5 },
        { itemName: "Fitter's day, Borrowdale", quantity: 2, unitCost: 45, vatRate: 0 },
      ],
    });
    expect(order).toMatchObject({ siteId: null, status: "DRAFT" });
    expect(order.lines.find((line) => line.itemName.startsWith("Fitter"))?.inventoryItemId).toBeNull();
    const sent = await submitPurchaseOrder(manager(), order.id);
    expect(sent).toMatchObject({ status: "TO_APPROVE", approverId: fixture.ownerId });
    await expect(decidePurchaseOrder(manager(), order.id, { approve: true })).rejects.toThrow("Somebody else has to approve your own request.");
    await expect(decidePurchaseOrder(accountant(), order.id, { approve: true })).rejects.toThrow(/^Over US\$500\.00 needs/);
    expect(await decidePurchaseOrder(owner(), order.id, { approve: true })).toMatchObject({ status: "SENT", approvedById: fixture.ownerId });
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: order.id } })).toBe(0);
    expect((await prisma.approvalAction.findMany({ where: { entityId: order.id }, orderBy: { actedAt: "asc" } })).map((row) => `${row.entityType} ${row.action}`)).toEqual(["PURCHASE_ORDER SUBMIT", "PURCHASE_ORDER APPROVE"]);
  });
});

describe("a bill's FTI and its void", () => {
  it("keeps VAT waiting until the FTI is valid, moves it then, and mirrors both when the bill is voided", async () => {
    const bill = await prisma.purchaseBill.create({
      data: { companyId: fixture.companyId, vendorId, billDate: new Date(), status: "DRAFT", subTotal: 200, taxTotal: 31, total: 231, createdById: fixture.managerId, lines: { create: [{ description: "Adhesive", quantity: 4, unitPrice: 50, taxRate: 15.5, taxAmount: 31, lineTotal: 231 }] } },
    });
    const before = await trialBalance(fixture.companyId);
    await expect(recordBill(accountant(), bill.id)).rejects.toThrow(/registered for VAT/);
    await recordBill(accountant(), bill.id, { supplierFtiNumber: "FTI-0042" });
    let after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "2215")).toBe(31);
    expect(moved(before, after, "2210")).toBe(0);
    expect(moved(before, after, "2000")).toBe(-231);

    await checkBillFti(accountant(), bill.id, { status: "VALID" });
    after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "2215")).toBe(0);
    expect(moved(before, after, "2210")).toBe(31);

    await voidBillPostings(owner(), bill, "Supplier sent a corrected invoice");
    after = await trialBalance(fixture.companyId);
    for (const account of ["2210", "2215", "2000", "5000"]) expect(moved(before, after, account)).toBe(0);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE_BILL", sourceId: bill.id } })).toMatchObject({ status: "VOIDED" });
  });
});

describe("a supplier payment voided", () => {
  it("is mirrored, its payables line voided, its bank side gone and its bill owing again; only by the owner", async () => {
    const bill = await prisma.purchaseBill.create({ data: { companyId: fixture.companyId, vendorId, billNumber: `BILL-V${fixture.stamp.slice(-4)}`, billDate: new Date(), status: "RECEIVED", subTotal: 120, total: 120 } });
    const payment = await recordPurchasePayment({ companyId: fixture.companyId, userId: fixture.managerId, billId: bill.id, paidAt: new Date(), amount: 120, method: "Bank transfer", bankAccountId: operating });
    expect((await prisma.purchaseBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PAID");
    await expect(voidSupplierPayment(manager(), payment.id, "Paid the wrong supplier")).rejects.toThrow(/Only the owner/);
    const voided = await voidSupplierPayment(owner(), payment.id, "Paid the wrong supplier");
    expect(voided).toMatchObject({ status: "VOIDED", voidedById: fixture.ownerId, voidReason: "Paid the wrong supplier" });
    expect(await prisma.bankTransaction.count({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toBe(0);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ status: "VOIDED" });
    expect(await prisma.purchaseBill.findUniqueOrThrow({ where: { id: bill.id } })).toMatchObject({ status: "RECEIVED", amountPaid: 0 });
  });
});

describe("a claim from the cost tracker", () => {
  it("is a draft flagged for review, posts against 2190 when approved by somebody else, and clears it when reimbursed", async () => {
    const log = await prisma.crmDailyLog.create({ data: { companyId: fixture.companyId, userId: repId, logDate: new Date("2026-10-15T00:00:00.000Z"), submittedAt: new Date() } });
    await prisma.crmDailyCostEntry.createMany({
      data: [
        { companyId: fixture.companyId, logId: log.id, direction: "SPENT", category: "AIRTIME", amount: 12, description: "Econet bundle" },
        { companyId: fixture.companyId, logId: log.id, direction: "SPENT", category: "TRANSPORT", amount: 25, description: "Kombi to Ruwa and back" },
        { companyId: fixture.companyId, logId: log.id, direction: "RECEIVED", category: "OTHER", amount: 100, description: "Deposit, cash" },
      ],
    });
    const made = await prisma.$transaction((tx) => claimFromDailyLog(tx, fixture.companyId, log.id));
    const claim = await prisma.expenseClaim.findUniqueOrThrow({ where: { id: made!.id }, include: { lines: true } });
    expect(claim).toMatchObject({ status: "DRAFT", claimNo: null, needsReview: true, claimantId: repId });
    expect(Number(claim.total)).toBe(37);
    expect(claim.lines).toHaveLength(2);
    // Once per day.
    expect((await prisma.$transaction((tx) => claimFromDailyLog(tx, fixture.companyId, log.id)))?.id).toBe(claim.id);

    const submitted = await submitClaim(rep(), claim.id);
    expect(submitted.claimNo).toMatch(/^CLM-\d{4,}$/);
    await expect(decideClaim(rep(), claim.id, { approve: true })).rejects.toThrow("Somebody else has to approve your own request.");
    const before = await trialBalance(fixture.companyId);
    await decideClaim(manager(), claim.id, { approve: true });
    let after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "5510")).toBe(12);
    expect(moved(before, after, "5520")).toBe(25);
    expect(moved(before, after, "2190")).toBe(-37);

    await expect(reimburseClaim(rep(), claim.id, { bankAccountId: operating })).rejects.toThrow("Somebody else has to pay out your own request.");
    await expect(reimburseClaim(manager(), claim.id, { bankAccountId: operating })).rejects.toThrow("You approved this, so somebody else pays it out.");
    const paid = await reimburseClaim(accountant(), claim.id, { bankAccountId: operating });
    expect(paid.claim.status).toBe("PAID");
    after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "2190")).toBe(0);
    expect(moved(before, after, "1010")).toBe(-37);
  });
});

describe("petty cash", () => {
  it("posts a small voucher on the holder's word, holds a big one for somebody else, and tops the float back to its imprest", async () => {
    const box = await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "Showroom cash box", kind: "CASH", currency: "USD", ledgerAccountId: await code("1005") } });
    await expect(setUpFloat(manager(), { bankAccountId: box.id, holderId: repId, imprestAmount: 200 })).rejects.toThrow(/owner or the accountant/);
    await setUpFloat(owner(), { bankAccountId: box.id, holderId: repId, imprestAmount: 200 });
    const before = await trialBalance(fixture.companyId);
    const today = new Date().toISOString().slice(0, 10);
    const small = await writeVoucher(rep(), { floatId: box.id, category: "SUBSISTENCE", description: "Tea and milk", amount: 8.5, taxAmount: 0, fdmsStatus: "NOT_CHECKED", spentAt: today });
    expect(small).toMatchObject({ status: "POSTED" });
    expect(small.voucherNo).toMatch(/^PCV-\d{4,}$/);
    const big = await writeVoucher(rep(), { floatId: box.id, category: "MATERIALS", description: "Trowels and spreaders", amount: 46, taxAmount: 6.17, fdmsStatus: "VALID", spentAt: today });
    expect(big).toMatchObject({ status: "TO_APPROVE", voucherNo: null });
    await expect(approveVoucher(rep(), big.id, { approve: true })).rejects.toThrow("Somebody else has to approve your own request.");
    await approveVoucher(manager(), big.id, { approve: true });
    let after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "5550")).toBe(8.5);
    expect(moved(before, after, "5530")).toBe(39.83);
    expect(moved(before, after, "2210")).toBe(6.17);
    expect(moved(before, after, "1005")).toBe(-54.5);

    expect(await spentSinceTopUp(fixture.companyId, box.id)).toMatchObject({ spent: 54.5, vouchers: 2 });
    await expect(topUpFloat(rep(), { floatId: box.id, fromBankAccountId: operating })).rejects.toThrow();
    const topUp = await topUpFloat(accountant(), { floatId: box.id, fromBankAccountId: operating });
    expect(Number(topUp.amount)).toBe(54.5);
    after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "1005")).toBe(0);
    expect(moved(before, after, "1010")).toBe(-54.5);
    expect(await spentSinceTopUp(fixture.companyId, box.id)).toMatchObject({ spent: 0, vouchers: 0 });
  });
});

describe("commission", () => {
  it("posts to 2195 when approved by somebody other than the rep, clears it when paid, and a paid one is never voided", async () => {
    const entry = await prisma.crmCommissionEntry.create({
      data: { companyId: fixture.companyId, repId: fixture.managerId, basis: "PAID", periodKey: "2026-10", baseAmount: 1155, ratePercent: 5, amount: 57.75 },
    });
    await expect(approveCommission(manager(), entry.id, { mayManage: true })).rejects.toThrow("Somebody else approves your own commission.");
    const before = await trialBalance(fixture.companyId);
    const approved = await approveCommission(owner(), entry.id, { mayManage: true });
    expect(approved.status).toBe("APPROVED");
    expect(approved.journalEntryId).toBeTruthy();
    let after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "5650")).toBe(57.75);
    expect(moved(before, after, "2195")).toBe(-57.75);
    await expect(payCommission(manager(), entry.id, { bankAccountId: operating, mayManage: true })).rejects.toThrow("Somebody else has to pay out your own request.");
    await payCommission(accountant(), entry.id, { bankAccountId: operating, mayManage: true });
    after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "2195")).toBe(0);
    await expect(voidCommission(owner(), entry.id, { mayManage: true, reason: "Wrong rate" })).rejects.toThrow(/has been paid/);

    // Approved and then voided: its posting is mirrored.
    const other = await prisma.crmCommissionEntry.create({ data: { companyId: fixture.companyId, repId, basis: "PAID", periodKey: "2026-10", baseAmount: 400, ratePercent: 5, amount: 20 } });
    await approveCommission(manager(), other.id, { mayManage: true });
    await voidCommission(manager(), other.id, { mayManage: true, reason: "Invoice reversed" });
    after = await trialBalance(fixture.companyId);
    expect(moved(before, after, "5650")).toBe(57.75);
  });
});

describe("a project's cost", () => {
  it("is what the ledger holds on its cost centre, with what is committed apart", async () => {
    const { companyId, stamp } = fixture;
    const client = await prisma.crmClient.create({ data: { companyId, clientNo: `CLI-P${stamp.slice(-4)}`, name: "Ruwa Primary" } });
    const pipeline = await prisma.crmPipeline.create({ data: { companyId, name: "Jobs", isDefault: true } });
    const stage = await prisma.crmPipelineStage.create({ data: { companyId, pipelineId: pipeline.id, name: "Won", position: 1 } });
    const deal = await prisma.crmDeal.create({ data: { companyId, dealNo: `CRMD-P${stamp.slice(-4)}`, title: "Classroom floors", pipelineId: pipeline.id, stageId: stage.id, clientId: client.id } });
    const project = await prisma.$transaction((tx) => createProject(tx, companyId, fixture.ownerId, { name: "Classroom floors", dealId: deal.id, clientId: client.id, budget: 100 }));
    await postMoney(prisma, { companyId, sourceType: "PETTY_CASH_VOUCHER", sourceId: `test-${stamp}`, sourceSubtype: "MATERIALS", date: new Date(), description: "Screed", amount: 140, costCenterId: project.costCenterId, accounts: { moneyAccount: await code("1005") }, actor: { userId: fixture.ownerId } });
    await prisma.crmRequisition.create({ data: { companyId, requisitionNo: `REQ-P${stamp.slice(-5)}`, category: "LABOUR", purpose: "Casuals", amount: 60, requestedById: repId, status: "APPROVED", projectId: project.id } });
    const summary = await prisma.$transaction((tx) => projectCostSummary(tx, companyId, project.id));
    expect(Number(summary.spent)).toBe(140);
    expect(Number(summary.approved)).toBe(60);
    expect(Number(summary.remaining)).toBe(-40);
  });
});

describe("a requisition accounted for before cash advances", () => {
  it("is settled once its events have posted: nothing left on 1150, the rest to its category", async () => {
    const { companyId, stamp } = fixture;
    const requisition = await prisma.crmRequisition.create({
      data: { companyId, requisitionNo: `REQ-L${stamp.slice(-5)}`, category: "FUEL", purpose: "Diesel, before P2", amount: 200, requestedById: repId, status: "ACQUITTED", disbursedAt: new Date(), acquittedAt: new Date(), acquittedAmount: 170, changeAmount: 30 },
    });
    const before = await trialBalance(companyId);
    // Its events, captured before P2 and posted now: the payout onto the advance, the change off it.
    await postMoney(prisma, { companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: requisition.id, sourceSubtype: "FUEL", date: new Date(), description: "Payout", amount: 200, money: { bankAccountId: operating, direction: "OUT" }, actor: { userId: fixture.ownerId } });
    await postMoney(prisma, { companyId, sourceType: "CRM_REQUISITION_REFUND", sourceId: requisition.id, sourceSubtype: "FUEL", date: new Date(), description: "Change", amount: 30, money: { bankAccountId: operating, direction: "IN" }, actor: { userId: fixture.ownerId } });
    expect(moved(before, await trialBalance(companyId), "1150")).toBe(170);
    expect(await settleAdvances(companyId)).toBe(1);
    const after = await trialBalance(companyId);
    expect(moved(before, after, "1150")).toBe(0);
    expect(moved(before, after, "5500")).toBe(170);
    expect(await settleAdvances(companyId)).toBe(0);
  });
});
