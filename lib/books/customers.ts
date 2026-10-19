import type { Prisma, PrismaClient } from "@prisma/client";

import { ageBucket, AGE_BUCKETS, type AgeBucket } from "./invoices";
import { invoiceBalance } from "./invoice-state";
import { customerFace, customerImage } from "./faces";
import { count, dayOf, money, shortDay, storedDay } from "./format";
import type { CustomerPage, CustomerQuery, CustomerRow, CustomersView, CustomerView, StatementLine } from "./customers-view";

/**
 * Books → Sales → Customers (BkCustomers) and one customer (BkCustomer): who
 * owes what, how late, what sits on their account, and the one full-activity
 * statement (invoices, payments, credit notes and write-offs) with a running
 * balance. Customers are the CRM's and the shop's too: one table.
 */

type Db = PrismaClient;

const round = (n: number) => Math.round(n * 100) / 100;
const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

type Position = { owes: number; overdue: number; onAccount: number; lastPaid: Date | null; ages: Record<AgeBucket, number> };

const emptyAges = (): Record<AgeBucket, number> => Object.fromEntries(AGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<AgeBucket, number>;

/** Every customer's position in one currency, from their open invoices and their money on account. */
async function positions(db: Db, companyId: string, currency: string, today: string): Promise<Map<string, Position>> {
  const [invoices, onAccount, paid] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", currency },
      select: { customerId: true, dueDate: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
    }),
    db.salesReceipt.groupBy({ by: ["customerId"], where: { companyId, invoiceId: null, voidedAt: null, customerId: { not: null }, OR: [{ currency }, { currency: null }] }, _sum: { amount: true } }),
    db.salesReceipt.groupBy({ by: ["customerId"], where: { companyId, voidedAt: null, customerId: { not: null } }, _max: { receivedAt: true } }),
  ]);
  const map = new Map<string, Position>();
  const at = (id: string) => {
    let entry = map.get(id);
    if (!entry) {
      entry = { owes: 0, overdue: 0, onAccount: 0, lastPaid: null, ages: emptyAges() };
      map.set(id, entry);
    }
    return entry;
  };
  for (const invoice of invoices) {
    const balance = invoiceBalance(invoice);
    if (balance <= 0.005) continue;
    const entry = at(invoice.customerId);
    entry.owes += balance;
    const due = invoice.dueDate ? storedDay(invoice.dueDate) : null;
    const late = due ? Math.round((midnight(today).getTime() - midnight(due).getTime()) / 86_400_000) : 0;
    if (late > 0) entry.overdue += balance;
    entry.ages[ageBucket(late)] += balance;
  }
  for (const row of onAccount) if (row.customerId) at(row.customerId).onAccount += row._sum.amount ?? 0;
  for (const row of paid) if (row.customerId) at(row.customerId).lastPaid = row._max.receivedAt;
  for (const entry of map.values()) {
    entry.owes = round(entry.owes);
    entry.overdue = round(entry.overdue);
    entry.onAccount = round(entry.onAccount);
    for (const bucket of AGE_BUCKETS) entry.ages[bucket] = round(entry.ages[bucket]);
  }
  return map;
}

export async function mainCurrency(db: Db, companyId: string): Promise<string> {
  const rows = await db.salesInvoice.groupBy({ by: ["currency"], where: { companyId, status: { in: ["ISSUED", "PAID"] } }, _count: true });
  return rows.sort((a, b) => b._count - a._count)[0]?.currency ?? "USD";
}

export const CUSTOMERS_PAGE_SIZE = 50;

