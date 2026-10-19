import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { docLabel } from "./doc-number";
import { billState } from "./expenses";
import { addDays, count, dayOf, money, monthStart, shortDay, storedDay } from "./format";

/**
 * Books → Bills & spending → Suppliers (BkSuppliers) and one supplier
 * (BkSupplier): what is owed to each and how late, what was paid them this
 * year, their aging from the payables sub-ledger (the same lines the P2 exit
 * ties to 2000), and the write-offs. A supplier's page has their Activity,
 * Bills, Payments, a Statement with its running balance, and Tax. The ITF263,
 * withholding and VAT-agent facts come with P3 (D17).
 */

export const SUPPLIER_VIEWS = ["all", "owed", "by-age", "write-offs"] as const;
export type SupplierView = (typeof SUPPLIER_VIEWS)[number];
export const SUPPLIER_TAB_LABEL: Record<SupplierView, string> = { all: "All", owed: "Owed", "by-age": "By age", "write-offs": "Write-offs" };

export const SUPPLIERS_PAGE_SIZE = 50;

export const supplierQuerySchema = z.object({
  view: z.enum(SUPPLIER_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  currency: z.string().trim().max(3).nullable().catch(null),
  sort: z.enum(["owed", "name"]).catch("owed"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type SupplierQuery = z.infer<typeof supplierQuerySchema>;

export function readSupplierQuery(params: URLSearchParams): SupplierQuery {
  return supplierQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    currency: params.get("currency") || null,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type SupplierRow = { id: string; name: string; contact: string | null; owed: number; overdue: number; paidYear: number; openBills: number; currency: string };
export type AgeRow = { id: string; name: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number };
export type WriteOffRow = { id: string; number: string; supplier: { id: string; name: string }; bill: { id: string; number: string }; reason: string | null; date: string; amount: number; voided: boolean };

export type SuppliersView = {
  finding: { fact: string; rest: string | null };
  rows: SupplierRow[];
  ages: AgeRow[];
  writeOffs: WriteOffRow[];
  range: { from: number; to: number; of: number };
  counts: Record<SupplierView, number>;
  sums: { owed: number; overdue: number; paidYear: number };
  currency: string;
  query: SupplierQuery;
};

type Db = Pick<PrismaClient, "vendor" | "purchaseBill" | "purchasePayment" | "purchaseWriteOff" | "paymentLedgerEntry">;

const round = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

/** "You owe 5 suppliers US$8,077.15." / "2 are overdue, US$2,044.55 in all." */
export function suppliersFinding(owed: { suppliers: number; amount: number }, overdue: Array<{ name: string; amount: number }>, currency = "USD"): { fact: string; rest: string | null } {
  if (owed.suppliers === 0) return { fact: "You owe no supplier anything.", rest: null };
  const fact = `You owe ${count(owed.suppliers, "supplier")} ${money(owed.amount, currency)}.`;
  if (overdue.length === 0) return { fact, rest: "Nothing is overdue." };
  if (overdue.length === 1) return { fact, rest: `${overdue[0].name} is owed ${money(overdue[0].amount, currency)} that is overdue.` };
  return { fact, rest: `${overdue.length} are overdue, ${money(overdue.reduce((sum, row) => sum + row.amount, 0), currency)} in all.` };
}

/** Aging buckets from a supplier's payables lines, aged from each line's date (as `supplierAging` does). */
export function ageLines(lines: Array<{ partyId: string | null; entryDate: Date; debit: number; credit: number }>, names: Map<string, string>, asOf: Date): AgeRow[] {
  const rows = new Map<string, AgeRow>();
  for (const line of lines) {
    if (!line.partyId) continue;
    const owed = line.credit - line.debit;
    if (owed === 0) continue;
    const row = rows.get(line.partyId) ?? { id: line.partyId, name: names.get(line.partyId) ?? "Supplier", current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
    const days = Math.floor((asOf.getTime() - line.entryDate.getTime()) / DAY);
    const bucket = days <= 30 ? "current" : days <= 60 ? "days30" : days <= 90 ? "days60" : days <= 120 ? "days90" : "over90";
    row[bucket] = round(row[bucket] + owed);
    row.total = round(row.total + owed);
    rows.set(line.partyId, row);
  }
  return [...rows.values()].filter((row) => Math.abs(row.total) >= 0.005).sort((a, b) => b.total - a.total);
}

const yearStart = (today: string) => new Date(`${today.slice(0, 4)}-01-01T00:00:00.000+02:00`);

async function owedBySupplier(db: Db, companyId: string, today: string, currency: string) {
  const bills = await db.purchaseBill.findMany({
    where: { companyId, status: "RECEIVED", currency },
    select: { vendorId: true, status: true, billDate: true, dueDate: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true },
  });
  const owed = new Map<string, { owed: number; overdue: number; open: number }>();
  for (const bill of bills) {
    const read = billState(bill, today);
    if (read.balance <= 0.005) continue;
    const row = owed.get(bill.vendorId) ?? { owed: 0, overdue: 0, open: 0 };
    row.owed = round(row.owed + read.balance);
    if (read.state === "overdue") row.overdue = round(row.overdue + read.balance);
    row.open += 1;
    owed.set(bill.vendorId, row);
  }
  return owed;
}

async function paidThisYear(db: Db, companyId: string, today: string, vendorIds?: string[]) {
  const payments = await db.purchasePayment.findMany({
    where: { companyId, status: "PAID", requisitionId: null, paidAt: { gte: yearStart(today) }, ...(vendorIds ? { OR: [{ vendorId: { in: vendorIds } }, { bill: { vendorId: { in: vendorIds } } }] } : {}) },
    select: { amount: true, vendorId: true, bill: { select: { vendorId: true } } },
  });
  const paid = new Map<string, number>();
  for (const payment of payments) {
    const id = payment.vendorId ?? payment.bill?.vendorId;
    if (id) paid.set(id, round((paid.get(id) ?? 0) + payment.amount));
  }
  return paid;
}

export async function readSuppliers(db: Db, companyId: string, query: SupplierQuery, base = "USD", now = new Date(), pageSize = SUPPLIERS_PAGE_SIZE): Promise<SuppliersView> {
  const today = dayOf(now);
  const currency = (query.currency ?? base).toUpperCase();
  const nameWhere: Prisma.VendorWhereInput = { companyId, ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { contactName: { contains: query.q, mode: "insensitive" } }] } : {}) };
  const [vendors, owed, paid, lines, writeOffs, writeOffCount] = await Promise.all([
    db.vendor.findMany({ where: nameWhere, select: { id: true, name: true, contactName: true }, orderBy: { name: "asc" }, take: 2000 }),
    owedBySupplier(db, companyId, today, currency),
    paidThisYear(db, companyId, today),
    query.view === "by-age"
      ? db.paymentLedgerEntry.findMany({ where: { companyId, accountType: "PAYABLE", status: "POSTED", entryDate: { lte: now }, partyId: { not: null } }, select: { partyId: true, entryDate: true, debit: true, credit: true } })
      : Promise.resolve([]),
    query.view === "write-offs"
      ? db.purchaseWriteOff.findMany({
          where: { companyId, ...(query.q ? { bill: { vendor: { name: { contains: query.q, mode: "insensitive" } } } } : {}) },
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * pageSize,
          take: pageSize,
          select: { id: true, writeOffNumber: true, reason: true, amount: true, status: true, createdAt: true, bill: { select: { id: true, billNumber: true, vendor: { select: { id: true, name: true } } } } },
        })
      : Promise.resolve([]),
    db.purchaseWriteOff.count({ where: { companyId } }),
  ]);
  const all: SupplierRow[] = vendors.map((vendor) => {
    const row = owed.get(vendor.id);
    return { id: vendor.id, name: vendor.name, contact: vendor.contactName, owed: row?.owed ?? 0, overdue: row?.overdue ?? 0, paidYear: paid.get(vendor.id) ?? 0, openBills: row?.open ?? 0, currency };
  });
  const owing = all.filter((row) => row.owed > 0.005);
  const listed = (query.view === "owed" ? owing : all).sort((a, b) => (query.sort === "name" ? a.name.localeCompare(b.name) : b.owed - a.owed || a.name.localeCompare(b.name)));
  const names = new Map(vendors.map((vendor) => [vendor.id, vendor.name]));
  const ages = query.view === "by-age" ? ageLines(lines, names, now).filter((row) => names.has(row.id)) : [];
  const skip = (query.page - 1) * pageSize;
  const page = listed.slice(skip, skip + pageSize);
  const of = query.view === "by-age" ? ages.length : query.view === "write-offs" ? writeOffCount : listed.length;
  const shown = query.view === "by-age" ? ages.length : query.view === "write-offs" ? writeOffs.length : page.length;
  const from = of === 0 ? 0 : query.view === "by-age" ? 1 : skip + 1;
  const late = owing.filter((row) => row.overdue > 0.005).sort((a, b) => b.overdue - a.overdue);
  return {
    finding: suppliersFinding({ suppliers: owing.length, amount: round(owing.reduce((sum, row) => sum + row.owed, 0)) }, late.map((row) => ({ name: row.name, amount: row.overdue })), currency),
    rows: query.view === "by-age" || query.view === "write-offs" ? [] : page,
    ages,
    writeOffs: writeOffs.map((row) => ({
      id: row.id,
      number: row.writeOffNumber ?? "Write-off",
      supplier: row.bill.vendor,
      bill: { id: row.bill.id, number: docLabel(row.bill.billNumber, "bill") },
      reason: row.reason,
      date: shortDay(dayOf(row.createdAt)),
      amount: round(row.amount),
      voided: row.status === "VOIDED",
    })),
    range: { from, to: from === 0 ? 0 : from + shown - 1, of },
    counts: { all: all.length, owed: owing.length, "by-age": owing.length, "write-offs": writeOffCount },
    sums: { owed: round(owing.reduce((sum, row) => sum + row.owed, 0)), overdue: round(owing.reduce((sum, row) => sum + row.overdue, 0)), paidYear: round(all.reduce((sum, row) => sum + row.paidYear, 0)) },
    currency,
    query,
  };
}

/* ── One supplier ──────────────────────────────────────────────────────── */

export const SUPPLIER_TABS = ["activity", "bills", "payments", "statement", "tax"] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number];

export type SupplierStatementLine = { date: string; document: string; detail: string; href: string | null; billed: number | null; paid: number | null; balance: number };

export type SupplierRecord = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  terms: string;
  currency: string;
  payTo: string | null;
  delivers: string | null;
  /** What their bills were for, most often first: "Oak strip, skirting, underlay". */
  supplies: string | null;
  tax: { vatNumber: string | null; tin: string | null; checked: number; valid: number; billsWithTax: number };
  tiles: { owed: number; late: number; paidYear: number; payments: number; onOrder: number; firstOrder: string | null };
  state: "owed" | "overdue" | "paid-up";
  bills: Array<{ id: string; number: string; date: string; fti: string | null; fdms: string; state: string; total: number; balance: number }>;
  payments: Array<{ id: string; number: string; date: string; bill: { id: string; number: string } | null; from: string | null; state: string; amount: number; voided: boolean }>;
  statement: { from: string; to: string; opening: number; lines: SupplierStatementLine[]; closing: number };
};

type RecordDb = Pick<PrismaClient, "vendor" | "purchaseBill" | "purchasePayment" | "retailPurchaseOrder">;

const PAYMENT_STATE: Record<string, string> = { DRAFT: "Draft", TO_APPROVE: "To approve", APPROVED: "Approved", PAID: "Paid", VOIDED: "Void" };
const FDMS: Record<string, string> = { NOT_CHECKED: "Not checked", VALID: "Valid", NOT_VALID: "Not valid" };
const BILL_STATE: Record<string, string> = { draft: "Draft", "to-pay": "To pay", "part-paid": "Part paid", overdue: "Overdue", paid: "Paid", void: "Void" };

/** The three things a supplier's bills are most often for, by their lines' words: "Oak strip, skirting, underlay". */
export function suppliesOf(descriptions: string[], most = 3): string | null {
  const seen = new Map<string, { text: string; times: number }>();
  for (const description of descriptions) {
    const text = description.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const known = seen.get(key);
    if (known) known.times += 1;
    else seen.set(key, { text, times: 1 });
  }
  const top = [...seen.values()].sort((a, b) => b.times - a.times).slice(0, most);
  return top.length ? top.map((item) => item.text).join(", ") : null;
}

/** The statement's lines in date order with the running balance: a bill adds what is owed; a payment, debit note or write-off takes it off. */
export function statementLines(
  events: Array<{ day: string; document: string; detail: string; href: string | null; billed: number; paid: number }>,
  opening: number,
): { lines: SupplierStatementLine[]; closing: number } {
  let balance = opening;
  const lines = [...events]
    .sort((a, b) => a.day.localeCompare(b.day) || (a.billed ? -1 : 1))
    .map((event) => {
      balance = round(balance + event.billed - event.paid);
      return { date: shortDay(event.day), document: event.document, detail: event.detail, href: event.href, billed: event.billed ? event.billed : null, paid: event.paid ? event.paid : null, balance };
    });
  return { lines, closing: round(balance) };
}

export async function readSupplierRecord(db: RecordDb, companyId: string, id: string, period: { from: string; to: string } | null, base = "USD", now = new Date()): Promise<SupplierRecord | null> {
  const vendor = await db.vendor.findFirst({ where: { id, companyId } });
  if (!vendor) return null;
  const today = dayOf(now);
  const [bills, payments, orders] = await Promise.all([
    db.purchaseBill.findMany({
      where: { companyId, vendorId: id },
      orderBy: { billDate: "desc" },
      select: {
        id: true,
        billNumber: true,
        billDate: true,
        dueDate: true,
        status: true,
        currency: true,
        total: true,
        taxTotal: true,
        amountPaid: true,
        debitNoteTotal: true,
        writeOffTotal: true,
        supplierFtiNumber: true,
        fdmsStatus: true,
        debitNotes: { where: { status: "ISSUED" }, select: { noteNumber: true, noteDate: true, total: true } },
        writeOffs: { where: { status: "POSTED" }, select: { writeOffNumber: true, createdAt: true, amount: true } },
        lines: { select: { description: true }, take: 20 },
      },
    }),
    db.purchasePayment.findMany({
      where: { companyId, requisitionId: null, OR: [{ vendorId: id }, { bill: { vendorId: id } }] },
      orderBy: { paidAt: "desc" },
      select: { id: true, paymentNumber: true, groupNo: true, status: true, paidAt: true, amount: true, bill: { select: { id: true, billNumber: true } }, bankAccount: { select: { name: true, bankName: true, currency: true } } },
    }),
    db.retailPurchaseOrder.findMany({ where: { companyId, vendorId: id, status: { in: ["SENT", "PARTIAL", "TO_APPROVE"] }, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { poNo: true, lines: { select: { quantity: true, receivedQuantity: true, unitCost: true, vatRate: true } } } }),
  ]);
  const currencies = new Map<string, number>();
  for (const bill of bills) currencies.set(bill.currency, (currencies.get(bill.currency) ?? 0) + 1);
  const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? base;
  let owed = 0;
  let overdue = 0;
  let late = 0;
  for (const bill of bills) {
    if (bill.status !== "RECEIVED" || bill.currency !== currency) continue;
    const read = billState(bill, today);
    owed += read.balance;
    if (read.state === "overdue") {
      overdue += read.balance;
      const days = bill.dueDate ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${storedDay(bill.dueDate)}T00:00:00Z`)) / DAY) : 0;
      late = Math.max(late, days);
    }
  }
  const year = yearStart(today);
  const paidYear = payments.filter((payment) => payment.status === "PAID" && payment.paidAt >= year);
  const onOrder = round(orders.reduce((sum, order) => sum + order.lines.reduce((total, line) => total + Math.max(0, Number(line.quantity) - Number(line.receivedQuantity)) * Number(line.unitCost) * (1 + Number(line.vatRate) / 100), 0), 0));

  // The statement: the period's bills, debit notes, write-offs and payments, after what was owed before it.
  const to = period?.to ?? today;
  // The last three months by default: this month and the two before it.
  const from = period?.from ?? monthStart(addDays(monthStart(addDays(monthStart(today), -1)), -1));
  const events: Array<{ day: string; document: string; detail: string; href: string | null; billed: number; paid: number }> = [];
  for (const bill of bills) {
    if (bill.status === "DRAFT" || bill.status === "VOIDED" || bill.currency !== currency) continue;
    events.push({ day: storedDay(bill.billDate), document: docLabel(bill.billNumber, "bill"), detail: bill.supplierFtiNumber ? `Their invoice ${bill.supplierFtiNumber}` : "Bill", href: `/books/bills/${bill.id}`, billed: bill.total, paid: 0 });
    for (const note of bill.debitNotes) events.push({ day: storedDay(note.noteDate), document: note.noteNumber ?? "Debit note", detail: `Debit note on ${docLabel(bill.billNumber, "bill")}`, href: `/books/bills/${bill.id}`, billed: 0, paid: note.total });
    for (const writeOff of bill.writeOffs) events.push({ day: dayOf(writeOff.createdAt), document: writeOff.writeOffNumber ?? "Write-off", detail: `Written off on ${docLabel(bill.billNumber, "bill")}`, href: `/books/bills/${bill.id}`, billed: 0, paid: writeOff.amount });
  }
  for (const payment of payments) {
    if (payment.status !== "PAID") continue;
    events.push({ day: storedDay(payment.paidAt), document: payment.paymentNumber ?? payment.groupNo ?? "Payment", detail: payment.bill ? `Paid on ${docLabel(payment.bill.billNumber, "bill")}` : "Paid", href: payment.bill ? `/books/bills/${payment.bill.id}` : null, billed: 0, paid: payment.amount });
  }
  const before = events.filter((event) => event.day < from);
  const within = events.filter((event) => event.day >= from && event.day <= to);
  const opening = round(before.reduce((sum, event) => sum + event.billed - event.paid, 0));
  const statement = statementLines(within, opening);

  const checked = bills.filter((bill) => bill.fdmsStatus !== "NOT_CHECKED").length;
  const valid = bills.filter((bill) => bill.fdmsStatus === "VALID").length;
  return {
    id: vendor.id,
    name: vendor.name,
    contact: vendor.contactName,
    phone: vendor.phone,
    email: vendor.email,
    address: vendor.address,
    terms: vendor.payTermsDays === null || vendor.payTermsDays === undefined ? "On delivery" : vendor.payTermsDays === 0 ? "On receipt" : `${vendor.payTermsDays} days`,
    currency,
    payTo: vendor.bankDetails,
    delivers: vendor.deliversOn,
    supplies: suppliesOf(bills.filter((bill) => bill.status !== "VOIDED").flatMap((bill) => bill.lines.map((line) => line.description))),
    tax: { vatNumber: vendor.vatNumber, tin: vendor.taxNumber, checked, valid, billsWithTax: bills.filter((bill) => bill.taxTotal > 0).length },
    tiles: { owed: round(owed), late, paidYear: round(paidYear.reduce((sum, payment) => sum + payment.amount, 0)), payments: paidYear.length, onOrder, firstOrder: orders[0]?.poNo ?? null },
    state: overdue > 0.005 ? "overdue" : owed > 0.005 ? "owed" : "paid-up",
    bills: bills.map((bill) => {
      const read = billState(bill, today);
      return { id: bill.id, number: docLabel(bill.billNumber, "bill"), date: shortDay(storedDay(bill.billDate)), fti: bill.supplierFtiNumber, fdms: FDMS[bill.fdmsStatus], state: BILL_STATE[read.state], total: round(bill.total), balance: read.balance };
    }),
    payments: payments.map((payment) => ({
      id: payment.id,
      number: payment.paymentNumber ?? payment.groupNo ?? "Draft",
      date: shortDay(storedDay(payment.paidAt)),
      bill: payment.bill ? { id: payment.bill.id, number: docLabel(payment.bill.billNumber, "bill") } : null,
      from: payment.bankAccount ? `${payment.bankAccount.bankName || payment.bankAccount.name}, ${payment.bankAccount.currency}` : null,
      state: PAYMENT_STATE[payment.status] ?? payment.status,
      amount: round(payment.amount),
      voided: payment.status === "VOIDED",
    })),
    statement: { from, to, opening, lines: statement.lines, closing: statement.closing },
  };
}

/** The supplier as its page reads it, with what this person may do (`GET /api/books/suppliers/[id]`). */
export type SupplierRecordPage = SupplierRecord & { can: { pay: boolean; bill: boolean; order: boolean } };

/** The list as its page reads it (`GET /api/books/suppliers`). */
export type SuppliersPage = SuppliersView & { can: { create: boolean; pay: boolean } };

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The tab as filtered, every page, for Export. */
export function suppliersCsv(view: SuppliersView): string {
  const rows: Array<Array<string | number>> =
    view.query.view === "by-age"
      ? [["Supplier", "Up to 30 days", "31 to 60", "61 to 90", "Over 90", "We owe"], ...view.ages.map((row) => [row.name, row.current.toFixed(2), row.days30.toFixed(2), row.days60.toFixed(2), (row.days90 + row.over90).toFixed(2), row.total.toFixed(2)])]
      : view.query.view === "write-offs"
        ? [["Write-off", "Supplier", "Bill", "Why", "Date", "Amount"], ...view.writeOffs.map((row) => [row.number, row.supplier.name, row.bill.number, row.reason ?? "", row.date, row.amount.toFixed(2)])]
        : [["Supplier", "Open bills", "We owe", "Overdue", "Paid this year"], ...view.rows.map((row) => [row.name, row.openBills, row.owed.toFixed(2), row.overdue.toFixed(2), row.paidYear.toFixed(2)])];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
