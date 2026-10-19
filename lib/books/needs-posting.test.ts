/**
 * Needs posting: why a money event did not post, in plain words, and the fix
 * that makes it post; against the test database, Map and retry, Post in this
 * month and the close check that now counts waiting money as well as failed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { captureAccountingEvent } from "@/lib/accounting/integration";
import { prisma } from "@/lib/prisma";

import { readClose } from "./close";
import { HELD_UNTIL } from "./core/holds";
import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "./invoice-test-fixtures";
import { explain, needsPostingFinding, readNeedsPosting, sourceWords } from "./needs-posting";
import { mapAndRetry, NeedsPostingRefused, postInThisMonth, retryNeedsPosting } from "./needs-posting-actions";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const failedWith = (lastError: string, extra: Partial<{ nextRetryAt: Date; sourceType: string; status: string }> = {}) =>
  explain({ status: "FAILED", lastError, nextRetryAt: null, sourceType: "RETAIL_GOODS_RECEIPT", ...extra });

describe("why it didn't post, in plain words", () => {
  it("names the missing account and offers to map it", () => {
    expect(failedWith("The event names no moneyAccount to post to", { sourceType: "CRM_REQUISITION_DISBURSEMENT" })).toEqual({
      why: "No money account to post it to",
      fix: { kind: "map", target: "event", key: "moneyAccount", label: "Money account for requisition paid out" },
    });
    expect(failedWith("No account is set for cost of sales")).toEqual({
      why: "No cost of sales account",
      fix: { kind: "map", target: "role", key: "cost of sales", label: "Cost of sales account" },
    });
    expect(failedWith("Tender mapping missing for MOBILE_MONEY")).toMatchObject({ why: "No account for mobile money payments", fix: { kind: "map", target: "tender", key: "MOBILE_MONEY" } });
  });

  it("sends a missing or broken rule to Posting rules", () => {
    expect(failedWith("Posting rule missing for source type CRM_COST_ENTRY_RECEIPT", { sourceType: "CRM_COST_ENTRY_RECEIPT" })).toEqual({
      why: "No rule says where cash received in the cost tracker posts",
      fix: { kind: "rule", label: "Add a rule", href: "/accounting/posting-rules" },
    });
    expect(failedWith("Unbalanced entry (debit 10.00 vs credit 9.00)").why).toBe("Its rule doesn’t balance: 10.00 against 9.00");
    expect(failedWith("Posting rule contains inactive or non-ledger accounts").why).toBe("Its rule posts to an account that is closed or is a heading");
  });

  it("says a held month is closed, and offers this month", () => {
    expect(failedWith("September 2025 is closed, so this was not posted on its own. Post it in this month, or reopen September 2025.", { nextRetryAt: HELD_UNTIL })).toEqual({
      why: "September 2025 is closed",
      fix: { kind: "month", month: "September 2025" },
    });
    expect(failedWith("Posting period is closed and strict lock is enabled.")).toEqual({ why: "Its month is closed", fix: null });
    expect(explain({ status: "PENDING", lastError: null, nextRetryAt: null, sourceType: "SALES_INVOICE" })).toEqual({ why: "Not tried yet", fix: null });
  });

  it("writes the finding and the source in a person's words", () => {
    expect(needsPostingFinding(1, 0, "October")).toEqual({ fact: "1 money event didn’t reach the ledger.", rest: "It holds up October’s close." });
    expect(needsPostingFinding(2, 1, null)).toEqual({ fact: "3 money events didn’t reach the ledger.", rest: null });
    expect(needsPostingFinding(0, 0, null)).toEqual({ fact: "Every money event reached the ledger.", rest: null });
    expect(sourceWords("SALES_INVOICE")).toBe("Sales invoice");
    expect(sourceWords("CRM_REQUISITION_TOPUP")).toBe("Requisition overspend");
  });
});

let fixture: BooksFixture;
const owner = () => ({ companyId: fixture.companyId, userId: fixture.ownerId, role: "SUPERADMIN" });

beforeAll(async () => {
  fixture = await makeBooksFixture("Needs posting");
}, 120_000);

afterAll(async () => {
  if (fixture) await prisma.crmRequisition.deleteMany({ where: { companyId: fixture.companyId } });
  await destroyBooksFixture(fixture);
}, 60_000);

const requisitionEvent = async (no: string, overrides: Record<string, unknown> = {}) => {
  const req = await prisma.crmRequisition.create({
    data: { companyId: fixture.companyId, requisitionNo: no, category: "AIRTIME", purpose: "Airtime for the site team", amount: 30, requestedById: fixture.managerId, status: "DISBURSED", disbursedAt: new Date() },
  });
  const event = await captureAccountingEvent({
    companyId: fixture.companyId,
    sourceDomain: "crm-requisitions",
    sourceAction: "disbursed",
    sourceType: "CRM_REQUISITION_DISBURSEMENT",
    sourceId: req.id,
    sourceSubtype: "AIRTIME",
    entryDate: new Date(),
    amount: 30,
    createdById: fixture.managerId,
  });
  await prisma.accountingIntegrationEvent.update({ where: { id: event.id }, data: overrides });
  return { req, event };
};

describe("the page, against the database", () => {
  it("lists failed money with its document, and waiting money only after an hour", async () => {
    const { req, event } = await requisitionEvent(`REQ-N${fixture.stamp.slice(-5)}-1`, { status: "FAILED", lastError: "The event names no moneyAccount to post to", attemptCount: 3 });
    const fresh = await requisitionEvent(`REQ-N${fixture.stamp.slice(-5)}-2`);
    const old = await requisitionEvent(`REQ-N${fixture.stamp.slice(-5)}-3`, { createdAt: new Date(Date.now() - 2 * 60 * 60_000) });

    const view = await readNeedsPosting(prisma, fixture.companyId, { tab: "failed", q: "", source: "" });
    expect(view.counts).toEqual({ failed: 1, waiting: 1 });
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ id: event.id, ref: req.requisitionNo, title: "Airtime for the site team", href: `/crm/requisitions/${req.id}`, amount: 30, why: "No money account to post it to", held: false });
    expect(view.rows[0]!.tries.count).toBe(3);
    expect(view.finding.fact).toBe("2 money events didn’t reach the ledger.");

    const waiting = await readNeedsPosting(prisma, fixture.companyId, { tab: "waiting", q: "", source: "" });
    expect(waiting.rows.map((row) => row.id)).toEqual([old.event.id]);
    expect(waiting.rows.map((row) => row.id)).not.toContain(fresh.event.id);

    // The month's close counts both.
    const close = await readClose(prisma, fixture.companyId, new Date(Date.now() + 40 * 24 * 60 * 60_000));
    const check = close.closing?.checks.find((one) => one.key === "postings");
    expect(check).toMatchObject({ state: "failed", action: { label: "Needs posting", href: "/books/needs-posting" } });
  });

  it("maps the missing account and posts it there", async () => {
    const { event } = await requisitionEvent(`REQ-N${fixture.stamp.slice(-5)}-4`, { status: "FAILED", lastError: "The event names no moneyAccount to post to" });
    const cash = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "1005" }, select: { id: true } });
    const heading = await prisma.chartOfAccount.findFirst({ where: { companyId: fixture.companyId, nodeType: { not: "LEDGER" } }, select: { id: true } });
    if (heading) await expect(mapAndRetry(owner(), event.id, heading.id)).rejects.toBeInstanceOf(NeedsPostingRefused);

    const before = await trialBalance(fixture.companyId);
    // The event names the account, so the drain's fallback is not what posts it.
    const summary = await mapAndRetry(owner(), event.id, cash.id);
    expect(summary).toMatchObject({ tried: 1, posted: 1 });
    expect((await trialBalance(fixture.companyId))["1005"]).toBe((before["1005"] ?? 0) - 30);
    expect(await prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ status: "POSTED" });
    expect(await prisma.platformAuditEvent.count({ where: { companyId: fixture.companyId, eventType: "books.posting.mapped", entityId: event.id } })).toBe(1);
  });

  it("posts money held for a closed month in this month, and only that way", async () => {
    const { req, event } = await requisitionEvent(`REQ-N${fixture.stamp.slice(-5)}-5`, {
      status: "FAILED",
      nextRetryAt: HELD_UNTIL,
      lastError: "March 2024 is closed, so this was not posted on its own. Post it in this month, or reopen March 2024.",
      entryDate: new Date(Date.UTC(2024, 2, 9)),
    });
    // Retry all leaves it held: it is not even tried.
    const all = await retryNeedsPosting(owner(), null);
    expect(all.held).toBe(0);
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: req.id } })).toBe(0);

    const summary = await postInThisMonth(owner(), event.id);
    expect(summary).toMatchObject({ posted: 1 });
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: fixture.companyId, sourceId: req.id } });
    expect(entry.entryDate.getUTCFullYear()).toBe(new Date().getUTCFullYear());
    await expect(postInThisMonth(owner(), event.id)).rejects.toMatchObject({ status: 400 });
  });
});
