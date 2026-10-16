/**
 * Void on a payment, against the test database: it reverses the receipt's
 * posting so the trial balance is as if it had never posted, puts what it paid
 * back on the invoice (a paid invoice is issued again, and aged debt agrees),
 * opens its bank statement line again, keeps who, when and why with an audit
 * snapshot, leaves it out of every total while it stays in the list, waits for
 * an open fiscal day to close, and is the owner's alone. Only the sign-in is
 * faked for the route.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { acceptMatch } from "./bank";
import { destroyBooksFixture, issueTestInvoice, makeBooksFixture, payTestInvoice, trialBalance, type BooksFixture } from "./invoice-test-fixtures";
import { cameIn } from "./money";
import { paymentQuerySchema, readPayments } from "./payments";
import { voidInvoice } from "./reverse-invoice";
import { readReceiptVoid, voidReceipt } from "./void-receipt";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { GET as readVoidRoute, POST as voidRoute } from "@/app/api/books/payments/[id]/void/route";
import { GET as paymentsRoute } from "@/app/api/books/payments/route";

// Posting and the seed pack are slow under a full run: each test posts several journals.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
const owner = () => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });
const manager = () => ({ companyId: fixture.companyId, userId: fixture.managerId, role: "MANAGER" });

function signedInAs(user: { userId: string; role: string }) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: user.userId, companyId: fixture.companyId, role: user.role, name: "Someone", email: "someone@books.test" } } });
}

async function call(handler: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>, id: string, method: string, body?: unknown) {
  const response = await handler(
    new NextRequest(`http://books.test/api/books/payments/${id}/void`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** What the receivables sub-ledger says is owed on an invoice: its POSTED lines, as aged debt reads them. */
async function ledgerOwed(invoiceId: string): Promise<number> {
  const lines = await prisma.paymentLedgerEntry.findMany({ where: { companyId: fixture.companyId, status: "POSTED", OR: [{ invoiceId }, { sourceType: "SALES_INVOICE", sourceId: invoiceId }] } });
  return Math.round(lines.reduce((sum, line) => sum + line.debit - line.credit, 0) * 100) / 100;
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("Void a payment");
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.bankStatementLine.deleteMany({ where: { reconciliation: { companyId: fixture.companyId } } });
    await prisma.bankTransaction.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.bankReconciliation.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.bankAccount.deleteMany({ where: { companyId: fixture.companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("voiding a payment on an invoice", () => {
  it("reverses its posting: the trial balance is as if it had never posted", async () => {
    const invoice = await issueTestInvoice(fixture);
    const before = await trialBalance(fixture.companyId);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    expect(await trialBalance(fixture.companyId)).not.toEqual(before);

    const done = await voidReceipt(owner(), receipt.id, { reason: "The transfer bounced" });
    expect(done.reversalEntryId).toBeTruthy();
    expect(await trialBalance(fixture.companyId)).toEqual(before);

    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: `void:${receipt.id}` }, include: { lines: { include: { account: true } } } });
    expect(reversal.status).toBe("POSTED");
    // The receipt's own entry stays: the void is a second entry, inverted, never a deletion.
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toBe(1);
    const byCode = Object.fromEntries(reversal.lines.map((line) => [line.account.code, line.debit - line.credit]));
    expect(byCode).toEqual({ "1010": -690, "1100": 690 });
  });

  it("puts what it paid back on the invoice: a paid invoice is issued again, and aged debt agrees", async () => {
    const invoice = await issueTestInvoice(fixture);
    await payTestInvoice(fixture, invoice.id, 200);
    const receipt = await payTestInvoice(fixture, invoice.id, 490);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "PAID", amountPaid: 690 });
    expect(await ledgerOwed(invoice.id)).toBe(0);

    const facts = await readReceiptVoid(fixture.companyId, receipt.id);
    expect(facts).toMatchObject({ number: receipt.receiptNumber, amount: 490, invoice: { number: invoice.invoiceNumber, paid: true, owedAfter: 490 }, bankLine: null, voided: null });

    const done = await voidReceipt(owner(), receipt.id, { reason: "Paid into the wrong account" });
    expect(done.invoice).toEqual({ number: invoice.invoiceNumber, status: "ISSUED", owed: 490 });
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "ISSUED", amountPaid: 200 });
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toMatchObject({ status: "VOIDED" });
    expect(await ledgerOwed(invoice.id)).toBe(490);

    // The receipt stays, on its invoice, marked void.
    expect(await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).toMatchObject({ invoiceId: invoice.id, voidedById: fixture.ownerId, voidReason: "Paid into the wrong account" });
  });

  it("opens again the bank statement line it was matched to", async () => {
    const invoice = await issueTestInvoice(fixture);
    const account = await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "Stanbic USD", bankName: "Stanbic", currency: "USD" } });
    const day = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const reconciliation = await prisma.bankReconciliation.create({ data: { companyId: fixture.companyId, bankAccountId: account.id, startDate: day, endDate: day } });
    const line = await prisma.bankStatementLine.create({ data: { reconciliationId: reconciliation.id, txnDate: day, description: "RTGS BORROWDALE BROOKE", amount: 690, direction: "CREDIT" } });

    const { transactionId } = await acceptMatch(prisma, { companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN", lineId: line.id, match: { kind: "invoice", invoiceId: invoice.id, amount: 690 } });
    const receipt = await prisma.salesReceipt.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    expect(await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ matchedTransactionId: transactionId });
    expect(await readReceiptVoid(fixture.companyId, receipt.id)).toMatchObject({ bankLine: { bank: "Stanbic", description: "RTGS BORROWDALE BROOKE" } });

    const done = await voidReceipt(owner(), receipt.id, { reason: "Matched to the wrong invoice" });
    expect(done.bankLine).toMatchObject({ bank: "Stanbic", description: "RTGS BORROWDALE BROOKE" });
    expect(await prisma.bankStatementLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ matchedTransactionId: null });
    expect(await prisma.bankTransaction.count({ where: { id: transactionId } })).toBe(0);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "ISSUED", amountPaid: 0 });

    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.receipt.voided", entityId: receipt.id } });
    const snapshot = JSON.parse(audit.payloadJson!) as { bankTransactions: Array<{ id: string }>; statementLinesReopened: Array<{ id: string }> };
    expect(snapshot.bankTransactions.map((txn) => txn.id)).toEqual([transactionId]);
    expect(snapshot.statementLinesReopened.map((row) => row.id)).toEqual([line.id]);
  });
});

