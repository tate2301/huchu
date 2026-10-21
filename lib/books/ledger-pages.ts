import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  accountLedger,
  balanceSheet,
  cashAccountIds,
  cashFlow,
  ledgerAccounts,
  movements,
  profitAndLoss,
  trialBalanceOf,
  type StatementLine,
  type StatementSection,
} from "./core/ledger";
import { dayOf, money, monthName, shortDay } from "./format";

/**
 * Books → Ledger: Trial balance (BkTrialBalance), Financial statements
 * (BkFinancials) and General ledger (BkLedger), shaped from the core's one
 * read of the ledger (`lib/books/core/ledger.ts`), so they agree with each
 * other and with the accountant export.
 */

type Db = PrismaClient;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-09" → "2026-09-30". */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** "2026-09" → "September 2026". */
export const monthLabel = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;
/** "2026-09-30" → "30 Sep 2026". */
export const dayLabel = (iso: string) => `${shortDay(iso)} ${iso.slice(0, 4)}`;
/** The month before today's: the last whole month. */
export function lastWholeMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 7);
}
const prevMonth = (month: string) => lastWholeMonth(`${month}-15`);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const TYPE_WORD: Record<string, string> = { ASSET: "Asset", LIABILITY: "Liability", EQUITY: "Equity", INCOME: "Income", EXPENSE: "Expense" };

type Shared = { baseCurrency: string; booksStart: string | null; fyStartMonth: number; costCentres: Array<{ id: string; label: string }>; months: Array<{ value: string; label: string }> };

