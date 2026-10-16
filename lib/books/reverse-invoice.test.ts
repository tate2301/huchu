/**
 * Reverse on an invoice, against the test database: voiding reverses its
 * posting and leaves its payments as the customer's money on account; a credit
 * note credits part of it; and only the workspace's owner may do either, on
 * the server. Only the sign-in is faked for the routes.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, issueTestInvoice, makeBooksFixture, payTestInvoice, trialBalance, type BooksFixture } from "./invoice-test-fixtures";
import { creditInvoice, voidInvoice } from "./reverse-invoice";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as reverseRoute } from "@/app/api/books/invoices/[id]/reverse/route";
import { PATCH as patchInvoiceRoute } from "@/app/api/accounting/sales/invoices/[id]/route";

// Posting and the seed pack are slow under a full run: each test posts several journals.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
const owner = () => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });
const manager = () => ({ companyId: fixture.companyId, userId: fixture.managerId, role: "MANAGER" });

function signedInAs(user: { userId: string; role: string }) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: user.userId, companyId: fixture.companyId, role: user.role, name: "Someone", email: "someone@books.test" } } });
}

async function call(handler: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>, id: string, method: string, body: unknown) {
  const response = await handler(new NextRequest(`http://books.test/api/x/${id}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("Reverse");
}, 120_000);

afterAll(async () => {
  await destroyBooksFixture(fixture);
}, 60_000);

describe("voiding an invoice", () => {
  it("reverses its posting, so the books are as before it", async () => {
    const before = await trialBalance(fixture.companyId);
    const invoice = await issueTestInvoice(fixture);
    expect(await trialBalance(fixture.companyId)).not.toEqual(before);

    const done = await voidInvoice(owner(), invoice.id, { reason: "Raised against the wrong customer" });
    expect(done).toMatchObject({ number: invoice.invoiceNumber, unlinked: [], fiscalised: false });
    expect(await trialBalance(fixture.companyId)).toEqual(before);

    const voided = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(voided.status).toBe("VOIDED");
    const reversal = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: `void:${invoice.id}` } });
    expect(reversal.status).toBe("POSTED");
    // Aged debt reads the sub-ledger: the void invoice is owed by nobody.
    const owed = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_INVOICE", sourceId: invoice.id } });
    expect(owed.status).toBe("VOIDED");
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.invoice.voided", entityId: invoice.id } });
    expect(audit.reason).toBe("Raised against the wrong customer");
    expect(audit.actor).toBe(fixture.ownerId);
  });

  it("leaves its payments as the customer's money on account", async () => {
    const invoice = await issueTestInvoice(fixture);
    const receipt = await payTestInvoice(fixture, invoice.id, 690);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
    const bank = (await trialBalance(fixture.companyId))["1010"] ?? 0;

    const done = await voidInvoice(owner(), invoice.id, { reason: "Customer cancelled the job" });
    expect(done.unlinked).toEqual([{ id: receipt.id, number: receipt.receiptNumber, amount: 690 }]);

    const kept = await prisma.salesReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(kept.invoiceId).toBeNull();
    expect(kept.amount).toBe(690);
    const line = await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id } });
    expect(line).toMatchObject({ invoiceId: null, partyId: fixture.customerId, status: "POSTED", credit: 690 });
    // The money stays in the bank, and the customer is owed it: receivables in credit.
    const after = await trialBalance(fixture.companyId);
    expect(after["1010"]).toBe(bank);
    expect(after["1100"]).toBe(-690);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountPaid).toBe(0);
  });

  it("wants a reason, and refuses one void already", async () => {
    const invoice = await issueTestInvoice(fixture);
    await expect(voidInvoice(owner(), invoice.id, { reason: " " })).rejects.toMatchObject({ status: 400 });
    await voidInvoice(owner(), invoice.id, { reason: "Duplicate of another" });
    await expect(voidInvoice(owner(), invoice.id, { reason: "Again" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("crediting part of an invoice", () => {
  it("raises a credit note for chosen lines, posted at once", async () => {
    const invoice = await issueTestInvoice(fixture);
    const before = await trialBalance(fixture.companyId);
    const done = await creditInvoice(owner(), invoice.id, { reason: "Two lengths of skirting came back", choice: { lines: [{ lineId: invoice.lines[1]!.id, quantity: 2 }] } });
    expect(done).toMatchObject({ number: invoice.invoiceNumber, total: 57.5 });

    const note = await prisma.creditNote.findFirstOrThrow({ where: { invoiceId: invoice.id }, include: { lines: true } });
    expect(note).toMatchObject({ status: "ISSUED", reason: "Two lengths of skirting came back", subTotal: 50, taxTotal: 7.5, total: 57.5 });
    expect(note.lines).toHaveLength(1);
    const after = await trialBalance(fixture.companyId);
    expect(Math.round(((after["1100"] ?? 0) - (before["1100"] ?? 0)) * 100) / 100).toBe(-57.5);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).creditTotal).toBe(57.5);
  });

  it("credits an amount including VAT, and no more than is left", async () => {
    const invoice = await issueTestInvoice(fixture);
    const done = await creditInvoice(owner(), invoice.id, { reason: "Goodwill", choice: { amount: 115 } });
    expect(done.total).toBe(115);
    await expect(creditInvoice(owner(), invoice.id, { reason: "Too much", choice: { amount: 600 } })).rejects.toMatchObject({ status: 400 });
    // A credit note stands against it now: voiding would reverse that part twice.
    await expect(voidInvoice(owner(), invoice.id, { reason: "Changed my mind" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("who may reverse an invoice", () => {
  it("is the owner only, refused on the server for a manager (403)", async () => {
    const invoice = await issueTestInvoice(fixture);
    await expect(voidInvoice(manager(), invoice.id, { reason: "Not mine to void" })).rejects.toMatchObject({ status: 403 });
    await expect(creditInvoice(manager(), invoice.id, { reason: "Not mine", choice: { amount: 10 } })).rejects.toMatchObject({ status: 403 });

    signedInAs({ userId: fixture.managerId, role: "MANAGER" });
    expect((await call(reverseRoute, invoice.id, "POST", { how: "void", reason: "Not mine to void" })).status).toBe(403);
    expect((await call(reverseRoute, invoice.id, "POST", { how: "credit", reason: "Not mine", amount: 10 })).status).toBe(403);
    expect((await call(patchInvoiceRoute, invoice.id, "PATCH", { status: "VOIDED" })).status).toBe(403);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("ISSUED");

    signedInAs({ userId: fixture.ownerId, role: "SUPERADMIN" });
    const voided = await call(reverseRoute, invoice.id, "POST", { how: "void", reason: "Raised twice" });
    expect(voided.status).toBe(200);
    expect((await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("VOIDED");
  });

  it("lets the owner void through Accounting's old PATCH, the same way", async () => {
    const invoice = await issueTestInvoice(fixture);
    signedInAs({ userId: fixture.ownerId, role: "SUPERADMIN" });
    const result = await call(patchInvoiceRoute, invoice.id, "PATCH", { status: "VOIDED" });
    expect(result.status).toBe(200);
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: `void:${invoice.id}` } })).toBe(1);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: fixture.companyId, eventType: "books.invoice.voided", entityId: invoice.id } });
    expect(audit.reason).toBe("Cancelled in Accounting, Sales");
  });
});
