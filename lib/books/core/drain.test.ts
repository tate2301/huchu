/**
 * The one drain, against the test database: it posts a waiting money event of
 * any source type as that same row, to the money account it was paid from;
 * it waits out the backoff; it holds what is dated in a closed month for a
 * person; and it leaves a shop's deferred retail events to the day's run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { captureAccountingEvent } from "@/lib/accounting/integration";
import { prisma } from "@/lib/prisma";

import { destroyBooksFixture, makeBooksFixture, trialBalance, type BooksFixture } from "../invoice-test-fixtures";
import { drainCompany, dueWhere } from "./drain";
import { HELD_UNTIL } from "./holds";
import { BOOKS_JOBS } from "./jobs";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

let fixture: BooksFixture;
let bankAccountId: string;

beforeAll(async () => {
  fixture = await makeBooksFixture("Drain");
  const cash = await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: fixture.companyId, code: "1005" }, select: { id: true } });
  bankAccountId = (await prisma.bankAccount.create({ data: { companyId: fixture.companyId, name: "Cash box", kind: "CASH", ledgerAccountId: cash.id }, select: { id: true } })).id;
}, 120_000);

afterAll(async () => {
  if (fixture) {
    await prisma.crmRequisition.deleteMany({ where: { companyId: fixture.companyId } });
    await prisma.bankTransaction.deleteMany({ where: { companyId: fixture.companyId } });
  }
  await destroyBooksFixture(fixture);
}, 60_000);

async function requisition(no: string) {
  return prisma.crmRequisition.create({
    data: {
      companyId: fixture.companyId,
      requisitionNo: no,
      category: "TRANSPORT",
      purpose: "Kombi fares to site",
      amount: 80,
      requestedById: fixture.managerId,
      status: "DISBURSED",
      disbursedAt: new Date(),
      bankAccountId,
    },
  });
}

/** As the CRM wrote it before the core: its own domain, no accounts named. */
const captured = (sourceId: string, entryDate = new Date()) =>
  captureAccountingEvent({
    companyId: fixture.companyId,
    sourceDomain: "crm-requisitions",
    sourceAction: "disbursed",
    sourceType: "CRM_REQUISITION_DISBURSEMENT",
    sourceId,
    sourceSubtype: "TRANSPORT",
    entryDate,
    description: "REQ: kombi fares",
    amount: 80,
    currency: "USD",
    createdById: fixture.managerId,
  });

describe("the drain", () => {
  it("is on the tick every 15 minutes", () => {
    expect(BOOKS_JOBS).toEqual([expect.objectContaining({ name: "books-drain", when: { everyMinutes: 15 } })]);
  });

  it("posts a waiting event of any source type as that row, to the account it was paid from", async () => {
    const req = await requisition(`REQ-D${fixture.stamp.slice(-5)}-1`);
    const event = await captured(req.id);
    expect(event.status).toBe("PENDING");
    const before = await trialBalance(fixture.companyId);

    const summary = await drainCompany(fixture.companyId);
    expect(summary).toMatchObject({ posted: 1, failed: 0, held: 0 });

    const row = await prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe("POSTED");
    expect(row.journalEntryId).toBeTruthy();
    // One row for the source, not a second one beside it.
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: fixture.companyId, sourceId: req.id } })).toBe(1);
    const after = await trialBalance(fixture.companyId);
    expect(after["5520"]).toBe((before["5520"] ?? 0) + 80);
    expect(after["1005"]).toBe((before["1005"] ?? 0) - 80);

    // Nothing left for the next tick.
    expect(await drainCompany(fixture.companyId)).toMatchObject({ processed: 0 });
  });

  it("waits out the backoff, and tries again once it has passed", async () => {
    const event = await captureAccountingEvent({
      companyId: fixture.companyId,
      sourceDomain: "crm-daily-costs",
      sourceAction: "received",
      sourceType: "CRM_COST_ENTRY_RECEIPT",
      sourceId: `cost-${fixture.stamp}`,
      entryDate: new Date(),
      amount: 20,
      createdById: fixture.managerId,
    });
    await drainCompany(fixture.companyId);
    const failed = await prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(failed).toMatchObject({ status: "FAILED", attemptCount: 1 });
    expect(failed.lastError).toMatch(/Posting rule missing/);
    expect(failed.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    expect(await drainCompany(fixture.companyId)).toMatchObject({ processed: 0 });
    const later = new Date(failed.nextRetryAt!.getTime() + 1000);
    expect(await drainCompany(fixture.companyId, later)).toMatchObject({ processed: 1, failed: 1 });
    expect(await prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id: event.id } })).toMatchObject({ attemptCount: 2 });
  });

  it("holds money dated in a closed month for a person, and never posts it on its own", async () => {
    const period = await prisma.accountingPeriod.create({
      data: { companyId: fixture.companyId, startDate: new Date(Date.UTC(2025, 1, 1)), endDate: new Date(Date.UTC(2025, 1, 28)), status: "CLOSED" },
    });
    const req = await requisition(`REQ-D${fixture.stamp.slice(-5)}-2`);
    const event = await captured(req.id, new Date(Date.UTC(2025, 1, 14, 9)));
    expect(await drainCompany(fixture.companyId)).toMatchObject({ held: 1, posted: 0 });
    const held = await prisma.accountingIntegrationEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(held).toMatchObject({ status: "FAILED", nextRetryAt: HELD_UNTIL });
    expect(held.lastError).toBe("February 2025 is closed, so this was not posted on its own. Post it in this month, or reopen February 2025.");
    expect(await prisma.journalEntry.count({ where: { companyId: fixture.companyId, sourceId: req.id } })).toBe(0);
    expect(await drainCompany(fixture.companyId, new Date(Date.UTC(2030, 0, 1)))).toMatchObject({ held: 0 });
    await prisma.accountingPeriod.delete({ where: { id: period.id } });
  });

  it("leaves a shop's deferred retail events to the day's run, and takes its failures", async () => {
    const past = new Date(Date.now() - 60_000);
    const deferred = await prisma.accountingIntegrationEvent.create({
      data: { companyId: fixture.companyId, sourceDomain: "accounting", sourceAction: "auto-post", eventKey: `deferred-${fixture.stamp}`, sourceType: "RETAIL_SALE", sourceId: `sale-${fixture.stamp}`, status: "PENDING", nextRetryAt: past },
    });
    const failed = await prisma.accountingIntegrationEvent.create({
      data: { companyId: fixture.companyId, sourceDomain: "accounting", sourceAction: "auto-post", eventKey: `failed-${fixture.stamp}`, sourceType: "RETAIL_SALE", sourceId: `sale2-${fixture.stamp}`, status: "FAILED", attemptCount: 1, nextRetryAt: past },
    });
    const due = await prisma.accountingIntegrationEvent.findMany({ where: dueWhere(new Date(), fixture.companyId), select: { id: true } });
    expect(due.map((row) => row.id)).not.toContain(deferred.id);
    expect(due.map((row) => row.id)).toContain(failed.id);
    await prisma.accountingIntegrationEvent.deleteMany({ where: { id: { in: [deferred.id, failed.id] } } });
  });
});
