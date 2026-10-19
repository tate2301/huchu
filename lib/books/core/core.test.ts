/**
 * The Books core against the test database: postMoney posts once, to the
 * money account the money went through, with its bank side; what cannot post
 * waits with its reason; voidMoney posts the mirror and lets go of the bank
 * and sub-ledger; rateFor and nextNumber answer as documents need them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UnknownExchangeRateError } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { HELD_UNTIL, holdFor } from "./holds";
import { NoSeriesYet, nextNumber } from "./numbering";
import { moneyLedgerAccount, postMoney } from "./post-money";
import { rateFor } from "./rate";
import { VoidRefused, voidMoney } from "./void-money";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let ecocash: { id: string; ledgerAccountId: string };
const accountId = async (code: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code }, select: { id: true } })).id;
const owner = () => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });

beforeAll(async () => {
  fixture = await makeBooksFixture("Core");
  const ledgerAccountId = await accountId("1016");
  ecocash = await prisma.bankAccount.create({
    data: { companyId: fixture.companyId, name: "EcoCash", kind: "MOBILE", ledgerAccountId },
    select: { id: true, ledgerAccountId: true },
  }) as { id: string; ledgerAccountId: string };
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.bankTransaction.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.currencyRate.deleteMany({ where: { companyId: fixture.companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

const disbursement = (sourceId: string, bankAccountId: string | null) =>
  postMoney(prisma, {
    companyId: fixture.companyId,
    sourceType: "CRM_REQUISITION_DISBURSEMENT",
    sourceId,
    sourceSubtype: "FUEL",
    date: new Date(),
    description: "REQ-T: diesel",
    amount: 120,
    currency: "USD",
    money: { bankAccountId, direction: "OUT", reference: "REQ-T" },
    actor: { userId: fixture.ownerId, role: "SUPERADMIN" },
  });

describe("postMoney", () => {
  it("posts to the money account the money went through, with its bank side, once", async () => {
    const before = await trialBalance(fixture.companyId);
    const first = await disbursement("req-core-1", ecocash.id);
    expect(first.entryId).toBeTruthy();
    expect(first.bankTransactionId).toBeTruthy();

    const after = await trialBalance(fixture.companyId);
    expect(after["5500"]).toBe((before["5500"] ?? 0) + 120);
    expect(after["1016"]).toBe((before["1016"] ?? 0) - 120);

    const again = await disbursement("req-core-1", ecocash.id);
    expect(again).toMatchObject({ entryId: first.entryId, skipped: true, bankTransactionId: first.bankTransactionId });
    expect(await trialBalance(fixture.companyId)).toEqual(after);
    const bank = await prisma.bankTransaction.findMany({ where: { companyId: fixture.companyId, sourceId: "req-core-1" } });
    expect(bank).toHaveLength(1);
    expect(bank[0]).toMatchObject({ bankAccountId: ecocash.id, amount: 120, direction: "CREDIT" });

    const event = await prisma.accountingIntegrationEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: "req-core-1" } });
    expect(event).toMatchObject({ status: "POSTED", journalEntryId: first.entryId });
  });

  it("falls back to the operating bank when no money account is named", async () => {
    expect(await moneyLedgerAccount(fixture.companyId, null)).toBe(await accountId("1010"));
    const before = await trialBalance(fixture.companyId);
    const result = await disbursement("req-core-2", null);
    expect(result.entryId).toBeTruthy();
    expect(result.bankTransactionId).toBeUndefined();
    expect((await trialBalance(fixture.companyId))["1010"]).toBe((before["1010"] ?? 0) - 120);
  });

  it("keeps what cannot post, FAILED with its reason, never dropped", async () => {
    const result = await postMoney(prisma, {
      companyId: fixture.companyId,
      sourceType: "CRM_COST_ENTRY_RECEIPT",
      sourceId: "cost-core-1",
      sourceSubtype: "OTHER",
      date: new Date(),
      description: "Cash from the office",
      amount: 50,
      actor: { userId: fixture.ownerId },
    });
    expect(result.entryId).toBeUndefined();
    const event = await prisma.accountingIntegrationEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: "cost-core-1" } });
    expect(event.status).toBe("FAILED");
    expect(event.lastError).toMatch(/Posting rule missing/);
    expect(event.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("voidMoney", () => {
  it("posts the mirror, marks the original void, and lets go of the bank side", async () => {
    const before = await trialBalance(fixture.companyId);
    const posted = await disbursement("req-core-3", ecocash.id);
    const voided = await voidMoney({
      companyId: fixture.companyId,
      sourceType: "CRM_REQUISITION_DISBURSEMENT",
      sourceId: "req-core-3",
      reason: "Paid twice",
      actor: owner(),
    });
    expect(voided).toMatchObject({ originalEntryId: posted.entryId, already: false });
    expect(await trialBalance(fixture.companyId)).toEqual(before);

    const original = await prisma.journalEntry.findUniqueOrThrow({ where: { id: posted.entryId! } });
    expect(original).toMatchObject({ status: "POSTED", voidedById: fixture.ownerId });
    expect(original.voidedAt).toBeTruthy();
    const mirror = await prisma.journalEntry.findUniqueOrThrow({ where: { id: voided.mirrorEntryId } });
    expect(mirror).toMatchObject({ sourceId: "void:req-core-3", reversalOfEntryId: posted.entryId, status: "POSTED" });
    expect(await prisma.bankTransaction.count({ where: { companyId: fixture.companyId, sourceId: "req-core-3" } })).toBe(0);

    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.posting.voided", entityId: "req-core-3" } });
    expect(audit.reason).toBe("Paid twice");

    // Twice is safe.
    expect(await voidMoney({ companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: "req-core-3", reason: "Paid twice", actor: owner() })).toMatchObject({
      mirrorEntryId: voided.mirrorEntryId,
      already: true,
    });
  });

  it("marks the sub-ledger line void with it", async () => {
    const invoice = await prisma.salesInvoice.create({
      data: { companyId: fixture.companyId, customerId: fixture.customerId, invoiceNumber: `INV-C${fixture.stamp.slice(-6)}`, invoiceDate: new Date(), status: "ISSUED", subTotal: 100, taxTotal: 15, total: 115 },
    });
    await postMoney(prisma, { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoice.id, date: new Date(), description: "Sales invoice", amount: 115, netAmount: 100, taxAmount: 15, grossAmount: 115, actor: { userId: fixture.ownerId } });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: invoice.id } })).toMatchObject({ status: "POSTED" });
    await voidMoney({ companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoice.id, reason: "Raised by mistake", actor: owner() });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: invoice.id } })).toMatchObject({ status: "VOIDED" });
  });

  it("refuses without a reason, and when nothing was posted", async () => {
    await expect(voidMoney({ companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: "req-core-2", reason: " ", actor: owner() })).rejects.toBeInstanceOf(VoidRefused);
    await expect(voidMoney({ companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: "never", reason: "Mistake", actor: owner() })).rejects.toMatchObject({ status: 404 });
  });
});

describe("holds", () => {
  it("holds money dated in a closed month, with the reason in plain words", async () => {
    const start = new Date(Date.UTC(2024, 0, 1));
    const period = await prisma.accountingPeriod.create({ data: { companyId: fixture.companyId, startDate: start, endDate: new Date(Date.UTC(2024, 0, 31)), status: "CLOSED" } });
    expect(await holdFor(fixture.companyId, new Date(Date.UTC(2024, 0, 31, 15)))).toMatchObject({ kind: "closed", month: "January 2024" });
    expect(await holdFor(fixture.companyId, new Date())).toBeNull();
    expect(HELD_UNTIL.getUTCFullYear()).toBe(9999);
    await prisma.accountingPeriod.delete({ where: { id: period.id } });
  });
});

describe("rateFor and nextNumber", () => {
  it("freezes 1 for the base currency, the latest rate and its source otherwise, and never invents one", async () => {
    expect(await rateFor(fixture.companyId, "USD")).toMatchObject({ rate: 1, source: "BASE" });
    await prisma.currencyRate.create({ data: { companyId: fixture.companyId, baseCurrency: "USD", quoteCurrency: "ZWG", rate: 26.7, effectiveDate: new Date(Date.UTC(2026, 0, 2)) } });
    expect(await rateFor(fixture.companyId, "zwg", new Date(Date.UTC(2026, 5, 1)))).toMatchObject({ currency: "ZWG", rate: 26.7, source: "MANUAL" });
    await expect(rateFor(fixture.companyId, "ZAR")).rejects.toBeInstanceOf(UnknownExchangeRateError);
  });

  it("hands out the next number of a series, and says when a type has none yet", async () => {
    const first = await nextNumber(prisma, fixture.companyId, "invoice");
    const second = await nextNumber(prisma, fixture.companyId, "invoice");
    expect(first).not.toBe(second);
    await expect(nextNumber(prisma, fixture.companyId, "bill")).rejects.toBeInstanceOf(NoSeriesYet);
  });
});
