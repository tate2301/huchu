import type { Prisma, PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";
import { z } from "zod";

import { addDays, count, daysBetween, dayOf, money, monthStart, shortDay, storedDay } from "./format";
import { INVOICE_PERIOD_LABEL, INVOICE_PERIODS, type InvoicePeriod } from "./invoices";

/**
 * Books → Expenses: the bills suppliers sent (Payables' bills), what is still
 * to pay on each and how late it is, ported onto the kit as Books → Invoices is.
 */

export const EXPENSE_VIEWS = ["all", "to-pay", "overdue", "paid", "drafts"] as const;
export type ExpenseView = (typeof EXPENSE_VIEWS)[number];

export const EXPENSE_VIEW_LABEL: Record<ExpenseView, string> = {
  all: "All bills",
  "to-pay": "To pay",
  overdue: "Overdue",
  paid: "Paid",
  drafts: "Drafts",
};

export const EXPENSE_PERIODS = INVOICE_PERIODS;
export const EXPENSE_PERIOD_LABEL = INVOICE_PERIOD_LABEL;

export const EXPENSES_PAGE_SIZE = 50;

export const expenseQuerySchema = z.object({
  view: z.enum(EXPENSE_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  supplier: z.string().uuid().nullable().catch(null),
  period: z.enum(INVOICE_PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

export function readExpenseQuery(params: URLSearchParams): ExpenseQuery {
  return expenseQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    supplier: params.get("supplier") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type ExpenseState = "overdue" | "part-paid" | "to-pay" | "paid" | "draft" | "void";

export const EXPENSE_STATE_LABEL: Record<ExpenseState, string> = {
  overdue: "Overdue",
  "part-paid": "Part paid",
  "to-pay": "To pay",
  paid: "Paid",
  draft: "Draft",
  void: "Void",
};

export type BillFacts = {
  status: "DRAFT" | "RECEIVED" | "PAID" | "VOIDED";
  billDate: Date;
  dueDate: Date | null;
  total: number;
  amountPaid: number;
  debitNoteTotal: number;
  writeOffTotal: number;
};

/** What is left to pay on a bill, and how it reads: "4 days overdue", "Due 18 Oct", "Paid". */
export function billState(facts: BillFacts, today: string): { state: ExpenseState; when: string; balance: number } {
  const balance = Math.round(Math.max(0, facts.total - facts.amountPaid - facts.debitNoteTotal - facts.writeOffTotal) * 100) / 100;
  if (facts.status === "VOIDED") return { state: "void", when: "Voided", balance: 0 };
  if (facts.status === "DRAFT") return { state: "draft", when: `Entered ${shortDay(storedDay(facts.billDate))}`, balance };
  if (facts.status === "PAID" || balance <= 0) return { state: "paid", when: "Paid", balance: 0 };
  const due = facts.dueDate ? storedDay(facts.dueDate) : null;
  const late = due ? daysBetween(due, today) : 0;
  if (due && late > 0) return { state: "overdue", when: `${count(late, "day")} overdue`, balance };
  const when = due ? (late === 0 ? "Due today" : `Due ${shortDay(due)}`) : `Received ${shortDay(storedDay(facts.billDate))}`;
  return { state: facts.amountPaid > 0 ? "part-paid" : "to-pay", when, balance };
}

/** "$1,980.00 is to pay on 4 bills." / "1 is overdue, $420.00 in all." */
export function expensesFinding(
  toPay: { amount: number; bills: number },
  overdue: { amount: number; bills: number },
  currency = "USD",
): { fact: string; rest: string | null } {
  if (toPay.bills === 0) return { fact: "Nothing is owed to suppliers.", rest: "Every bill received is paid." };
  const fact = `${money(toPay.amount, currency)} is to pay on ${count(toPay.bills, "bill")}.`;
  if (overdue.bills === 0) return { fact, rest: "None is overdue." };
  if (overdue.bills === toPay.bills) return { fact, rest: toPay.bills === 1 ? "It is overdue." : `All ${toPay.bills} are overdue.` };
  return { fact, rest: `${overdue.bills} ${overdue.bills === 1 ? "is" : "are"} overdue, ${money(overdue.amount, currency)} in all.` };
}

export type ExpenseRow = {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  state: ExpenseState;
  stateLabel: string;
  when: string;
  total: number;
  balance: number;
  currency: string;
};

export type ExpensesView = {
  finding: { fact: string; rest: string | null };
  rows: ExpenseRow[];
  range: { from: number; to: number; of: number };
  toPay: number;
  overdue: number;
  currency: string;
  suppliers: Array<{ id: string; name: string }>;
  query: ExpenseQuery;
};

type Db = Pick<PrismaClient, "purchaseBill">;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

function periodRange(period: InvoicePeriod, today: string): { gte: Date; lt: Date } | null {
  if (period === "any") return null;
  if (period === "this-month") return { gte: midnight(monthStart(today)), lt: midnight(addDays(today, 1)) };
  if (period === "this-year") return { gte: midnight(`${today.slice(0, 4)}-01-01`), lt: midnight(addDays(today, 1)) };
  const start = monthStart(today);
  return { gte: midnight(monthStart(addDays(start, -1))), lt: midnight(start) };
}

export function expenseWhere(companyId: string, query: ExpenseQuery, today: string): Prisma.PurchaseBillWhereInput {
  const where: Prisma.PurchaseBillWhereInput = { companyId };
  if (query.view === "all") where.status = { not: "VOIDED" };
  if (query.view === "to-pay") where.status = "RECEIVED";
  if (query.view === "overdue") Object.assign(where, { status: "RECEIVED", dueDate: { lt: midnight(today) } });
  if (query.view === "paid") where.status = "PAID";
  if (query.view === "drafts") where.status = "DRAFT";
  if (query.supplier) where.vendorId = query.supplier;
  const range = periodRange(query.period, today);
  if (range) where.billDate = range;
  if (query.q) {
    where.OR = [
      { billNumber: { contains: query.q, mode: "insensitive" } },
      { vendor: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

const rowSelect = {
  id: true,
  billNumber: true,
  billDate: true,
  dueDate: true,
  status: true,
  currency: true,
  total: true,
  amountPaid: true,
  debitNoteTotal: true,
  writeOffTotal: true,
  vendor: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseBillSelect;

type RowRecord = Prisma.PurchaseBillGetPayload<{ select: typeof rowSelect }>;

export function toExpenseRow(record: RowRecord, today: string): ExpenseRow {
  const read = billState(record, today);
  return {
    id: record.id,
    number: docLabel(record.billNumber, "bill"),
    supplier: record.vendor,
    state: read.state,
    stateLabel: EXPENSE_STATE_LABEL[read.state],
    when: read.when,
    total: record.total,
    balance: read.balance,
    currency: record.currency,
  };
}

/** What is to pay and overdue across every bill received, in the currency most of them are in. */
export async function toPayAndOverdue(db: Db, companyId: string, today: string) {
  const open = await db.purchaseBill.findMany({
    where: { companyId, status: "RECEIVED" },
    select: { currency: true, dueDate: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true },
  });
  const byCurrency = new Map<string, number>();
  for (const bill of open) byCurrency.set(bill.currency, (byCurrency.get(bill.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const toPay = { amount: 0, bills: 0 };
  const overdue = { amount: 0, bills: 0 };
  for (const bill of open) {
    if (bill.currency !== currency) continue;
    const balance = Math.max(0, bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal);
    if (balance <= 0.005) continue;
    toPay.amount += balance;
    toPay.bills += 1;
    if (bill.dueDate && storedDay(bill.dueDate) < today) {
      overdue.amount += balance;
      overdue.bills += 1;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { currency, toPay: { amount: round(toPay.amount), bills: toPay.bills }, overdue: { amount: round(overdue.amount), bills: overdue.bills } };
}

export async function readExpenses(db: Db, companyId: string, query: ExpenseQuery, now = new Date()): Promise<ExpensesView> {
  const today = dayOf(now);
  const where = expenseWhere(companyId, query, today);
  const [records, matching, totals, supplierRows] = await Promise.all([
    db.purchaseBill.findMany({
      where,
      select: rowSelect,
      orderBy: [{ billDate: query.sort === "newest" ? "desc" : "asc" }, { billNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * EXPENSES_PAGE_SIZE,
      take: EXPENSES_PAGE_SIZE,
    }),
    db.purchaseBill.count({ where }),
    toPayAndOverdue(db, companyId, today),
    db.purchaseBill.findMany({
      where: { companyId, status: { not: "VOIDED" } },
      select: { vendor: { select: { id: true, name: true } } },
      distinct: ["vendorId"],
    }),
  ]);
  const rows = records.map((record) => toExpenseRow(record, today));
  const from = matching === 0 ? 0 : (query.page - 1) * EXPENSES_PAGE_SIZE + 1;
  return {
    finding: expensesFinding(totals.toPay, totals.overdue, totals.currency),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    toPay: totals.toPay.amount,
    overdue: totals.overdue.amount,
    currency: totals.currency,
    suppliers: supplierRows.map((row) => row.vendor).sort((a, b) => a.name.localeCompare(b.name)),
    query,
  };
}

/** The list as it is filtered, every page, for Export. */
export async function expensesCsv(db: Db, companyId: string, query: ExpenseQuery, now = new Date()): Promise<string> {
  const today = dayOf(now);
  const records = await db.purchaseBill.findMany({
    where: expenseWhere(companyId, query, today),
    select: rowSelect,
    orderBy: [{ billDate: query.sort === "newest" ? "desc" : "asc" }],
    take: 10_000,
  });
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Bill", "Supplier", "State", "When", "Currency", "Total", "Balance"].join(",")];
  for (const record of records) {
    const row = toExpenseRow(record, today);
    lines.push([row.number, row.supplier.name, row.stateLabel, row.when, row.currency, row.total.toFixed(2), row.balance.toFixed(2)].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
