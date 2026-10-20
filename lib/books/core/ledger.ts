import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The ledger read once for every report (books-final §3.3 Ledger, §8 P5):
 * the trial balance, the profit and loss, the balance sheet and the cash flow
 * all come from `movements`, so the screens and the accountant export can
 * never disagree. Base currency, posted entries only (a reversed entry and its
 * mirror both count, and cancel). Core: free, whatever the plan.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type LedgerRange = {
  /** "2026-09-01": from the first day, or from the beginning when left out. */
  from?: string | null;
  /** "2026-09-30": to and including this day. */
  to: string;
  costCentreId?: string | null;
};

export type LedgerAccount = { id: string; code: string; name: string; type: string; category: string | null; nodeType: string; parentId: string | null; isActive: boolean };
export type Movement = { debit: number; credit: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Debits and credits by account over the range. */
export async function movements(db: Db, companyId: string, range: LedgerRange): Promise<Map<string, Movement>> {
  const grouped = await db.journalLine.groupBy({
    by: ["accountId"],
    where: {
      ...(range.costCentreId ? { costCenterId: range.costCentreId } : {}),
      entry: { companyId, status: "POSTED", entryDate: { ...(range.from ? { gte: day(range.from) } : {}), lt: day(addDay(range.to, 1)) } },
    },
    _sum: { debit: true, credit: true },
  });
  return new Map(grouped.map((row) => [row.accountId, { debit: round2(row._sum.debit ?? 0), credit: round2(row._sum.credit ?? 0) }]));
}

export async function ledgerAccounts(db: Db, companyId: string): Promise<LedgerAccount[]> {
  const rows = await db.chartOfAccount.findMany({ where: { companyId }, select: { id: true, code: true, name: true, type: true, category: true, nodeType: true, parentAccountId: true, isActive: true }, orderBy: { code: "asc" } });
  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name, type: row.type, category: row.category, nodeType: row.nodeType, parentId: row.parentAccountId, isActive: row.isActive }));
}

export type TrialBalanceRow = { accountId: string; code: string; name: string; type: string; category: string | null; debit: number; credit: number };
export type TrialBalance = { rows: TrialBalanceRow[]; debit: number; credit: number; difference: number };

/**
 * Each account's balance over the range, on the side it falls: a debit
 * balance in Debit, a credit balance in Credit. Accounts with nothing are
 * left out. Pure, from the accounts and their movements.
 */
