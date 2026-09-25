/**
 * The daily cost log: what one person received and spent in one day.
 *
 * James, 22 Sep: "a daily cost tracker where each employee inputs money
 * received and money spent per day". The shape that matters is the *day*, not
 * the entry. A stream of entries nobody ever closes cannot be checked against
 * anything; a day that someone submits can be. So entries hang off a
 * `CrmDailyLog`, one per person per day, and submitting the log is the act of
 * saying "that was my Tuesday".
 *
 * `logDate` is a DATE and the log is keyed on it, which makes "open today's
 * log" an upsert rather than a find-or-create race. A rep writes Tuesday up on
 * Wednesday morning more often than not, and the entry belongs to Tuesday
 * whatever time zone the phone thinks it is in.
 */

import { Prisma } from "@prisma/client";
import { z } from "zod";

type Tx = Prisma.TransactionClient;

export const CASH_DIRECTIONS = ["RECEIVED", "SPENT"] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export const CASH_DIRECTION_LABELS: Record<CashDirection, string> = {
  RECEIVED: "Received",
  SPENT: "Spent",
};

/**
 * Midnight of the day this instant falls in, as a date-only value.
 *
 * UTC on purpose, and it has to be: the column is a DATE, Prisma sends a
 * timestamp, and anything other than midnight UTC can land the entry on the
 * neighbouring day depending on which machine does the truncating.
 */
