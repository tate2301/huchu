import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { addDays, count, dayOf, methodWord, money, monthStart, shortDay, storedDay } from "./format";
import { INVOICE_PERIOD_LABEL, INVOICE_PERIODS, type InvoicePeriod } from "./invoices";

/**
 * Books → Payments: every payment a customer made, on an invoice or not (the
 * receipts Receivables records), ported onto the kit as Books → Invoices is.
 */

export const PAYMENT_VIEWS = ["all", "invoiced", "unlinked"] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export const PAYMENT_VIEW_LABEL: Record<PaymentView, string> = {
  all: "All payments",
  invoiced: "On an invoice",
  unlinked: "Not on an invoice",
};

export const PAYMENT_PERIODS = INVOICE_PERIODS;
export const PAYMENT_PERIOD_LABEL = INVOICE_PERIOD_LABEL;

export const PAYMENTS_PAGE_SIZE = 50;

export const paymentQuerySchema = z.object({
  view: z.enum(PAYMENT_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  period: z.enum(INVOICE_PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;

export function readPaymentQuery(params: URLSearchParams): PaymentQuery {
  return paymentQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type PaymentRow = {
  id: string;
  number: string;
  /** Who paid: the invoice's customer, or null for a payment on no invoice. */
  customer: string | null;
  invoice: string | null;
  received: string;
  method: string;
  amount: number;
  currency: string;
};

export type PaymentsView = {
  finding: { fact: string; rest: string | null };
  rows: PaymentRow[];
  range: { from: number; to: number; of: number };
  /** What the matching payments add up to, in `currency`. */
  received: number;
  currency: string;
  query: PaymentQuery;
};

type Db = Pick<PrismaClient, "salesReceipt">;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

function periodRange(period: InvoicePeriod, today: string): { gte: Date; lt: Date } | null {
  if (period === "any") return null;
  if (period === "this-month") return { gte: midnight(monthStart(today)), lt: midnight(addDays(today, 1)) };
  if (period === "this-year") return { gte: midnight(`${today.slice(0, 4)}-01-01`), lt: midnight(addDays(today, 1)) };
  const start = monthStart(today);
  return { gte: midnight(monthStart(addDays(start, -1))), lt: midnight(start) };
}

export function paymentWhere(companyId: string, query: PaymentQuery, today: string): Prisma.SalesReceiptWhereInput {
  const where: Prisma.SalesReceiptWhereInput = { companyId };
  if (query.view === "invoiced") where.invoiceId = { not: null };
  if (query.view === "unlinked") where.invoiceId = null;
  const range = periodRange(query.period, today);
  if (range) where.receivedAt = range;
  if (query.q) {
    where.OR = [
      { receiptNumber: { contains: query.q, mode: "insensitive" } },
      { reference: { contains: query.q, mode: "insensitive" } },
      { invoice: { invoiceNumber: { contains: query.q, mode: "insensitive" } } },
      { invoice: { customer: { name: { contains: query.q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

const rowSelect = {
  id: true,
  receiptNumber: true,
  receivedAt: true,
  amount: true,
  method: true,
  invoice: { select: { invoiceNumber: true, currency: true, customer: { select: { name: true } } } },
} satisfies Prisma.SalesReceiptSelect;

type RowRecord = Prisma.SalesReceiptGetPayload<{ select: typeof rowSelect }>;

/** "EcoCash", "Transfer", "Cash": the method as a person says it. */
function methodLabel(method: string): string {
  const word = methodWord(method);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function toPaymentRow(record: RowRecord): PaymentRow {
  return {
    id: record.id,
    number: record.receiptNumber,
    customer: record.invoice?.customer.name ?? null,
    invoice: record.invoice?.invoiceNumber ?? null,
    received: shortDay(storedDay(record.receivedAt)),
    method: methodLabel(record.method),
    amount: Math.round(record.amount * 100) / 100,
    currency: record.invoice?.currency ?? "USD",
  };
}

/** "$1,240.00 came in this month." / "4 payments so far." */
export function paymentsFinding(month: { amount: number; payments: number }, currency = "USD"): { fact: string; rest: string | null } {
  if (month.payments === 0) return { fact: "Nothing has come in this month yet.", rest: null };
  return { fact: `${money(month.amount, currency)} came in this month.`, rest: `${count(month.payments, "payment")} so far.` };
}

/** The sum of payments in one currency: the one most of them are in. Others are left out, not converted. */
function sumInMainCurrency(rows: Array<{ amount: number; invoice: { currency: string } | null }>) {
  const byCurrency = new Map<string, { amount: number; payments: number }>();
  for (const row of rows) {
    const currency = row.invoice?.currency ?? "USD";
    const entry = byCurrency.get(currency) ?? { amount: 0, payments: 0 };
    entry.amount += row.amount;
    entry.payments += 1;
    byCurrency.set(currency, entry);
  }
  const [currency, entry] = [...byCurrency.entries()].sort((a, b) => b[1].payments - a[1].payments)[0] ?? ["USD", { amount: 0, payments: 0 }];
  return { currency, amount: Math.round(entry.amount * 100) / 100, payments: entry.payments };
}

export async function readPayments(db: Db, companyId: string, query: PaymentQuery, now = new Date()): Promise<PaymentsView> {
  const today = dayOf(now);
  const where = paymentWhere(companyId, query, today);
  const [records, matching, sums, month] = await Promise.all([
    db.salesReceipt.findMany({
      where,
      select: rowSelect,
      orderBy: [{ receivedAt: query.sort === "newest" ? "desc" : "asc" }, { receiptNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * PAYMENTS_PAGE_SIZE,
      take: PAYMENTS_PAGE_SIZE,
    }),
    db.salesReceipt.count({ where }),
    db.salesReceipt.findMany({ where, select: { amount: true, invoice: { select: { currency: true } } }, take: 10_000 }),
    db.salesReceipt.findMany({
      where: { companyId, receivedAt: { gte: midnight(monthStart(today)) } },
      select: { amount: true, invoice: { select: { currency: true } } },
      take: 10_000,
    }),
  ]);
  const rows = records.map(toPaymentRow);
  const from = matching === 0 ? 0 : (query.page - 1) * PAYMENTS_PAGE_SIZE + 1;
  const total = sumInMainCurrency(sums);
  const thisMonth = sumInMainCurrency(month);
  return {
    finding: paymentsFinding(thisMonth, thisMonth.currency),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    received: total.amount,
    currency: total.currency,
    query,
  };
}

/** The list as it is filtered, every page, for Export. */
export async function paymentsCsv(db: Db, companyId: string, query: PaymentQuery, now = new Date()): Promise<string> {
  const records = await db.salesReceipt.findMany({
    where: paymentWhere(companyId, query, dayOf(now)),
    select: rowSelect,
    orderBy: [{ receivedAt: query.sort === "newest" ? "desc" : "asc" }],
    take: 10_000,
  });
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Receipt", "Customer", "Invoice", "Received", "Method", "Currency", "Amount"].join(",")];
  for (const record of records) {
    const row = toPaymentRow(record);
    lines.push([row.number, row.customer ?? "", row.invoice ?? "", row.received, row.method, row.currency, row.amount.toFixed(2)].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