export async function readCustomers(db: Db, companyId: string, query: CustomerQuery, now = new Date()): Promise<CustomersView> {
  const today = dayOf(now);
  const currency = query.currency ?? (await mainCurrency(db, companyId));
  const map = await positions(db, companyId, currency, today);
  const base: Prisma.CustomerWhereInput = { companyId, isActive: true, mergedIntoId: null };
  if (query.q) base.OR = [{ name: { contains: query.q, mode: "insensitive" } }, { contactName: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }];
  if (query.vat === "yes") base.vatNumber = { not: null };
  if (query.vat === "no") base.vatNumber = null;
  const owingIds = [...map.entries()].filter(([, entry]) => entry.owes > 0.005).map(([id]) => id);
  const accountIds = [...map.entries()].filter(([, entry]) => entry.onAccount > 0.005).map(([id]) => id);
  const where: Prisma.CustomerWhereInput =
    query.view === "owing" || query.view === "by-age" ? { ...base, id: { in: owingIds } } : query.view === "on-account" ? { ...base, id: { in: accountIds } } : base;
  const [all, owing, onAccount, matching, records, currencies] = await Promise.all([
    db.customer.count({ where: base }),
    db.customer.count({ where: { ...base, id: { in: owingIds } } }),
    db.customer.count({ where: { ...base, id: { in: accountIds } } }),
    db.customer.count({ where }),
    db.customer.findMany({ where, select: { id: true, name: true, contactName: true, phone: true, ...customerFace }, orderBy: { name: "asc" }, take: 5000 }),
    db.salesInvoice.findMany({ where: { companyId }, select: { currency: true }, distinct: ["currency"] }),
  ]);
  // Who owes most first on the money tabs; A to Z on All.
  const sorted =
    query.view === "all" && query.sort === "name"
      ? records
      : [...records].sort((a, b) => (map.get(b.id)?.overdue ?? 0) - (map.get(a.id)?.overdue ?? 0) || (map.get(b.id)?.owes ?? 0) - (map.get(a.id)?.owes ?? 0));
  const page = sorted.slice((query.page - 1) * CUSTOMERS_PAGE_SIZE, query.page * CUSTOMERS_PAGE_SIZE);
  const rows: CustomerRow[] = page.map((record) => {
    const entry = map.get(record.id);
    return {
      id: record.id,
      name: record.name,
      image: customerImage(record),
      contact: record.contactName ?? record.phone ?? null,
      owes: entry?.owes ?? 0,
      overdue: entry?.overdue ?? 0,
      onAccount: entry?.onAccount ?? 0,
      lastPaid: entry?.lastPaid ? shortDay(storedDay(entry.lastPaid)) : null,
      ages: entry?.ages ?? emptyAges(),
    };
  });
  const totals = { owed: 0, overdue: 0, onAccount: 0, owing: 0, late: 0 };
  for (const entry of map.values()) {
    totals.owed += entry.owes;
    totals.overdue += entry.overdue;
    totals.onAccount += entry.onAccount;
    if (entry.owes > 0.005) totals.owing += 1;
    if (entry.overdue > 0.005) totals.late += 1;
  }
  const from = matching === 0 ? 0 : (query.page - 1) * CUSTOMERS_PAGE_SIZE + 1;
  return {
    finding:
      totals.owing === 0
        ? { fact: "No customer owes you anything.", rest: totals.onAccount > 0.005 ? `${money(totals.onAccount, currency)} sits on their accounts.` : null }
        : {
            fact: `${count(totals.owing, "customer")} ${totals.owing === 1 ? "owes" : "owe"} you ${money(totals.owed, currency)}.`,
            rest: totals.late ? `${totals.late} ${totals.late === 1 ? "is" : "are"} late, ${money(totals.overdue, currency)} in all.` : "None is late.",
          },
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts: { all, owing, "by-age": owing, "on-account": onAccount },
    totals: { owed: round(totals.owed), overdue: round(totals.overdue), onAccount: round(totals.onAccount) },
    currency,
    currencies: currencies.map((row) => row.currency).sort(),
    query,
  };
}

