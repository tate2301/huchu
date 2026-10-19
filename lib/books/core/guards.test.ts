/**
 * The guards (books-final §2.2, §4.1, §6), through the real routes with only
 * the sign-in faked: no arbitrary status jumps on invoices, bills or periods;
 * reopening a month is the owner's; the write-off's undo is a void that keeps
 * it; a clerk cannot post a journal; and Journals' Reversed and Voided tabs
 * read the markers the ledger writes.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { reverseJournalEntry } from "@/lib/accounting/journals";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, issueTestInvoice, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { readJournals } from "../journals";
import { postMoney } from "./post-money";
import { voidMoney } from "./void-money";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { PATCH as patchInvoice } from "@/app/api/accounting/sales/invoices/[id]/route";
import { PATCH as patchBill } from "@/app/api/accounting/purchases/bills/[id]/route";
import { PATCH as patchPeriod } from "@/app/api/accounting/periods/[id]/route";
import { POST as reopen } from "@/app/api/accounting/closing/period-reopen/route";
import { DELETE as undoWriteOff } from "@/app/api/accounting/sales/write-offs/[id]/route";
import { POST as postJournal } from "@/app/api/accounting/journals/route";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let clerkId: string;

function as(userId: string, role: string) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: userId, companyId: fixture.companyId, role, name: "Someone", email: "someone@books.test" } } });
}

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;
async function call(handler: Handler, id: string, method: string, body?: unknown) {
  const response = await handler(
    new NextRequest(`http://books.test/api/x/${id}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("Guards");
  clerkId = (await prisma.user.create({ data: { email: `clerk-${fixture.stamp}@books.test`, name: "Rufaro", role: "CLERK", companyId: fixture.companyId }, select: { id: true } })).id;
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.salesWriteOff.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.purchaseBill.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.vendor.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.periodCloseVoucher.deleteMany({ where: { companyId: fixture.companyId } }).catch(() => undefined);
  }
  await destroyBooksFixture(fixture);
}, 60_000);

describe("no arbitrary status jumps", () => {
  it("an invoice is never marked paid by hand, nor sent back to draft, and only a voider voids it", async () => {
    const invoice = await issueTestInvoice(fixture);
    as(fixture.managerId, "MANAGER");
    expect((await call(patchInvoice, invoice.id, "PATCH", { status: "PAID" })).status).toBe(409);
    expect((await call(patchInvoice, invoice.id, "PATCH", { status: "DRAFT" })).status).toBe(409);
    expect((await call(patchInvoice, invoice.id, "PATCH", { status: "ISSUED" })).status).toBe(409);
    expect((await call(patchInvoice, invoice.id, "PATCH", { status: "VOIDED", reason: "Raised twice" })).status).toBe(403);
    // Notes still change.
    expect((await call(patchInvoice, invoice.id, "PATCH", { notes: "Delivered to the side gate" })).status).toBe(200);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ status: "ISSUED", notes: "Delivered to the side gate" });

    as(fixture.ownerId, "SUPERADMIN");
    expect((await call(patchInvoice, invoice.id, "PATCH", { status: "VOIDED", reason: "Raised twice" })).status).toBe(200);
  });

  it("a bill is received from draft only, never paid by hand, and voided through the core", async () => {
    const vendor = await prisma.vendor.create({ data: { companyId: fixture.companyId, name: "Tile Trader Zimbabwe" } });
    const bill = await prisma.purchaseBill.create({
      data: { companyId: fixture.companyId, vendorId: vendor.id, billNumber: `BILL-${fixture.stamp.slice(-5)}`, billDate: new Date(), subTotal: 200, taxTotal: 30, total: 230, createdById: fixture.ownerId },
    });
    const before = await trialBalance(fixture.companyId);
    as(fixture.managerId, "MANAGER");
    expect((await call(patchBill, bill.id, "PATCH", { status: "PAID" })).status).toBe(409);
    expect((await call(patchBill, bill.id, "PATCH", { status: "RECEIVED" })).status).toBe(200);
    expect((await call(patchBill, bill.id, "PATCH", { status: "RECEIVED" })).status).toBe(409);
    expect((await call(patchBill, bill.id, "PATCH", { status: "DRAFT" })).status).toBe(409);
    expect((await call(patchBill, bill.id, "PATCH", { status: "VOIDED" })).status).toBe(403);

    as(fixture.ownerId, "SUPERADMIN");
    expect((await call(patchBill, bill.id, "PATCH", { status: "VOIDED", reason: "Billed twice" })).status).toBe(200);
    expect(await trialBalance(fixture.companyId)).toEqual(before);
    const original = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "PURCHASE_BILL", sourceId: bill.id } });
    expect(original.voidedAt).toBeTruthy();
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: `void:${bill.id}`, reversalOfEntryId: original.id } })).toBe(1);
    expect(await prisma.paymentLedgerEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: bill.id } })).toMatchObject({ status: "VOIDED" });
  });

  it("a period's status never changes by PATCH, and only the owner reopens a month", async () => {
    const period = await prisma.accountingPeriod.create({
      data: { companyId: fixture.companyId, startDate: new Date(Date.UTC(2023, 4, 1)), endDate: new Date(Date.UTC(2023, 4, 31)), status: "CLOSED" },
    });
    as(fixture.managerId, "MANAGER");
    expect((await call(patchPeriod, period.id, "PATCH", { status: "OPEN" })).status).toBe(400);
    expect((await prisma.accountingPeriod.findUniqueOrThrow({ where: { id: period.id } })).status).toBe("CLOSED");
    const refused = await reopen(new NextRequest("http://books.test/api/accounting/closing/period-reopen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ periodId: period.id, reason: "Missed a bill" }) }));
    expect(refused.status).toBe(403);
    expect(JSON.stringify(await refused.json())).toContain("Only the owner can reopen a month.");
    await prisma.accountingPeriod.delete({ where: { id: period.id } });
  });
});

describe("undo", () => {
  it("voids a write-off instead of deleting it and its journal", async () => {
    const invoice = await issueTestInvoice(fixture);
    const untouched = await trialBalance(fixture.companyId);
    const writeOff = await prisma.salesWriteOff.create({ data: { companyId: fixture.companyId, invoiceId: invoice.id, amount: 90, reason: "Client gone" } });
    await postMoney(prisma, { companyId: fixture.companyId, sourceType: "SALES_WRITE_OFF", sourceId: writeOff.id, date: new Date(), description: "Bad debt", amount: 90, actor: { userId: fixture.ownerId } });
    const posted = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceType: "SALES_WRITE_OFF", sourceId: writeOff.id } });

    as(fixture.managerId, "MANAGER");
    expect((await call(undoWriteOff, writeOff.id, "DELETE")).status).toBe(403);
    as(fixture.ownerId, "SUPERADMIN");
    expect((await call(undoWriteOff, writeOff.id, "DELETE", { reason: "Client paid after all" })).status).toBe(200);

    expect(await prisma.salesWriteOff.findUniqueOrThrow({ where: { id: writeOff.id } })).toMatchObject({ status: "VOIDED" });
    expect(await prisma.journalEntry.findUniqueOrThrow({ where: { id: posted.id } })).toMatchObject({ status: "POSTED" });
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: `void:${writeOff.id}` } })).toBe(1);
    // As if it had never been written off: the debt is owed again.
    expect(await trialBalance(fixture.companyId)).toEqual(untouched);
    expect(await prisma.salesInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject({ writeOffTotal: 0 });
    expect((await call(undoWriteOff, writeOff.id, "DELETE")).status).toBe(409);
  });

  it("refuses a clerk a posted journal", async () => {
    const [bank, cash] = await Promise.all(
      ["1010", "1005"].map((code) => prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code }, select: { id: true } })),
    );
    as(clerkId, "CLERK");
    const response = await postJournal(
      new NextRequest("http://books.test/api/accounting/journals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entryDate: new Date().toISOString().slice(0, 10),
          description: "Cash to the bank",
          status: "POSTED",
          lines: [
            { accountId: bank!.id, debit: 10, credit: 0 },
            { accountId: cash!.id, debit: 0, credit: 10 },
          ],
        }),
      }),
    );
    expect(response.status).toBe(403);
  });
});

describe("Journals' Reversed and Voided tabs", () => {
  it("read reversedAt and the void markers, not a status nobody writes", async () => {
    const result = await postMoney(prisma, { companyId: fixture.companyId, sourceType: "MAINTENANCE_COMPLETION", sourceId: `wo-${fixture.stamp}`, date: new Date(), description: "Pump repaired", amount: 50, actor: { userId: fixture.ownerId } });
    const reversed = await postMoney(prisma, { companyId: fixture.companyId, sourceType: "MAINTENANCE_COMPLETION", sourceId: `wo2-${fixture.stamp}`, date: new Date(), description: "Belt replaced", amount: 20, actor: { userId: fixture.ownerId } });
    await prisma.$transaction((tx) => reverseJournalEntry(tx, { companyId: fixture.companyId, entryId: reversed.entryId!, actorId: fixture.ownerId, actorRole: "SUPERADMIN", reason: "Wrong job" }));
    await voidMoney({ companyId: fixture.companyId, sourceType: "MAINTENANCE_COMPLETION", sourceId: `wo-${fixture.stamp}`, reason: "Never done", actor: { companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" } });

    const view = (tab: "reversed" | "voided" | "posted") => readJournals(prisma, fixture.companyId, { tab, q: "", page: 1 });
    const reversedTab = await view("reversed");
    expect(reversedTab.rows.map((row) => row.id)).toContain(reversed.entryId);
    expect(reversedTab.rows.every((row) => row.state === "reversed")).toBe(true);
    const voidedTab = await view("voided");
    expect(voidedTab.rows.map((row) => row.id)).toContain(result.entryId);
    expect(voidedTab.rows.some((row) => row.memo.startsWith("Void: "))).toBe(true);
    expect(voidedTab.counts.voided).toBeGreaterThanOrEqual(2);
    const postedTab = await view("posted");
    expect(postedTab.rows.map((row) => row.id)).not.toContain(result.entryId);
    expect(postedTab.rows.map((row) => row.id)).not.toContain(reversed.entryId);
  });
});
