import type { RetailPostingSchedule } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { dailySlot } from "@/lib/retail/worker/schedule";

/**
 * When a shop's sales and stock reach the ledger (SET-09, W-65). "With every
 * sale" posts each one as it happens. "At the end of each day" leaves each
 * one's accounting event PENDING with `nextRetryAt` at the next 23:00 on the
 * shop's clock — "not before" is what `nextRetryAt` already means to the
 * drain — and the retail worker's 23:00 run, or "Post now", posts them.
 */

/** The shop-clock time of the daily posting run. */
export const POSTING_RUN_AT = "23:00";

/** A shop with no settings row yet posts at the end of each day, as the row's default does. */
export const DEFAULT_POSTING_SCHEDULE: RetailPostingSchedule = "END_OF_DAY";

/** Whether an accounting source is one of the shop's (a sale, a delivery, a count, a shift …). */
export function isRetailSource(sourceType: string): boolean {
  return sourceType.startsWith("RETAIL_");
}

/** The next daily run strictly after `now`. */
export function nextPostingRun(now: Date): Date {
  const today = dailySlot(now, POSTING_RUN_AT);
  return today > now ? today : dailySlot(new Date(today.getTime() + 24 * 60 * 60_000), POSTING_RUN_AT);
}

export async function retailPostingSchedule(companyId: string): Promise<RetailPostingSchedule> {
  const settings = await prisma.retailPostingSettings.findUnique({
    where: { companyId },
    select: { schedule: true },
  });
  return settings?.schedule ?? DEFAULT_POSTING_SCHEDULE;
}

/**
 * When a retail event captured `now` should post: null to post it now (with
 * every sale), else the next daily run.
 */
export async function retailPostingDeferredUntil(companyId: string, now: Date): Promise<Date | null> {
  return (await retailPostingSchedule(companyId)) === "END_OF_DAY" ? nextPostingRun(now) : null;
}
