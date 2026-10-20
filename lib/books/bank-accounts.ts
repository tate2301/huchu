import type { MoneyAccountKind, PrismaClient } from "@prisma/client";

import { reconciliationSummary } from "@/lib/books/core/bank";
import { resolveBaseCurrency } from "@/lib/money";

import { KIND_LABEL, type AccountKindKey } from "./bank-labels";
import { count, money, shortDay, storedDay } from "./format";
import { isMoneyIn } from "./money";

/**
 * Books → Bank & cash → Accounts (BkAccounts) and one account (BkAccount):
 * each money account's balance in its own currency and in the base, when it
 * was last reconciled and how many statement lines wait to be matched; one
 * account's bank transactions with the running balance, its statement lines
 * and its reconciliations. Balances are the account's opening balance and
 * every bank transaction, the way the reconciliation reads them.
 */

type Db = PrismaClient;

export type { AccountKindKey };
export { KIND_LABEL };
export const KIND_OF: Record<MoneyAccountKind, AccountKindKey> = { BANK: "bank", MOBILE: "mobile", CASH: "cash" };
const KIND_ORDER: AccountKindKey[] = ["bank", "mobile", "cash"];

export type AccountRow = {
  id: string;
  name: string;
  /** "Ending 4471 · 1010". */
  sub: string;
  kind: AccountKindKey;
  currency: string;
  balance: number;
  /** In the base currency, for an account in another; null when it is the base or there is no rate. */
  inBase: number | null;
  lastReconciled: string | null;
  toMatch: number;
};

