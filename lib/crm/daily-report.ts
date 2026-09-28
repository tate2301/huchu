/**
 * The daily report: what one person did in one day, assembled and kept.
 *
 * James, 22 Sep: "a daily report from each employee of the work done and
 * monies which is automatically sent to management".
 *
 * Two decisions worth stating.
 *
 * It is *assembled*, not typed. Everything in it — the visits, the jobs, the
 * tasks, the money — is already in the system because the person did their
 * work in the system. Asking them to retype it at six o'clock produces a
 * report that is late, thin and quietly different from the records it claims
 * to summarise. The one free-text field is the log's own note, which is where
 * the things the system cannot know belong.
 *
 * It is *stored*, not recomputed. Management asking about the 14th three weeks
 * later should get the 14th as it was, not the 14th recomputed against records
 * that have since been edited, reassigned or deleted. That is why `summary` is
 * a JSON column and not a view.
 */

import { Prisma } from "@prisma/client";

import { dayTotals, toLogDate } from "@/lib/crm/daily-log";
import { payableAmount } from "@/lib/crm/requisitions";

type Tx = Prisma.TransactionClient;

/** Money in a stored report: a string, so the cents survive the JSON. */
type Money = string;

export type DailyReportSummary = {
  version: 1;
  date: string;
  person: { id: string; name: string | null; email: string | null };
  visits: Array<{
    id: string;
    title: string;
    status: string;
    clientName: string | null;
    siteName: string | null;
    sectionsAnswered: number;
  }>;
  jobs: Array<{ id: string; title: string; status: string; clientName: string | null }>;
  tasks: { completed: Array<{ id: string; title: string }>; stillOpen: number; overdue: number };
  money: {
    received: Money;
    spent: Money;
    balance: Money;
    entryCount: number;
    missingReceipts: number;
    byCategory: Array<{ category: string; spent: Money }>;
    byProject: Array<{ projectId: string | null; projectName: string | null; spent: Money }>;
  };
  requisitions: {
    raised: Array<{ id: string; requisitionNo: string; category: string; amount: Money; status: string }>;
    outstanding: Money;
  };
  notes: string | null;
  /** Things worth a manager's eye, in plain words. Empty is the normal case. */
  flags: string[];
};

const ZERO = new Prisma.Decimal(0);

function money(value: Prisma.Decimal): Money {
  return value.toFixed(2);
}

