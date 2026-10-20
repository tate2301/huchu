/**
 * The ledger plumbing of P1b against the test database (books-final §6.1
 * fixes 2, 3, 5 and 6, D8): numbers are gapless and given only at issue; the
 * sub-ledger line is written in the post's own transaction, and goes VOIDED
 * with any void; a receipt or payment through a money account posts to that
 * account and writes its bank transaction; a receipt freezes its customer,
 * currency and rate.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordPurchasePayment, recordSalesReceipt, ReceiptRefused } from "@/lib/accounting/payments";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { prisma } from "@/lib/prisma";

import { createSalesInvoice } from "../create-invoice";
import { destroyBooksFixture, issueTestInvoice, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { issueDraftInvoice } from "../issue-invoice";
import { nextJournalNumber, nextNumber } from "./numbering";
import { writeMissingSubLedgerLines } from "./sub-ledger-backfill";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let ecocash: { id: string; ledgerAccountId: string };
const accountId = async (code: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code }, select: { id: true } })).id;
const digits = (number: string) => Number(number.replace(/^\D+-/, ""));

beforeAll(async () => {
  fixture = await makeBooksFixture("Plumbing");
  ecocash = (await prisma.bankAccount.create({
    data: { companyId: fixture.companyId, name: "EcoCash", kind: "MOBILE", currency: "USD", ledgerAccountId: await accountId("1016") },
    select: { id: true, ledgerAccountId: true },
  })) as { id: string; ledgerAccountId: string };
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.bankTransaction.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.purchasePayment.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.vendor.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.idSequence.deleteMany({ where: { companyId: fixture.companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("gapless numbering (D8)", () => {
  it("hands out consecutive numbers to people issuing at once, never the same one twice", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 8 }, () => prisma.$transaction((tx) => nextNumber(tx, fixture.companyId, "credit-note"))),
    );
    const sorted = numbers.map(digits).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(8);
    expect(sorted[sorted.length - 1] - sorted[0]).toBe(7);
    expect(numbers.every((number) => /^CN-\d{4,}$/.test(number))).toBe(true);
  });

  it("gives a rolled-back issue's number back, so the series has no gap", async () => {
    const before = await prisma.$transaction((tx) => nextNumber(tx, fixture.companyId, "debit-note"));
    await expect(
      prisma.$transaction(async (tx) => {
        await nextNumber(tx, fixture.companyId, "debit-note");
        throw new Error("the issue failed");
      }),
    ).rejects.toThrow("the issue failed");
    const after = await prisma.$transaction((tx) => nextNumber(tx, fixture.companyId, "debit-note"));
    expect(digits(after)).toBe(digits(before) + 1);
  });

  it("numbers journals one after another however many post at once", async () => {
    const numbers = await Promise.all(Array.from({ length: 6 }, () => prisma.$transaction(async (tx) => {
      const entryNumber = await nextJournalNumber(tx, fixture.companyId);
      await tx.journalEntry.create({ data: { companyId: fixture.companyId, entryNumber, entryDate: new Date(), description: "Concurrent", status: "DRAFT", createdById: fixture.ownerId } });
      return entryNumber;
    })));
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(6);
    expect(sorted[5] - sorted[0]).toBe(5);
    await prisma.journalEntry.deleteMany({ where: { companyId: fixture.companyId, description: "Concurrent" } });
  });

  it("leaves a draft unnumbered and numbers it from the series when it is issued", async () => {
    const draft = await createSalesInvoice(
      { companyId: fixture.companyId, userId: fixture.ownerId },
      { customerId: fixture.customerId, invoiceDate: "2026-10-19", lines: [{ description: "Screed", quantity: 2, unitPrice: 50, taxRate: 0 }] },
    );
    expect(draft.status).toBe("DRAFT");
    expect(draft.invoiceNumber).toBeNull();
    const peek = await prisma.$transaction((tx) => nextNumber(tx, fixture.companyId, "invoice"));
    const issued = await issueDraftInvoice({ companyId: fixture.companyId, userId: fixture.ownerId }, draft.id);
    expect(issued.invoiceNumber).toMatch(/^INV-\d{4,}$/);
    expect(digits(issued.invoiceNumber!)).toBe(digits(peek) + 1);
  });
});

describe("the sub-ledger, in the post's own transaction (fixes 2 and 3)", () => {
  it("writes the line for a document made in the same transaction, and neither when it rolls back", async () => {
    const madeAndPosted = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.create({
        data: { companyId: fixture.companyId, customerId: fixture.customerId, invoiceNumber: await nextNumber(tx, fixture.companyId, "invoice"), invoiceDate: new Date(), status: "ISSUED", subTotal: 100, total: 100 },
      });
      const posting = await createJournalEntryFromSource(
        { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoice.id, entryDate: new Date(), description: "In one transaction", createdById: fixture.ownerId, amount: 100, netAmount: 100, taxAmount: 0, grossAmount: 100 },
        tx,
      );
      return { invoice, posting };
    });
    expect(madeAndPosted.posting.entryId).toBeTruthy();
    const line = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: madeAndPosted.invoice.id } });
    expect(line).toMatchObject({ status: "POSTED", partyId: fixture.customerId, debit: 100, journalEntryId: madeAndPosted.posting.entryId });

    let rolledBack = "";
    await expect(
      prisma.$transaction(async (tx) => {
        const invoice = await tx.salesInvoice.create({
          data: { companyId: fixture.companyId, customerId: fixture.customerId, invoiceNumber: `T-RB-${fixture.stamp}`, invoiceDate: new Date(), status: "ISSUED", subTotal: 40, total: 40 },
        });
        rolledBack = invoice.id;
        await createJournalEntryFromSource(
          { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoice.id, entryDate: new Date(), description: "Rolled back", createdById: fixture.ownerId, amount: 40, netAmount: 40, taxAmount: 0, grossAmount: 40 },
          tx,
        );
        throw new Error("the invoice was not saved");
      }),
    ).rejects.toThrow("the invoice was not saved");
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: rolledBack } })).toBe(0);
    expect(await prisma.paymentLedgerEntry.count({ where: { companyId: fixture.companyId, sourceId: rolledBack } })).toBe(0);
  });

  it("marks the line VOIDED when the mirror posts under void:<id>, whichever route voided it", async () => {
    const invoice = await issueTestInvoice(fixture);
    await prisma.creditNote.create({ data: { companyId: fixture.companyId, invoiceId: invoice.id, noteNumber: `CN-T${fixture.stamp.slice(-5)}`, noteDate: new Date(), status: "ISSUED", subTotal: 50, total: 50 } });
    const note = await prisma.creditNote.findFirstOrThrow({ where: { companyId: fixture.companyId, invoiceId: invoice.id } });
    const post = (sourceId: string, invert: boolean) =>
      createJournalEntryFromSource({ companyId: fixture.companyId, sourceType: "SALES_CREDIT_NOTE", sourceId, entryDate: new Date(), description: "Credit note", createdById: fixture.ownerId, amount: 50, netAmount: 50, taxAmount: 0, grossAmount: 50, invertDirection: invert });
    await post(note.id, false);
    expect((await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: note.id } })).status).toBe("POSTED");
    await prisma.creditNote.update({ where: { id: note.id }, data: { status: "VOIDED" } });
    await post(`void:${note.id}`, true);
    expect((await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: note.id } })).status).toBe("VOIDED");
  });

  it("finds the invoice behind a CRM revision key, and keeps one line at the new figures", async () => {
    const invoice = await issueTestInvoice(fixture);
    await prisma.salesInvoice.update({ where: { id: invoice.id }, data: { total: 805, subTotal: 700, taxTotal: 105, revision: 1 } });
    const posting = await createJournalEntryFromSource({ companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: `${invoice.id}:revision-1`, entryDate: new Date(), description: "Revision 1", createdById: fixture.ownerId, amount: 805, netAmount: 700, taxAmount: 105, grossAmount: 805 });
    const lines = await prisma.paymentLedgerEntry.findMany({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: { startsWith: invoice.id } } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ sourceId: invoice.id, debit: 805, journalEntryId: posting.entryId });
  });

  it("writes the lines past postings missed, once", async () => {
    const invoice = await issueTestInvoice(fixture);
    await prisma.paymentLedgerEntry.deleteMany({ where: { companyId: fixture.companyId, sourceId: invoice.id } });
    const first = await writeMissingSubLedgerLines(fixture.companyId);
    expect(first.written).toBeGreaterThanOrEqual(1);
    expect(await prisma.paymentLedgerEntry.count({ where: { companyId: fixture.companyId, sourceId: invoice.id } })).toBe(1);
    expect((await writeMissingSubLedgerLines(fixture.companyId)).written).toBe(0);
  });
});

describe("receipts and payments through a money account (fixes 5 and 6)", () => {
  it("posts a receipt to the account it came into, writes its bank transaction and freezes its facts", async () => {
    const invoice = await issueTestInvoice(fixture);
    const before = await trialBalance(fixture.companyId);
    const receipt = await recordSalesReceipt({ companyId: fixture.companyId, userId: fixture.ownerId, invoiceId: invoice.id, receivedAt: new Date(), amount: 200, method: "EcoCash", bankAccountId: ecocash.id });
    expect(receipt).toMatchObject({ customerId: fixture.customerId, currency: "USD", exchangeRate: 1, baseAmount: 200 });
    expect(receipt.receiptNumber).toMatch(/^REC-\d{4,}$/);
    const after = await trialBalance(fixture.companyId);
    expect(after["1016"]).toBe((before["1016"] ?? 0) + 200);
    expect(after["1010"] ?? 0).toBe(before["1010"] ?? 0);
    const bank = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } });
    expect(bank).toMatchObject({ id: receipt.bankTransactionId, bankAccountId: ecocash.id, amount: 200, direction: "CREDIT" });
    const line = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } });
    expect(line).toMatchObject({ partyId: fixture.customerId, credit: 200, currency: "USD", status: "POSTED" });
  });

  it("names the customer of money on account, and refuses money with no owner", async () => {
    const onAccount = await recordSalesReceipt({ companyId: fixture.companyId, userId: fixture.ownerId, customerId: fixture.customerId, receivedAt: new Date(), amount: 75, method: "Cash" });
    expect(onAccount).toMatchObject({ invoiceId: null, customerId: fixture.customerId });
    expect((await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceId: onAccount.id } })).partyId).toBe(fixture.customerId);
    await expect(recordSalesReceipt({ companyId: fixture.companyId, userId: fixture.ownerId, receivedAt: new Date(), amount: 10, method: "Cash" })).rejects.toBeInstanceOf(ReceiptRefused);
  });

  it("pays a supplier out of the account named, with the bank transaction going out", async () => {
    const vendor = await prisma.vendor.create({ data: { companyId: fixture.companyId, name: "Harare Screeds" } });
    const bill = await prisma.purchaseBill.create({ data: { companyId: fixture.companyId, vendorId: vendor.id, billNumber: `BILL-T${fixture.stamp.slice(-5)}`, billDate: new Date(), status: "RECEIVED", subTotal: 300, total: 300 } });
    const before = await trialBalance(fixture.companyId);
    const payment = await recordPurchasePayment({ companyId: fixture.companyId, userId: fixture.ownerId, billId: bill.id, paidAt: new Date(), amount: 120, method: "EcoCash", bankAccountId: ecocash.id });
    expect(payment.paymentNumber).toMatch(/^PAY-\d{4,}$/);
    const after = await trialBalance(fixture.companyId);
    expect(after["1016"]).toBe((before["1016"] ?? 0) - 120);
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ bankAccountId: ecocash.id, amount: 120, direction: "DEBIT" });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ partyId: vendor.id, debit: 120 });
  });
});
