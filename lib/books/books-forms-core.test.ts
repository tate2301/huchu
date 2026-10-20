/**
 * Books' P1c forms post through the core (books-final §8 P1): New invoice
 * (draft unnumbered, issued numbered and posted on its cost centre, paid now
 * with its receipt into the chosen account), Record a payment (customer named,
 * put on invoices oldest first, the rest on account), Record a bill and Pay a
 * supplier. Against the test database, in a fresh workspace.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { createPurchaseBill } from "./bill-create";
import { createBooksInvoice } from "./invoice-create";
import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "./invoice-test-fixtures";
import { booksPaymentSchema, recordBooksPayment } from "./payment-create";
import { paySupplier } from "./payment-out-create";
import { ReceiptRefused } from "./core/receipt-facts";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let bank: string;
let centre: string;
let vatCode: string;
const actor = () => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });
const accountId = async (code: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code }, select: { id: true } })).id;
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  fixture = await makeBooksFixture("P1c forms");
  const { companyId } = fixture;
  bank = (await prisma.bankAccount.create({ data: { companyId, name: "CBZ current", bankName: "CBZ", kind: "BANK", currency: "USD", ledgerAccountId: await accountId("1010") } })).id;
  centre = (await prisma.costCenter.create({ data: { companyId, code: "SHOW", name: "Showroom" } })).id;
  vatCode = (await prisma.taxCode.create({ data: { companyId, code: "VAT15.5", name: "VAT 15.5%", rate: 15.5, appliesTo: "BOTH" } })).id;
}, 180_000);

afterAll(async () => {
  if (fixture) {
    const { companyId } = fixture;
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.purchasePayment.deleteMany({ where: { companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId } });
    await prisma.vendor.deleteMany({ where: { companyId } });
    await prisma.salesReceipt.deleteMany({ where: { companyId } });
    await prisma.bankAccount.deleteMany({ where: { companyId } });
    await prisma.idSequence.deleteMany({ where: { companyId } });
  }
  await destroyBooksFixture(fixture);
  if (fixture) {
    await prisma.costCenter.deleteMany({ where: { companyId: fixture.companyId } }).catch(() => undefined);
    await prisma.taxCode.deleteMany({ where: { companyId: fixture.companyId } }).catch(() => undefined);
  }
}, 60_000);

const lines = [{ description: "Carpet tiles, grey", quantity: 64, unitPrice: 18.5, taxCodeId: "" }];

describe("New invoice through the core", () => {
  it("saves a draft with no number and nothing posted", async () => {
    const draft = await createBooksInvoice(actor(), { customerId: fixture.customerId, invoiceDate: today(), currency: "USD", issueNow: false, lines: [{ ...lines[0], taxCodeId: vatCode }] });
    expect(draft.status).toBe("DRAFT");
    expect(draft.number).toBeNull();
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: draft.id } })).toBe(0);
  });

  it("issues it numbered from the series, posted on its cost centre, with the receivable line", async () => {
    const issued = await createBooksInvoice(actor(), { customerId: fixture.customerId, invoiceDate: today(), currency: "USD", issueNow: true, costCenterId: centre, lines: [{ ...lines[0], taxCodeId: vatCode }] });
    expect(issued.number).toMatch(/^INV-\d{4,}$/);
    expect(issued.total).toBe(1367.52);
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: issued.id }, include: { lines: true } });
    expect(entry.status).toBe("POSTED");
    expect(entry.lines.every((line) => line.costCenterId === centre)).toBe(true);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { sourceType: "SALES_INVOICE", sourceId: issued.id } })).toMatchObject({ partyId: fixture.customerId, debit: 1367.52 });
  });

  it("paid now: the receipt is recorded into the chosen account with its bank transaction, and the invoice is paid", async () => {
    const before = await trialBalance(fixture.companyId);
    const sale = await createBooksInvoice(actor(), { customerId: fixture.customerId, invoiceDate: today(), currency: "USD", issueNow: true, paidNow: { bankAccountId: bank }, lines: [{ description: "Underlay", quantity: 10, unitPrice: 10 }] });
    expect(sale.receipt?.receiptNumber).toMatch(/^REC-\d{4,}$/);
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: sale.id } });
    expect(invoice.status).toBe("PAID");
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { sourceType: "SALES_RECEIPT", sourceId: sale.receipt!.id } })).toMatchObject({ bankAccountId: bank, amount: invoice.total, direction: "CREDIT" });
    const after = await trialBalance(fixture.companyId);
    expect(after["1010"]).toBe(Math.round(((before["1010"] ?? 0) + invoice.total) * 100) / 100);
  });

  it("refuses paid now on a draft", async () => {
    await expect(createBooksInvoice(actor(), { customerId: fixture.customerId, invoiceDate: today(), issueNow: false, paidNow: { bankAccountId: bank }, lines })).rejects.toThrow(/draft is not paid/);
  });
});

describe("Record a payment through the core", () => {
  it("will not take a payment without its customer", () => {
    expect(booksPaymentSchema.safeParse({ bankAccountId: bank, receivedAt: today(), currency: "USD", amount: 10 }).success).toBe(false);
  });

  it("puts the money on the customer's invoices and the rest on account, each receipt posted with its bank line", async () => {
    const owing = await prisma.salesInvoice.findFirstOrThrow({ where: { companyId: fixture.companyId, status: "ISSUED" } });
    const done = await recordBooksPayment(actor(), {
      customerId: fixture.customerId,
      bankAccountId: bank,
      receivedAt: today(),
      currency: "USD",
      amount: 1500,
      reference: "EFT 1810",
      allocations: [{ invoiceId: owing.id, amount: owing.total }],
    });
    expect(done.receipts.map((receipt) => receipt.invoiceId)).toEqual([owing.id, null]);
    expect(done.onAccount).toBe(132.48);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: owing.id } })).status).toBe("PAID");
    for (const receipt of done.receipts) {
      expect(await prisma.bankTransaction.count({ where: { sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toBe(1);
      expect(await prisma.journalEntry.count({ where: { sourceType: "SALES_RECEIPT", sourceId: receipt.id, status: "POSTED" } })).toBe(1);
    }
    expect(await prisma.salesReceipt.count({ where: { companyId: fixture.companyId, customerId: null } })).toBe(0);
  });

  it("refuses more on an invoice than it owes", async () => {
    const invoice = await createBooksInvoice(actor(), { customerId: fixture.customerId, invoiceDate: today(), currency: "USD", issueNow: true, lines: [{ description: "Fitting", quantity: 1, unitPrice: 50 }] });
    await expect(
      recordBooksPayment(actor(), { customerId: fixture.customerId, bankAccountId: bank, receivedAt: today(), currency: "USD", amount: 80, allocations: [{ invoiceId: invoice.id, amount: 80 }] }),
    ).rejects.toBeInstanceOf(ReceiptRefused);
  });
});

describe("Record a bill and pay it through the core", () => {
  it("records the bill numbered and posted, then pays it out of the account with its bank transaction", async () => {
    const vendor = await prisma.vendor.create({ data: { companyId: fixture.companyId, name: "Tile Trader Zimbabwe" } });
    const bill = await createPurchaseBill(actor(), { vendorId: vendor.id, billDate: today(), currency: "USD", receiveNow: true, notes: "Their invoice 00184977", lines: [{ description: "Ceramic skirting", quantity: 60, unitPrice: 4.4 }] }, { costCenterId: centre });
    expect(bill.billNumber).toMatch(/^BILL-\d{4,}$/);
    expect(await prisma.journalEntry.findFirstOrThrow({ where: { sourceType: "PURCHASE_BILL", sourceId: bill.id } })).toMatchObject({ status: "POSTED" });
    const paid = await paySupplier(actor(), { vendorId: vendor.id, bankAccountId: bank, paidAt: today(), bills: [{ billId: bill.id, amount: bill.total }] });
    expect(paid.payments[0].number).toMatch(/^PAY-\d{4,}$/);
    const payment = await prisma.purchasePayment.findFirstOrThrow({ where: { billId: bill.id } });
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { sourceType: "PURCHASE_PAYMENT", sourceId: payment.id } })).toMatchObject({ bankAccountId: bank, direction: "DEBIT" });
    expect((await prisma.purchaseBill.findUniqueOrThrow({ where: { id: bill.id } })).status).toBe("PAID");
  });

  it("leaves the trial balance balanced and no money event waiting", async () => {
    const tb = await trialBalance(fixture.companyId);
    expect(Math.abs(Object.values(tb).reduce((sum, value) => sum + value, 0))).toBeLessThan(0.005);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, status: { in: ["PENDING", "FAILED", "IGNORED"] } } })).toBe(0);
  });
});
