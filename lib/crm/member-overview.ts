/**
 * One member of the team, as their manager — or they themselves — read them:
 * what they got done in a period, what is outstanding, and their days.
 *
 * Read-only, like everything else that summarises the CRM. Most of it is the
 * same rules the rest of the money pages use, pointed at one person: a float
 * is `payableAmount`, cash not receipted is their share of `receiptGaps`, and
 * a day is the daily report's own builder.
 */

import { Prisma } from "@prisma/client";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { buildDailyReport, type DailyReportSummary } from "@/lib/crm/daily-report";
import { canUser } from "@/lib/crm/permissions";
import { hasCrmFullAccess } from "@/lib/crm/scope";
import { receiptGaps, shareOfGap } from "@/lib/crm/finance";
import { payableAmount } from "@/lib/crm/requisitions";

type Tx = Prisma.TransactionClient;

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);

/** A float out longer than this is overdue for its accounting. */
export const FLOAT_OVERDUE_DAYS = 7;

/** How many days of activity one page shows, newest first. */
export const ACTIVITY_DAYS = 31;

export type MemberScope = {
  companyId: string;
  userId: string;
  /** The first day of the period, as the UTC midnight a daily log is keyed on. */
  from: Date;
  /** The last day, inclusive, in the same terms. */
  to: Date;
  now?: Date;
};

export type OutstandingKind =
  | "task"
  | "follow-up"
  | "requisition"
  | "float"
  | "no-receipt"
  | "not-receipted"
  | "report";

/**
 * One thing outstanding. Flagged means it is this person's to fix and it is
 * late — an overdue task, a float out for more than a week, a spend with no
 * photo, cash not receipted, a day not closed. A requisition waiting for an
 * answer is outstanding too, but it is waiting on somebody else.
 */
export type OutstandingItem = {
  kind: OutstandingKind;
  id: string;
  title: string;
  href: string;
  flagged: boolean;
  /** When it fell due, went out, or happened — whatever makes it late. */
  at: Date | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
  /** How many lines or invoices, where the item stands for several. */
  count: number | null;
};

