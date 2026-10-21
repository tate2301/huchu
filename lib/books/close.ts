import type { AccountingPeriodLockPolicy, PrismaClient } from "@prisma/client";

import { reconciledTo } from "./core/bank";
import { revaluationPlan } from "./core/revaluation";
import { count, dayOf, money, monthName, shortDay, storedDay } from "./format";
import { blockingWhere, readNeedsPosting } from "./needs-posting";

/**
 * Books → Close the month (design/books/html/bk-close.html): the month due to
 * close next and its checks, failures first, every period, and the closing
 * controls. Closing is a person's press, and only once every check passes; it
 * posts the period voucher (PCV-YYYY-MM) and stops posting into the month.
 */

export type CloseCheck = {
  key: "journals" | "vat" | "fiscal" | "trial-balance" | "postings" | "reconciled" | "revaluation" | "payroll" | "requisitions" | "fti";
  label: string;
  state: "done" | "open" | "failed";
  note: string;
  action: { label: string; href: string } | null;
};

export type PeriodRow = { id: string; name: string; opens: string; closes: string; state: "open" | "closed" | "reopened"; voucher: string | null };

export type CloseView = {
  finding: { fact: string; rest: string | null };
  /** The month the checks are about: the oldest open period that has ended. Failures come first. */
  closing: { id: string; month: string; title: string; voucher: string; checks: CloseCheck[]; ready: boolean } | null;
  /** When nothing is due: the latest closed month and its voucher. */
  closed: { id: string; month: string; voucher: string } | null;
  periods: PeriodRow[];
  controls: {
    retainedEarningsAccountId: string | null;
    freezeBeforeDate: string | null;
    policy: AccountingPeriodLockPolicy;
    equityAccounts: Array<{ id: string; code: string; name: string }>;
  };
};

export { POLICY_LABEL } from "./close-labels";

const fullDay = (date: Date) => {
  const day = storedDay(date);
  return `${shortDay(day)} ${day.slice(0, 4)}`;
};

/** PCV-2026-09: the voucher a month's close posts. */
export const voucherNumber = (start: Date) => `PCV-${storedDay(start).slice(0, 7)}`;

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export function closeFinding(
  closing: { month: string; checks: CloseCheck[] } | null,
  current: { month: string } | null,
  closed: { month: string; voucher: string } | null = null,
): { fact: string; rest: string | null } {
  if (!closing) {
    if (closed) return { fact: `${closed.month} is closed.`, rest: `Posted as ${closed.voucher}.` };
    return { fact: "Nothing is due to close.", rest: current ? `${current.month} is open and taking postings.` : null };
  }
  const total = closing.checks.length;
  const left = closing.checks.filter((check) => check.state !== "done").length;
  if (left === 0) return { fact: `${total} of ${total} checks pass.`, rest: `${closing.month} is ready to close.` };
  return { fact: `${total - left} of ${total} checks pass.`, rest: `${WORDS[left] ?? left} ${left === 1 ? "blocks" : "block"} the close.` };
}

type Db = Pick<
  PrismaClient,
  | "accountingPeriod"
  | "journalEntry"
  | "journalLine"
  | "vatReturn"
  | "fiscalReceipt"
  | "accountingIntegrationEvent"
  | "accountingSettings"
  | "chartOfAccount"
  | "payrollRun"
  | "crmRequisition"
  | "purchaseBill"
