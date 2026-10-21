import type { Prisma, PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";
import { z } from "zod";

import { customerFace, customerImage } from "./faces";
import { addDays, dayOf, monthStart, shortDay, storedDay } from "./format";
import { INVOICE_STATE_LABEL, invoiceState, invoicesFinding, type InvoiceState } from "./invoice-state";

/**
 * Books → Invoices (design/core-modules/html/books-invoices.html): every
 * invoice the workspace has sent, what is still owed on each and how late it
 * is, with what is owed and overdue across all of them.
 */

export const INVOICE_VIEWS = ["all", "owed", "overdue", "paid", "drafts", "void"] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];

export const INVOICE_VIEW_LABEL: Record<InvoiceView, string> = {
  all: "All invoices",
  owed: "Owed to you",
  overdue: "Overdue",
  paid: "Paid",
  drafts: "Drafts",
  void: "Void",
};

/** The tabs BkInvoices draws over the list. */
export const INVOICE_TAB_LABEL: Record<InvoiceView, string> = {
  all: "All",
  owed: "Owed",
  overdue: "Overdue",
  paid: "Paid",
  drafts: "Drafts",
  void: "Void",
};

export const INVOICE_PERIODS = ["any", "this-month", "last-month", "this-year"] as const;
export type InvoicePeriod = (typeof INVOICE_PERIODS)[number];

export const INVOICE_PERIOD_LABEL: Record<InvoicePeriod, string> = {
  any: "Any time",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
};

export const PAGE_SIZE = 50;