/** The base currency, the first posted day, the financial year's first month, the cost centres and the months to choose. */
async function shared(db: Db, companyId: string, today: string): Promise<Shared> {
  const [settings, first, centres] = await Promise.all([
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true, fiscalYearStartMonth: true } }),
    db.journalEntry.findFirst({ where: { companyId, status: "POSTED" }, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
    db.costCenter.findMany({ where: { companyId }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const booksStart = first ? first.entryDate.toISOString().slice(0, 10) : null;
  const months: Array<{ value: string; label: string }> = [];
  let cursor = today.slice(0, 7);
  const stop = (booksStart ?? today).slice(0, 7);
  for (let i = 0; i < 36; i += 1) {
    months.push({ value: cursor, label: monthLabel(cursor) });
    if (cursor <= stop) break;
    cursor = prevMonth(cursor);
  }
  return { baseCurrency: settings?.baseCurrency ?? "USD", booksStart, fyStartMonth: settings?.fiscalYearStartMonth ?? 1, costCentres: centres.map((c) => ({ id: c.id, label: c.isActive ? c.name : `${c.name} (inactive)` })), months };
}

/** The financial year's first day for a month, or the books' first day when that is later. */
export function yearStart(month: string, fyStartMonth: number, booksStart: string | null): string {
  const [y, m] = month.split("-").map(Number);
  const year = m >= fyStartMonth ? y : y - 1;
  const start = `${year}-${String(fyStartMonth).padStart(2, "0")}-01`;
  return booksStart && booksStart > start ? booksStart : start;
}

/** The month a page opens on: the last whole month, or this one when the books started after it. */
export function openingMonth(today: string, booksStart: string | null): string {
  const last = lastWholeMonth(today);
  return booksStart && monthEnd(last) < booksStart ? today.slice(0, 7) : last;
}

/* ── Trial balance ───────────────────────────────────────────────────── */

export const trialBalanceQuery = z.object({
  view: z.enum(["month", "range"]).catch("month"),
  month: z.string().regex(MONTH).optional().catch(undefined),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
  cc: z.string().max(60).catch(""),
  zero: z.enum(["hide", "show"]).catch("hide"),
});
export type TrialBalanceQuery = z.infer<typeof trialBalanceQuery>;

export type TrialBalancePage = Shared & {
  finding: { fact: string; rest: string | null };
  query: TrialBalanceQuery & { month: string; from: string; to: string };
  /** "As at 30 Sep 2026", "1 Sep to 18 Oct 2026". */
  when: string;
  rows: Array<{ accountId: string; code: string; name: string; type: string; debit: number; credit: number }>;
  debit: number;
  credit: number;
  difference: number;
  withBalance: number;
};

export async function readTrialBalance(db: Db, companyId: string, query: TrialBalanceQuery, now = new Date()): Promise<TrialBalancePage> {
  const today = dayOf(now);
  const base = await shared(db, companyId, today);
  const month = query.month ?? openingMonth(today, base.booksStart);
  const range = query.view === "range" ? { from: query.from ?? `${today.slice(0, 7)}-01`, to: query.to ?? today } : { from: null, to: monthEnd(month) };
  const [accounts, moved] = await Promise.all([ledgerAccounts(db, companyId), movements(db, companyId, { ...range, costCentreId: query.cc || null })]);
  const tb = trialBalanceOf(accounts, moved);
  const rows = query.zero === "show"
    ? accounts.filter((account) => account.nodeType === "LEDGER" && account.isActive).map((account) => tb.rows.find((row) => row.accountId === account.id) ?? { accountId: account.id, code: account.code, name: account.name, type: account.type, category: account.category, debit: 0, credit: 0 })
    : tb.rows;
  const c = base.baseCurrency;
  const when = query.view === "range" ? `${shortDay(range.from!)} to ${dayLabel(range.to)}` : `As at ${dayLabel(range.to)}`;
  const balanced = Math.abs(tb.difference) < 0.005;
  const onDay = query.view === "range" ? `from ${shortDay(range.from!)} to ${shortDay(range.to)}` : `on ${shortDay(range.to).replace(/ \w+$/, "")} ${monthName(range.to)}`;
  return {
    ...base,
    finding: tb.rows.length === 0
      ? { fact: "Nothing has posted yet.", rest: "The trial balance fills as documents post." }
      : balanced
        ? { fact: `The trial balance balances at ${money(tb.debit, c)} ${onDay}.`, rest: `In ${c}, the base currency.` }
        : { fact: `The trial balance is out by ${money(Math.abs(tb.difference), c)} ${onDay}.`, rest: "A posting is missing a side: Needs posting lists it." },
    query: { ...query, month, from: range.from ?? "", to: range.to },
    when,
    rows: rows.map((row) => ({ accountId: row.accountId, code: row.code, name: row.name, type: TYPE_WORD[row.type] ?? row.type, debit: row.debit, credit: row.credit })),
    debit: tb.debit,
    credit: tb.credit,
    difference: tb.difference,
    withBalance: tb.rows.length,
  };
}

/* ── Financial statements ────────────────────────────────────────────── */

export const financialsQuery = z.object({
  tab: z.enum(["pl", "bs", "cf"]).catch("pl"),
  month: z.string().regex(MONTH).optional().catch(undefined),
  /** both: the month before and the year so far, as the design draws it. */
  compare: z.enum(["both", "since", "previous", "none"]).catch("both"),
  cc: z.string().max(60).catch(""),
});
export type FinancialsQuery = z.infer<typeof financialsQuery>;

/** A "sub" row is a running figure inside a group (Gross profit); a "total" closes the statement. */
export type FinancialsRow = { kind: "group" | "line" | "sub" | "total"; label: string; accountId?: string | null; amounts: number[] };

export type FinancialsPage = Shared & {
  finding: { fact: string; rest: string | null };
  query: FinancialsQuery & { month: string };
  columns: string[];
  rows: FinancialsRow[];
  /** The compare chip's words: "August, year to date", "Year to date", "August", "Off". */
  compareLabel: string;
};

const sectionRows = (sections: StatementSection[]): FinancialsRow[] =>
  sections.flatMap((section) =>
    section.lines.length === 0
      ? []
      : [
          { kind: "group" as const, label: section.title, amounts: [] },
          ...section.lines.map((line) => ({ kind: "line" as const, label: line.label, accountId: line.accountId, amounts: line.amounts })),
          { kind: "total" as const, label: section.title, amounts: section.total },
        ],
  );

export async function readFinancials(db: Db, companyId: string, query: FinancialsQuery, now = new Date()): Promise<FinancialsPage> {
  const today = dayOf(now);
  const base = await shared(db, companyId, today);
  const c = base.baseCurrency;
  const month = query.month ?? openingMonth(today, base.booksStart);
  const end = monthEnd(month);
  const start = `${month}-01`;
  const since = yearStart(month, base.fyStartMonth, base.booksStart);
  const previous = prevMonth(month);
  const cc = query.cc || null;
  const accounts = await ledgerAccounts(db, companyId);
  const withPrevious = query.compare === "both" || query.compare === "previous";
  const withYear = query.compare === "both" || query.compare === "since";
  /** "August", or "August 2025" when the month before is in another year. */
  const word = (m: string) => (m.slice(0, 4) === month.slice(0, 4) ? monthName(`${m}-01`) : monthLabel(m));
  const compareLabel = query.compare === "none" ? "Off" : [withPrevious ? word(previous) : null, withYear ? (query.tab === "bs" ? "start of the year" : "year to date") : null].filter(Boolean).join(", ").replace(/^./, (ch) => ch.toUpperCase());
  const monthWord = monthName(start);

  if (query.tab === "cf") {
    const ranges = [{ from: start, to: end }, ...(withPrevious ? [{ from: `${previous}-01`, to: monthEnd(previous) }] : []), ...(withYear ? [{ from: since, to: end }] : [])];
    const flows = await Promise.all(ranges.map((range) => cashFlow(companyId, { ...range, costCentreId: cc }, db)));
    const columns = [word(month), ...(withPrevious ? [word(previous)] : []), ...(withYear ? ["Year to date"] : [])];
    const keys = new Set(flows.flatMap((flow) => flow.sections.flatMap((section) => section.lines.map((line) => `${section.key}|${line.accountId}|${line.label}`))));
    const rows: FinancialsRow[] = [{ kind: "line", label: "Cash at the start", amounts: flows.map((flow) => flow.opening) }];
    for (const section of flows[0].sections) {
      const lines = [...keys].filter((key) => key.startsWith(`${section.key}|`)).map((key) => {
        const [, accountId, label] = key.split("|");
        return { kind: "line" as const, label, accountId, amounts: flows.map((flow) => flow.sections.find((s) => s.key === section.key)?.lines.find((line) => line.accountId === accountId)?.amounts[0] ?? 0) };
      });
      if (lines.length === 0) continue;
      rows.push({ kind: "group", label: section.title, amounts: [] }, ...lines, { kind: "sub", label: section.title, amounts: flows.map((flow) => flow.sections.find((s) => s.key === section.key)!.total) });
    }
    rows.push({ kind: "total", label: "Cash at the end", amounts: flows.map((flow) => flow.closing) });
    const net = flows[0].net;
    return {
      ...base,
      finding: { fact: `${monthWord} ${net >= 0 ? "brought in" : "paid out"} ${money(Math.abs(net), c)} more than it ${net >= 0 ? "paid out" : "brought in"}.`, rest: `Cash stood at ${money(flows[0].closing, c)} on ${shortDay(end)}.` },
      query: { ...query, month },
      columns,
      rows,
      compareLabel,
    };
  }

  if (query.tab === "bs") {
    const days = [end, ...(withPrevious ? [monthEnd(previous)] : []), ...(withYear ? [addDays(since, -1)] : [])];
    const columns = days.map(dayLabel);
    const moved = await Promise.all(days.map((to) => movements(db, companyId, { to, costCentreId: cc })));
    const sheet = balanceSheet(accounts, moved);
    const rows = sectionRows(sheet.sections);
    rows.push({ kind: "total", label: "Liabilities and equity", amounts: sheet.liabilitiesAndEquity });
    const agree = Math.abs(sheet.assets[0] - sheet.liabilitiesAndEquity[0]) < 0.005;
    return {
      ...base,
      finding: agree
        ? { fact: `The business owns ${money(sheet.assets[0], c)} on ${shortDay(end)}.`, rest: `What it owes and the owners’ share come to the same.` }
        : { fact: `The balance sheet is out by ${money(Math.abs(sheet.assets[0] - sheet.liabilitiesAndEquity[0]), c)}.`, rest: "A posting is missing a side: Needs posting lists it." },
      query: { ...query, month },
      columns,
      rows,
      compareLabel,
    };
  }

  // Profit and loss, as drawn: income, the cost of sales taken off inside it, Gross profit, the running costs, Profit.
  const ranges = [{ from: start, to: end }, ...(withPrevious ? [{ from: `${previous}-01`, to: monthEnd(previous) }] : []), ...(withYear ? [{ from: since, to: end }] : [])];
  const moved = await Promise.all(ranges.map((range) => movements(db, companyId, { ...range, costCentreId: cc })));
  const pl = profitAndLoss(accounts, moved);
  const [income, cost, running] = pl.sections;
  const taken = (lines: StatementLine[]) => lines.map((line) => ({ kind: "line" as const, label: line.label, accountId: line.accountId, amounts: line.amounts.map((amount) => round2(0 - amount)) }));
  const rows: FinancialsRow[] = [];
  if (income!.lines.length || cost!.lines.length) {
    rows.push({ kind: "group", label: "Income", amounts: [] }, ...income!.lines.map((line) => ({ kind: "line" as const, label: line.label, accountId: line.accountId, amounts: line.amounts })), ...taken(cost!.lines));
    if (cost!.lines.length) rows.push({ kind: "sub", label: "Gross profit", amounts: pl.gross });
  }
  if (running!.lines.length) rows.push({ kind: "group", label: "Running costs", amounts: [] }, ...taken(running!.lines));
  rows.push({ kind: "total", label: pl.profit[0]! < 0 ? "Loss" : "Profit", amounts: pl.profit });
  const columns = [word(month), ...(withPrevious ? [word(previous)] : []), ...(withYear ? ["Year to date"] : [])];
  const profit = pl.profit[0]!;
  const yearProfit = withYear ? pl.profit[withPrevious ? 2 : 1] : undefined;
  return {
    ...base,
    finding: {
      fact: rows.length <= 1 ? `Nothing came in or went out in ${monthWord}.` : `${monthWord} made a ${profit < 0 ? "loss" : "profit"} of ${money(Math.abs(profit), c)}.`,
      rest: yearProfit !== undefined ? `The year to date is ${money(yearProfit, c)}.` : null,
    },
    query: { ...query, month },
    columns,
    rows,
    compareLabel,
  };
}

function addDays(iso: string, n: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/* ── General ledger ──────────────────────────────────────────────────── */

export const ledgerQuery = z.object({
  account: z.string().max(60).catch(""),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
  cc: z.string().max(60).catch(""),
});
export type LedgerQuery = z.infer<typeof ledgerQuery>;

export type LedgerPageRow = {
  entryId: string;
  /** "JE-0418". */
  number: string;
  date: string;
  /** "Invoice, Chisipite Dental": the kind and the party, or the memo when the line has no party. */
  what: string;
  party: string | null;
  /** The document behind it ("INV-0131"), when Books has one. */
  document: string | null;
  source: string;
  href: string;
  debit: number;
  credit: number;
  balance: number;
};

export type LedgerPage = Shared & {
  finding: { fact: string; rest: string | null };
  query: LedgerQuery & { from: string; to: string };
  account: { id: string; code: string; name: string } | null;
  accounts: Array<{ id: string; label: string }>;
  opening: number;
  closing: number;
  rows: LedgerPageRow[];
  debit: number;
  credit: number;
  /** "1 Sep to 18 Oct". */
  dates: string;
  /** The parties on these lines, for the Party chip. */
  parties: string[];
};

const SOURCE_PAGE: Record<string, string> = { SALES_INVOICE: "/books/invoices/", PURCHASE_BILL: "/books/bills/" };
const WORD: Record<string, string> = { MANUAL: "Manual", SALES_INVOICE: "Invoice", SALES_RECEIPT: "Payment received", SALES_CREDIT_NOTE: "Credit note", PURCHASE_BILL: "Bill", PURCHASE_PAYMENT: "Payment made", BANK_TRANSACTION: "Bank", RETAIL_SALE: "Till sale", RETAIL_DAY_BANKED: "Takings", PAYROLL_RUN: "Payroll" };
const sourceWord = (type: string) => WORD[type] ?? (type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " "));

/** Where a line goes: its source document's page when Books has one, else its journal. */
export function sourceHref(line: { entryId: string; sourceType: string; sourceId: string | null }): string {
  const page = SOURCE_PAGE[line.sourceType];
  if (page && line.sourceId && !line.sourceId.startsWith("void:")) return `${page}${line.sourceId.split(":")[0]}`;
  return `/books/journals?journal=${line.entryId}`;
}

export async function readLedger(db: Db, companyId: string, query: LedgerQuery, now = new Date()): Promise<LedgerPage> {
  const today = dayOf(now);
  const base = await shared(db, companyId, today);
  const c = base.baseCurrency;
  const accounts = (await ledgerAccounts(db, companyId)).filter((account) => account.nodeType === "LEDGER");
  let account = accounts.find((row) => row.id === query.account || row.code === query.account) ?? null;
  if (!account) {
    // The busiest money account opens first: the one a person checks most.
    const cash = await cashAccountIds(db, companyId, accounts);
    const busiest = await db.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: [...cash] }, entry: { companyId, status: "POSTED" } }, _count: { _all: true }, orderBy: { _count: { accountId: "desc" } }, take: 1 });
    account = accounts.find((row) => row.id === busiest[0]?.accountId) ?? accounts.find((row) => cash.has(row.id)) ?? accounts[0] ?? null;
  }
  const from = query.from ?? `${lastWholeMonth(today)}-01`;
  const to = query.to ?? today;
  const dates = `${shortDay(from)} to ${shortDay(to)}`;
  if (!account) {
    return { ...base, finding: { fact: "There are no accounts yet.", rest: "Set up the books first." }, query: { ...query, from, to }, account: null, accounts: [], opening: 0, closing: 0, rows: [], debit: 0, credit: 0, dates, parties: [] };
  }
  const book = await accountLedger(companyId, account.id, { from, to, costCentreId: query.cc || null }, db);
  // Credit-side accounts read as positive balances: what is owed, earned or put in.
  const sign = ["LIABILITY", "EQUITY", "INCOME"].includes(account.type) ? -1 : 1;
  const debit = round2(book.lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(book.lines.reduce((sum, line) => sum + line.credit, 0));
  const name = `${account.code} ${account.name}`;
  const closingWord = to === today ? "today" : `on ${shortDay(to)}`;
  const docs = await documentsOf(db, companyId, book.lines);
  return {
    ...base,
    finding: { fact: `${name} stands at ${money(sign * book.closing, c)} ${closingWord}.`, rest: `It opened ${monthName(from)} at ${money(sign * book.opening, c)}.` },
    query: { ...query, from, to },
    account: { id: account.id, code: account.code, name: account.name },
    accounts: accounts.map((row) => ({ id: row.id, label: `${row.code} ${row.name}` })),
    opening: sign * book.opening,
    closing: sign * book.closing,
    rows: book.lines.map((line) => {
      const doc = docs.get(docKey(line));
      const source = sourceWord(line.sourceType);
      return {
        entryId: line.entryId,
        number: line.number > 0 ? `JE-${String(line.number).padStart(4, "0")}` : "—",
        date: shortDay(line.date),
        what: doc?.party ? `${source}, ${doc.party}` : line.memo,
        party: doc?.party ?? null,
        document: doc?.ref ?? null,
        source,
        href: sourceHref(line),
        debit: line.debit,
        credit: line.credit,
        balance: sign * line.balance,
      };
    }),
    debit,
    credit,
    dates,
    parties: [...new Set([...docs.values()].map((doc) => doc.party).filter((party): party is string => Boolean(party)))].sort((a, b) => a.localeCompare(b, "en-GB")),
  };
}

