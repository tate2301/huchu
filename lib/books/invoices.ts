import type { Prisma, PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";
import { z } from "zod";

import { customerFace, customerImage } from "./faces";
import { addDays, count, dayOf, daysBetween, monthStart, shortDay, storedDay } from "./format";
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

/** The Due filter (bk-invoices): when the money falls due. */
export const INVOICE_DUES = ["any", "this-week", "this-month", "next-month"] as const;
export type InvoiceDue = (typeof INVOICE_DUES)[number];
export const INVOICE_DUE_LABEL: Record<InvoiceDue, string> = { any: "Any", "this-week": "This week", "this-month": "This month", "next-month": "Next month" };

/** The Source filter: written in Books, or from a deal in the CRM. */
export const INVOICE_SOURCES = ["books", "crm"] as const;
export type InvoiceSource = (typeof INVOICE_SOURCES)[number];
export const INVOICE_SOURCE_LABEL: Record<InvoiceSource, string> = { books: "Books", crm: "CRM" };

export const PAGE_SIZE = 50;

export const invoiceQuerySchema = z.object({
  view: z.enum(INVOICE_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  due: z.enum(INVOICE_DUES).catch("any"),
  source: z.enum(INVOICE_SOURCES).nullable().catch(null),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;

export function readInvoiceQuery(params: URLSearchParams): InvoiceQuery {
  return invoiceQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    customer: params.get("customer") || null,
    due: params.get("due") ?? undefined,
    source: params.get("source") || null,
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
  /** "10 Sep"; null on a draft. */
  issued: string | null;
  /** "24 Sep"; null without a due date or on a draft. */
  due: string | null;
  /** What FDMS says: Valid, Pending or Failed; null on a draft or a void. */
  fdms: "Valid" | "Pending" | "Failed" | null;
  /** The row's one muted fact: "12 days late", "Due in 14 days", "Paid 5 Oct, cash", "Written by Vane from Q-0218". */
  note: string;
  total: number;
  balance: number;
  currency: string;
  daysOverdue: number;
  /** FDMS refused or never signed it: the row says so in place of the date. */
  fiscalFailed: boolean;
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
  /** The page's sums in the list's currency: what the rows total and what is still owed on them. */
  sums: { total: number; balance: number };
  /** How many invoices each tab holds, with the search and filters applied. */
  counts: Record<InvoiceView, number>;
  query: InvoiceQuery;
  /** What this person may do from a row's menu: delete drafts; reverse and delete the rest (the owner). The route adds it. */
  can?: { deleteDrafts: boolean; owner: boolean };
};

type Db = Pick<PrismaClient, "salesInvoice">;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The days a Due choice covers, end exclusive. "This week" runs to Sunday. */
function dueRange(due: InvoiceDue, today: string): { gte: Date; lt: Date } | null {
  if (due === "any") return null;
  if (due === "this-week") {
    const weekday = midnight(today).getUTCDay();
    return { gte: midnight(today), lt: midnight(addDays(today, ((7 - weekday) % 7) + 1)) };
  }
  const start = monthStart(today);
  const next = monthStart(addDays(start, 32));
  if (due === "this-month") return { gte: midnight(start), lt: midnight(next) };
  return { gte: midnight(next), lt: midnight(monthStart(addDays(next, 32))) };
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
  const range = dueRange(query.due, today);
  if (range) where.dueDate = range;
  if (query.source === "crm") where.crmLeadDocuments = { some: {} };
  if (query.source === "books") where.crmLeadDocuments = { none: {} };
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
  fromQuotation: { select: { quotationNumber: true } },
  supersededBy: { select: { invoiceNumber: true }, take: 1 },
  customer: { select: { id: true, name: true, ...customerFace } },
  receipts: { where: { voidedAt: null }, select: { receivedAt: true, method: true }, orderBy: { receivedAt: "desc" as const }, take: 1 },
} satisfies Prisma.SalesInvoiceSelect;

type RowRecord = Prisma.SalesInvoiceGetPayload<{ select: typeof rowSelect }>;

const FDMS_WORD: Record<NonNullable<RowRecord["fiscalStatus"]>, InvoiceRow["fdms"]> = { SUCCESS: "Valid", PENDING: "Pending", FAILED: "Failed", VOIDED: null };

/** The Note column: how late, when it falls due, how it was paid, or where a draft came from. */
function invoiceNote(record: RowRecord, read: { state: InvoiceState; when: string; daysOverdue: number }, today: string): string {
  if (read.state === "draft") return record.madeByVane && record.fromQuotation ? `Written by Vane from ${record.fromQuotation.quotationNumber}` : read.when;
  if (read.state === "void") return record.supersededBy[0]?.invoiceNumber ? `Replaced by ${record.supersededBy[0].invoiceNumber}` : "Voided";
  if (read.state === "overdue") return `${count(read.daysOverdue, "day")} late`;
  if (read.state === "paid" || !record.dueDate) return read.when;
  const days = daysBetween(today, storedDay(record.dueDate));
  return days === 0 ? "Due today" : `Due in ${count(days, "day")}`;
}

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
    number: record.status === "DRAFT" ? "No number" : docLabel(record.invoiceNumber),
    customer: { id: record.customer.id, name: record.customer.name, image: customerImage(record.customer) },
    state: read.state,
    // Vane's own draft says so until a person issues or deletes it.
    stateLabel: record.madeByVane && read.state === "draft" ? "Vane's draft" : INVOICE_STATE_LABEL[read.state],
    when: read.when,
    issued: record.status === "DRAFT" ? null : shortDay(storedDay(record.invoiceDate)),
    due: record.status === "DRAFT" || !record.dueDate ? null : shortDay(storedDay(record.dueDate)),
    fdms: record.status === "DRAFT" || record.status === "VOIDED" ? null : FDMS_WORD[record.fiscalStatus ?? "PENDING"],
    note: invoiceNote(record, read, today),
    total: record.total,
    balance: read.balance,
    currency: record.currency,
    daysOverdue: read.daysOverdue,
    fiscalFailed: record.fiscalStatus === "FAILED" && record.status !== "DRAFT",
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
  for (const invoice of open) {
    if (invoice.currency !== currency) continue;
    const balance = Math.max(0, invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
    if (balance <= 0.005) continue;
    owed.amount += balance;
    owed.invoices += 1;
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
  };
}

export async function readInvoices(db: Db, companyId: string, query: InvoiceQuery, now = new Date()): Promise<InvoicesView> {
  const today = dayOf(now);
  const where = invoiceWhere(companyId, query, today);
  const tabCount = (view: InvoiceView) => db.salesInvoice.count({ where: invoiceWhere(companyId, { ...query, view }, today) });
  const [records, matching, totals, customerRows, ...tabCounts] = await Promise.all([
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
    sums: {
      total: round2(rows.filter((row) => row.currency === totals.currency && row.state !== "void").reduce((sum, row) => sum + row.total, 0)),
      balance: round2(rows.filter((row) => row.currency === totals.currency).reduce((sum, row) => sum + row.balance, 0)),
    },
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
