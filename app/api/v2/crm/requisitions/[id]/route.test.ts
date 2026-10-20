/**
 * A CRM requisition through its real route, against the test database, with
 * only the sign-in faked (books-final §4.11, §2.4):
 *
 *   - a draft has no number; Send for approval gives the next in the series,
 *     with the limit and who it waits for, written to ApprovalAction
 *   - nobody approves their own request; over the limit only the owner does
 *   - the approver does not pay where somebody else may; nobody pays their own
 *   - paying out puts it on 1150 Cash advances out of the account chosen;
 *     accounting for it expenses each category out of 1150 and brings the
 *     change back, leaving 1150 at nothing
 *   - a shop's requisition is never moved by these routes
 *   - reopening and reversing are the owner's; the money is mirrored, and
 *     accounting for it again posts afresh
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "@/lib/books/invoice-test-fixtures";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { PATCH } from "./route";
import { POST } from "../route";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let repId: string;
let ecocash: string;
const people: Record<string, { id: string; role: string; name: string }> = {};

beforeAll(async () => {
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  fixture = await makeBooksFixture("CRM requisitions");
  repId = (await prisma.user.create({ data: { email: `rep-${fixture.stamp}@books.test`, name: "Farai Ncube", role: "SALES_REP", companyId: fixture.companyId }, select: { id: true } })).id;
  people.owner = { id: fixture.ownerId, role: "SUPERADMIN", name: "James Nyabadza" };
  people.manager = { id: fixture.managerId, role: "MANAGER", name: "Tendai Moyo" };
  people.rep = { id: repId, role: "SALES_REP", name: "Farai Ncube" };
  const ledger = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "1016" }, select: { id: true } });
  ecocash = (await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "EcoCash", kind: "MOBILE", ledgerAccountId: ledger.id }, select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  if (fixture) {
    const { companyId } = fixture;
    await prisma.notification.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.approvalAction.deleteMany({ where: { companyId } });
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
    await prisma.crmDailyLog.deleteMany({ where: { companyId } });
    await prisma.crmRequisition.deleteMany({ where: { companyId } });
    await prisma.bankTransaction.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prisma.idSequence.deleteMany({ where: { companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

const as = (who: keyof typeof people) =>
  validateSessionMock.mockResolvedValue({ session: { user: { id: people[who].id, companyId: fixture.companyId, role: people[who].role, name: people[who].name, email: `${who}@books.test` } } });

async function act(id: string, body: Record<string, unknown>) {
  const response = await PATCH(
    new NextRequest(`http://crm.test/api/v2/crm/requisitions/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> & { error?: string; requisition?: Record<string, unknown> } };
}

async function raise(body: Record<string, unknown>) {
  const response = await POST(new NextRequest("http://crm.test/api/v2/crm/requisitions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, body: (await response.json()) as { requisition: { id: string; requisitionNo: string | null; status: string } } };
}

async function spend(requisitionId: string, lines: Array<{ category: string; amount: number }>) {
  const log = await prisma.crmDailyLog.upsert({
    where: { companyId_userId_logDate: { companyId: fixture.companyId, userId: repId, logDate: new Date(new Date().toISOString().slice(0, 10)) } },
    create: { companyId: fixture.companyId, userId: repId, logDate: new Date(new Date().toISOString().slice(0, 10)) },
    update: {},
  });
  for (const line of lines) {
    await prisma.crmDailyCostEntry.create({
      data: { companyId: fixture.companyId, logId: log.id, direction: "SPENT", category: line.category as never, amount: line.amount, description: `${line.category} for the Kadoma run`, requisitionId, receiptUrl: "https://slips.test/r.jpg" },
    });
  }
}

const approvals = (entityId: string) =>
  prisma.approvalAction.findMany({ where: { companyId: fixture.companyId, entityId }, orderBy: { actedAt: "asc" }, select: { entityType: true, action: true, actedById: true, note: true } });

describe("a CRM requisition, Draft to Accounted for", () => {
  let id: string;

  it("keeps a draft unnumbered and numbers it when it is sent for approval", async () => {
    as("rep");
    const draft = await raise({ category: "FUEL", purpose: "Diesel and fittings for the Kadoma run", amount: 400 });
    expect(draft.status).toBe(201);
    expect(draft.body.requisition).toMatchObject({ requisitionNo: null, status: "DRAFT" });
    id = draft.body.requisition.id;

    const sent = await act(id, { action: "submit" });
    expect(sent.status).toBe(200);
    expect(sent.body.requisition).toMatchObject({ status: "SUBMITTED", approverId: null });
    expect(String(sent.body.requisition?.requisitionNo)).toMatch(/^REQ-\d{4,}$/);
    expect(Number(sent.body.requisition?.approvalLimit)).toBe(500);
    expect(await approvals(id)).toEqual([{ entityType: "REQUISITION", action: "SUBMIT", actedById: repId, note: null }]);
  });

  it("refuses the requester approving it, then lets a manager under the limit", async () => {
    as("rep");
    expect((await act(id, { action: "decide", approve: true })).status).toBe(403);
    as("manager");
    const approved = await act(id, { action: "decide", approve: true });
    expect(approved.status).toBe(200);
    expect(approved.body.requisition).toMatchObject({ status: "APPROVED", approvedById: fixture.managerId });
    expect((await approvals(id)).map((row) => row.action)).toEqual(["SUBMIT", "APPROVE"]);
  });

  it("keeps the approver from paying it out when someone else may, and puts the money on the advance", async () => {
    as("manager");
    const refused = await act(id, { action: "disburse", bankAccountId: ecocash });
    expect(refused).toMatchObject({ status: 403, body: { error: "You approved this, so somebody else pays it out." } });

    as("owner");
    const paid = await act(id, { action: "disburse", bankAccountId: ecocash });
    expect(paid.status).toBe(200);
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: id },
      include: { lines: { include: { account: { select: { code: true } } } } },
    });
    expect(entry.lines.map((line) => [line.account.code, line.debit, line.credit]).sort()).toEqual([
      ["1016", 0, 400],
      ["1150", 400, 0],
    ]);
    expect(await prisma.bankTransaction.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: id } })).toMatchObject({ bankAccountId: ecocash, amount: 400, direction: "DEBIT" });
  });

  it("accounts for it by category, brings the change back, and leaves nothing on 1150", async () => {
    const before = await trialBalance(fixture.companyId);
    await spend(id, [
      { category: "FUEL", amount: 150 },
      { category: "MATERIALS", amount: 80 },
      { category: "FUEL", amount: 20 },
    ]);
    as("rep");
    const done = await act(id, { action: "acquit" });
    expect(done.status).toBe(200);
    expect(done.body.requisition).toMatchObject({ status: "ACQUITTED" });
    expect(Number(done.body.requisition?.acquittedAmount)).toBe(250);
    expect(Number(done.body.requisition?.changeAmount)).toBe(150);

    const after = await trialBalance(fixture.companyId);
    expect(after["1150"] ?? 0).toBe(0);
    expect((after["5500"] ?? 0) - (before["5500"] ?? 0)).toBe(170);
    expect((after["5530"] ?? 0) - (before["5530"] ?? 0)).toBe(80);
    expect((after["1016"] ?? 0) - (before["1016"] ?? 0)).toBe(150);
    const groups = await prisma.journalEntry.findMany({ where: { companyId: fixture.companyId, sourceType: "REQUISITION_ACQUITTAL", sourceId: { startsWith: `${id}:` } }, select: { sourceId: true } });
    expect(groups.map((row) => row.sourceId).sort()).toEqual([`${id}:FUEL`, `${id}:MATERIALS`]);
    expect(await prisma.bankTransaction.count({ where: { companyId: fixture.companyId, sourceType: "CRM_REQUISITION_REFUND", sourceId: id, direction: "CREDIT", amount: 150 } })).toBe(1);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, status: { in: ["PENDING", "FAILED", "IGNORED"] } } })).toBe(0);
  });

  it("lets only the owner reopen it, mirrors its postings, and posts afresh when accounted for again", async () => {
    as("manager");
    expect((await act(id, { action: "reopen", reason: "Wrong category on a slip" })).status).toBe(403);
    as("owner");
    const reopened = await act(id, { action: "reopen", reason: "Wrong category on a slip" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.requisition).toMatchObject({ status: "DISBURSED" });
    expect((await trialBalance(fixture.companyId))["1150"]).toBe(400);

    as("rep");
    expect((await act(id, { action: "acquit" })).status).toBe(200);
    const tb = await trialBalance(fixture.companyId);
    expect(tb["1150"] ?? 0).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceType: "REQUISITION_ACQUITTAL", sourceId: { startsWith: `${id}:r2:` } } })).toBe(2);
  });
});

describe("the limits and the shop's requisitions", () => {
  it("makes a request over the limit wait for the owner", async () => {
    as("rep");
    const asked = await raise({ category: "EQUIPMENT", purpose: "Floor grinder hire, a week", amount: 900, submit: true });
    expect(asked.body.requisition.status).toBe("SUBMITTED");
    const row = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: asked.body.requisition.id } });
    expect(row.approverId).toBe(fixture.ownerId);

    as("manager");
    expect(await act(row.id, { action: "decide", approve: true })).toMatchObject({ status: 403, body: { error: "Over US$500.00 needs James Nyabadza." } });
    as("owner");
    expect((await act(row.id, { action: "decide", approve: true })).status).toBe(200);
    // The owner approved it, so a manager may pay it out over their limit.
    as("manager");
    expect((await act(row.id, { action: "disburse", bankAccountId: ecocash })).status).toBe(200);
    // A payout reversed by the owner goes back to Approved, with its mirror.
    as("owner");
    const reversed = await act(row.id, { action: "reverse-payout", reason: "Paid from the wrong account" });
    expect(reversed.status).toBe(200);
    expect(reversed.body.requisition).toMatchObject({ status: "APPROVED", bankAccountId: null });
    expect(await prisma.bankTransaction.count({ where: { companyId: fixture.companyId, sourceId: row.id } })).toBe(0);
    as("manager");
    expect((await act(row.id, { action: "disburse", bankAccountId: ecocash })).status).toBe(200);
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceType: "CRM_REQUISITION_DISBURSEMENT", sourceId: `${row.id}:r2` } })).toBe(1);
  });

  it("never moves a shop's requisition", async () => {
    const site = await prisma.site.create({ data: { companyId: fixture.companyId, name: "Avondale shop", code: `AV${fixture.stamp.slice(-4)}` } });
    const retail = await prisma.crmRequisition.create({
      data: { companyId: fixture.companyId, requisitionNo: `REQ-S${fixture.stamp.slice(-5)}`, category: "OTHER", purpose: "Shop float", amount: 50, requestedById: repId, status: "SUBMITTED", siteId: site.id },
    });
    as("owner");
    expect((await act(retail.id, { action: "decide", approve: true })).status).toBe(404);
  });
});
