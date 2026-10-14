import type { AccountingPeriodLockPolicy, PrismaClient } from "@prisma/client";

import { count, dayOf, money, monthName, shortDay, storedDay } from "./format";

/**
 * Books → Periods and the close (design/core-modules/boards/view/PageBooksClose.html):
 * the month due to close next and the five checks it has to pass, every
 * period, and the closing controls. Closing is a person's press, and only
 * once every check passes.
 */

export type CloseCheck = {
  key: "journals" | "vat" | "fiscal" | "trial-balance" | "postings";
  label: string;
  state: "done" | "open" | "failed";
  note: string;
  action: { label: string; href: string } | null;
};

export type PeriodRow = { id: string; name: string; opens: string; closes: string; state: "open" | "closed" | "reopened" };

export type CloseView = {
  finding: { fact: string; rest: string | null };
  /** The month the checks are about: the oldest open period that has ended. */
  closing: { id: string; month: string; checks: CloseCheck[]; ready: boolean } | null;
  periods: PeriodRow[];
  controls: {
    retainedEarningsAccountId: string | null;
    freezeBeforeDate: string | null;
    policy: AccountingPeriodLockPolicy;
    equityAccounts: Array<{ id: string; code: string; name: string }>;
  };
};

export const POLICY_LABEL: Record<AccountingPeriodLockPolicy, string> = {
  STRICT: "Nobody may post",
  MANAGER_OVERRIDE: "Managers may post, with a reason",
  SOFT_WARN: "Anyone may post, with a reason",
};

const fullDay = (date: Date) => {
  const day = storedDay(date);
  return `${shortDay(day)} ${day.slice(0, 4)}`;
};

export function closeFinding(
  closing: { month: string; checks: CloseCheck[] } | null,
  current: { month: string } | null,
): { fact: string; rest: string | null } {
  const taking = current ? `${current.month} is open and taking postings.` : null;
  if (!closing) return { fact: "Nothing is due to close.", rest: taking };
  const left = closing.checks.filter((check) => check.state !== "done").length;
  if (left === 0) return { fact: `${closing.month} is ready to close.`, rest: `Every check passes.${taking ? ` ${taking}` : ""}` };
  return {
    fact: `${closing.month} can’t close yet.`,
    rest: `${left} of the ${closing.checks.length} checks ${left === 1 ? "is" : "are"} still open.${taking ? ` ${taking}` : ""}`,
  };
}

type Db = Pick<
  PrismaClient,
  "accountingPeriod" | "journalEntry" | "journalLine" | "vatReturn" | "fiscalReceipt" | "accountingIntegrationEvent" | "accountingSettings" | "chartOfAccount"
>;