type SourceLine = { sourceType: string; sourceId: string | null };
const docKey = (line: SourceLine) => `${line.sourceType}:${(line.sourceId ?? "").replace(/^void:/, "").split(":")[0]}`;

/** The documents behind a page of lines: their numbers and their parties, one query per kind. */
async function documentsOf(db: Db, companyId: string, lines: SourceLine[]): Promise<Map<string, { ref: string | null; party: string | null }>> {
  const ids = (type: string) => [...new Set(lines.filter((line) => line.sourceType === type && line.sourceId).map((line) => (line.sourceId ?? "").replace(/^void:/, "").split(":")[0]!))];
  const out = new Map<string, { ref: string | null; party: string | null }>();
  const [invoices, receipts, bills, notes] = await Promise.all([
    ids("SALES_INVOICE").length ? db.salesInvoice.findMany({ where: { companyId, id: { in: ids("SALES_INVOICE") } }, select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } }) : [],
    ids("SALES_RECEIPT").length ? db.salesReceipt.findMany({ where: { companyId, id: { in: ids("SALES_RECEIPT") } }, select: { id: true, receiptNumber: true, customer: { select: { name: true } } } }) : [],
    ids("PURCHASE_BILL").length ? db.purchaseBill.findMany({ where: { companyId, id: { in: ids("PURCHASE_BILL") } }, select: { id: true, billNumber: true, vendor: { select: { name: true } } } }) : [],
    ids("SALES_CREDIT_NOTE").length ? db.creditNote.findMany({ where: { companyId, id: { in: ids("SALES_CREDIT_NOTE") } }, select: { id: true, noteNumber: true, invoice: { select: { customer: { select: { name: true } } } } } }) : [],
  ]);
  for (const row of invoices) out.set(`SALES_INVOICE:${row.id}`, { ref: row.invoiceNumber, party: row.customer?.name ?? null });
  for (const row of receipts) out.set(`SALES_RECEIPT:${row.id}`, { ref: row.receiptNumber, party: row.customer?.name ?? null });
  for (const row of bills) out.set(`PURCHASE_BILL:${row.id}`, { ref: row.billNumber, party: row.vendor?.name ?? null });
  for (const row of notes) out.set(`SALES_CREDIT_NOTE:${row.id}`, { ref: row.noteNumber, party: row.invoice?.customer?.name ?? null });
  return out;
}

/** A month chip's label: "Sep 2026". */
export const shortMonth = (month: string) => `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
