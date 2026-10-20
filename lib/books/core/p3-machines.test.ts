/**
 * P3's state machines against the test database (books-final §4.13, §4.16,
 * §5.8, §5.11, D15, D17): a statement line excluded and put back; a
 * reconciliation that will not close with a difference, closes at 0.00,
 * locks its transactions, is reopened only by the owner and voided only
 * while open; bank entries (a charge, a transfer, a QPD) posted and voided;
 * VAT a customer withheld; the tax settings; provisional tax paid from the
 * ledger; the base currency locked once anything has posted; a VAT return
 * that does not tie out refused Finalise until explained; the fiscal
 * register.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { getNextEntryNumber } from "@/lib/accounting/ledger";
import { recordSalesReceipt } from "@/lib/accounting/payments";
import { createOrRefreshVatReturnDraft, transitionVatReturnStatus } from "@/lib/accounting/vat-return";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { uploadStatement } from "../bank";
import { trialBalance } from "../invoice-test-fixtures";
import {
  BankRefused,
  closeReconciliation,
  excludeLine,
  includeLine,
  matchLine,
  reconciliationSummary,
  recordBankEntry,
  reopenReconciliation,
  startReconciliation,
  unmatchLine,
  voidBankEntry,
  voidReconciliation,
} from "./bank";
import type { BooksActor } from "./can-do";
import { baseCurrencyChangeRefusal } from "./currency";
import { fiscalRegister } from "./fiscal-register";
import { postInvoice } from "./issue-invoice";
import { nextNumber } from "./numbering";
import { provisionalTax } from "./tax-calendar";
import { saveTaxSettings, taxSettings } from "./tax-settings";
import { recordVatWithheldByCustomer } from "./vat-withheld";
import { VoidRefused, voidMoney } from "./void-money";
import { WithholdingRefused } from "./withholding";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let shop: TestShop;
let bank: string;
let savings: string;
let customerId: string;

const owner = (): BooksActor => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const manager = (): BooksActor => ({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" });
const code = async (value: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code: value }, select: { id: true } })).id;
const lineId = async (description: string) =>
  (await prisma.bankStatementLine.findFirstOrThrow({ where: { reconciliation: { companyId: shop.companyId }, description }, select: { id: true } })).id;

beforeAll(async () => {
  shop = await makeTestShop("P3 machines");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  const savingsLedger = (await prisma.chartOfAccount.create({ data: { companyId: shop.companyId, code: "1013", name: "CBZ savings", type: "ASSET", category: "Cash", nodeType: "LEDGER" }, select: { id: true } })).id;
  bank = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "CBZ USD", bankName: "CBZ", kind: "BANK", currency: "USD", ledgerAccountId: await code("1010"), openingBalance: 0 }, select: { id: true } })).id;
  savings = (await prisma.bankAccount.create({ data: { companyId: shop.companyId, name: "CBZ savings", bankName: "CBZ", kind: "BANK", currency: "USD", ledgerAccountId: savingsLedger }, select: { id: true } })).id;
  customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Delta Corporation", isVatWithholdingAgent: true }, select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.bankStatementLine.deleteMany({ where: { reconciliation: { companyId } } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.bankReconciliation.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfEntryId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.paymentLedgerEntry.deleteMany({ where: { companyId } });
  await prisma.vatReturn.deleteMany({ where: { companyId } });
  await prisma.salesReceipt.deleteMany({ where: { companyId } });
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("statement lines and reconciliations (§4.13, D15)", () => {
  it("excludes a line with who and why, refuses a bare exclude, and puts it back", async () => {
    await uploadStatement(prisma, {
      companyId: shop.companyId,
      userId: shop.managerId,
      accountId: bank,
      rows: [
        { date: "2026-08-03", description: "Monthly service fee", reference: null, amount: 12, direction: "DEBIT" },
        { date: "2026-08-04", description: "Duplicate line from the bank", reference: null, amount: 50, direction: "CREDIT" },
        { date: "2026-08-05", description: "Reversal of the duplicate", reference: null, amount: 50, direction: "DEBIT" },
        { date: "2026-08-06", description: "Sweep to savings", reference: null, amount: 100, direction: "DEBIT" },
        { date: "2026-09-02", description: "Next month's fee", reference: null, amount: 12, direction: "DEBIT" },
      ],
    });
    const duplicate = await lineId("Duplicate line from the bank");
    await expect(excludeLine(manager(), duplicate, "")).rejects.toBeInstanceOf(BankRefused);
    expect(await excludeLine(manager(), duplicate, "The bank doubled it and reversed it")).toMatchObject({ excludedById: shop.managerId, excludeReason: "The bank doubled it and reversed it" });
    await includeLine(manager(), duplicate);
    expect(await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: duplicate } })).toMatchObject({ excludedAt: null });
    await excludeLine(manager(), duplicate, "The bank doubled it and reversed it");
    await excludeLine(manager(), await lineId("Reversal of the duplicate"), "Reverses the doubled line");
  });

  it("records a charge and a transfer from lines, and will not close with a line left or a difference", async () => {
    const charge = await recordBankEntry(manager(), { kind: "CHARGE", bankAccountId: bank, date: day("2026-08-03"), amount: 12, statementLineId: await lineId("Monthly service fee") });
    expect(charge.entryId).toBeTruthy();
    const sweep = await recordBankEntry(manager(), { kind: "TRANSFER", bankAccountId: bank, toBankAccountId: savings, date: day("2026-08-06"), amount: 100, statementLineId: await lineId("Sweep to savings") });
    expect(await prisma.bankTransaction.count({ where: { sourceType: "BANK_TRANSACTION", sourceId: sweep.sourceId } })).toBe(2);
    const tb = await trialBalance(shop.companyId);
    expect(tb["5460"]).toBe(12);
    expect(tb["1013"]).toBe(100);

    const rec = await startReconciliation(manager(), { bankAccountId: bank, statementEndDate: day("2026-08-31"), statementBalance: -112.5 });
    expect(await reconciliationSummary(shop.companyId, rec.id)).toMatchObject({ bookBalance: -112, toMatch: 0, excluded: 2, excludedNet: 0, difference: -0.5, canClose: false });
    await expect(closeReconciliation(manager(), rec.id)).rejects.toThrow(/difference is -0.50/);
    await startReconciliation(manager(), { bankAccountId: bank, statementEndDate: day("2026-08-31"), statementBalance: -112 });
    await expect(closeReconciliation({ ...manager(), role: "SHOP_MANAGER" }, rec.id)).rejects.toBeInstanceOf(BankRefused);
    const closed = await closeReconciliation(manager(), rec.id);
    expect(closed).toMatchObject({ status: "CLOSED", closedById: shop.managerId });
    // September's line moved on to an open reconciliation of its own.
    const next = await prisma.bankReconciliation.findFirstOrThrow({ where: { companyId: shop.companyId, bankAccountId: bank, status: "OPEN" }, include: { statementLines: true } });
    expect(next.statementLines.map((line) => line.description)).toEqual(["Next month's fee"]);
  });

  it("locks what a closed reconciliation holds until the owner reopens it", async () => {
    const charge = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: shop.companyId, bankAccountId: bank, description: { startsWith: "Bank charges" } }, select: { sourceId: true } });
    await expect(voidBankEntry(owner(), charge.sourceId!, "Charged twice")).rejects.toBeInstanceOf(VoidRefused);
    await expect(unmatchLine(manager(), await lineId("Monthly service fee"))).rejects.toThrow(/closed reconciliation/);
    await expect(excludeLine(manager(), await lineId("Monthly service fee"), "Not ours")).rejects.toThrow(/closed reconciliation/);
    const closed = await prisma.bankReconciliation.findFirstOrThrow({ where: { companyId: shop.companyId, status: "CLOSED" } });
    await expect(reopenReconciliation(manager(), closed.id, "A charge was wrong")).rejects.toBeInstanceOf(BankRefused);
    const reopened = await reopenReconciliation(owner(), closed.id, "A charge was wrong");
    expect(reopened.status).toBe("OPEN");
    // It took back September's line: one open reconciliation per account.
    expect(await prisma.bankReconciliation.count({ where: { companyId: shop.companyId, bankAccountId: bank, status: "OPEN" } })).toBe(1);
    await unmatchLine(manager(), await lineId("Monthly service fee"));
    const voided = await voidBankEntry(owner(), charge.sourceId!, "Charged twice");
    expect(voided.mirrorEntryId).toBeTruthy();
    expect((await trialBalance(shop.companyId))["5460"]).toBeUndefined();
    await expect(voidReconciliation(manager(), reopened.id, "Started in error")).rejects.toBeInstanceOf(BankRefused);
    const gone = await voidReconciliation(owner(), reopened.id, "Started in error");
    expect(gone.status).toBe("VOIDED");
    expect(await prisma.bankStatementLine.count({ where: { reconciliationId: reopened.id } })).toBe(0);
    expect(await prisma.bankTransaction.count({ where: { companyId: shop.companyId, reconciliationId: { not: null } } })).toBe(0);
  });

  it("matches a line to a transaction already recorded, the same way and amount only", async () => {
    await uploadStatement(prisma, { companyId: shop.companyId, userId: shop.managerId, accountId: savings, rows: [{ date: "2026-08-06", description: "From CBZ USD", reference: null, amount: 100, direction: "CREDIT" }] });
    const txn = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: shop.companyId, bankAccountId: savings } });
    expect(await matchLine(manager(), await lineId("From CBZ USD"), txn.id)).toMatchObject({ matchedTransactionId: txn.id });
  });
});

describe("tax as bank entries, settings and provisional tax (§5.11)", () => {
  it("keeps a workspace's own values and marks a FLAGged one confirmed once saved", async () => {
    const before = await taxSettings(shop.companyId);
    expect(before.toConfirm.map((item) => item.key)).toContain("provisional.paymentDates");
    const after = await saveTaxSettings(shop.companyId, { provisional: { estimates: { "2026": { taxUsd: 8000 } } }, confirmed: ["provisional.paymentDates"] });
    expect(after.provisional.estimates["2026"]).toEqual({ taxUsd: 8000 });
    expect(after.provisional.shares).toEqual([10, 25, 30, 35]);
    expect(after.toConfirm.map((item) => item.key)).not.toContain("provisional.paymentDates");
  });

  it("reads QPDs paid from tax payments to 2280 against the instalments due", async () => {
    await recordBankEntry(manager(), { kind: "TAX", bankAccountId: bank, accountId: await code("2280"), date: day("2026-03-24"), amount: 800, description: "First QPD 2026" });
    await recordBankEntry(manager(), { kind: "TAX", bankAccountId: bank, accountId: await code("2280"), date: day("2026-06-25"), amount: 1500, description: "Second QPD 2026" });
    const qpd = await provisionalTax(shop.companyId, 2026, day("2026-10-01"));
    expect(qpd.instalments.map((row) => [row.amount, row.paid, row.overdue])).toEqual([
      [800, 800, false],
      [2000, 1500, true],
      [2400, 0, true],
      [2800, 0, false],
    ]);
    expect(qpd).toMatchObject({ paid: 2300, dueToDate: 5200, shortToDate: 2900, toConfirm: false });
  });
});

describe("VAT withheld by a customer, and a return that does not tie out (D17, §5.10.3)", () => {
  let invoiceId: string;

  it("lands a third of the VAT a withholding agent kept back on 1170, against their certificate", async () => {
    const invoice = await prisma.$transaction(async (tx) =>
      tx.salesInvoice.create({
        data: { companyId: shop.companyId, customerId, invoiceNumber: await nextNumber(tx, shop.companyId, "invoice"), invoiceDate: day("2026-07-10"), status: "ISSUED", currency: "USD", subTotal: 1000, taxTotal: 155, total: 1155 },
      }),
    );
    invoiceId = invoice.id;
    await postInvoice(prisma, { companyId: shop.companyId, invoice, actor: { userId: shop.ownerId } });
    await expect(recordVatWithheldByCustomer(manager(), { invoiceId, amount: 60, certificateNo: "VWT-1", date: day("2026-07-20") })).rejects.toBeInstanceOf(WithholdingRefused);
    const receipt = await recordVatWithheldByCustomer(manager(), { invoiceId, amount: 51.67, certificateNo: "VWT-1", date: day("2026-07-20") });
    expect(receipt).toMatchObject({ method: "VAT withheld", reference: "VWT-1", bankAccountId: null });
    await recordSalesReceipt({ companyId: shop.companyId, userId: shop.ownerId, invoiceId, receivedAt: day("2026-07-20"), amount: 1103.33, method: "Bank transfer", bankAccountId: bank });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).toMatchObject({ status: "PAID" });
    expect((await trialBalance(shop.companyId))["1170"]).toBe(51.67);
  });

  it("counts it as a credit on the return, and refuses Finalise on a difference until it is explained", async () => {
    // A journal straight to VAT output, with no document: the ledger and the documents now differ by it.
    await prisma.journalEntry.create({
      data: {
        companyId: shop.companyId,
        entryNumber: await getNextEntryNumber(shop.companyId),
        entryDate: day("2026-07-25"),
        description: "VAT adjustment",
        status: "POSTED",
        sourceType: "SALES_INVOICE",
        sourceId: `adjust-${Date.now()}`,
        createdById: shop.ownerId,
        lines: { create: [{ accountId: await code("2200"), debit: 0, credit: 5 }, { accountId: await code("4200"), debit: 5, credit: 0 }] },
      },
    });
    const draft = await createOrRefreshVatReturnDraft({ companyId: shop.companyId, periodStart: day("2026-07-01"), periodEnd: day("2026-07-31") });
    expect(draft).toMatchObject({ outputTax: 155, inputTax: 0, netTax: 103.33 });
    await transitionVatReturnStatus({ companyId: shop.companyId, vatReturnId: draft.id, nextStatus: "REVIEWED", actorId: shop.ownerId });
    await expect(transitionVatReturnStatus({ companyId: shop.companyId, vatReturnId: draft.id, nextStatus: "FINALIZED", actorId: shop.managerId })).rejects.toThrow(/differs from the ledger by -5.00/);
    const finalised = await transitionVatReturnStatus({ companyId: shop.companyId, vatReturnId: draft.id, nextStatus: "FINALIZED", actorId: shop.managerId, notes: "A July adjustment journal, filed with August's return." });
    expect(finalised.status).toBe("FINALIZED");
  });
});

describe("the base currency and the fiscal register", () => {
  it("refuses to change the base currency once the books hold an entry", async () => {
    expect(await baseCurrencyChangeRefusal(prisma, shop.companyId, "USD")).toBeNull();
    expect(await baseCurrencyChangeRefusal(prisma, shop.companyId, "ZWG")).toMatch(/cannot change now/);
  });

  it("lists the fiscal days and documents, and what waits to be retried", async () => {
    const register = await fiscalRegister(shop.companyId, { from: day("2026-01-01"), to: day("2026-12-31") });
    expect(register).toMatchObject({ days: [], documents: [], toRetry: 0, counts: { success: 0, pending: 0, failed: 0 } });
  });

  it("voids a posting only once, with a reason", async () => {
    const entry = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: shop.companyId, description: "First QPD 2026" }, select: { sourceId: true } });
    await expect(voidMoney({ companyId: shop.companyId, sourceType: "BANK_TRANSACTION", sourceId: entry.sourceId!, reason: "", actor: owner() })).rejects.toBeInstanceOf(VoidRefused);
  });
});
