import type { PrismaClient } from "@prisma/client";

import { reconciliationSummary, type ReconciliationSummary } from "@/lib/books/core/bank";
import { canDo, type BooksActor } from "@/lib/books/core/can-do";

import { count, money, shortDay, storedDay } from "./format";

/**
 * Books → Bank & cash → Reconciliations (BkReconciliation): each account's
 * open reconciliation against its statement (closing date and balance), the
 * book balance, what is still unmatched and the difference; Close at 0.00;
 * the closed ones, which only the owner reopens. The figures are the core's
 * (`reconciliationSummary`), so the page and Close agree.
 */

type Db = PrismaClient;

export type RecTab = "open" | "closed";

export type RecRow = {
  id: string;
  accountId: string;
  account: string;
  currency: string;
  /** "Statement 1 to 16 Oct", or "No statement yet". */
  period: string;
  statementEnd: string | null;
  closingBalance: number | null;
  unmatched: number;
  difference: number | null;
  state: "open" | "ready" | "closed";
  closed: string | null;
};

export type RecDetail = {
  id: string;
  account: string;
  accountId: string;
  currency: string;
  status: ReconciliationSummary["status"];
  statementEnd: string | null;
  statementBalance: number | null;
  bookBalance: number;
  unmatchedCount: number;
  unmatchedSum: number;
  outstanding: number;
  difference: number | null;
  canClose: boolean;
  blocker: string | null;
  /** The lines still to match up to the statement's end: what clears the difference. */
  clears: Array<{ id: string; what: string; amount: number }>;
  closedBy: string | null;
  closedAt: string | null;
};

export type ReconciliationsPage = {
  tab: RecTab;
  finding: { fact: string; rest: string | null };
  counts: Record<RecTab, number>;
  rows: RecRow[];
  accounts: Array<{ id: string; label: string; currency: string }>;
  selected: RecDetail | null;
  closedThisYear: number;
  /** What the person may do here: the server refuses on its own. */
  can: { start: boolean; close: boolean; reopen: boolean; void: boolean; why: { close: string | null; reopen: string | null; void: string | null } };
};

/** "1 to 16 Oct", or "28 Sep to 16 Oct" across months. */
export function rangeWords(start: string, end: string): string {
  if (start === end) return shortDay(end);
  return start.slice(0, 7) === end.slice(0, 7) ? `${Number(start.slice(8))} to ${shortDay(end)}` : `${shortDay(start)} to ${shortDay(end)}`;
}

