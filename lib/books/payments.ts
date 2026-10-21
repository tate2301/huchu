import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { customerFace, customerImage } from "./faces";
import { addDays, count, dayOf, methodWord, money, monthStart, shortDay, storedDay } from "./format";
import { INVOICE_PERIOD_LABEL, INVOICE_PERIODS, type InvoicePeriod } from "./invoices";

/**
 * Books → Payments: every payment a customer made, on an invoice or not (the
 * receipts Receivables records), ported onto the kit as Books → Invoices is.
 * A void payment (`void-receipt.ts`) stays in the list, marked Void with who,
 * when and why, and is left out of every sum.
 */

export const PAYMENT_VIEWS = ["all", "invoiced", "unlinked", "void"] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export const PAYMENT_VIEW_LABEL: Record<PaymentView, string> = {
  all: "All payments",
  invoiced: "On an invoice",
  unlinked: "Not on an invoice",
  void: "Void",
};

/** The tabs BkPaymentsIn draws over the list. */
export const PAYMENT_TAB_LABEL: Record<PaymentView, string> = { all: "All", invoiced: "On an invoice", unlinked: "On account", void: "Void" };

export const PAYMENT_PERIODS = INVOICE_PERIODS;
export const PAYMENT_PERIOD_LABEL = INVOICE_PERIOD_LABEL;

export const PAYMENTS_PAGE_SIZE = 50;