describe("a void payment's record", () => {
  it("keeps the reason, and an audit snapshot of the receipt and its posting", async () => {
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    await expect(voidReceipt(owner(), receipt.id, { reason: " " })).rejects.toMatchObject({ status: 400 });

    await voidReceipt(owner(), receipt.id, { reason: "Recorded twice" });
    await expect(voidReceipt(owner(), receipt.id, { reason: "Again" })).rejects.toMatchObject({ status: 409 });

    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.receipt.voided", entityId: receipt.id } });
    expect(audit).toMatchObject({ actor: fixture.ownerId, reason: "Recorded twice", entityType: "SalesReceipt" });
    const snapshot = JSON.parse(audit.payloadJson!) as {
      number: string;
      receipt: { receiptNumber: string; amount: number; invoiceId: string };
      invoice: { number: string; status: string };
      journalEntries: Array<{ sourceId: string; lines: unknown[] }>;
      reversalEntryId: string;
      paymentLedgerEntry: { status: string; credit: number };
    };
    expect(snapshot.number).toBe(receipt.receiptNumber);
    expect(snapshot.receipt).toMatchObject({ receiptNumber: receipt.receiptNumber, amount: 690, invoiceId: invoice.id });
    expect(snapshot.invoice).toMatchObject({ number: invoice.invoiceNumber, status: "PAID" });
    expect(snapshot.journalEntries.map((entry) => entry.sourceId)).toEqual([receipt.id]);
    expect(snapshot.journalEntries[0]!.lines).toHaveLength(2);
    expect(snapshot.reversalEntryId).toBeTruthy();
    expect(snapshot.paymentLedgerEntry).toMatchObject({ status: "POSTED", credit: 690 });

    expect(await readReceiptVoid(fixture.companyId, receipt.id)).toMatchObject({ voided: { by: "James Nyabadza", reason: "Recorded twice" } });
  });

  it("can void a payment a void invoice left on account", async () => {
    const before = await trialBalance(fixture.companyId);
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    await voidInvoice(owner(), invoice.id, { reason: "Raised against the wrong customer" });
    expect(await readReceiptVoid(fixture.companyId, receipt.id)).toMatchObject({ customer: "Borrowdale Brooke Clinic", invoice: null });

    await voidReceipt(owner(), receipt.id, { reason: "Refunded in cash" });
    expect(await trialBalance(fixture.companyId)).toEqual(before);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toMatchObject({ status: "VOIDED", partyId: fixture.customerId });
  });
});

