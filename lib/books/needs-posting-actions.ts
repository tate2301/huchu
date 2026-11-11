import type { RetailAccountRole } from "@prisma/client";

import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { postIntegrationEvent } from "@/lib/accounting/integration";
import { ROLE_WORDS } from "@/lib/accounting/posting";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, type BooksActor } from "./core/can-do";
import { isHeld } from "./core/holds";
import { explain, tabWhere } from "./needs-posting";

/**
 * What a person does in Needs posting: Retry (one, or every one), map the
 * account a posting is missing and retry, or post money held for a closed
 * month in this month instead (the owner, D14). Each goes through the same
 * engine the drain does; nothing is posted into a closed month here either.
 */

export class NeedsPostingRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "NeedsPostingRefused";
  }
}

export type RetrySummary = { tried: number; posted: number; failed: number; held: number };

type Outcome = Awaited<ReturnType<typeof postIntegrationEvent>>;

async function post(ids: string[], actor: BooksActor): Promise<RetrySummary> {
  const events = await prisma.accountingIntegrationEvent.findMany({ where: { id: { in: ids }, companyId: actor.companyId } });
  const summary: RetrySummary = { tried: events.length, posted: 0, failed: 0, held: 0 };
  if (events.length === 0) return summary;
  await ensureAccountingDefaults(actor.companyId);
  for (const event of events) {
    const outcome: Outcome = await postIntegrationEvent(event, { actorRole: actor.role, defaultsReady: true }).catch(() => "failed" as const);
    if (outcome === "posted" || outcome === "skipped") summary.posted += 1;
    else if (outcome === "held") summary.held += 1;
    else summary.failed += 1;
  }
  return summary;
}

/** Retry the ones named, or every failed and waiting one that is not held for a closed month. */
export async function retryNeedsPosting(actor: BooksActor, ids: string[] | null, now = new Date()): Promise<RetrySummary> {
  const rows = await prisma.accountingIntegrationEvent.findMany({
    where: { AND: [{ OR: [tabWhere(actor.companyId, "failed", now), tabWhere(actor.companyId, "waiting", now)] }, ids ? { id: { in: ids } } : {}] },
    select: { id: true, nextRetryAt: true },
    take: 500,
  });
  // A held one only moves when its month reopens or the owner moves it into this one.
  return post(rows.filter((row) => ids || !isHeld(row.nextRetryAt)).map((row) => row.id), actor);
}

/** Sets the account the posting is missing, then retries it and every one that failed the same way. */
export async function mapAndRetry(actor: BooksActor, eventId: string, accountId: string): Promise<RetrySummary> {
  const event = await prisma.accountingIntegrationEvent.findFirst({ where: { id: eventId, companyId: actor.companyId } });
  if (!event || !event.sourceType) throw new NeedsPostingRefused("That posting is not here any more.", 404);
  const { fix } = explain({ status: event.status, lastError: event.lastError, nextRetryAt: event.nextRetryAt, sourceType: event.sourceType });
  if (fix?.kind !== "map") throw new NeedsPostingRefused("This posting is not missing an account.", 400);
  const account = await prisma.chartOfAccount.findFirst({
    where: { id: accountId, companyId: actor.companyId, isActive: true, nodeType: "LEDGER" },
    select: { id: true, code: true, name: true },
  });
  if (!account) throw new NeedsPostingRefused("Choose an open account that takes postings, not a heading.", 400);

  let same: string[] = [event.id];
  if (fix.target === "event") {
    let payload: Record<string, unknown> = {};
    try {
      payload = event.payloadJson ? (JSON.parse(event.payloadJson) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    const accounts = { ...((payload.accounts as Record<string, unknown> | undefined) ?? {}), [fix.key]: account.id };
    await prisma.accountingIntegrationEvent.update({ where: { id: event.id }, data: { payloadJson: JSON.stringify({ ...payload, accounts }) } });
  } else {
    if (fix.target === "role") {
      const role = (Object.entries(ROLE_WORDS) as Array<[RetailAccountRole, string]>).find(([, word]) => word === fix.key)?.[0];
      if (!role) throw new NeedsPostingRefused("This posting is not missing an account.", 400);
      await prisma.retailAccountRoleMapping.upsert({
        where: { companyId_role: { companyId: actor.companyId, role } },
        update: { accountId: account.id },
        create: { companyId: actor.companyId, role, accountId: account.id },
      });
    } else {
      await prisma.tenderAccountMapping.create({ data: { companyId: actor.companyId, tenderType: fix.key, clearingAccountId: account.id, isActive: true } });
    }
    // Every posting that failed for the same missing account goes again with it.
    const others = await prisma.accountingIntegrationEvent.findMany({
      where: { companyId: actor.companyId, status: { in: ["FAILED", "PENDING"] }, lastError: event.lastError },
      select: { id: true, nextRetryAt: true },
    });
    same = [...new Set([event.id, ...others.filter((row) => !isHeld(row.nextRetryAt)).map((row) => row.id)])];
  }

  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: "books.posting.mapped",
    entityType: "AccountingIntegrationEvent",
    entityId: event.id,
    payload: { by: auditActor(actor), target: fix.target, key: fix.key, account: { id: account.id, code: account.code, name: account.name }, sourceType: event.sourceType, sourceId: event.sourceId },
  });
  return post(same, actor);
}