/** The full-activity statement (books-final §3.3: one statement, not two) between two days, with the balance brought forward. */
export async function readStatement(db: Db, companyId: string, customerId: string, currency: string, from: string, to: string): Promise<{ lines: StatementLine[]; opening: number; closing: number; invoiced: number; paid: number }> {
  const until = midnight(to);
  until.setUTCDate(until.getUTCDate() + 1);
  const [invoices, receipts, credits, writeOffs] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, customerId, currency, status: { in: ["ISSUED", "PAID", "VOIDED"] }, invoiceDate: { lt: until } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, total: true, status: true, lines: { select: { description: true }, take: 1 } },
    }),
    db.salesReceipt.findMany({
      where: { companyId, voidedAt: null, receivedAt: { lt: until }, OR: [{ customerId }, { invoice: { customerId } }], AND: [{ OR: [{ currency }, { currency: null }] }] },
      select: { id: true, receiptNumber: true, receivedAt: true, amount: true, method: true },
    }),
    db.creditNote.findMany({
      where: { companyId, invoice: { customerId, currency }, status: "ISSUED", noteDate: { lt: until } },
      select: { id: true, noteNumber: true, noteDate: true, total: true },
    }),
    db.salesWriteOff.findMany({
      where: { companyId, invoice: { customerId, currency }, status: "POSTED", createdAt: { lt: until } },
      select: { id: true, writeOffNumber: true, createdAt: true, amount: true },
    }),
  ]);
  type Event = { day: string; document: string; detail: string; href: string | null; invoiced: number; paid: number };
  const events: Event[] = [];
  for (const invoice of invoices) {
    // A voided invoice is cancelled by its credit note or mirror: it shows, and nets to nothing.
    if (invoice.status === "VOIDED") continue;
    events.push({ day: storedDay(invoice.invoiceDate), document: invoice.invoiceNumber ?? "Invoice", detail: invoice.lines[0]?.description ?? "", href: `/books/invoices/${invoice.id}`, invoiced: invoice.total, paid: 0 });
  }
  for (const receipt of receipts) events.push({ day: storedDay(receipt.receivedAt), document: receipt.receiptNumber, detail: receipt.method, href: null, invoiced: 0, paid: receipt.amount });
  for (const note of credits) events.push({ day: storedDay(note.noteDate), document: note.noteNumber ?? "Credit note", detail: "Credit note", href: null, invoiced: 0, paid: note.total });
  for (const writeOff of writeOffs) events.push({ day: storedDay(writeOff.createdAt), document: writeOff.writeOffNumber ?? "Write-off", detail: "Written off", href: null, invoiced: 0, paid: writeOff.amount });
  events.sort((a, b) => a.day.localeCompare(b.day) || b.invoiced - a.invoiced);
  let opening = 0;
  let balance = 0;
  let invoiced = 0;
  let paid = 0;
  const lines: StatementLine[] = [];
  for (const event of events) {
    if (event.day < from) {
      opening += event.invoiced - event.paid;
      balance = opening;
      continue;
    }
    balance += event.invoiced - event.paid;
    invoiced += event.invoiced;
    paid += event.paid;
    lines.push({ date: shortDay(event.day), document: event.document, detail: event.detail, href: event.href, invoiced: event.invoiced ? round(event.invoiced) : null, paid: event.paid ? round(event.paid) : null, balance: round(balance) });
  }
  if (lines.length === 0) balance = opening;
  return { lines, opening: round(opening), closing: round(balance), invoiced: round(invoiced), paid: round(paid) };
}