export function toLogDate(when: Date | string): Date {
  const date = typeof when === "string" ? new Date(when) : when;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const costEntrySchema = z.object({
  direction: z.enum(CASH_DIRECTIONS),
  category: z.enum([
    "FUEL",
    "AIRTIME",
    "TRANSPORT",
    "MATERIALS",
    "EQUIPMENT",
    "LABOUR",
    "SUBSISTENCE",
    "ACCOMMODATION",
    "OTHER",
  ]),
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(10).default("USD"),
  description: z.string().trim().min(1).max(500),
  /**
   * The day it belongs to. Defaults to today; can be moved back and never
   * forward — a rep writes Tuesday up on Wednesday, and a line for Friday
   * written on Wednesday is a guess.
   */
  date: z.coerce.date().optional(),
  /** Null for airtime and anything else that belongs to no project. */
  projectId: z.string().uuid().nullable().optional(),
  /** Set when the cash came from a requisition, so the float reconciles. */
  requisitionId: z.string().uuid().nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
  receiptPathname: z.string().trim().max(500).nullable().optional(),
  /**
   * Generated on the device. These are written in the field, so the same entry
   * replayed on reconnect must land once rather than doubling the day's spend.
   */
  clientEntryId: z.string().uuid().nullable().optional(),
});

export const openLogSchema = z.object({
  logDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type CostEntryInput = z.infer<typeof costEntrySchema>;

/** The person's log for that day, created if this is the first entry on it. */
export async function openDailyLog(
  tx: Tx,
  companyId: string,
  userId: string,
  when: Date = new Date(),
) {
  const logDate = toLogDate(when);
  return tx.crmDailyLog.upsert({
    where: { companyId_userId_logDate: { companyId, userId, logDate } },
    update: {},
    create: { companyId, userId, logDate },
  });
}

/** A line the day cannot take: a day not yet lived, or one already closed. */
export class CostEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostEntryError";
  }
}

export type AddCostEntryInput = CostEntryInput & {
  companyId: string;
  /** Whose money it is. The line goes on this person's log for the day. */
  userId: string;
  /** What "today" is, so a test is not at the mercy of the clock. */
  now?: Date;
};

/**
 * Record one movement of cash — the only way a spend or income line is ever
 * written.
 *
 * The cost tracker, a requisition's report and a project's "Add spend" all
 * come through here, so there is one ledger of field money rather than three
 * that each add up slightly differently. It opens the person's log for the
 * day if this is the first line on it, which is what lets a requisition's
 * report and a project's spend land on the same day the tracker shows.
 *
 * Refuses a day in the future, and a day already submitted: a day somebody has
 * declared finished and then quietly added to is not a day anybody can check.
 *
 * Idempotent on `clientEntryId` when the device supplies one. Without it the
 * entry is created outright, which is right for the web form: a person typing
 * the same amount twice usually means it happened twice.
 */
export async function addCostEntry(tx: Tx, input: AddCostEntryInput) {
  const { companyId, userId } = input;
  const logDate = toLogDate(input.date ?? input.now ?? new Date());
  if (logDate.getTime() > toLogDate(input.now ?? new Date()).getTime()) {
    throw new CostEntryError("That day has not happened yet. Money is logged on the day it moved.");
  }

  const log = await tx.crmDailyLog.upsert({
    where: { companyId_userId_logDate: { companyId, userId, logDate } },
    update: {},
    create: { companyId, userId, logDate },
  });
  if (log.submittedAt) {
    throw new CostEntryError(
      "That day has been submitted. Ask a manager to reopen it if something is missing.",
    );
  }

  const data = {
    companyId,
    logId: log.id,
    direction: input.direction,
    category: input.category,
    amount: new Prisma.Decimal(input.amount),
    currency: input.currency,
    description: input.description,
    projectId: input.projectId ?? null,
    requisitionId: input.requisitionId ?? null,
    receiptUrl: input.receiptUrl ?? null,
    receiptPathname: input.receiptPathname ?? null,
    clientEntryId: input.clientEntryId ?? null,
  };

  if (!input.clientEntryId) return tx.crmDailyCostEntry.create({ data });

  return tx.crmDailyCostEntry.upsert({
    where: { companyId_clientEntryId: { companyId, clientEntryId: input.clientEntryId } },
    update: {
      // A replay that carries a correction should win; a replay of the same
      // values is a no-op either way.
      direction: data.direction,
      category: data.category,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      projectId: data.projectId,
      requisitionId: data.requisitionId,
      receiptUrl: data.receiptUrl,
      receiptPathname: data.receiptPathname,
    },
    create: data,
  });
}

export type DayTotals = {
  received: Prisma.Decimal;
  spent: Prisma.Decimal;
  /** Received minus spent. What the person should still be holding. */
  balance: Prisma.Decimal;
  entryCount: number;
  /** Entries with no project. Fine for fuel; worth a look on materials. */
  unattributed: number;
  missingReceipts: number;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Add up one day.
 *
 * Takes the entries rather than fetching them so the same arithmetic serves
 * the log page, the daily report and a test, and so the three cannot disagree
 * about what a day came to.
 */
export function dayTotals(
  entries: Array<{
    direction: CashDirection;
    amount: Prisma.Decimal | number;
    projectId: string | null;
    receiptUrl: string | null;
  }>,
): DayTotals {
  let received = ZERO;
  let spent = ZERO;
  let unattributed = 0;
  let missingReceipts = 0;

  for (const entry of entries) {
    const amount = new Prisma.Decimal(entry.amount);
    if (entry.direction === "RECEIVED") received = received.plus(amount);
    else {
      spent = spent.plus(amount);
      // Only spending needs a receipt. Money received is evidenced by the
      // requisition or the customer's own paperwork.
      if (!entry.receiptUrl) missingReceipts += 1;
    }
    if (!entry.projectId) unattributed += 1;
  }

  return {
    received,
    spent,
    balance: received.minus(spent),
    entryCount: entries.length,
    unattributed,
    missingReceipts,
  };
}

/**
 * Close the day.
 *
 * Refuses an empty log. "I moved no money today" is a real answer, but it is
 * one somebody should record as a note rather than by submitting nothing —
 * otherwise an empty submitted log is indistinguishable from a day the person
 * forgot about, which is exactly the distinction the report needs.
 */
export async function submitDailyLog(tx: Tx, companyId: string, logId: string) {
  const log = await tx.crmDailyLog.findFirst({
    where: { id: logId, companyId },
    include: { entries: { select: { id: true } } },
  });
  if (!log) throw new Error("Daily log not found");
  if (log.submittedAt) return log;
  if (log.entries.length === 0 && !log.notes) {
    throw new Error("Add an entry, or a note saying why there was no movement, before submitting.");
  }

  return tx.crmDailyLog.update({
    where: { id: log.id },
    data: { submittedAt: new Date() },
  });
}