export type AccountsPage = {
  baseCurrency: string;
  finding: { fact: string; rest: string | null };
  rows: AccountRow[];
  counts: Record<"all" | AccountKindKey, number>;
  sums: { inBase: number; byCurrency: Array<{ currency: string; total: number }> };
  /** "ZWG at 27.00 today". */
  rateNote: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** "Ending 4471 · 1010": the account number's last four and its ledger code. */
export function accountSub(accountNumber: string | null, code: string | null, kind: AccountKindKey): string {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  const parts = [digits.length >= 4 ? `${kind === "mobile" ? "Merchant" : "Ending"} ${digits.slice(-4)}` : null, code].filter(Boolean);
  return parts.length ? parts.join(" · ") : KIND_LABEL[kind];
}

/** The finding: what is held today, and the account with the most lines to match. */
export function accountsFinding(rows: AccountRow[], baseCurrency: string): { fact: string; rest: string | null } {
  if (rows.length === 0) return { fact: "No money account yet.", rest: "Money accounts are set up in Management." };
  const kinds = new Set(rows.map((row) => row.kind));
  const where = [kinds.has("bank") ? "bank" : null, kinds.has("mobile") ? "EcoCash" : null, kinds.has("cash") ? "cash" : null].filter(Boolean) as string[];
  const place = where.length > 1 ? `${where.slice(0, -1).join(", ")} and ${where.at(-1)}` : where[0];
  const total = round2(rows.reduce((sum, row) => sum + (row.currency === baseCurrency ? row.balance : (row.inBase ?? 0)), 0));
  const fact = `${money(total, baseCurrency)} is in your ${place} today.`;
  const most = [...rows].sort((a, b) => b.toMatch - a.toMatch)[0];
  if (!most || most.toMatch === 0) return { fact, rest: "Every statement line is matched." };
  return { fact, rest: `${most.name} has ${count(most.toMatch, "line")} to match.` };
}

async function ledgerCodes(db: Db, companyId: string, ids: Array<string | null>) {
  const wanted = ids.filter((id): id is string => Boolean(id));
  const [own, fallback] = await Promise.all([
    wanted.length ? db.chartOfAccount.findMany({ where: { companyId, id: { in: wanted } }, select: { id: true, code: true } }) : [],
    db.chartOfAccount.findFirst({ where: { companyId, code: "1010", nodeType: "LEDGER" }, select: { code: true } }),
  ]);
  const byId = new Map(own.map((row) => [row.id, row.code]));
  return (id: string | null, kind: AccountKindKey) => (id ? (byId.get(id) ?? null) : kind === "bank" ? (fallback?.code ?? null) : null);
}

/** The latest rate per currency, as quote units per one base unit. */
export async function latestRates(db: Db, companyId: string, baseCurrency: string, on = new Date()) {
  const rows = await db.currencyRate.findMany({
    where: { companyId, baseCurrency, effectiveDate: { lte: on }, rate: { gt: 0 } },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { quoteCurrency: true, rate: true, effectiveDate: true },
    take: 50,
  });
  const rates = new Map<string, { rate: number; day: string }>();
  for (const row of rows) if (!rates.has(row.quoteCurrency)) rates.set(row.quoteCurrency, { rate: row.rate, day: storedDay(row.effectiveDate) });
  return rates;
}

/** Each money account's movements in its own currency, from its bank transactions. */
export async function balances(db: Db, companyId: string, ids: string[]) {
  const txns = await db.bankTransaction.findMany({ where: { companyId, bankAccountId: { in: ids } }, select: { bankAccountId: true, amount: true, direction: true, sourceType: true } });
  const sums = new Map<string, number>();
  for (const txn of txns) sums.set(txn.bankAccountId, (sums.get(txn.bankAccountId) ?? 0) + (isMoneyIn(txn) ? txn.amount : -txn.amount));
  return sums;
}

async function lastClosed(db: Db, companyId: string, ids: string[]) {
  const recs = await db.bankReconciliation.findMany({
    where: { companyId, bankAccountId: { in: ids }, status: "CLOSED" },
    select: { bankAccountId: true, statementEndDate: true, endDate: true },
  });
  const out = new Map<string, string>();
  for (const rec of recs) {
    const day = storedDay(rec.statementEndDate ?? rec.endDate);
    if (!out.has(rec.bankAccountId) || out.get(rec.bankAccountId)! < day) out.set(rec.bankAccountId, day);
  }
  return out;
}

async function toMatchCounts(db: Db, companyId: string) {
  const lines = await db.bankStatementLine.findMany({
    where: { matchedTransactionId: null, excludedAt: null, reconciliation: { companyId, status: "OPEN" } },
    select: { reconciliation: { select: { bankAccountId: true } } },
  });
  const out = new Map<string, number>();
  for (const line of lines) out.set(line.reconciliation.bankAccountId, (out.get(line.reconciliation.bankAccountId) ?? 0) + 1);
  return out;
}

export async function readAccounts(db: Db, companyId: string, { view = "all", q = "" }: { view?: "all" | AccountKindKey; q?: string } = {}, now = new Date()): Promise<AccountsPage> {
  const baseCurrency = (await resolveBaseCurrency(companyId)).toUpperCase();
  const accounts = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, accountNumber: true, currency: true, openingBalance: true, kind: true, ledgerAccountId: true },
    orderBy: [{ name: "asc" }],
  });
  const ids = accounts.map((account) => account.id);
  const [sums, closed, waiting, rates, codeOf] = await Promise.all([
    balances(db, companyId, ids),
    lastClosed(db, companyId, ids),
    toMatchCounts(db, companyId),
    latestRates(db, companyId, baseCurrency, now),
    ledgerCodes(db, companyId, accounts.map((account) => account.ledgerAccountId)),
  ]);
  const all: AccountRow[] = accounts
    .map((account) => {
      const kind = KIND_OF[account.kind];
      const currency = account.currency.toUpperCase();
      const balance = round2(account.openingBalance + (sums.get(account.id) ?? 0));
      const rate = rates.get(currency)?.rate;
      return {
        id: account.id,
        name: account.name,
        sub: accountSub(account.accountNumber, codeOf(account.ledgerAccountId, kind), kind),
        kind,
        currency,
        balance,
        inBase: currency === baseCurrency ? null : rate ? round2(balance / rate) : null,
        lastReconciled: closed.has(account.id) ? shortDay(closed.get(account.id)!) : null,
        toMatch: waiting.get(account.id) ?? 0,
      };
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  const counts = { all: all.length, bank: 0, mobile: 0, cash: 0 };
  for (const row of all) counts[row.kind] += 1;
  const needle = q.trim().toLowerCase();
  const rows = all.filter((row) => (view === "all" || row.kind === view) && (!needle || row.name.toLowerCase().includes(needle)));
  const byCurrency = new Map<string, number>();
  for (const row of rows) byCurrency.set(row.currency, round2((byCurrency.get(row.currency) ?? 0) + row.balance));
  const other = [...rates.entries()].find(([code]) => code === "ZWG") ?? [...rates.entries()][0];
  return {
    baseCurrency,
    finding: accountsFinding(all, baseCurrency),
    rows,
    counts,
    sums: {
      inBase: round2(rows.reduce((sum, row) => sum + (row.currency === baseCurrency ? row.balance : (row.inBase ?? 0)), 0)),
      byCurrency: [...byCurrency.entries()].sort(([a], [b]) => (a === baseCurrency ? -1 : b === baseCurrency ? 1 : a.localeCompare(b))).map(([currency, total]) => ({ currency, total })),
    },
    rateNote: other ? `${other[0]} at ${other[1].rate.toFixed(2)}${other[1].day === storedDay(now) ? " today" : `, ${shortDay(other[1].day)}`}` : null,
  };
}

// ── One account ──────────────────────────────────────────────────────────────

export type AccountTab = "transactions" | "lines" | "reconciliations";

export type AccountTxn = {
  id: string;
  day: string;
  number: string | null;
  what: string;
  sub: string | null;
  amount: number;
  balance: number;
  matched: boolean;
  /** A bank entry made here (charge, IMTT, interest, transfer, tax): it can be voided. */
  entryId: string | null;
  locked: boolean;
};

export type AccountLine = { id: string; day: string; what: string; reference: string | null; amount: number; state: "matched" | "to-match" | "excluded"; note: string | null };

export type AccountRec = { id: string; period: string; statementEnd: string | null; balance: number | null; state: "OPEN" | "CLOSED" | "VOIDED"; closed: string | null };

export type AccountPage = {
  id: string;
  name: string;
  kindLabel: string;
  currency: string;
  baseCurrency: string;
  last4: string | null;
  accountNumber: string | null;
  bankName: string | null;
  ledger: string | null;
  tab: AccountTab;
  range: "since" | "all";
  counts: Record<AccountTab, number>;
  toMatch: number;
  since: string | null;
  transactions: AccountTxn[];
  lines: AccountLine[];
  reconciliations: AccountRec[];
  sums: { in: number; out: number };
  rail: { book: number; statement: { day: string; balance: number } | null; difference: number | null; lastReconciled: string | null; openReconciliationId: string | null };
  /** The balance at the last reconciled day: the table's last row. */
  reconciledBalance: number | null;
};

const BANK_ENTRY_WORDS: Record<string, string> = { CHARGE: "Bank charge", IMTT: "IMTT", INTEREST: "Interest", TRANSFER: "Transfer", TAX: "Tax paid", OTHER: "Bank entry" };

export async function readAccount(db: Db, companyId: string, id: string, { tab = "transactions", q = "", range = "since" }: { tab?: AccountTab; q?: string; range?: "since" | "all" } = {}): Promise<AccountPage | null> {
  const account = await db.bankAccount.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, bankName: true, accountNumber: true, currency: true, openingBalance: true, kind: true, ledgerAccountId: true },
  });
  if (!account) return null;
  const baseCurrency = (await resolveBaseCurrency(companyId)).toUpperCase();
  const kind = KIND_OF[account.kind];
  const [txns, lines, recs, codeOf] = await Promise.all([
    db.bankTransaction.findMany({
      where: { companyId, bankAccountId: id },
      orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
      select: { id: true, txnDate: true, description: true, reference: true, amount: true, direction: true, sourceType: true, sourceId: true, reconciledAt: true, reconciliation: { select: { status: true } }, matchedStatementLines: { select: { id: true }, take: 1 } },
    }),
    db.bankStatementLine.findMany({
      where: { reconciliation: { companyId, bankAccountId: id } },
      orderBy: [{ txnDate: "desc" }, { createdAt: "asc" }],
      select: { id: true, txnDate: true, description: true, reference: true, amount: true, direction: true, matchedTransactionId: true, excludedAt: true, excludeReason: true, matchedTransaction: { select: { description: true } } },
      take: 500,
    }),
    db.bankReconciliation.findMany({
      where: { companyId, bankAccountId: id },
      orderBy: [{ endDate: "desc" }],
      select: { id: true, startDate: true, endDate: true, statementEndDate: true, statementBalance: true, status: true, closedAt: true },
    }),
    ledgerCodes(db, companyId, [account.ledgerAccountId]),
  ]);
  const closedRecs = recs.filter((rec) => rec.status === "CLOSED");
  const lastClosedDay = closedRecs.map((rec) => storedDay(rec.statementEndDate ?? rec.endDate)).sort().at(-1) ?? null;
  // The running balance from the opening balance; the table shows what came after the last reconciled day.
  let running = account.openingBalance;
  let atReconciled = account.openingBalance;
  const withBalance = txns.map((txn) => {
    const amount = isMoneyIn(txn) ? txn.amount : -txn.amount;
    running = round2(running + amount);
    const day = storedDay(txn.txnDate);
    if (lastClosedDay && day <= lastClosedDay) atReconciled = running;
    return { txn, amount, balance: running, day };
  });
  const since = withBalance.filter((row) => range === "all" || !lastClosedDay || row.day > lastClosedDay);
  const needle = q.trim().toLowerCase();
  const transactions: AccountTxn[] = since
    .filter(({ txn }) => !needle || `${txn.description} ${txn.reference ?? ""}`.toLowerCase().includes(needle))
    .reverse()
    .map(({ txn, amount, balance, day }) => {
      const entry = txn.sourceType === "BANK_TRANSACTION" && txn.sourceId && txn.direction === (amount < 0 ? "DEBIT" : "CREDIT");
      const [what, ...rest] = txn.description.split(", ");
      return {
        id: txn.id,
        day: shortDay(day),
        number: txn.reference && txn.reference.length <= 14 ? txn.reference : null,
        what: what ?? txn.description,
        sub: rest.length ? rest.join(", ") : txn.sourceType === "BANK_TRANSACTION" ? "Bank entry" : null,
        amount,
        balance,
        matched: Boolean(txn.reconciledAt || txn.matchedStatementLines.length),
        entryId: entry ? txn.sourceId : null,
        locked: txn.reconciliation?.status === "CLOSED",
      };
    });
  const lineRows: AccountLine[] = lines
    .filter((line) => !needle || `${line.description} ${line.reference ?? ""}`.toLowerCase().includes(needle))
    .map((line) => ({
      id: line.id,
      day: shortDay(storedDay(line.txnDate)),
      what: line.description,
      reference: line.reference,
      amount: line.direction === "CREDIT" ? line.amount : -line.amount,
      state: line.matchedTransactionId ? ("matched" as const) : line.excludedAt ? ("excluded" as const) : ("to-match" as const),
      note: line.matchedTransaction?.description ?? line.excludeReason ?? null,
    }));
  const toMatch = lineRows.filter((line) => line.state === "to-match").length;
  const open = recs.find((rec) => rec.status === "OPEN") ?? null;
  const summary = open?.statementEndDate ? await reconciliationSummary(companyId, open.id, db) : null;
  const book = round2(running);
  return {
    id: account.id,
    name: account.name,
    kindLabel: kind === "bank" ? "Bank account" : kind === "mobile" ? "Mobile money" : "Cash",
    currency: account.currency.toUpperCase(),
    baseCurrency,
    last4: (account.accountNumber ?? "").replace(/\D/g, "").slice(-4) || null,
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    ledger: codeOf(account.ledgerAccountId, kind),
    tab,
    range,
    counts: { transactions: since.length, lines: lines.length, reconciliations: recs.filter((rec) => rec.status !== "VOIDED").length },
    toMatch,
    since: lastClosedDay ? shortDay(lastClosedDay) : null,
    transactions,
    lines: lineRows,
    reconciliations: recs.map((rec) => ({
      id: rec.id,
      period: `${shortDay(storedDay(rec.startDate))} to ${shortDay(storedDay(rec.statementEndDate ?? rec.endDate))}`,
      statementEnd: rec.statementEndDate ? shortDay(storedDay(rec.statementEndDate)) : null,
      balance: rec.statementEndDate ? rec.statementBalance : null,
      state: rec.status,
      closed: rec.closedAt ? shortDay(storedDay(rec.closedAt)) : null,
    })),
    sums: {
      in: round2(transactions.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0)),
      out: round2(-transactions.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0)),
    },
    rail: {
      book,
      statement: summary && open?.statementEndDate ? { day: shortDay(storedDay(open.statementEndDate)), balance: open.statementBalance } : null,
      difference: summary ? summary.difference : null,
      lastReconciled: lastClosedDay ? shortDay(lastClosedDay) : null,
      openReconciliationId: open?.id ?? null,
    },
    reconciledBalance: lastClosedDay && range === "since" ? round2(atReconciled) : null,
  };
}

export { BANK_ENTRY_WORDS };

/** Every money account, for pickers (bank entries, transfers, statements). */
export async function moneyAccountOptions(db: Db, companyId: string) {
  const accounts = await db.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, currency: true, kind: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  return accounts.map((account) => ({ id: account.id, label: account.name, currency: account.currency.toUpperCase(), kind: KIND_OF[account.kind] }));
}