export function trialBalanceOf(accounts: LedgerAccount[], moved: Map<string, Movement>): TrialBalance {
  const rows: TrialBalanceRow[] = [];
  for (const account of accounts) {
    const move = moved.get(account.id);
    if (!move) continue;
    const net = round2(move.debit - move.credit);
    if (Math.abs(net) < 0.005) continue;
    rows.push({ accountId: account.id, code: account.code, name: account.name, type: account.type, category: account.category, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  const debit = round2(rows.reduce((sum, row) => sum + row.debit, 0));
  const credit = round2(rows.reduce((sum, row) => sum + row.credit, 0));
  return { rows, debit, credit, difference: round2(debit - credit) };
}

/** The trial balance as at a day (from the beginning), or over a range. */
export async function trialBalance(companyId: string, range: LedgerRange, db: Db = prisma): Promise<TrialBalance> {
  const [accounts, moved] = await Promise.all([ledgerAccounts(db, companyId), movements(db, companyId, range)]);
  return trialBalanceOf(accounts, moved);
}

/** Cost of sales: an expense account the chart files as COGS or cost of sales. */
export const isCostOfSales = (account: Pick<LedgerAccount, "type" | "category" | "name">) =>
  account.type === "EXPENSE" && /\b(cogs|cost of (sales|goods))\b/i.test(`${account.category ?? ""} ${account.name}`);

export type StatementLine = { accountId: string | null; label: string; amounts: number[] };
export type StatementSection = { key: string; title: string; lines: StatementLine[]; total: number[] };

/** Income and expenses in each column's movements: what came in, cost of sales, the rest; profit. Pure. */
export function profitAndLoss(accounts: LedgerAccount[], columns: Array<Map<string, Movement>>) {
  const pick = (test: (account: LedgerAccount) => boolean, sign: 1 | -1): StatementLine[] =>
    accounts
      .filter(test)
      .map((account) => ({ accountId: account.id, label: account.name, amounts: columns.map((moved) => round2(sign * ((moved.get(account.id)?.credit ?? 0) - (moved.get(account.id)?.debit ?? 0)))) }))
      .filter((line) => line.amounts.some((amount) => Math.abs(amount) >= 0.005));
  const total = (lines: StatementLine[]) => columns.map((_, index) => round2(lines.reduce((sum, line) => sum + line.amounts[index], 0)));
  const income = pick((account) => account.type === "INCOME", 1);
  const costOfSales = pick((account) => isCostOfSales(account), -1);
  const expenses = pick((account) => account.type === "EXPENSE" && !isCostOfSales(account), -1);
  const incomeTotal = total(income);
  const costTotal = total(costOfSales);
  const gross = incomeTotal.map((value, index) => round2(value - costTotal[index]));
  const expenseTotal = total(expenses);
  const profit = gross.map((value, index) => round2(value - expenseTotal[index]));
  return {
    sections: [
      { key: "income", title: "Income", lines: income, total: incomeTotal },
      { key: "cost", title: "Cost of sales", lines: costOfSales, total: costTotal },
      { key: "expenses", title: "Expenses", lines: expenses, total: expenseTotal },
    ] satisfies StatementSection[],
    income: incomeTotal,
    gross,
    profit,
  };
}

/**
 * Assets, liabilities and equity as at each column's day (movements from the
 * beginning), with the profit not yet closed to retained earnings on its own
 * line under equity, so the two sides agree. Pure.
 */
export function balanceSheet(accounts: LedgerAccount[], columns: Array<Map<string, Movement>>) {
  const pick = (type: string, sign: 1 | -1): StatementLine[] =>
    accounts
      .filter((account) => account.type === type)
      .map((account) => ({ accountId: account.id, label: account.name, amounts: columns.map((moved) => round2(sign * ((moved.get(account.id)?.debit ?? 0) - (moved.get(account.id)?.credit ?? 0)))) }))
      .filter((line) => line.amounts.some((amount) => Math.abs(amount) >= 0.005));
  const total = (lines: StatementLine[]) => columns.map((_, index) => round2(lines.reduce((sum, line) => sum + line.amounts[index], 0)));
  const assets = pick("ASSET", 1);
  const liabilities = pick("LIABILITY", -1);
  const equity = pick("EQUITY", -1);
  const unclosed = profitAndLoss(accounts, columns).profit;
  if (unclosed.some((amount) => Math.abs(amount) >= 0.005)) equity.push({ accountId: null, label: "Profit not yet closed", amounts: unclosed });
  const assetTotal = total(assets);
  const liabilityTotal = total(liabilities);
  const equityTotal = total(equity);
  return {
    sections: [
      { key: "assets", title: "Assets", lines: assets, total: assetTotal },
      { key: "liabilities", title: "Liabilities", lines: liabilities, total: liabilityTotal },
      { key: "equity", title: "Equity", lines: equity, total: equityTotal },
    ] satisfies StatementSection[],
    assets: assetTotal,
    liabilitiesAndEquity: liabilityTotal.map((value, index) => round2(value + equityTotal[index])),
  };
}

export type CashFlowKind = "operating" | "investing" | "financing";

/** Where a counter-account's cash belongs. Pure. */
export function cashFlowKind(account: Pick<LedgerAccount, "type" | "category" | "name" | "code">): CashFlowKind {
  const words = `${account.category ?? ""} ${account.name}`.toLowerCase();
  if (account.type === "EQUITY") return "financing";
  if (account.type === "LIABILITY" && /\b(loan|borrow|overdraft|lease|hire purchase)\b/.test(words)) return "financing";
  if (account.type === "ASSET" && /\b(fixed|equipment|vehicle|van|furniture|machinery|plant|property|building|computer)\b/.test(words)) return "investing";
  return "operating";
}

/** A money account's ledger account: bank, cash, mobile money and floats. */
export async function cashAccountIds(db: Db, companyId: string, accounts: LedgerAccount[]): Promise<Set<string>> {
  const linked = await db.bankAccount.findMany({ where: { companyId, ledgerAccountId: { not: null } }, select: { ledgerAccountId: true } });
  const ids = new Set(linked.map((row) => row.ledgerAccountId!).filter(Boolean));
  for (const account of accounts) if (account.type === "ASSET" && account.category?.toLowerCase() === "cash") ids.add(account.id);
  return ids;
}

export type CashFlow = {
  opening: number;
  closing: number;
  sections: Array<{ key: CashFlowKind; title: string; lines: StatementLine[]; total: number }>;
  net: number;
};

/**
 * The direct cash flow over a range: every posted entry that moved a money
 * account, its other lines' credits less debits as the cash each brought in
 * or paid out, and each line filed operating, investing or financing by its account. A transfer between
 * two money accounts moves no cash and is left out.
 */
export async function cashFlow(companyId: string, range: LedgerRange & { from: string }, db: Db = prisma): Promise<CashFlow> {
  const accounts = await ledgerAccounts(db, companyId);
  const cash = await cashAccountIds(db, companyId, accounts);
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const [before, entries] = await Promise.all([
    movements(db, companyId, { to: addDay(range.from, -1), costCentreId: range.costCentreId }),
    db.journalEntry.findMany({
      where: { companyId, status: "POSTED", entryDate: { gte: day(range.from), lt: day(addDay(range.to, 1)) }, lines: { some: { accountId: { in: [...cash] } } } },
      select: { lines: { select: { accountId: true, debit: true, credit: true, costCenterId: true } } },
    }),
  ]);
  const opening = round2([...cash].reduce((sum, id) => sum + (before.get(id)?.debit ?? 0) - (before.get(id)?.credit ?? 0), 0));
  const byAccount = new Map<string, number>();
  for (const entry of entries) {
    const lines = range.costCentreId ? entry.lines.filter((line) => line.costCenterId === range.costCentreId || cash.has(line.accountId)) : entry.lines;
    const moved = lines.filter((line) => cash.has(line.accountId)).reduce((sum, line) => sum + line.debit - line.credit, 0);
    const others = lines.filter((line) => !cash.has(line.accountId));
    if (Math.abs(moved) < 0.005 || others.length === 0) continue;
    // In a balanced entry the other lines' credits less debits are the cash it moved, line by line.
    for (const line of others) byAccount.set(line.accountId, (byAccount.get(line.accountId) ?? 0) + line.credit - line.debit);
  }
  const kinds: Array<{ key: CashFlowKind; title: string }> = [
    { key: "operating", title: "From trading" },
    { key: "investing", title: "Bought and sold for the business" },
    { key: "financing", title: "From owners and lenders" },
  ];
  const sections = kinds.map(({ key, title }) => {
    const lines = [...byAccount]
      .filter(([id]) => byId.get(id) && cashFlowKind(byId.get(id)!) === key)
      .map(([id, amount]) => ({ accountId: id, label: byId.get(id)!.name, amounts: [round2(amount)] }))
      .filter((line) => Math.abs(line.amounts[0]) >= 0.005)
      .sort((a, b) => (byId.get(a.accountId!)!.code < byId.get(b.accountId!)!.code ? -1 : 1));
    return { key, title, lines, total: round2(lines.reduce((sum, line) => sum + line.amounts[0], 0)) };
  });
  const net = round2(sections.reduce((sum, section) => sum + section.total, 0));
  return { opening, closing: round2(opening + net), sections, net };
}

function addDay(iso: string, n: number): string {
  const date = day(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

export type LedgerLine = { entryId: string; number: number; date: string; memo: string; sourceType: string; sourceId: string | null; debit: number; credit: number; balance: number; costCentre: string | null };

/** One account's lines over a range with the running balance, and its balance before the range. */
export async function accountLedger(companyId: string, accountId: string, range: LedgerRange & { from: string }, db: Db = prisma): Promise<{ opening: number; lines: LedgerLine[]; closing: number }> {
  const before = await movements(db, companyId, { to: addDay(range.from, -1), costCentreId: range.costCentreId });
  const opening = round2((before.get(accountId)?.debit ?? 0) - (before.get(accountId)?.credit ?? 0));
  const rows = await db.journalLine.findMany({
    where: { accountId, ...(range.costCentreId ? { costCenterId: range.costCentreId } : {}), entry: { companyId, status: "POSTED", entryDate: { gte: day(range.from), lt: day(addDay(range.to, 1)) } } },
    select: { debit: true, credit: true, memo: true, costCenter: { select: { name: true } }, entry: { select: { id: true, entryNumber: true, entryDate: true, description: true, sourceType: true, sourceId: true } } },
    orderBy: [{ entry: { entryDate: "asc" } }, { entry: { entryNumber: "asc" } }, { createdAt: "asc" }],
    take: 5000,
  });
  let balance = opening;
  const lines = rows.map((row) => {
    balance = round2(balance + row.debit - row.credit);
    return { entryId: row.entry.id, number: row.entry.entryNumber, date: row.entry.entryDate.toISOString().slice(0, 10), memo: row.entry.description, sourceType: row.entry.sourceType, sourceId: row.entry.sourceId, debit: round2(row.debit), credit: round2(row.credit), balance, costCentre: row.costCenter?.name ?? null };
  });
  return { opening, lines, closing: balance };
}