export async function readCustomer(db: Db, companyId: string, id: string, period: { from?: string | null; to?: string | null } = {}, now = new Date()): Promise<CustomerView | null> {
  const customer = await db.customer.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, contactName: true, phone: true, email: true, address: true, vatNumber: true, taxNumber: true, createdAt: true, ...customerFace },
  });
  if (!customer) return null;
  const today = dayOf(now);
  const currency = await mainCurrency(db, companyId);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const from = period.from && /^\d{4}-\d{2}-\d{2}$/.test(period.from) ? period.from : statementStart(today);
  const to = period.to && /^\d{4}-\d{2}-\d{2}$/.test(period.to) ? period.to : today;
  const [map, invoices, receipts, paidYear, statement, terms] = await Promise.all([
    positions(db, companyId, currency, today),
    db.salesInvoice.findMany({
      where: { companyId, customerId: id },
      orderBy: { invoiceDate: "desc" },
      take: 100,
      select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, status: true, currency: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
    }),
    db.salesReceipt.findMany({
      where: { companyId, OR: [{ customerId: id }, { invoice: { customerId: id } }] },
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: { id: true, receiptNumber: true, receivedAt: true, amount: true, currency: true, voidedAt: true, invoice: { select: { id: true, invoiceNumber: true } }, bankAccount: { select: { name: true, bankName: true, currency: true } }, method: true },
    }),
    db.salesReceipt.aggregate({ where: { companyId, voidedAt: null, receivedAt: { gte: midnight(yearStart) }, OR: [{ customerId: id }, { invoice: { customerId: id } }] }, _sum: { amount: true }, _count: true }),
    readStatement(db, companyId, id, currency, from, to),
    db.salesInvoice.findMany({ where: { companyId, customerId: id, status: { in: ["ISSUED", "PAID"] }, dueDate: { not: null } }, orderBy: { invoiceDate: "desc" }, take: 5, select: { invoiceDate: true, dueDate: true } }),
  ]);
  const position = map.get(id);
  const nextDue = invoices
    .filter((invoice) => invoice.status === "ISSUED" && invoice.dueDate && invoiceBalance(invoice) > 0.005)
    .map((invoice) => storedDay(invoice.dueDate!))
    .sort()[0];
  const usual = terms.length ? Math.round(terms.reduce((sum, row) => sum + (row.dueDate!.getTime() - row.invoiceDate.getTime()) / 86_400_000, 0) / terms.length) : null;
  const page: CustomerPage = {
    id: customer.id,
    name: customer.name,
    image: customerImage(customer),
    line: [customer.contactName ? `Accounts: ${customer.contactName}` : null, `Customer since ${new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "Africa/Harare" }).format(customer.createdAt)}`].filter(Boolean) as string[],
    contact: { phone: customer.phone, email: customer.email, address: customer.address },
    tax: { vatNumber: customer.vatNumber, tin: customer.taxNumber },
    terms: usual !== null ? `${usual} days` : null,
    currency,
    tiles: {
      owes: position?.owes ?? 0,
      nextDue: nextDue ? shortDay(nextDue) : null,
      overdue: position?.overdue ?? 0,
      paidYear: round(paidYear._sum.amount ?? 0),
      paymentsYear: paidYear._count,
    },
    onAccount: position?.onAccount ?? 0,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.invoiceNumber ?? "Draft",
      date: shortDay(storedDay(invoice.invoiceDate)),
      status: invoice.status,
      total: invoice.total,
      balance: invoice.status === "ISSUED" ? invoiceBalance(invoice) : 0,
      currency: invoice.currency,
    })),
    payments: receipts.map((receipt) => ({
      id: receipt.id,
      number: receipt.receiptNumber,
      date: shortDay(storedDay(receipt.receivedAt)),
      forWhat: receipt.voidedAt ? "Void" : (receipt.invoice?.invoiceNumber ?? "On account"),
      invoiceId: receipt.invoice?.id ?? null,
      into: receipt.bankAccount ? `${receipt.bankAccount.bankName || receipt.bankAccount.name}, ${receipt.bankAccount.currency}` : receipt.method,
      amount: receipt.amount,
      currency: receipt.currency ?? currency,
      voided: receipt.voidedAt !== null,
    })),
    statement: { from, to, ...statement },
  };
  return { ...page, ages: position?.ages ?? emptyAges() };
}

/** The statement's default start: the first of the month two months back ("1 Aug" on 18 Oct). */
export function statementStart(today: string): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 3, 1)).toISOString().slice(0, 10);
}