/** Money held for a closed month, posted in this month instead: dated today, then posted. The owner's. */
export async function postInThisMonth(actor: BooksActor, eventId: string, now = new Date()): Promise<RetrySummary> {
  const event = await prisma.accountingIntegrationEvent.findFirst({ where: { id: eventId, companyId: actor.companyId } });
  if (!event) throw new NeedsPostingRefused("That posting is not here any more.", 404);
  if (!isHeld(event.nextRetryAt)) throw new NeedsPostingRefused("This posting is not held for a closed month. Retry it instead.", 400);
  await prisma.accountingIntegrationEvent.update({
    where: { id: event.id },
    data: { entryDate: now, status: "PENDING", nextRetryAt: null, lastError: null },
  });
  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: "books.posting.redated",
    entityType: "AccountingIntegrationEvent",
    entityId: event.id,
    reason: event.lastError ?? undefined,
    payload: { by: auditActor(actor), was: event.entryDate?.toISOString() ?? null, now: now.toISOString(), sourceType: event.sourceType, sourceId: event.sourceId },
  });
  return post([event.id], actor);
}

/**
 * Permanently removes unposted integration event(s) and deletes the row(s).
 * Clears any source accountingStatus (e.g. SchoolFee records) so they are no longer marked failed.
 */
export async function deleteNeedsPosting(actor: BooksActor, ids: string[]): Promise<{ deleted: number }> {
  if (!ids.length) return { deleted: 0 };

  const events = await prisma.accountingIntegrationEvent.findMany({
    where: { id: { in: ids }, companyId: actor.companyId },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      status: true,
      journalEntryId: true,
      description: true,
    },
  });

  if (events.length === 0) {
    if (ids.length === 1) throw new NeedsPostingRefused("That posting is not here any more.", 404);
    return { deleted: 0 };
  }

  const posted = events.filter((e) => e.status === "POSTED" || e.journalEntryId !== null);
  if (posted.length > 0) {
    throw new NeedsPostingRefused("Cannot delete an event that has already been posted to the ledger.", 400);
  }

  const deleteIds = events.map((e) => e.id);

  // If any source document tracks accountingStatus (e.g. SchoolFee tables), reset them to NOT_REQUIRED
  const schoolFeeIds = events
    .filter((e) => e.sourceType && e.sourceType.startsWith("SCHOOL_") && e.sourceId)
    .map((e) => e.sourceId!);

  if (schoolFeeIds.length > 0) {
    await Promise.all([
      prisma.schoolFeeInvoice.updateMany({
        where: { id: { in: schoolFeeIds }, companyId: actor.companyId, accountingStatus: { in: ["FAILED", "PENDING"] } },
        data: { accountingStatus: "NOT_REQUIRED", accountingError: null },
      }),
      prisma.schoolFeeReceipt.updateMany({
        where: { id: { in: schoolFeeIds }, companyId: actor.companyId, accountingStatus: { in: ["FAILED", "PENDING"] } },
        data: { accountingStatus: "NOT_REQUIRED", accountingError: null },
      }),
      prisma.schoolFeeRefund.updateMany({
        where: { id: { in: schoolFeeIds }, companyId: actor.companyId, accountingStatus: { in: ["FAILED", "PENDING"] } },
        data: { accountingStatus: "NOT_REQUIRED", accountingError: null },
      }),
    ]);
  }

  const result = await prisma.accountingIntegrationEvent.deleteMany({
    where: { id: { in: deleteIds }, companyId: actor.companyId },
  });

  for (const event of events) {
    await writePlatformAuditEvent({
      companyId: actor.companyId,
      actorId: actor.userId,
      eventType: "books.posting.deleted",
      entityType: "AccountingIntegrationEvent",
      entityId: event.id,
      payload: {
        by: auditActor(actor),
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        description: event.description,
        status: event.status,
      },
    });
  }

  return { deleted: result.count };
}
