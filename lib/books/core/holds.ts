import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Money is never posted into a closed month automatically (books-final §1.1,
 * D14). An event whose date falls in a closed month, or on or before the
 * freeze date, is held: FAILED with the reason in plain words, and a "not
 * before" so far off that no drain takes it. It waits in Needs posting for a
 * person, who posts it in the current month or reopens the month.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The "not before" of a held event: no drain or replay reaches it, only a person. */
export const HELD_UNTIL = new Date("9999-12-31T00:00:00.000Z");

export const isHeld = (nextRetryAt: Date | null | undefined) => Boolean(nextRetryAt && nextRetryAt.getTime() >= HELD_UNTIL.getTime());

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "September 2026". */
export const monthOf = (date: Date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export type Hold = { kind: "closed" | "frozen"; month: string; reason: string };

/** Why money dated `date` may not post on its own, or null when its month is open. */
export async function holdFor(companyId: string, date: Date, db: Db = prisma): Promise<Hold | null> {
  const [period, settings] = await Promise.all([
    db.accountingPeriod.findFirst({
      where: { companyId, startDate: { lte: date }, endDate: { gte: dayStart(date) } },
      orderBy: { startDate: "asc" },
      select: { status: true, startDate: true },
    }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { freezeBeforeDate: true } }),
  ]);
  if (period?.status === "CLOSED") {
    const month = monthOf(period.startDate);
    return { kind: "closed", month, reason: `${month} is closed, so this was not posted on its own. Post it in this month, or reopen ${month}.` };
  }
  if (settings?.freezeBeforeDate && date <= settings.freezeBeforeDate) {
    const month = monthOf(date);
    return { kind: "frozen", month, reason: `The books are frozen up to ${settings.freezeBeforeDate.toISOString().slice(0, 10)}, so this was not posted on its own. Post it in this month.` };
  }
  return null;
}

/** Marks an event held for a person, with the reason. */
export async function holdEvent(eventId: string, hold: Hold, db: Db = prisma) {
  await db.accountingIntegrationEvent.update({
    where: { id: eventId },
    data: { status: "FAILED", lastError: hold.reason, nextRetryAt: HELD_UNTIL },
  });
}
