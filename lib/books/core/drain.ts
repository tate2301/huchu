import type { AccountingSourceType, Prisma } from "@prisma/client";

import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { postIntegrationEvent } from "@/lib/accounting/integration";
import { prisma } from "@/lib/prisma";
import { RETAIL_SOURCE_TYPES } from "@/lib/retail/posting-settings";

import { settleAdvances } from "./requisitions";

/**
 * The one drain (books-final §1.1 rule 4): every 15 minutes, every money event
 * still PENDING or FAILED whose "not before" has come, for every source type
 * and every workspace, is posted again. The backoff is the engine's (5
 * minutes, doubling, up to a day). What is held for a person (a closed month)
 * has a "not before" no drain reaches, and stays in Needs posting.
 *
 * A shop's retail events waiting for its end-of-day run (PENDING, never
 * tried, with a "not before") are left to that run, which counts them.
 */

export const DRAIN_EVERY_MINUTES = 15;
/** Per workspace per tick, so one workspace's backlog does not starve the rest. */
const PER_COMPANY = 200;

export function dueWhere(now: Date, companyId?: string): Prisma.AccountingIntegrationEventWhereInput {
  return {
    ...(companyId ? { companyId } : {}),
    sourceType: { not: null },
    sourceId: { not: null },
    status: { in: ["PENDING", "FAILED"] },
    OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    NOT: { status: "PENDING", attemptCount: 0, nextRetryAt: { not: null }, sourceType: { in: RETAIL_SOURCE_TYPES as AccountingSourceType[] } },
  };
}

export type DrainSummary = { companies: number; processed: number; posted: number; skipped: number; failed: number; held: number };

export async function drainCompany(companyId: string, now = new Date(), limit = PER_COMPANY): Promise<Omit<DrainSummary, "companies">> {
  const events = await prisma.accountingIntegrationEvent.findMany({
    where: dueWhere(now, companyId),
    orderBy: [{ nextRetryAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  const summary = { processed: events.length, posted: 0, skipped: 0, failed: 0, held: 0 };
  if (events.length === 0) return summary;
  await ensureAccountingDefaults(companyId);
  for (const event of events) {
    const outcome = await postIntegrationEvent(event, { defaultsReady: true }).catch(async (error: unknown) => {
      await prisma.accountingIntegrationEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          lastError: (error instanceof Error ? error.message : "Posting failed").slice(0, 1000),
          attemptCount: { increment: 1 },
          nextRetryAt: new Date(now.getTime() + 5 * 60_000 * 2 ** Math.min(event.attemptCount, 8)),
        },
      });
      return "failed" as const;
    });
    summary[outcome] += 1;
  }
  // A requisition accounted for before cash advances whose events have just posted: square its advance.
  if (summary.posted > 0) await settleAdvances(companyId).catch((error: unknown) => console.error("[Books] settling cash advances failed:", error));
  return summary;
}

export async function drainAll(now = new Date()): Promise<DrainSummary> {
  const companies = await prisma.accountingIntegrationEvent.findMany({
    where: dueWhere(now),
    distinct: ["companyId"],
    select: { companyId: true },
  });
  const total: DrainSummary = { companies: companies.length, processed: 0, posted: 0, skipped: 0, failed: 0, held: 0 };
  for (const { companyId } of companies) {
    const one = await drainCompany(companyId, now);
    total.processed += one.processed;
    total.posted += one.posted;
    total.skipped += one.skipped;
    total.failed += one.failed;
    total.held += one.held;
  }
  return total;
}

export function drainWords(summary: DrainSummary): string {
  return `${summary.companies} workspaces, ${summary.posted} posted, ${summary.failed} could not post, ${summary.held} held for a closed month`;
}