export async function readClose(db: Db, companyId: string, now = new Date()): Promise<CloseView> {
  const today = dayOf(now);
  const [periods, settings, equityAccounts] = await Promise.all([
    db.accountingPeriod.findMany({
      where: { companyId },
      orderBy: { startDate: "desc" },
      take: 36,
      select: { id: true, startDate: true, endDate: true, status: true, reopenedAt: true },
    }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { retainedEarningsAccountId: true, freezeBeforeDate: true, periodLockPolicy: true } }),
    db.chartOfAccount.findMany({
      where: { companyId, type: "EQUITY", nodeType: "LEDGER", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);
  const name = (start: Date) => `FY${start.getUTCFullYear()} · ${monthName(storedDay(start))}`;
  const rows: PeriodRow[] = periods.map((period) => ({
    id: period.id,
    name: name(period.startDate),
    opens: fullDay(period.startDate),
    closes: fullDay(period.endDate),
    state: period.status === "CLOSED" ? "closed" : period.reopenedAt ? "reopened" : "open",
  }));

  const open = periods.filter((period) => period.status === "OPEN").sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const due = open.find((period) => storedDay(period.endDate) < today) ?? null;
  const current = open.find((period) => storedDay(period.startDate) <= today && storedDay(period.endDate) >= today) ?? null;

  let closing: CloseView["closing"] = null;
  if (due) {
    const range = { gte: due.startDate, lte: new Date(`${storedDay(due.endDate)}T23:59:59.999Z`) };
    const month = monthName(storedDay(due.startDate));
    const [drafts, vat, fiscal, firstFiscal, balance, failed] = await Promise.all([
      db.journalEntry.findMany({ where: { companyId, status: "DRAFT", entryDate: range }, select: { lines: { select: { debit: true, credit: true } } } }),
      db.vatReturn.findFirst({
        where: { companyId, periodStart: { lte: due.endDate }, periodEnd: { gte: due.startDate }, status: { not: "VOIDED" } },
        select: { status: true, reviewedAt: true, finalizedAt: true, filedAt: true },
        orderBy: { periodStart: "desc" },
      }),
      db.fiscalReceipt.count({ where: { companyId, status: { in: ["PENDING", "FAILED"] }, createdAt: range } }),
      db.fiscalReceipt.findFirst({
        where: { companyId, status: { in: ["PENDING", "FAILED"] }, createdAt: range },
        select: { invoice: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.journalLine.aggregate({
        where: { entry: { companyId, status: "POSTED", entryDate: { lte: range.lte } } },
        _sum: { debit: true, credit: true },
      }),
      db.accountingIntegrationEvent.groupBy({ by: ["sourceType"], where: { companyId, status: "FAILED", createdAt: range }, _count: true }),
    ]);
    const draftTotal = drafts.reduce((sum, draft) => sum + Math.max(draft.lines.reduce((s, l) => s + l.debit, 0), draft.lines.reduce((s, l) => s + l.credit, 0)), 0);
    const debit = Math.round((balance._sum.debit ?? 0) * 100) / 100;
    const credit = Math.round((balance._sum.credit ?? 0) * 100) / 100;
    const failedCount = failed.reduce((sum, group) => sum + group._count, 0);
    const vatReady = vat && vat.status !== "DRAFT";
    const vatDay = vat?.filedAt ?? vat?.finalizedAt ?? vat?.reviewedAt;
    const vatWord = vat?.status === "FILED" ? "Filed" : vat?.status === "FINALIZED" ? "Finalised" : "Reviewed";
    const checks: CloseCheck[] = [
      {
        key: "journals",
        label: "All journals posted",
        state: drafts.length === 0 ? "done" : "open",
        note: drafts.length === 0 ? "Every journal is posted" : `${drafts.length} still in draft, ${money(draftTotal)}`,
        action: drafts.length === 0 ? null : { label: "Journals", href: "/books/journals?tab=draft" },
      },
      {
        key: "vat",
        label: "VAT return prepared",
        state: vatReady ? "done" : "open",
        note: vatReady ? `${vatWord}${vatDay ? `, ${shortDay(storedDay(vatDay))}` : ""}` : vat ? "In draft, not reviewed" : "Not prepared",
        action: vatReady ? null : { label: "VAT", href: "/books/vat" },
      },
      {
        key: "fiscal",
        label: "Receipts fiscalised",
        state: fiscal === 0 ? "done" : "open",
        note: fiscal === 0 ? "Every receipt reached ZIMRA" : `${count(fiscal, "queued", "queued")}${firstFiscal?.invoice ? `, ${firstFiscal.invoice.invoiceNumber}` : ""}`,
        action: fiscal === 0 ? null : { label: "Retry", href: "/accounting/fiscalisation" },
      },
      {
        key: "trial-balance",
        label: "Trial balance agrees",
        state: Math.abs(debit - credit) < 0.005 ? "done" : "failed",
        note: Math.abs(debit - credit) < 0.005 ? `${money(debit)} each side` : `Out by ${money(Math.abs(debit - credit))}`,
        action: Math.abs(debit - credit) < 0.005 ? null : { label: "Trial balance", href: "/accounting/trial-balance" },
      },
      {
        key: "postings",
        label: "Every posting reached the ledger",
        state: failedCount === 0 ? "done" : "failed",
        note:
          failedCount === 0
            ? "Nothing failed to post"
            : failed.length === 1 && failed[0].sourceType?.startsWith("RETAIL_")
              ? `${failedCount} Tender ${failedCount === 1 ? "sale" : "sales"} failed to post`
              : `${count(failedCount, "posting")} failed`,
        action: failedCount === 0 ? null : { label: "Replay", href: "replay" },
      },
    ];
    closing = { id: due.id, month, checks, ready: checks.every((check) => check.state === "done") };
  }

  return {
    finding: closeFinding(closing, current ? { month: monthName(storedDay(current.startDate)) } : null),
    closing,
    periods: rows,
    controls: {
      retainedEarningsAccountId: settings?.retainedEarningsAccountId ?? null,
      freezeBeforeDate: settings?.freezeBeforeDate ? storedDay(settings.freezeBeforeDate) : null,
      policy: settings?.periodLockPolicy ?? "MANAGER_OVERRIDE",
      equityAccounts,
    },
  };
}