>;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const entryNo = (n: number) => `JE-${String(n).padStart(4, "0")}`;

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
  const name = (start: Date) => `${monthName(storedDay(start))} ${storedDay(start).slice(0, 4)}`;
  const rows: PeriodRow[] = periods.map((period) => ({
    id: period.id,
    name: name(period.startDate),
    opens: fullDay(period.startDate),
    closes: fullDay(period.endDate),
    state: period.status === "CLOSED" ? "closed" : period.reopenedAt ? "reopened" : "open",
    voucher: period.status === "CLOSED" ? voucherNumber(period.startDate) : null,
  }));

  const open = periods.filter((period) => period.status === "OPEN").sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const due = open.find((period) => storedDay(period.endDate) < today) ?? null;
  const current = open.find((period) => storedDay(period.startDate) <= today && storedDay(period.endDate) >= today) ?? null;
  const lastClosed = periods.find((period) => period.status === "CLOSED") ?? null;

  let closing: CloseView["closing"] = null;
  if (due) {
    const range = { gte: due.startDate, lte: new Date(`${storedDay(due.endDate)}T23:59:59.999Z`) };
    const month = monthName(storedDay(due.startDate));
    const lastDay = storedDay(due.endDate);
    const overdueBefore = new Date(range.lte.getTime() - 30 * 86_400_000);
    const [drafts, vat, fiscal, firstFiscal, balance, failed, runs, requisitions, bills] = await Promise.all([
      db.journalEntry.findMany({ where: { companyId, status: "DRAFT", entryDate: range }, select: { lines: { select: { debit: true, credit: true } } } }),
      db.vatReturn.findFirst({
        where: { companyId, periodStart: { lte: due.endDate }, periodEnd: { gte: due.startDate }, status: { not: "VOIDED" } },
        select: { status: true, reviewedAt: true, finalizedAt: true, filedAt: true },
        orderBy: { periodStart: "desc" },
      }),
      db.fiscalReceipt.count({ where: { companyId, status: { in: ["PENDING", "FAILED"] }, createdAt: range } }),
      db.fiscalReceipt.findFirst({
        where: { companyId, status: { in: ["PENDING", "FAILED"] }, createdAt: range },
        select: { createdAt: true, invoice: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.journalLine.aggregate({
        where: { entry: { companyId, status: "POSTED", entryDate: { lte: range.lte } } },
        _sum: { debit: true, credit: true },
      }),
      // What blocks the close: every FAILED event, and PENDING for over an hour (books-final §1.1 rule 5).
      db.accountingIntegrationEvent.groupBy({ by: ["sourceType", "status"], where: blockingWhere(companyId, now, range), _count: true }),
      db.payrollRun.findMany({
        where: { companyId, period: { endDate: range }, status: { not: "REJECTED" } },
        select: { status: true, journalEntryId: true, postingSkippedReason: true, period: { select: { periodKey: true } } },
      }),
      db.crmRequisition.count({ where: { companyId, status: "DISBURSED", acquittedAt: null, disbursedAt: { lte: overdueBefore } } }),
      db.purchaseBill.count({ where: { companyId, billDate: range, status: { in: ["RECEIVED", "PAID"] }, supplierFtiNumber: { not: null }, fdmsStatus: "NOT_CHECKED" } }),
    ]);
    const draftTotal = drafts.reduce((sum, draft) => sum + Math.max(draft.lines.reduce((s, l) => s + l.debit, 0), draft.lines.reduce((s, l) => s + l.credit, 0)), 0);
    const debit = Math.round((balance._sum.debit ?? 0) * 100) / 100;
    const credit = Math.round((balance._sum.credit ?? 0) * 100) / 100;
    const failedCount = failed.reduce((sum, group) => sum + group._count, 0);
    const waitingCount = failed.filter((group) => group.status === "PENDING").reduce((sum, group) => sum + group._count, 0);
    const vatReady = vat && vat.status !== "DRAFT";
    const vatDay = vat?.filedAt ?? vat?.finalizedAt ?? vat?.reviewedAt;
    const vatWord = vat?.status === "FILED" ? "Filed" : vat?.status === "FINALIZED" ? "Finalised" : "Reviewed";
    const unposted = runs.filter((run) => run.status !== "POSTED" || (!run.journalEntryId && !run.postingSkippedReason));

    // One failed event reads as a sentence: who, how much, and why.
    let postingNote = "";
    if (failedCount > 0 && waitingCount === failedCount) postingNote = `${count(failedCount, "posting")} waiting over an hour`;
    else if (failedCount === 1) {
      const view = await readNeedsPosting(db as unknown as Parameters<typeof readNeedsPosting>[0], companyId, { tab: "failed", q: "", source: "" }, now).catch(() => null);
      const row = view?.rows[0];
      postingNote = row ? `1 failed: ${[row.title, row.amount === null ? null : money(row.amount, row.currency), lowerFirst(row.why)].filter(Boolean).join(", ")}` : "1 failed to post";
    } else if (failedCount > 1 && failed.length === 1 && failed[0].sourceType?.startsWith("RETAIL_")) postingNote = `${failedCount} Tender sales failed to post`;
    else if (failedCount > 1) postingNote = `${failedCount} failed to post`;

    const checks: CloseCheck[] = [
      {
        key: "postings",
        label: "Nothing failed to post",
        state: failedCount === 0 ? "done" : "failed",
        note: postingNote,
        action: failedCount === 0 ? null : { label: "Fix it", href: "/books/needs-posting" },
      },
      {
        key: "fiscal",
        label: "No fiscal document unsigned",
        state: fiscal === 0 ? "done" : "failed",
        note:
          fiscal === 0
            ? ""
            : fiscal === 1 && firstFiscal?.invoice
              ? `${firstFiscal.invoice.invoiceNumber}, queued on ${shortDay(storedDay(firstFiscal.createdAt))}`
              : `${fiscal} unsigned${firstFiscal?.invoice ? `, from ${firstFiscal.invoice.invoiceNumber}` : ""}`,
        action: fiscal === 0 ? null : { label: "Retry", href: "/books/fiscal?tab=failed" },
      },
      ...(await bankAndRevaluationChecks(db, companyId, lastDay)),
      {
        key: "payroll",
        label: `Payroll for ${month} posted`,
        state: unposted.length === 0 ? "done" : "open",
        note: runs.length === 0 ? `No run in ${month}` : unposted.length === 0 ? `Run ${runs[0].period.periodKey}` : `${count(unposted.length, "run")} not posted, ${unposted[0].period.periodKey}`,
        action: unposted.length === 0 ? null : { label: "Payroll", href: "/payroll" },
      },
      {
        key: "vat",
        label: `VAT return for ${month} reviewed and tied out`,
        state: vatReady ? "done" : "open",
        note: vatReady ? `${vatWord}${vatDay ? `, ${shortDay(storedDay(vatDay))}` : ""}` : vat ? "In draft, not reviewed" : "Not prepared",
        action: vatReady ? null : { label: "VAT", href: "/books/vat" },
      },
      {
        key: "journals",
        label: "No drafts older than the month",
        state: drafts.length === 0 ? "done" : "open",
        note: drafts.length === 0 ? "" : `${drafts.length} still in draft, ${money(draftTotal)}`,
        action: drafts.length === 0 ? null : { label: "Journals", href: "/books/journals?tab=draft" },
      },
      {
        key: "requisitions",
        label: "Requisitions over 30 days not accounted for",
        state: requisitions === 0 ? "done" : "open",
        note: requisitions === 0 ? "" : `${requisitions} paid out and not accounted for`,
        action: requisitions === 0 ? null : { label: "Requisitions", href: "/books/requisitions" },
      },
      {
        key: "fti",
        label: "Bills with an FTI not checked on FDMS",
        state: bills === 0 ? "done" : "open",
        note: bills === 0 ? `None in ${month}` : `${bills} in ${month}`,
        action: bills === 0 ? null : { label: "Bills", href: "/books/bills" },
      },
      {
        key: "trial-balance",
        label: "Trial balance balances",
        state: Math.abs(debit - credit) < 0.005 ? "done" : "failed",
        note: Math.abs(debit - credit) < 0.005 ? `${money(debit)} each side` : `Out by ${money(Math.abs(debit - credit))}`,
        action: Math.abs(debit - credit) < 0.005 ? null : { label: "Trial balance", href: "/books/trial-balance" },
      },
    ];
    // Failures first: what blocks the close leads, each in the order it was checked.
    const ordered = [...checks.filter((check) => check.state !== "done"), ...checks.filter((check) => check.state === "done")];
    closing = { id: due.id, month, title: name(due.startDate), voucher: voucherNumber(due.startDate), checks: ordered, ready: ordered.every((check) => check.state === "done") };
  }
  const closed = !closing && lastClosed ? { id: lastClosed.id, month: monthName(storedDay(lastClosed.startDate)), voucher: voucherNumber(lastClosed.startDate) } : null;

  return {
    finding: closeFinding(closing, current ? { month: monthName(storedDay(current.startDate)) } : null, closed),
    closing,
    closed,
    periods: rows,
    controls: {
      retainedEarningsAccountId: settings?.retainedEarningsAccountId ?? null,
      freezeBeforeDate: settings?.freezeBeforeDate ? storedDay(settings.freezeBeforeDate) : null,
      policy: settings?.periodLockPolicy ?? "MANAGER_OVERRIDE",
      equityAccounts,
    },
  };
}

/**
 * Every money account reconciled to the month's last day or later
 * (`reconciledTo`; cash is counted instead), and the month-end rate present
 * with the revaluation posted where anything is held in another currency
 * (`revaluationPlan`).
 */
export async function bankAndRevaluationChecks(db: Pick<PrismaClient, "journalEntry">, companyId: string, lastDay: string): Promise<CloseCheck[]> {
  const month = lastDay.slice(0, 7);
  const [accounts, posted, plan] = await Promise.all([
    reconciledTo(companyId, new Date(`${lastDay}T00:00:00.000Z`)),
    db.journalEntry.findFirst({
      where: { companyId, sourceType: "FX_REVALUATION", sourceId: `reval:${month}`, voidedAt: null },
      select: { entryNumber: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
    }),
    revaluationPlan(companyId, month).catch(() => null),
  ]);
  const behind = accounts.filter((account) => !account.reconciled);
  const reconciled: CloseCheck = {
    key: "reconciled",
    label: `Every money account reconciled to ${shortDay(lastDay)} or later`,
    state: behind.length === 0 ? "done" : "open",
    note:
      behind.length === 0
        ? accounts.length === 0
          ? "No bank or wallet account"
          : `${accounts.length} of ${accounts.length}`
        : behind.length === 1
          ? `${behind[0].name}${behind[0].reconciledTo ? `, reconciled to ${shortDay(behind[0].reconciledTo)}` : ", never reconciled"}`
          : `${behind.length} of ${accounts.length} not reconciled to ${shortDay(lastDay)}`,
    action: behind.length === 0 ? null : { label: "Reconcile", href: "/books/reconciliations" },
  };
  const label = `Rates for ${shortDay(lastDay)} present, revaluation posted`;
  const nothing = plan !== null && plan.items.length === 0;
  const missing = plan !== null && plan.missingRates.length > 0;
  let revaluation: CloseCheck;
  if (posted) {
    const gain = (posted.lines ?? []).filter((line) => line.account.code === "4220").reduce((sum, line) => sum + line.credit - line.debit, 0);
    const [currency, rate] = Object.entries(plan?.rates ?? {})[0] ?? [];
    const words = [currency && rate ? `${currency} at ${rate}` : null, Math.abs(gain) < 0.005 ? null : `${gain > 0 ? "gain" : "loss"} ${money(Math.abs(gain))}`, entryNo(posted.entryNumber)];
    revaluation = { key: "revaluation", label, state: "done", note: words.filter(Boolean).join(", "), action: null };
  } else if (nothing) {
    revaluation = { key: "revaluation", label, state: "done", note: "Nothing held in another currency", action: null };
  } else {
    revaluation = {
      key: "revaluation",
      label,
      state: "open",
      note: missing && plan ? `No ${plan.missingRates.join(", ")} rate for ${shortDay(lastDay)}` : "Not posted yet",
      action: { label: missing ? "Enter a rate" : "Revalue", href: `/books/rates?month=${month}` },
    };
  }
  return [reconciled, revaluation];
}