export const invoiceQuerySchema = z.object({
  view: z.enum(INVOICE_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).nullable().catch(null),
  period: z.enum(INVOICE_PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

export function readInvoiceQuery(params: URLSearchParams): InvoiceQuery {
  return invoiceQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    customer: params.get("customer") || null,
    currency: params.get("currency") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type InvoiceRow = {
  id: string;
  number: string;
  customer: { id: string; name: string; image?: string | null };
  state: InvoiceState;
  stateLabel: string;
  when: string;
  total: number;
  balance: number;
  currency: string;
  daysOverdue: number;
  /** FDMS refused or never signed it. */
  fiscalFailed: boolean;
  /** The day it was issued and the day it falls due, as "10 Sep"; null when it has none yet. */
  issued: string | null;
  due: string | null;
  /** What FDMS says of it: Valid, Pending or Failed; null on a draft. */
  fiscal: "Valid" | "Pending" | "Failed" | null;
};

export type InvoicesView = {
  finding: { fact: string; rest: string | null };
  rows: InvoiceRow[];
  /** Rows on this page and how many match. */
  range: { from: number; to: number; of: number };
  owed: number;
  overdue: number;
  currency: string;
  customers: Array<{ id: string; name: string; image?: string | null }>;
  /** The currencies the workspace has invoiced in, for the Currency filter. */
  currencies: string[];
  /** How many invoices each tab holds, with the search and filters applied. */
  counts: Record<InvoiceView, number>;
  query: InvoiceQuery;
  /** What this person may do from a row's menu: delete drafts; reverse and delete the rest (the owner). The route adds it. */
  can?: { deleteDrafts: boolean; owner: boolean };
};

type Db = Pick<PrismaClient, "salesInvoice">;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

function periodRange(period: InvoicePeriod, today: string): { gte: Date; lt: Date } | null {
  if (period === "any") return null;
  if (period === "this-month") return { gte: midnight(monthStart(today)), lt: midnight(addDays(today, 1)) };
  if (period === "this-year") return { gte: midnight(`${today.slice(0, 4)}-01-01`), lt: midnight(addDays(today, 1)) };
  const start = monthStart(today);
  return { gte: midnight(monthStart(addDays(start, -1))), lt: midnight(start) };
}

export function invoiceWhere(companyId: string, query: InvoiceQuery, today: string): Prisma.SalesInvoiceWhereInput {
  const where: Prisma.SalesInvoiceWhereInput = { companyId };
  if (query.view === "all") where.status = { not: "VOIDED" };
  if (query.view === "owed") where.status = "ISSUED";
  if (query.view === "overdue") Object.assign(where, { status: "ISSUED", dueDate: { lt: midnight(today) } });
  if (query.view === "paid") where.status = "PAID";
  if (query.view === "drafts") where.status = "DRAFT";
  if (query.view === "void") where.status = "VOIDED";
  if (query.customer) where.customerId = query.customer;
  if (query.currency) where.currency = query.currency.toUpperCase();
  const range = periodRange(query.period, today);
  if (range) where.invoiceDate = range;
  if (query.q) {
    where.OR = [
      { invoiceNumber: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

const rowSelect = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  dueDate: true,
  status: true,
  currency: true,
  total: true,
  amountPaid: true,
  creditTotal: true,
  writeOffTotal: true,
  madeByVane: true,
  fiscalStatus: true,
  customer: { select: { id: true, name: true, ...customerFace } },
  receipts: { where: { voidedAt: null }, select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" as const }, take: 1 },
} satisfies Prisma.SalesInvoiceSelect;

type RowRecord = Prisma.SalesInvoiceGetPayload<{ select: typeof rowSelect }>;

export function toInvoiceRow(record: RowRecord, today: string): InvoiceRow {
  const read = invoiceState(
    {
      status: record.status,
      invoiceDate: record.invoiceDate,
      dueDate: record.dueDate,
      total: record.total,
      amountPaid: record.amountPaid,
      creditTotal: record.creditTotal,
      writeOffTotal: record.writeOffTotal,
      lastReceipt: record.receipts[0] ?? null,
    },
    today,
  );
  return {
    id: record.id,
    number: docLabel(record.invoiceNumber),
    customer: { id: record.customer.id, name: record.customer.name, image: customerImage(record.customer) },
    state: read.state,
    // Vane's own draft says so until a person issues or deletes it.
    stateLabel: record.madeByVane && read.state === "draft" ? "Vane's draft" : INVOICE_STATE_LABEL[read.state],
    when: read.when,
    total: record.total,
    balance: read.balance,
    currency: record.currency,
    daysOverdue: read.daysOverdue,
    fiscalFailed: record.fiscalStatus === "FAILED" && record.status !== "DRAFT",
    issued: record.status === "DRAFT" ? null : shortDay(storedDay(record.invoiceDate)),
    due: record.status === "DRAFT" || !record.dueDate ? null : shortDay(storedDay(record.dueDate)),
    fiscal: record.status === "DRAFT" ? null : record.fiscalStatus === "SUCCESS" ? "Valid" : record.fiscalStatus === "FAILED" ? "Failed" : record.fiscalStatus === "PENDING" ? "Pending" : null,
  };
}

/**
 * What is owed and overdue across every invoice sent, in the currency most of
 * them are in. Invoices in another currency are left out of the sums rather
 * than added to dollars at a guessed rate.
 */
export async function owedAndOverdue(db: Db, companyId: string, today: string) {
  const open = await db.salesInvoice.findMany({
    where: { companyId, status: "ISSUED" },
    select: { currency: true, dueDate: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, customer: { select: { name: true } } },
  });
  const byCurrency = new Map<string, number>();
  for (const invoice of open) byCurrency.set(invoice.currency, (byCurrency.get(invoice.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const owed = { amount: 0, invoices: 0 };
  const overdue = { amount: 0, invoices: 0, latest: null as { customer: string; days: number } | null };
  /** Not due, 1 to 7 days late, 8 to 30, over 30. */
  const ages = [0, 0, 0, 0];
  for (const invoice of open) {
    if (invoice.currency !== currency) continue;
    const balance = Math.max(0, invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
    if (balance <= 0.005) continue;
    owed.amount += balance;
    owed.invoices += 1;
    const late = invoice.dueDate ? Math.round((midnight(today).getTime() - midnight(storedDay(invoice.dueDate)).getTime()) / 86_400_000) : 0;
    ages[late <= 0 ? 0 : late <= 7 ? 1 : late <= 30 ? 2 : 3] += balance;
    if (invoice.dueDate && storedDay(invoice.dueDate) < today) {
      overdue.amount += balance;
      overdue.invoices += 1;
      const days = Math.round((midnight(today).getTime() - midnight(storedDay(invoice.dueDate)).getTime()) / 86_400_000);
      if (!overdue.latest || days > overdue.latest.days) overdue.latest = { customer: invoice.customer.name, days };
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    currency,
    owed: { amount: round(owed.amount), invoices: owed.invoices },
    overdue: { amount: round(overdue.amount), invoices: overdue.invoices, latest: overdue.latest },
    ages: ages.map(round),
  };
}

export async function readInvoices(db: Db, companyId: string, query: InvoiceQuery, now = new Date()): Promise<InvoicesView> {
  const today = dayOf(now);
  const where = invoiceWhere(companyId, query, today);
  const tabCount = (view: InvoiceView) => db.salesInvoice.count({ where: invoiceWhere(companyId, { ...query, view }, today) });
  const [records, matching, totals, customerRows, currencyRows, ...tabCounts] = await Promise.all([
    db.salesInvoice.findMany({
      where,
      select: rowSelect,
      orderBy: [{ invoiceDate: query.sort === "newest" ? "desc" : "asc" }, { invoiceNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.salesInvoice.count({ where }),
    owedAndOverdue(db, companyId, today),
    db.salesInvoice.findMany({
      where: { companyId, status: { not: "VOIDED" } },
      select: { customer: { select: { id: true, name: true, ...customerFace } } },
      distinct: ["customerId"],
    }),
    db.salesInvoice.findMany({ where: { companyId }, select: { currency: true }, distinct: ["currency"] }),
    ...INVOICE_VIEWS.map(tabCount),
  ]);
  const rows = records.map((record) => toInvoiceRow(record, today));
  const from = matching === 0 ? 0 : (query.page - 1) * PAGE_SIZE + 1;
  return {
    finding: invoicesFinding(totals.owed, totals.overdue, totals.currency),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    owed: totals.owed.amount,
    overdue: totals.overdue.amount,
    currency: totals.currency,
    customers: customerRows.map(({ customer }) => ({ id: customer.id, name: customer.name, image: customerImage(customer) })).sort((a, b) => a.name.localeCompare(b.name)),
    currencies: currencyRows.map((row) => row.currency).sort(),
    counts: Object.fromEntries(INVOICE_VIEWS.map((view, index) => [view, tabCounts[index] ?? 0])) as Record<InvoiceView, number>,
    query,
  };
}

/** The list as it is filtered, every page, for Export. */
export async function invoicesCsv(db: Db, companyId: string, query: InvoiceQuery, now = new Date()): Promise<string> {
  const today = dayOf(now);
  const records = await db.salesInvoice.findMany({
    where: invoiceWhere(companyId, query, today),
    select: rowSelect,
    orderBy: [{ invoiceDate: query.sort === "newest" ? "desc" : "asc" }],
    take: 10_000,
  });
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Invoice", "Customer", "State", "When", "Currency", "Total", "Balance"].join(",")];
  for (const record of records) {
    const row = toInvoiceRow(record, today);
    lines.push(
      [row.number, row.customer.name, row.stateLabel, row.when, row.currency, row.total.toFixed(2), row.balance.toFixed(2)].map(cell).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** How late an open invoice is, in the buckets "Owed to you, by age" groups by. */
export const AGE_BUCKETS = ["Not yet due", "1 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 0) return "Not yet due";
  if (daysOverdue <= 30) return "1 to 30 days";
  if (daysOverdue <= 60) return "31 to 60 days";
  if (daysOverdue <= 90) return "61 to 90 days";
  return "Over 90 days";
}

/** Every invoice with money still owing on it, with how late it is and its age bucket. */
export async function openInvoicesByAge(db: Db, companyId: string, now = new Date(), take = 5001) {
  const today = dayOf(now);
  const records = await db.salesInvoice.findMany({
    where: { companyId, status: "ISSUED" },
    select: rowSelect,
    orderBy: [{ dueDate: "asc" }, { invoiceNumber: "asc" }],
    take,
  });
  return records
    .map((record) => ({ record, row: toInvoiceRow(record, today) }))
    .filter(({ row }) => row.balance > 0)
    .map(({ record, row }) => ({
      ...row,
      due: record.dueDate ? storedDay(record.dueDate) : null,
      bucket: ageBucket(row.daysOverdue),
    }));
}