describe("who may void a payment", () => {
  it("is the owner only: a manager is refused on the server (403), and the list offers them nothing", async () => {
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    await expect(voidReceipt(manager(), receipt.id, { reason: "Not mine" })).rejects.toMatchObject({ status: 403 });

    signedInAs({ userId: fixture.managerId, role: "MANAGER" });
    expect((await call(voidRoute, receipt.id, "POST", { reason: "Not mine" })).status).toBe(403);
    expect((await call(readVoidRoute, receipt.id, "GET")).status).toBe(403);
    const list = await paymentsRoute(new NextRequest("http://books.test/api/books/payments"));
    expect(((await list.json()) as { can: unknown }).can).toEqual({ void: false });
    expect((await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).voidedAt).toBeNull();

    signedInAs({ userId: fixture.ownerId, role: "SUPERADMIN" });
    const owners = await paymentsRoute(new NextRequest("http://books.test/api/books/payments"));
    expect(((await owners.json()) as { can: unknown }).can).toEqual({ void: true });
    expect((await call(voidRoute, receipt.id, "POST", {})).status).toBe(400);
    expect((await call(voidRoute, receipt.id, "POST", { reason: "Bounced" })).status).toBe(200);
  });

  it("refuses a payment on an invoice in a fiscal day still open: the day's Z report counts it", async () => {
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    const provider = await prisma.fiscalisationProviderConfig.create({ data: { companyId: fixture.companyId, providerKey: `test-${fixture.stamp}` } });
    const day = await prisma.fiscalDay.create({ data: { companyId: fixture.companyId, providerConfigId: provider.id, deviceId: "1", fiscalDayNo: 7, status: "OPENED" } });
    const fiscal = await prisma.fiscalReceipt.create({ data: { companyId: fixture.companyId, invoiceId: invoice.id, status: "SUCCESS", fiscalDayId: day.id, receiptCounter: 1, receiptGlobalNo: 41 } });
    expect(await readReceiptVoid(fixture.companyId, receipt.id)).toMatchObject({ fiscalised: true, fiscalDayOpen: 7 });
    const balance = await trialBalance(fixture.companyId);
    await expect(voidReceipt(owner(), receipt.id, { reason: "Bounced" })).rejects.toMatchObject({ status: 409 });
    expect(await trialBalance(fixture.companyId)).toEqual(balance);
    expect((await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } })).voidedAt).toBeNull();

    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED" } });
    const done = await voidReceipt(owner(), receipt.id, { reason: "Bounced" });
    expect(done.fiscalised).toBe(true);
    await prisma.fiscalReceipt.delete({ where: { id: fiscal.id } });
    await prisma.fiscalDay.delete({ where: { id: day.id } });
    await prisma.fiscalisationProviderConfig.delete({ where: { id: provider.id } });
  });
});

describe("the totals", () => {
  it("leave a void payment out, while Payments still lists it marked void", async () => {
    const query = paymentQuerySchema.parse({});
    const today = new Date().toISOString().slice(0, 10);
    const listed = await readPayments(prisma, fixture.companyId, query);
    const came = (await cameIn(prisma as never, fixture.companyId, today, "USD")).find((source) => source.key === "invoices")?.amount ?? 0;

    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    expect((await readPayments(prisma, fixture.companyId, query)).received).toBe(Math.round((listed.received + 690) * 100) / 100);

    await voidReceipt(owner(), receipt.id, { reason: "Bounced" });
    const after = await readPayments(prisma, fixture.companyId, query);
    expect(after.received).toBe(listed.received);
    expect(after.range.of).toBe(listed.range.of + 1);
    expect(after.rows.find((row) => row.id === receipt.id)).toMatchObject({ amount: 690, voided: { by: "James Nyabadza", reason: "Bounced" } });
    expect((await cameIn(prisma as never, fixture.companyId, today, "USD")).find((source) => source.key === "invoices")?.amount ?? 0).toBe(came);
  });
});