export type MemberAchievements = {
  dealsWon: number;
  wonValue: Prisma.Decimal;
  wonCurrency: string;
  jobsCompleted: number;
  visitsDone: number;
  spent: Prisma.Decimal;
  received: Prisma.Decimal;
  moneyCurrency: string;
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function taskHref(task: { dealId: string | null; leadId: string | null; clientId: string | null }) {
  if (task.dealId) return `/crm/deals/${task.dealId}`;
  if (task.leadId) return `/crm/leads/${task.leadId}`;
  if (task.clientId) return `/crm/companies/${task.clientId}`;
  return "/crm/follow-ups";
}

/** The currency most rows are in, so a total is added up in one. */
function commonest(currencies: string[], fallback = "USD"): string {
  const tally = new Map<string, number>();
  for (const currency of currencies) tally.set(currency, (tally.get(currency) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? fallback;
}

/**
 * What they got done in the period: deals won and what they were worth, jobs
 * completed, visits done, and the money they spent and took in.
 */
export async function memberAchievements(tx: Tx, scope: MemberScope): Promise<MemberAchievements> {
  const { companyId, userId, from, to } = scope;
  const periodEnd = new Date(to.getTime() + DAY_MS);

  const [won, jobsCompleted, visitsDone, entries] = await Promise.all([
    tx.crmDeal.findMany({
      where: { companyId, assignedToId: userId, status: "WON", wonAt: { gte: from, lt: periodEnd } },
      select: { value: true, currency: true },
    }),
    tx.crmWorkOrder.count({
      where: { companyId, assignedToId: userId, status: "COMPLETED", completedAt: { gte: from, lt: periodEnd } },
    }),
    tx.crmAppointment.count({
      where: {
        companyId,
        assignedToId: userId,
        status: "COMPLETED",
        scheduledStart: { gte: from, lt: periodEnd },
      },
    }),
    tx.crmDailyCostEntry.findMany({
      where: { companyId, log: { userId, logDate: { gte: from, lte: to } } },
      select: { direction: true, amount: true, currency: true },
    }),
  ]);

  const wonCurrency = commonest(won.map((deal) => deal.currency));
  const moneyCurrency = commonest(entries.map((entry) => entry.currency));
  const inMoneyCurrency = entries.filter((entry) => entry.currency === moneyCurrency);

  return {
    dealsWon: won.length,
    wonValue: won
      .filter((deal) => deal.currency === wonCurrency)
      .reduce((sum, deal) => sum.plus(new Prisma.Decimal(deal.value ?? 0)), ZERO)
      .toDecimalPlaces(2),
    wonCurrency,
    jobsCompleted,
    visitsDone,
    spent: inMoneyCurrency
      .filter((entry) => entry.direction === "SPENT")
      .reduce((sum, entry) => sum.plus(entry.amount), ZERO),
    received: inMoneyCurrency
      .filter((entry) => entry.direction === "RECEIVED")
      .reduce((sum, entry) => sum.plus(entry.amount), ZERO),
    moneyCurrency,
  };
}

/**
 * Everything outstanding against this person, flagged items first and the
 * oldest of those first — the one that has waited longest is the one to ask
 * about.
 *
 * Most of it is as it stands now. Spend without a receipt and days not closed
 * are the period's, because those are questions about particular days.
 */
export async function memberOutstanding(tx: Tx, scope: MemberScope): Promise<OutstandingItem[]> {
  const { companyId, userId, from, to } = scope;
  const now = scope.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const floatDeadline = new Date(now.getTime() - FLOAT_OVERDUE_DAYS * DAY_MS);
  const range = `from=${dayKey(from)}&to=${dayKey(to)}`;

  const [tasks, followUps, requisitions, unphotographed, openDays] = await Promise.all([
    tx.crmTask.findMany({
      where: { companyId, assignedToId: userId, status: "OPEN", dueAt: { lt: now } },
      select: { id: true, title: true, dueAt: true, dealId: true, leadId: true, clientId: true },
      orderBy: { dueAt: "asc" },
      take: 50,
    }),
    // The follow-ups the lead flow still writes as rows of their own.
    tx.crmFollowUp.findMany({
      where: { companyId, assignedToId: userId, status: "PENDING", dueAt: { lt: now } },
      select: { id: true, title: true, dueAt: true, dealId: true, leadId: true, clientId: true },
      orderBy: { dueAt: "asc" },
      take: 50,
    }),
    tx.crmRequisition.findMany({
      where: { companyId, requestedById: userId, status: { in: ["SUBMITTED", "APPROVED", "DISBURSED"] } },
      select: {
        id: true,
        requisitionNo: true,
        purpose: true,
        status: true,
        amount: true,
        approvedAmount: true,
        currency: true,
        submittedAt: true,
        approvedAt: true,
        disbursedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.crmDailyCostEntry.findMany({
      where: {
        companyId,
        direction: "SPENT",
        receiptUrl: null,
        log: { userId, logDate: { gte: from, lte: to } },
      },
      select: { amount: true, currency: true },
    }),
    // A day with something on it that was never closed. Today is still open
    // by right, and a day with nothing on it has no report to send.
    tx.crmDailyLog.findMany({
      where: {
        companyId,
        userId,
        submittedAt: null,
        logDate: { gte: from, lte: to, lt: today },
        OR: [{ entries: { some: {} } }, { notes: { not: null } }],
      },
      select: { id: true, logDate: true },
      orderBy: { logDate: "asc" },
    }),
  ]);

  const items: OutstandingItem[] = [];

  for (const task of tasks) {
    items.push({
      kind: "task",
      id: task.id,
      title: task.title,
      href: taskHref(task),
      flagged: true,
      at: task.dueAt,
      amount: null,
      currency: null,
      count: null,
    });
  }
  for (const followUp of followUps) {
    items.push({
      kind: "follow-up",
      id: followUp.id,
      title: followUp.title,
      href: taskHref(followUp),
      flagged: true,
      at: followUp.dueAt,
      amount: null,
      currency: null,
      count: null,
    });
  }
  for (const requisition of requisitions) {
    const float = requisition.status === "DISBURSED";
    items.push({
      kind: float ? "float" : "requisition",
      id: requisition.id,
      title: `${requisition.requisitionNo} · ${requisition.purpose}`,
      href: `/crm/requisitions/${requisition.id}`,
      // Waiting for an answer, or for the cash, is waiting on somebody else.
      // A float out for more than a week is waiting on them.
      flagged: float && requisition.disbursedAt !== null && requisition.disbursedAt < floatDeadline,
      at: float ? requisition.disbursedAt : (requisition.approvedAt ?? requisition.submittedAt),
      amount: payableAmount(requisition),
      currency: requisition.currency,
      count: null,
    });
  }

  if (unphotographed.length > 0) {
    const currency = commonest(unphotographed.map((entry) => entry.currency));
    items.push({
      kind: "no-receipt",
      id: "no-receipt",
      title: "Spend without a receipt photo",
      href: `/crm/cost-tracker?person=${userId}&flag=no-receipt&${range}`,
      flagged: true,
      at: null,
      amount: unphotographed
        .filter((entry) => entry.currency === currency)
        .reduce((sum, entry) => sum.plus(entry.amount), ZERO),
      currency,
      count: unphotographed.length,
    });
  }

  // Their share of cash logged against invoices and not receipted.
  const gaps = [...(await receiptGaps(tx, companyId)).values()];
  if (gaps.length > 0) {
    const collections = await tx.crmDailyCostEntry.findMany({
      where: {
        companyId,
        direction: "RECEIVED",
        invoiceDocumentId: { in: gaps.map((gap) => gap.invoiceDocumentId) },
      },
      select: { invoiceDocumentId: true, amount: true, log: { select: { userId: true } } },
    });
    const byCurrency = new Map<string, { amount: Prisma.Decimal; invoices: number }>();
    for (const gap of gaps) {
      const share = shareOfGap(
        gap.unreceipted,
        collections
          .filter((line) => line.invoiceDocumentId === gap.invoiceDocumentId)
          .map((line) => ({ userId: line.log.userId, amount: line.amount })),
      ).get(userId);
      if (!share || share.isZero()) continue;
      const current = byCurrency.get(gap.currency) ?? { amount: ZERO, invoices: 0 };
      byCurrency.set(gap.currency, { amount: current.amount.plus(share), invoices: current.invoices + 1 });
    }
    for (const [currency, total] of byCurrency) {
      items.push({
        kind: "not-receipted",
        id: `not-receipted-${currency}`,
        title: "Cash collected and not receipted",
        href: `/crm/cost-tracker?person=${userId}&flag=not-receipted`,
        flagged: true,
        at: null,
        amount: total.amount,
        currency,
        count: total.invoices,
      });
    }
  }

  for (const day of openDays) {
    items.push({
      kind: "report",
      id: day.id,
      title: "Day not closed",
      href: `/crm/cost-tracker?person=${userId}&from=${dayKey(day.logDate)}&to=${dayKey(day.logDate)}`,
      flagged: true,
      at: day.logDate,
      amount: null,
      currency: null,
      count: null,
    });
  }

  // Flagged first; within each, the oldest first; undated last.
  return items.sort(
    (a, b) =>
      Number(b.flagged) - Number(a.flagged) ||
      (a.at?.getTime() ?? Number.POSITIVE_INFINITY) - (b.at?.getTime() ?? Number.POSITIVE_INFINITY),
  );
}

export type MemberDay = {
  date: string;
  /** Closed and sent — its report is the one management got. */
  submitted: boolean;
  summary: DailyReportSummary;
};

/**
 * Their days, newest first: what they did and what their money came to.
 *
 * A closed day is shown as the report management got, because a report is
 * stored so that the 14th reads the same three weeks later. A day still open
 * is built fresh by the same builder. Days with nothing on them are left
 * out — a month is mostly working days, and weekends are not news.
 */
export async function memberActivity(tx: Tx, scope: MemberScope): Promise<MemberDay[]> {
  const { companyId, userId, from } = scope;
  const now = scope.now ?? new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = scope.to < today ? scope.to : today;
  if (to < from) return [];
  const start = new Date(Math.max(from.getTime(), to.getTime() - (ACTIVITY_DAYS - 1) * DAY_MS));
  const end = new Date(to.getTime() + DAY_MS);

  // Which days have anything on them, found cheaply before any are built.
  const [visits, jobs, tasks, logs, requisitions, reports] = await Promise.all([
    tx.crmAppointment.findMany({
      where: { companyId, assignedToId: userId, scheduledStart: { gte: start, lt: end } },
      select: { scheduledStart: true },
    }),
    tx.crmWorkOrder.findMany({
      where: {
        companyId,
        assignedToId: userId,
        OR: [{ scheduledStart: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }],
      },
      select: { scheduledStart: true, completedAt: true },
    }),
    tx.crmTask.findMany({
      where: { companyId, assignedToId: userId, completedAt: { gte: start, lt: end } },
      select: { completedAt: true },
    }),
    tx.crmDailyLog.findMany({
      where: {
        companyId,
        userId,
        logDate: { gte: start, lte: to },
        OR: [{ entries: { some: {} } }, { notes: { not: null } }, { submittedAt: { not: null } }],
      },
      select: { logDate: true, submittedAt: true },
    }),
    tx.crmRequisition.findMany({
      where: { companyId, requestedById: userId, createdAt: { gte: start, lt: end } },
      select: { createdAt: true },
    }),
    tx.crmDailyReport.findMany({
      where: { companyId, userId, reportDate: { gte: start, lte: to } },
      select: { reportDate: true, summary: true },
    }),
  ]);

  const inRange = (date: Date | null) => (date && date >= start && date < end ? dayKey(date) : null);
  const days = new Set<string>();
  for (const visit of visits) days.add(dayKey(visit.scheduledStart));
  for (const job of jobs) {
    for (const date of [inRange(job.scheduledStart), inRange(job.completedAt)]) if (date) days.add(date);
  }
  for (const task of tasks) if (task.completedAt) days.add(dayKey(task.completedAt));
  for (const log of logs) days.add(dayKey(log.logDate));
  for (const requisition of requisitions) days.add(dayKey(requisition.createdAt));

  const submitted = new Set(logs.filter((log) => log.submittedAt).map((log) => dayKey(log.logDate)));
  const stored = new Map(
    reports.map((report) => [dayKey(report.reportDate), report.summary as unknown as DailyReportSummary]),
  );
  for (const date of stored.keys()) days.add(date);

  const ordered = [...days].sort().reverse();
  return Promise.all(
    ordered.map(async (date) => ({
      date,
      submitted: submitted.has(date),
      summary:
        (submitted.has(date) ? stored.get(date) : undefined) ??
        (await buildDailyReport(tx, companyId, userId, new Date(`${date}T00:00:00.000Z`))),
    })),
  );
}

/**
 * Whether this session may open this member's page.
 *
 * Their own, always. Anybody's for a manager, or for somebody who may see
 * everybody's money. The page is mostly money and lateness now — floats held,
 * cash not receipted, days not closed — which is a colleague's business only
 * through their manager.
 */
export async function mayOpenMember(session: AuthenticatedSession, memberId: string): Promise<boolean> {
  if (session.user.id === memberId) return true;
  if (hasCrmFullAccess(session.user.role)) return true;
  return canUser(session, "money.view_all");
}
