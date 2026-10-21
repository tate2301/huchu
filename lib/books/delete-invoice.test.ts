/**
 * Delete on an invoice, against the test database: it leaves the trial
 * balance as if the invoice had never been written, its payments survive as
 * the customer's money on account, its CRM copy and Vane's cards let go of it,
 * the audit log keeps the whole of it, and only the owner may delete one that
 * was issued. Only the sign-in is faked for the route.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

import { deleteInvoice, readInvoiceRemoval } from "./delete-invoice";
import { destroyBooksFixture, issueTestInvoice, makeBooksFixture, payTestInvoice, trialBalance, type BooksFixture } from "./invoice-test-fixtures";
import { removalSentence } from "./reversal";
import { creditInvoice, voidInvoice } from "./reverse-invoice";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { DELETE as deleteRoute, GET as readRoute } from "@/app/api/books/invoices/[id]/route";

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
    new NextRequest(`http://books.test/api/books/invoices/${id}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("Delete");
}, 120_000);

afterAll(async () => {
  await destroyBooksFixture(fixture);
}, 60_000);

describe("deleting an issued invoice", () => {
  it("leaves the trial balance as if it had never existed, credit notes and void with it", async () => {
    const before = await trialBalance(fixture.companyId);
    const invoice = await issueTestInvoice(fixture);
    await creditInvoice(owner(), invoice.id, { reason: "One roll short", choice: { lines: [{ lineId: invoice.lines[0]!.id, quantity: 1 }] } });
    const voidedToo = await issueTestInvoice(fixture);
    await voidInvoice(owner(), voidedToo.id, { reason: "Raised twice" });

    const removal = await readInvoiceRemoval(fixture.companyId, invoice.id);
    expect(removal).toMatchObject({ draft: false, ledgerEntries: 2, paymentLinks: 0, creditNotes: 1, fiscalRecord: false });
    expect(removalSentence(removal!)).toBe(`${invoice.invoiceNumber} and its 2 ledger entries and 1 credit note`);

    await deleteInvoice(owner(), invoice.id, { reason: "Raised by mistake", confirm: invoice.invoiceNumber!.toLowerCase() });
    await deleteInvoice(owner(), voidedToo.id, { reason: "Clearing the duplicate", confirm: voidedToo.invoiceNumber });
    expect(await trialBalance(fixture.companyId)).toEqual(before);

    expect(await prisma.salesInvoice.count({ where: { id: { in: [invoice.id, voidedToo.id] } } })).toBe(0);
    expect(await prisma.salesInvoiceLine.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma.creditNote.count({ where: { invoiceId: invoice.id } })).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: { in: [invoice.id, `void:${voidedToo.id}`, voidedToo.id] } } })).toBe(0);
    expect(await prisma.paymentLedgerEntry.count({ where: { companyId: fixture.companyId, invoiceId: { in: [invoice.id, voidedToo.id] } } })).toBe(0);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, sourceId: { in: [invoice.id, voidedToo.id] } } })).toBe(0);
  });

  it("keeps its payments as the customer's money on account, and never deletes a receipt", async () => {
    const before = await trialBalance(fixture.companyId);
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    // Queued for the device and never accepted: not fiscalised, so it goes with the invoice.
    await prisma.fiscalReceipt.create({ data: { companyId: fixture.companyId, invoiceId: invoice.id, status: "PENDING", fiscalNumber: "FD-1" } });
    const removal = await readInvoiceRemoval(fixture.companyId, invoice.id);
    expect(removalSentence(removal!)).toBe(`${invoice.invoiceNumber} and its 1 ledger entry, 1 payment link and the fiscal record`);

    const gone = await deleteInvoice(owner(), invoice.id, { reason: "Wrong job", confirm: invoice.invoiceNumber });
    expect(gone.onAccount).toEqual([{ id: receipt.id, number: receipt.receiptNumber, amount: 690 }]);

    const kept = await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(kept).toMatchObject({ invoiceId: null, amount: 690 });
    const line = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } });
    expect(line).toMatchObject({ invoiceId: null, partyId: fixture.customerId, credit: 690, status: "POSTED" });
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } })).toBe(1);
    expect(await prisma.fiscalReceipt.count({ where: { companyId: fixture.companyId, fiscalNumber: "FD-1" } })).toBe(0);

    // As if only the payment had ever come in: the bank up, the customer owed it.
    const after = await trialBalance(fixture.companyId);
    expect(after).toEqual({ ...before, "1010": (before["1010"] ?? 0) + 690, "1100": (before["1100"] ?? 0) - 690 });
  });

  it("lets go of the CRM and Vane, and keeps the whole of it in the audit log", async () => {
    const invoice = await issueTestInvoice(fixture);
    const deal = await prisma.crmLeadDocument.create({ data: { companyId: fixture.companyId, type: "INVOICE", invoiceId: invoice.id, amount: 690 } });
    const card = await prisma.vaneItem.create({
      data: { companyId: fixture.companyId, kind: "ISSUE", sourceModule: "books", subjectType: "SalesInvoice", subjectId: invoice.id, headline: `${invoice.invoiceNumber} is overdue`, body: "Let's remind them.", action: {} },
    });

    await deleteInvoice(owner(), invoice.id, { reason: "Changed the scope; reissuing", confirm: invoice.invoiceNumber });

    expect(await prisma.crmLeadDocument.findUnique({ where: { id: deal.id } })).toBeNull();
    expect(await prisma.vaneItem.findUniqueOrThrow({ where: { id: card.id } })).toMatchObject({ status: "DONE", resolvedById: fixture.ownerId });

    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.invoice.deleted", entityId: invoice.id } });
    expect(audit).toMatchObject({ actor: fixture.ownerId, reason: "Changed the scope; reissuing", entityType: "SalesInvoice" });
    const snapshot = JSON.parse(audit.payloadJson!) as {
      number: string;
      invoice: { invoiceNumber: string; total: number; customerId: string };
      lines: Array<{ description: string }>;
      journalEntries: Array<{ sourceId: string; lines: unknown[] }>;
      paymentLedgerEntries: unknown[];
      crmDocuments: Array<{ id: string }>;
      vaneItemsClosed: string[];
    };
    expect(snapshot.number).toBe(invoice.invoiceNumber);
    expect(snapshot.invoice).toMatchObject({ invoiceNumber: invoice.invoiceNumber, total: 690, customerId: fixture.customerId });
    expect(snapshot.lines.map((line) => line.description)).toEqual(["Vinyl sheet", "Coved skirting"]);
    expect(snapshot.journalEntries).toHaveLength(1);
    expect(snapshot.journalEntries[0]!.sourceId).toBe(invoice.id);
    expect(snapshot.journalEntries[0]!.lines).toHaveLength(3);
    expect(snapshot.paymentLedgerEntries).toHaveLength(1);
    expect(snapshot.crmDocuments.map((doc) => doc.id)).toEqual([deal.id]);
    expect(snapshot.vaneItemsClosed).toEqual([card.id]);
  });

  it("never hands its number out again", async () => {
    const first = await reserveIdentifier(prisma, { companyId: fixture.companyId, entity: "SALES_INVOICE" });
    const invoice = await prisma.salesInvoice.create({
      data: { companyId: fixture.companyId, customerId: fixture.customerId, invoiceNumber: first, invoiceDate: new Date(), status: "DRAFT", total: 1, subTotal: 1 },
    });
    await deleteInvoice(owner(), invoice.id);
    expect(await reserveIdentifier(prisma, { companyId: fixture.companyId, entity: "SALES_INVOICE" })).not.toBe(first);
  });
});

describe("who may delete an invoice", () => {
  it("is the owner only once it is issued, refused on the server for a manager (403)", async () => {
    const invoice = await issueTestInvoice(fixture);
    await expect(deleteInvoice(manager(), invoice.id, { reason: "Not mine", confirm: invoice.invoiceNumber })).rejects.toMatchObject({ status: 403 });

    signedInAs({ userId: fixture.managerId, role: "MANAGER" });
    expect((await call(deleteRoute, invoice.id, "DELETE", { reason: "Not mine", confirm: invoice.invoiceNumber })).status).toBe(403);
    const seen = await call(readRoute, invoice.id, "GET");
    expect(seen.body).toMatchObject({ can: { delete: false, reverse: false }, removal: null });
    expect(await prisma.salesInvoice.count({ where: { id: invoice.id } })).toBe(1);

    signedInAs({ userId: fixture.ownerId, role: "SUPERADMIN" });
    expect((await call(readRoute, invoice.id, "GET")).body).toMatchObject({ can: { delete: true, reverse: true } });
    // The number typed, and a reason, or it stays.
    expect((await call(deleteRoute, invoice.id, "DELETE", { reason: "Mistake", confirm: "INV-0000" })).status).toBe(400);
    expect((await call(deleteRoute, invoice.id, "DELETE", { confirm: invoice.invoiceNumber })).status).toBe(400);
    expect((await call(deleteRoute, invoice.id, "DELETE", { reason: "Mistake", confirm: invoice.invoiceNumber })).status).toBe(200);
    expect(await prisma.salesInvoice.count({ where: { id: invoice.id } })).toBe(0);
  });

  it("lets anyone who may change drafts delete a draft, with nothing typed", async () => {
    const draft = await issueTestInvoice(fixture, { draft: true });
    signedInAs({ userId: fixture.managerId, role: "MANAGER" });
    expect((await call(readRoute, draft.id, "GET")).body).toMatchObject({ can: { delete: true, reverse: false }, removal: { draft: true, ledgerEntries: 0 } });
    expect((await call(deleteRoute, draft.id, "DELETE")).status).toBe(200);
    expect(await prisma.salesInvoice.count({ where: { id: draft.id } })).toBe(0);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.invoice.deleted", entityId: draft.id } });
    expect(audit.actor).toBe(fixture.managerId);
  });

  it("never deletes a fiscalised invoice, whatever its fiscal day: it offers the credit note instead", async () => {
    const invoice = await issueTestInvoice(fixture);
    const provider = await prisma.fiscalisationProviderConfig.create({ data: { companyId: fixture.companyId, providerKey: `test-${fixture.stamp}` } });
    const day = await prisma.fiscalDay.create({ data: { companyId: fixture.companyId, providerConfigId: provider.id, deviceId: "1", fiscalDayNo: 7, status: "OPENED" } });
    await prisma.fiscalReceipt.create({ data: { companyId: fixture.companyId, invoiceId: invoice.id, status: "SUCCESS", fiscalDayId: day.id, receiptCounter: 1, receiptGlobalNo: 41 } });
    expect(await readInvoiceRemoval(fixture.companyId, invoice.id)).toMatchObject({ fiscalRecord: true, fiscalDayOpen: true, fiscalised: true });
    await expect(deleteInvoice(owner(), invoice.id, { reason: "Mistake", confirm: invoice.invoiceNumber })).rejects.toMatchObject({ status: 409 });

    // Its day closed, it is still ZIMRA's: refused, with the credit note named.
    await prisma.fiscalDay.update({ where: { id: day.id }, data: { status: "CLOSED" } });
    await expect(deleteInvoice(owner(), invoice.id, { reason: "Mistake", confirm: invoice.invoiceNumber })).rejects.toMatchObject({
      status: 409,
      message: `${invoice.invoiceNumber} was fiscalised, so ZIMRA holds it as issued and it can't be deleted. Reverse it with a credit note instead.`,
    });
    expect(await prisma.salesInvoice.count({ where: { id: invoice.id } })).toBe(1);
    // And the credit note is the way: Reverse still works on it.
    const credited = await creditInvoice(owner(), invoice.id, { reason: "Wrong job", choice: { amount: 115 } });
    expect(credited.fiscalised).toBe(true);
  });

  it("refuses a manager both void and delete posted; the outside accountant may do either", async () => {
    const invoice = await issueTestInvoice(fixture);
    await expect(deleteInvoice(manager(), invoice.id, { reason: "Not mine", confirm: invoice.invoiceNumber })).rejects.toMatchObject({ status: 403 });
    await expect(voidInvoice(manager(), invoice.id, { reason: "Raised twice" })).rejects.toMatchObject({ status: 403 });
    const outside = { ...manager(), role: "FINANCE_OFFICER", outsideAccountant: { firmName: "Mutasa & Co" } };
    const voided = await voidInvoice(outside, invoice.id, { reason: "Raised twice" });
    expect(voided.number).toBe(invoice.invoiceNumber);
  });
});