export const paymentQuerySchema = z.object({
  view: z.enum(PAYMENT_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  customer: z.string().uuid().nullable().catch(null),
  account: z.string().uuid().nullable().catch(null),
  period: z.enum(INVOICE_PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;

export function readPaymentQuery(params: URLSearchParams): PaymentQuery {
  return paymentQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    customer: params.get("customer") || null,
    account: params.get("account") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type PaymentBank = "matched" | "to-match" | "not-banked";

export const PAYMENT_BANK_LABEL: Record<PaymentBank, string> = { matched: "Matched", "to-match": "To match", "not-banked": "Not banked" };

export type PaymentRow = {
  id: string;
  number: string;
  /** Who paid: the invoice's customer, or null for a payment on no invoice. */
  customer: string | null;
  /** The customer's photo, from their CRM client, when there is one. */
  customerImage?: string | null;
  invoice: string | null;
  /** The invoice's id, for its link. */
  invoiceId: string | null;
  /** The money account it went into: "CBZ current", "EcoCash merchant". */
  into: string | null;
  received: string;
  method: string;
  /** Where it stands with the bank: matched to a statement line, still to match, or never through a bank (cash on hand). Null once void. */
  bank: PaymentBank | null;
  amount: number;
  currency: string;
  /** Voided by the owner: who, when and why. It counts in no sum. */
  voided: { by: string | null; byImage?: string | null; on: string; reason: string | null } | null;
};

export type PaymentsView = {
  finding: { fact: string; rest: string | null };
  rows: PaymentRow[];
  range: { from: number; to: number; of: number };
  /** What the matching payments add up to, in `currency`. */
  received: number;
  currency: string;
  /** This month's money in, and what of it is on account, in `currency`. */
  month: { amount: number; payments: number; onAccount: number; name: string };
  counts: Record<PaymentView, number>;
  customers: Array<{ id: string; name: string; image?: string | null }>;
  accounts: Array<{ id: string; name: string }>;
  query: PaymentQuery;
  /** The newest payment on no invoice whose customer has an open invoice: the one thing to put right. */
  allocate: { customer: string; amount: number; currency: string; invoice: { id: string; number: string; owed: number } } | null;
};

/** What the person may do from a row (the route adds it): Void is the owner's. */
export type PaymentsPage = PaymentsView & { can: { void: boolean } };

type Db = Pick<PrismaClient, "salesReceipt" | "paymentLedgerEntry" | "customer" | "platformAuditEvent" | "bankAccount" | "bankTransaction" | "salesInvoice">;

/**
 * Whose a payment on no invoice is: the customer its receivables line names.
 * A payment taken off an invoice that was voided or deleted keeps its customer
 * there (`lib/books/reverse-invoice.ts`), as their money on account; where the
 * workspace keeps no such line, the void's or deletion's audit event names
 * the customer (`receiptsOnAccount`).
 */
export async function onAccountCustomers(db: Db, companyId: string, records: Array<{ id: string; invoice: unknown }>): Promise<Map<string, string>> {
  const loose = records.filter((record) => !record.invoice).map((record) => record.id);
  if (loose.length === 0) return new Map();
  // The receipt names its customer itself (D2); the sub-ledger and audit trail answer for older rows.
  const named = await db.salesReceipt.findMany({ where: { companyId, id: { in: loose }, customerId: { not: null } }, select: { id: true, customerId: true } });
  const owner = new Map(named.map((row) => [row.id, row.customerId!]));
  const lines = await db.paymentLedgerEntry.findMany({
    where: { companyId, sourceType: "SALES_RECEIPT", sourceId: { in: loose.filter((id) => !owner.has(id)) }, partyId: { not: null } },
    select: { sourceId: true, partyId: true },
  });
  for (const line of lines) owner.set(line.sourceId, line.partyId!);
  const unnamed = loose.filter((id) => !owner.has(id));
  if (unnamed.length) {
    const events = await db.platformAuditEvent.findMany({
      where: { companyId, eventType: { in: ["books.invoice.voided", "books.invoice.deleted"] }, OR: unnamed.map((id) => ({ payloadJson: { contains: id } })) },
      orderBy: { createdAt: "asc" },
      select: { payloadJson: true },
    });
    for (const event of events) {
      try {
        const payload = JSON.parse(event.payloadJson ?? "{}") as { receiptsOnAccount?: Array<{ id?: string; customerId?: string }>; invoice?: { customerId?: string } };
        for (const receipt of payload.receiptsOnAccount ?? []) {
          const customerId = receipt.customerId ?? payload.invoice?.customerId;
          if (receipt.id && customerId && unnamed.includes(receipt.id)) owner.set(receipt.id, customerId);
        }
      } catch {
        // A payload that does not parse names nobody.
      }
    }
  }
  const customers = await db.customer.findMany({ where: { companyId, id: { in: [...new Set(owner.values())] } }, select: { id: true, name: true } });
  const names = new Map(customers.map((customer) => [customer.id, customer.name]));
  return new Map([...owner.entries()].flatMap(([receiptId, customerId]) => (names.has(customerId) ? [[receiptId, names.get(customerId)!] as const] : [])));
}

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
  if (query.view === "void") where.voidedAt = { not: null };
  else if (query.view !== "all") where.voidedAt = null;
  if (query.customer) where.AND = [{ OR: [{ customerId: query.customer }, { invoice: { customerId: query.customer } }] }];
  if (query.account) where.bankAccountId = query.account;
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
  voidedAt: true,
  voidReason: true,
  voidedBy: { select: { name: true, image: true } },
  customer: { select: customerFace },
  customerId: true,
  currency: true,
  bankAccount: { select: { name: true, bankName: true, currency: true, kind: true } },
  invoice: { select: { id: true, invoiceNumber: true, currency: true, customer: { select: { name: true, ...customerFace } } } },
} satisfies Prisma.SalesReceiptSelect;

type RowRecord = Prisma.SalesReceiptGetPayload<{ select: typeof rowSelect }>;

/** "EcoCash", "Transfer", "Cash": the method as a person says it. */
function methodLabel(method: string): string {
  const word = methodWord(method);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Banked money is matched once its bank side is reconciled or linked to a statement line; cash on hand never goes through a bank. */
export function bankState(record: RowRecord, bankSide: { reconciledAt: Date | null; reconciliationId: string | null; matchedStatementLines: Array<{ id: string }> } | undefined): PaymentBank | null {
  if (record.voidedAt) return null;
  if (!record.bankAccount || record.bankAccount.kind === "CASH") return "not-banked";
  return bankSide && (bankSide.reconciledAt || bankSide.matchedStatementLines.length > 0) ? "matched" : "to-match";
}

export function toPaymentRow(record: RowRecord, onAccount: string | null = null, bankSide?: Parameters<typeof bankState>[1]): PaymentRow {
  return {
    id: record.id,
    number: record.receiptNumber,
    customer: record.invoice?.customer.name ?? onAccount,
    customerImage: customerImage(record.invoice?.customer ?? record.customer),
    invoice: record.invoice?.invoiceNumber ?? null,
    invoiceId: record.invoice?.id ?? null,
    into: record.bankAccount ? record.bankAccount.name : methodLabel(record.method),
    received: shortDay(storedDay(record.receivedAt)),
    method: methodLabel(record.method),
    bank: bankState(record, bankSide),
    amount: Math.round(record.amount * 100) / 100,
    currency: record.currency ?? record.invoice?.currency ?? "USD",
    voided: record.voidedAt ? { by: record.voidedBy?.name ?? null, byImage: record.voidedBy?.image ?? null, on: shortDay(dayOf(record.voidedAt)), reason: record.voidReason } : null,
  };
}

/** "$1,240.00 came in this month." / "4 payments so far." */
export function paymentsFinding(month: { amount: number; payments: number }, currency = "USD"): { fact: string; rest: string | null } {
  if (month.payments === 0) return { fact: "Nothing has come in this month yet.", rest: null };
  return { fact: `${money(month.amount, currency)} came in this month.`, rest: `${count(month.payments, "payment")} so far.` };
}

/** "US$5,660.00 has come in on 6 payments this month." / "US$1,250.00 of it is on account, on no invoice yet." (BkPaymentsIn) */
export function paymentsInFinding(month: { amount: number; payments: number }, onAccount: number, currency = "USD"): { fact: string; rest: string | null } {
  if (month.payments === 0) return { fact: "Nothing has come in this month yet.", rest: null };
  return {
    fact: `${money(month.amount, currency)} has come in on ${count(month.payments, "payment")} this month.`,
    rest: onAccount > 0.005 ? `${money(onAccount, currency)} of it is on account, on no invoice yet.` : "All of it is on invoices.",
  };
}

/** The sum of payments in one currency: the one most of them are in. Others are left out, not converted. */
function sumInMainCurrency(rows: Array<{ amount: number; currency?: string | null; invoice: { currency: string } | null }>) {
  const byCurrency = new Map<string, { amount: number; payments: number }>();
  for (const row of rows) {
    // The currency the money came in (D2), as the core's money in/out reads it.
    const currency = row.currency ?? row.invoice?.currency ?? "USD";
    const entry = byCurrency.get(currency) ?? { amount: 0, payments: 0 };
    entry.amount += row.amount;
    entry.payments += 1;
    byCurrency.set(currency, entry);
  }
  const [currency, entry] = [...byCurrency.entries()].sort((a, b) => b[1].payments - a[1].payments)[0] ?? ["USD", { amount: 0, payments: 0 }];
  return { currency, amount: Math.round(entry.amount * 100) / 100, payments: entry.payments };
}

/** The bank side each receipt wrote (`recordBankTransaction`), by receipt id. */
async function bankSidesOf(db: Db, companyId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { reconciledAt: Date | null; reconciliationId: string | null; matchedStatementLines: Array<{ id: string }> }>();
  const sides = await db.bankTransaction.findMany({
    where: { companyId, sourceType: "SALES_RECEIPT", sourceId: { in: ids } },
    select: { sourceId: true, reconciledAt: true, reconciliationId: true, matchedStatementLines: { select: { id: true }, take: 1 } },
  });
  return new Map(sides.flatMap((side) => (side.sourceId ? [[side.sourceId, side] as const] : [])));
}

/** The newest live payment on no invoice whose customer owes on an issued invoice, and the oldest such invoice. */
async function toAllocate(db: Db, companyId: string, records: RowRecord[], owners: Map<string, string>): Promise<PaymentsView["allocate"]> {
  for (const record of records) {
    if (record.voidedAt || record.invoice || !record.customerId) continue;
    const currency = record.currency ?? "USD";
    const invoices = await db.salesInvoice.findMany({
      where: { companyId, customerId: record.customerId, status: "ISSUED", currency },
      select: { id: true, invoiceNumber: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
      orderBy: [{ dueDate: "asc" }, { invoiceNumber: "asc" }],
      take: 50,
    });
    const open = invoices.map((invoice) => ({ ...invoice, owed: Math.round((invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal) * 100) / 100 })).find((invoice) => invoice.owed > 0.005);
    if (!open) continue;
    return {
      customer: owners.get(record.id) ?? "The customer",
      amount: Math.round(record.amount * 100) / 100,
      currency,
      invoice: { id: open.id, number: open.invoiceNumber, owed: open.owed },
    };
  }
  return null;
}

export async function readPayments(db: Db, companyId: string, query: PaymentQuery, now = new Date()): Promise<PaymentsView> {
  const today = dayOf(now);
  const where = paymentWhere(companyId, query, today);
  const tabCount = (view: PaymentView) => db.salesReceipt.count({ where: paymentWhere(companyId, { ...query, view }, today) });
  const [records, matching, sums, month, customerRows, accountRows, ...tabCounts] = await Promise.all([
    db.salesReceipt.findMany({
      where,
      select: rowSelect,
      orderBy: [{ receivedAt: query.sort === "newest" ? "desc" : "asc" }, { receiptNumber: query.sort === "newest" ? "desc" : "asc" }],
      skip: (query.page - 1) * PAYMENTS_PAGE_SIZE,
      take: PAYMENTS_PAGE_SIZE,
    }),
    db.salesReceipt.count({ where }),
    // The sums leave void payments out: they are listed, not counted.
    db.salesReceipt.findMany({ where: { ...where, voidedAt: null }, select: { amount: true, currency: true, invoice: { select: { currency: true } } }, take: 10_000 }),
    db.salesReceipt.findMany({
      where: { companyId, voidedAt: null, receivedAt: { gte: midnight(monthStart(today)) } },
      select: { amount: true, currency: true, invoiceId: true, invoice: { select: { currency: true } } },
      take: 10_000,
    }),
    db.customer.findMany({ where: { companyId, receipts: { some: {} } }, select: { id: true, name: true, ...customerFace }, orderBy: { name: "asc" }, take: 500 }),
    db.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, bankName: true, currency: true }, orderBy: { name: "asc" } }),
    ...PAYMENT_VIEWS.map(tabCount),
  ]);
  const owners = await onAccountCustomers(db, companyId, records);
  const bankSides = await bankSidesOf(db, companyId, records.map((record) => record.id));
  const rows = records.map((record) => toPaymentRow(record, owners.get(record.id) ?? null, bankSides.get(record.id)));
  const allocate = await toAllocate(db, companyId, records, owners);
  const from = matching === 0 ? 0 : (query.page - 1) * PAYMENTS_PAGE_SIZE + 1;
  const total = sumInMainCurrency(sums);
  const thisMonth = sumInMainCurrency(month);
  const onAccount = sumInMainCurrency(month.filter((row) => !row.invoiceId && (row.currency ?? "USD") === thisMonth.currency));
  return {
    finding: paymentsInFinding(thisMonth, onAccount.amount, thisMonth.currency),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    received: total.amount,
    currency: total.currency,
    month: { amount: thisMonth.amount, payments: thisMonth.payments, onAccount: onAccount.amount, name: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(midnight(today)) },
    counts: Object.fromEntries(PAYMENT_VIEWS.map((view, index) => [view, tabCounts[index] ?? 0])) as Record<PaymentView, number>,
    customers: customerRows.map((customer) => ({ id: customer.id, name: customer.name, image: customerImage(customer) })),
    accounts: accountRows.map((account) => ({ id: account.id, name: account.name })),
    query,
    allocate,
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
  const lines = [["Receipt", "Customer", "Invoice", "Received", "Method", "Currency", "Amount", "Void"].join(",")];
  const owners = await onAccountCustomers(db, companyId, records);
  for (const record of records) {
    const row = toPaymentRow(record, owners.get(record.id) ?? null);
    const voided = row.voided ? [row.voided.on, row.voided.by, row.voided.reason].filter(Boolean).join(", ") : "";
    lines.push([row.number, row.customer ?? "", row.invoice ?? "", row.received, row.method, row.currency, row.amount.toFixed(2), voided].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}
