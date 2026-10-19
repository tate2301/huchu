/**
 * P1's exit, for the CRM: a requisition disbursed in the CRM now produces a
 * posted journal, out of the money account it was paid from, with its bank
 * transaction, and nothing about it is IGNORED. Through the real route, with
 * only the sign-in faked.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { PATCH } from "@/app/api/v2/crm/requisitions/[id]/route";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let ecocash: string;

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("CRM money");
  const ledger = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "1016" }, select: { id: true } });
  ecocash = (await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "EcoCash", kind: "MOBILE", ledgerAccountId: ledger.id }, select: { id: true } })).id;
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.notification.deleteMany({ where: { companyId: fixture.companyId } }).catch(() => undefined);
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.crmRequisition.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.bankTransaction.deleteMany({ where: { companyId: fixture.companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

async function act(id: string, body: Record<string, unknown>) {
  const response = await PATCH(
    new NextRequest(`http://crm.test/api/v2/crm/requisitions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("a CRM requisition paid out", () => {
  it("posts its journal out of the money account it was paid from, with the bank side", async () => {
    const requisition = await prisma.crmRequisition.create({
      data: {
        companyId: fixture.companyId,
        requisitionNo: `REQ-I${fixture.stamp.slice(-5)}`,
        category: "FUEL",
        purpose: "Diesel for the Kadoma run",
        amount: 400,
        requestedById: fixture.ownerId,
        status: "APPROVED",
        approvedById: fixture.ownerId,
        approvedAt: new Date(),
      },
    });
    const before = await trialBalance(fixture.companyId);

    validateSessionMock.mockResolvedValue({ session: { user: { id: fixture.managerId, companyId: fixture.companyId, role: "MANAGER", name: "Tendai Moyo", email: "t@crm.test" } } });
    const paid = await act(requisition.id, { action: "disburse", bankAccountId: ecocash });
    expect(paid.status).toBe(200);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: requisition.id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    expect(entry.status).toBe("POSTED");
    expect(entry.lines.map((line) => [line.account.code, line.debit, line.credit]).sort()).toEqual([
      ["1016", 0, 400],
      ["5500", 400, 0],
    ]);
    const after = await trialBalance(fixture.companyId);
    expect(after["1010"] ?? 0).toBe(before["1010"] ?? 0);

    const bank = await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: requisition.id } });
    expect(bank).toMatchObject({ bankAccountId: ecocash, amount: 400, direction: "DEBIT", sourceType: "CRM_REQUISITION_DISBURSEMENT" });

    const events = await prisma.accountingIntegrationEvent.findMany({ where: { companyId: fixture.companyId, sourceId: requisition.id } });
    expect(events.map((event) => event.status)).toEqual(["POSTED"]);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, status: "IGNORED", sourceType: { not: null } } })).toBe(0);
  });
});