function permissions(actor: BooksActor | null): ReconciliationsPage["can"] {
  const ask = (action: "bank.match" | "reconciliation.close" | "reconciliation.reopen" | "reconciliation.void") => (actor ? canDo(actor, action, { kind: "bank" }) : { allowed: false as const, reason: "Sign in again." });
  const [start, close, reopen, voided] = [ask("bank.match"), ask("reconciliation.close"), ask("reconciliation.reopen"), ask("reconciliation.void")];
  const why = (decision: { allowed: boolean; reason?: string }) => (decision.allowed ? null : (decision.reason ?? null));
  return { start: start.allowed, close: close.allowed, reopen: reopen.allowed, void: voided.allowed, why: { close: why(close), reopen: why(reopen), void: why(voided) } };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function reconciliationsFinding(rows: RecRow[]): { fact: string; rest: string | null } {
  const open = rows.filter((row) => row.state !== "closed");
  if (open.length === 0) return { fact: "Every account is reconciled.", rest: "Start one when the next statement comes in." };
  const out = open.filter((row) => row.state === "open" && row.difference !== null && Math.abs(row.difference) >= 0.005);
  const ready = open.filter((row) => row.state === "ready");
  const fact = out.length
    ? `${out[0].account} is ${money(Math.abs(out[0].difference!), out[0].currency)} out.`
    : ready.length
      ? `${ready[0].account} is ready to close.`
      : `${count(open.length, "reconciliation")} ${open.length === 1 ? "is" : "are"} open.`;
  const rest = out.length && ready.length ? `${ready[0].account} is ready to close.` : !out.length && ready.length > 1 ? `${ready.length - 1} more ${ready.length - 1 === 1 ? "is" : "are"} ready.` : open.some((row) => row.statementEnd === null) ? "Enter the statement’s closing date and balance to start." : null;
  return { fact, rest };
}

async function detail(db: Db, companyId: string, rec: { id: string; bankAccount: { id: string; name: string; currency: string }; statementEndDate: Date | null; endDate: Date; closedAt: Date | null; closedBy: { name: string } | null }): Promise<RecDetail> {
  const summary = await reconciliationSummary(companyId, rec.id, db);
  const end = rec.statementEndDate ?? rec.endDate;
  const lines = await db.bankStatementLine.findMany({
    where: { reconciliationId: rec.id, matchedTransactionId: null, excludedAt: null, txnDate: { lte: new Date(`${storedDay(end)}T23:59:59.999Z`) } },
    orderBy: { txnDate: "asc" },
    select: { id: true, description: true, amount: true, direction: true },
  });
  const signed = lines.map((line) => ({ id: line.id, what: line.description, amount: line.direction === "CREDIT" ? line.amount : -line.amount }));
  return {
    id: rec.id,
    account: rec.bankAccount.name,
    accountId: rec.bankAccount.id,
    currency: rec.bankAccount.currency.toUpperCase(),
    status: summary.status,
    statementEnd: rec.statementEndDate ? shortDay(storedDay(rec.statementEndDate)) : null,
    statementBalance: rec.statementEndDate ? summary.statementBalance : null,
    bookBalance: summary.bookBalance,
    unmatchedCount: signed.length,
    unmatchedSum: round2(signed.reduce((sum, line) => sum + line.amount, 0)),
    outstanding: summary.outstanding,
    difference: rec.statementEndDate ? summary.difference : null,
    canClose: summary.canClose,
    blocker: summary.blocker,
    clears: signed,
    closedBy: rec.closedBy?.name ?? null,
    closedAt: rec.closedAt ? shortDay(storedDay(rec.closedAt)) : null,
  };
}

export async function readReconciliations(
  db: Db,
  companyId: string,
  { tab = "open", q = "", account = null, selected = null, actor = null }: { tab?: RecTab; q?: string; account?: string | null; selected?: string | null; actor?: BooksActor | null } = {},
  now = new Date(),
): Promise<ReconciliationsPage> {
  const recs = await db.bankReconciliation.findMany({
    where: { companyId, status: { in: ["OPEN", "CLOSED"] } },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      statementEndDate: true,
      statementBalance: true,
      closedAt: true,
      closedBy: { select: { name: true } },
      bankAccount: { select: { id: true, name: true, currency: true } },
    },
    take: 400,
  });
  const openRecs = recs.filter((rec) => rec.status === "OPEN");
  const summaries = new Map(await Promise.all(openRecs.map(async (rec) => [rec.id, await reconciliationSummary(companyId, rec.id, db)] as const)));
  const unmatchedSums = new Map<string, number>();
  if (openRecs.length) {
    const lines = await db.bankStatementLine.findMany({
      where: { reconciliationId: { in: openRecs.map((rec) => rec.id) }, matchedTransactionId: null, excludedAt: null },
      select: { reconciliationId: true },
    });
    for (const line of lines) unmatchedSums.set(line.reconciliationId, (unmatchedSums.get(line.reconciliationId) ?? 0) + 1);
  }
  const all: RecRow[] = recs.map((rec) => {
    const summary = summaries.get(rec.id);
    const end = rec.statementEndDate ? storedDay(rec.statementEndDate) : null;
    const startDay = storedDay(rec.startDate);
    const state: RecRow["state"] = rec.status === "CLOSED" ? "closed" : summary?.canClose ? "ready" : "open";
    return {
      id: rec.id,
      accountId: rec.bankAccount.id,
      account: rec.bankAccount.name,
      currency: rec.bankAccount.currency.toUpperCase(),
      period: end ? `Statement ${rangeWords(startDay, end)}` : "No statement yet",
      statementEnd: end ? shortDay(end) : null,
      closingBalance: end ? rec.statementBalance : null,
      unmatched: rec.status === "OPEN" ? (unmatchedSums.get(rec.id) ?? 0) : 0,
      difference: rec.status === "OPEN" ? (end && summary ? summary.difference : null) : 0,
      state,
      closed: rec.closedAt ? shortDay(storedDay(rec.closedAt)) : null,
    };
  });
  const needle = q.trim().toLowerCase();
  const rows = all.filter((row) => (tab === "open" ? row.state !== "closed" : row.state === "closed") && (!account || row.accountId === account) && (!needle || row.account.toLowerCase().includes(needle)));
  const pick = selected ? recs.find((rec) => rec.id === selected) : tab === "open" ? recs.find((rec) => rec.id === rows[0]?.id) : null;
  const accounts = await db.bankAccount.findMany({ where: { companyId, isActive: true, kind: { in: ["BANK", "MOBILE"] } }, select: { id: true, name: true, currency: true }, orderBy: { name: "asc" } });
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return {
    tab,
    finding: reconciliationsFinding(all),
    counts: { open: all.filter((row) => row.state !== "closed").length, closed: all.filter((row) => row.state === "closed").length },
    rows,
    accounts: accounts.map((row) => ({ id: row.id, label: row.name, currency: row.currency.toUpperCase() })),
    selected: pick ? await detail(db, companyId, pick) : null,
    closedThisYear: recs.filter((rec) => rec.status === "CLOSED" && rec.closedAt && rec.closedAt >= yearStart).length,
    can: permissions(actor),
  };
}