/** The half-open window [start, next day) that a calendar day covers in UTC. */
export function dayWindow(when: Date): { start: Date; end: Date } {
  const start = toLogDate(when);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Build one person's report for one day.
 *
 * Reads rather than writes, so it can be shown as a preview before anybody
 * commits to it — a person should be able to see what management will see.
 */
export async function buildDailyReport(
  tx: Tx,
  companyId: string,
  userId: string,
  when: Date,
): Promise<DailyReportSummary> {
  const { start, end } = dayWindow(when);

  const [user, visits, jobs, tasksDone, openTasks, overdueTasks, log, requisitions] =
    await Promise.all([
      tx.user.findFirst({
        where: { id: userId, companyId },
        select: { id: true, name: true, email: true },
      }),
      tx.crmAppointment.findMany({
        where: { companyId, assignedToId: userId, scheduledStart: { gte: start, lt: end } },
        orderBy: { scheduledStart: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          client: { select: { name: true } },
          site: { select: { name: true } },
          _count: { select: { sections: true } },
        },
      }),
      tx.crmWorkOrder.findMany({
        where: {
          companyId,
          assignedToId: userId,
          OR: [
            { scheduledStart: { gte: start, lt: end } },
            { completedAt: { gte: start, lt: end } },
          ],
        },
        orderBy: { scheduledStart: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          client: { select: { name: true } },
        },
      }),
      tx.crmTask.findMany({
        where: { companyId, assignedToId: userId, completedAt: { gte: start, lt: end } },
        select: { id: true, title: true },
        orderBy: { completedAt: "asc" },
      }),
      tx.crmTask.count({
        where: { companyId, assignedToId: userId, status: "OPEN" },
      }),
      tx.crmTask.count({
        where: {
          companyId,
          assignedToId: userId,
          status: "OPEN",
          dueAt: { lt: start },
        },
      }),
      tx.crmDailyLog.findFirst({
        where: { companyId, userId, logDate: start },
        include: {
          entries: {
            select: {
              direction: true,
              amount: true,
              category: true,
              projectId: true,
              receiptUrl: true,
              project: { select: { name: true } },
            },
          },
        },
      }),
      tx.crmRequisition.findMany({
        where: {
          companyId,
          requestedById: userId,
          OR: [
            { createdAt: { gte: start, lt: end } },
            // Still out at the end of the day, whenever it was drawn. A float
            // from Monday that is still unaccounted for on Thursday is the
            // thing a manager most wants to see.
            { status: "DISBURSED" },
          ],
        },
        select: {
          id: true,
          requisitionNo: true,
          category: true,
          status: true,
          amount: true,
          approvedAmount: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const entries = log?.entries ?? [];
  const totals = dayTotals(entries);

  const spentByCategory = new Map<string, Prisma.Decimal>();
  const spentByProject = new Map<string, { name: string | null; total: Prisma.Decimal }>();

  for (const entry of entries) {
    if (entry.direction !== "SPENT") continue;
    const amount = new Prisma.Decimal(entry.amount);
    spentByCategory.set(
      entry.category,
      (spentByCategory.get(entry.category) ?? ZERO).plus(amount),
    );
    const key = entry.projectId ?? "";
    const current = spentByProject.get(key) ?? { name: entry.project?.name ?? null, total: ZERO };
    spentByProject.set(key, { name: current.name, total: current.total.plus(amount) });
  }

  const outstanding = requisitions
    .filter((requisition) => requisition.status === "DISBURSED")
    .reduce<Prisma.Decimal>(
      (total, requisition) => total.plus(payableAmount(requisition)),
      ZERO,
    );

  const flags: string[] = [];
  if (totals.missingReceipts > 0) {
    flags.push(
      totals.missingReceipts === 1
        ? "One spend has no receipt attached."
        : `${totals.missingReceipts} spends have no receipt attached.`,
    );
  }
  if (outstanding.greaterThan(0)) {
    flags.push(`${money(outstanding)} drawn and not yet accounted for.`);
  }
  if (overdueTasks > 0) {
    flags.push(
      overdueTasks === 1 ? "One task is overdue." : `${overdueTasks} tasks are overdue.`,
    );
  }
  if (visits.length === 0 && jobs.length === 0 && entries.length === 0) {
    // Said plainly rather than sent as an empty report that reads like a
    // system fault. A quiet day and a day nobody recorded look identical from
    // the outside, and only the person can tell management which it was.
    flags.push("Nothing was recorded against this day.");
  }

  return {
    version: 1,
    date: start.toISOString().slice(0, 10),
    person: { id: user?.id ?? userId, name: user?.name ?? null, email: user?.email ?? null },
    visits: visits.map((visit) => ({
      id: visit.id,
      title: visit.title,
      status: visit.status,
      clientName: visit.client?.name ?? null,
      siteName: visit.site?.name ?? null,
      sectionsAnswered: visit._count.sections,
    })),
    jobs: jobs.map((job) => ({
      id: job.id,
      title: job.title,
      status: job.status,
      clientName: job.client?.name ?? null,
    })),
    tasks: {
      completed: tasksDone.map((task) => ({ id: task.id, title: task.title })),
      stillOpen: openTasks,
      overdue: overdueTasks,
    },
    money: {
      received: money(totals.received),
      spent: money(totals.spent),
      balance: money(totals.balance),
      entryCount: totals.entryCount,
      missingReceipts: totals.missingReceipts,
      byCategory: [...spentByCategory.entries()]
        .sort((a, b) => b[1].comparedTo(a[1]))
        .map(([category, total]) => ({ category, spent: money(total) })),
      byProject: [...spentByProject.entries()]
        .sort((a, b) => b[1].total.comparedTo(a[1].total))
        .map(([projectId, value]) => ({
          projectId: projectId === "" ? null : projectId,
          projectName: value.name,
          spent: money(value.total),
        })),
    },
    requisitions: {
      raised: requisitions
        .filter((requisition) => requisition.createdAt >= start && requisition.createdAt < end)
        .map((requisition) => ({
          id: requisition.id,
          requisitionNo: requisition.requisitionNo,
          category: requisition.category,
          amount: money(payableAmount(requisition)),
          status: requisition.status,
        })),
      outstanding: money(outstanding),
    },
    notes: log?.notes ?? null,
    flags,
  };
}

/**
 * Build the report and keep it.
 *
 * Upserts on (company, person, day), so regenerating a day the person has
 * since added entries to replaces it rather than leaving two versions of the
 * 14th. `sentAt` is preserved: a report that has already gone to management
 * has gone, and rewriting the record should not pretend otherwise.
 */
export async function saveDailyReport(
  tx: Tx,
  companyId: string,
  userId: string,
  when: Date,
) {
  const summary = await buildDailyReport(tx, companyId, userId, when);
  const reportDate = toLogDate(when);

  return tx.crmDailyReport.upsert({
    where: { companyId_userId_reportDate: { companyId, userId, reportDate } },
    update: { summary: summary as unknown as Prisma.InputJsonValue, generatedAt: new Date() },
    create: {
      companyId,
      userId,
      reportDate,
      summary: summary as unknown as Prisma.InputJsonValue,
    },
  });
}

/** One line for a notification or a subject: what the day amounted to. */
export function reportHeadline(summary: DailyReportSummary): string {
  const parts: string[] = [];
  if (summary.visits.length > 0) {
    parts.push(summary.visits.length === 1 ? "1 visit" : `${summary.visits.length} visits`);
  }
  if (summary.jobs.length > 0) {
    parts.push(summary.jobs.length === 1 ? "1 job" : `${summary.jobs.length} jobs`);
  }
  if (summary.tasks.completed.length > 0) {
    parts.push(`${summary.tasks.completed.length} tasks done`);
  }
  if (summary.money.entryCount > 0) {
    parts.push(`${summary.money.spent} spent`);
  }
  return parts.length === 0 ? "Nothing recorded" : parts.join(", ");
}
