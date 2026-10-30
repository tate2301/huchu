import type { FdmsCheckStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { docLabel } from "./doc-number";
import { billState, type ExpenseState } from "./expenses";
import { addDays, count, dayOf, money, shortDay, storedDay } from "./format";
import { moneyLimits } from "./core/approvals";
import {
  BILL_DUE_LABEL,
  BILL_DUES,
  BILL_STATE_WORD,
  BILL_TAB_LABEL,
  BILL_VIEWS,
  BILLS_PAGE_SIZE,
  FDMS_LABEL,
  type BillDue,
  type BillView,
} from "./bills-labels";

export {
  BILL_DUE_LABEL,
  BILL_DUES,
  BILL_STATE_WORD,
  BILL_TAB_LABEL,
  BILL_VIEWS,
  BILLS_PAGE_SIZE,
  FDMS_LABEL,
  type BillDue,
  type BillView,
};

/** The days a Due choice covers, both ends included; null for any. */
export function dueWindow(due: BillDue, today: string): { gte: string; lte: string } | null {
  if (due === "any") return null;
  if (due === "this-week") return { gte: today, lte: comingSunday(today) };
  if (due === "next-30") return { gte: today, lte: addDays(today, 30) };
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { gte: `${today.slice(0, 7)}-01`, lte: addDays(next, -1) };
}

export const billQuerySchema = z.object({
  view: z.enum(BILL_VIEWS).catch("to-pay"),
  q: z.string().trim().max(100).catch(""),
  supplier: z.string().uuid().nullable().catch(null),
  fdms: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).nullable().catch(null),
  due: z.enum(BILL_DUES).catch("any"),
  sort: z.enum(["due", "newest"]).catch("due"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type BillQuery = z.infer<typeof billQuerySchema>;

export function readBillQuery(params: URLSearchParams): BillQuery {
  return billQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    supplier: params.get("supplier") || null,
    fdms: params.get("fdms") || null,
    due: params.get("due") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type BillRow = {
  id: string;
  /** A bill's own page, or the bill a debit note is against. */
  href: string;
  number: string;
  supplier: { id: string; name: string };
  /** What it was for: its first line, or its note. */
  what: string | null;
  /** The FDMS check; null for a debit note. */
  fdms: FdmsCheckStatus | null;
  /** Their fiscal invoice number, as they printed it. */
  fti: string | null;
  /** "1 Oct", and when it falls due ("7 Oct"); null for a debit note's due date. */
  dated: string;
  due: string | null;
  /** The VAT on it, which is claimed only once FDMS shows the invoice valid. */
  vat: number;
  /** A draft over the owner's limit, waiting for the owner. */
  toApprove: boolean;
  /** The order and goods receipt it matches: "PO-0032 · GRN-0046", or null. */
  matches: { order: string | null; receipt: string | null; bill: string | null };
  state: ExpenseState;
  stateLabel: string;
  when: string;
  balance: number;
  total: number;
  currency: string;
};

export type BillsView = {
  finding: { fact: string; rest: string | null };
  rows: BillRow[];
  range: { from: number; to: number; of: number };
  counts: Record<BillView, number>;
  /** What is to pay, and of it what falls due by Sunday, in `currency`. */
  toPay: number;
  dueBySunday: number;
  currency: string;
  suppliers: Array<{ id: string; name: string }>;
  /** Draft bills a goods receipt made, waiting for the supplier's invoice (From a goods receipt). */
  fromReceipts: Array<{ id: string; receipt: string; supplier: string; total: number; currency: string }>;
  query: BillQuery;
};

type Db = Pick<PrismaClient, "purchaseBill" | "debitNote">;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const round = (n: number) => Math.round(n * 100) / 100;

/** The Sunday that ends this week (today, when today is Sunday). */
export function comingSunday(today: string): string {
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return addDays(today, (7 - weekday) % 7);
}

export function billWhere(companyId: string, query: BillQuery, today: string): Prisma.PurchaseBillWhereInput {
  const where: Prisma.PurchaseBillWhereInput = { companyId };
  if (query.view === "to-pay") where.status = "RECEIVED";
  if (query.view === "overdue") Object.assign(where, { status: "RECEIVED", dueDate: { lt: midnight(today) } });
  if (query.view === "paid") where.status = "PAID";
  if (query.view === "drafts") where.status = "DRAFT";
  if (query.view === "void") where.status = "VOIDED";
  if (query.supplier) where.vendorId = query.supplier;
  if (query.fdms) where.fdmsStatus = query.fdms;
  const window = dueWindow(query.due, today);
  if (window) where.dueDate = { gte: midnight(window.gte), lt: midnight(addDays(window.lte, 1)) };
  if (query.q) {
    where.OR = [
      { billNumber: { contains: query.q, mode: "insensitive" } },
      { supplierFtiNumber: { contains: query.q, mode: "insensitive" } },
      { vendor: { name: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  return where;
}

const billSelect = {
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
  notes: true,
  fdmsStatus: true,
  supplierFtiNumber: true,
  taxTotal: true,
  approvedById: true,
  vendor: { select: { id: true, name: true } },
  purchaseOrder: { select: { poNo: true } },
  goodsReceipt: { select: { receiptNo: true } },
  lines: { select: { description: true }, take: 1 },
} satisfies Prisma.PurchaseBillSelect;

type BillRecord = Prisma.PurchaseBillGetPayload<{ select: typeof billSelect }>;

export function toBillRow(record: BillRecord, today: string, limit = Infinity): BillRow {
  const read = billState(record, today);
  const toApprove = record.status === "DRAFT" && record.total > limit + 0.004 && !record.approvedById;
  return {
    id: record.id,
    href: `/books/bills/${record.id}`,
    number: docLabel(record.billNumber, "bill"),
    supplier: record.vendor,
    what: record.lines[0]?.description ?? record.notes ?? null,
    fdms: record.fdmsStatus,
    fti: record.supplierFtiNumber,
    dated: shortDay(storedDay(record.billDate)),
    due: record.dueDate ? shortDay(storedDay(record.dueDate)) : null,
    vat: round(record.taxTotal),
    toApprove,
    matches: { order: record.purchaseOrder?.poNo ?? null, receipt: record.goodsReceipt?.receiptNo ?? null, bill: null },
    state: read.state,
    stateLabel: toApprove ? "To approve" : BILL_STATE_WORD[read.state],
    when: read.when,
    balance: read.balance,
    total: record.total,
    currency: record.currency,
  };
}

/** "You owe US$8,077.15 on 5 bills, US$4,897.15 by Sunday." / "Mutare Timber Works' bill is 2 days late." */
export function billsFinding(
  toPay: { amount: number; bills: number; bySunday: number },
  overdue: Array<{ supplier: string; days: number; balance: number }>,
  currency = "USD",
): { fact: string; rest: string | null } {
  if (toPay.bills === 0) return { fact: "You owe no supplier anything.", rest: "Every bill recorded is paid." };
  const fact = `You owe ${money(toPay.amount, currency)} on ${count(toPay.bills, "bill")}${toPay.bySunday > 0.005 ? `, ${money(toPay.bySunday, currency)} by Sunday` : ""}.`;
  if (overdue.length === 0) return { fact, rest: "None is late." };
  if (overdue.length === 1) {
    const [late] = overdue;
    return { fact, rest: `${late.supplier}${late.supplier.endsWith("s") ? "'" : "'s"} bill is ${count(late.days, "day")} late.` };
  }
  return { fact, rest: `${overdue.length} are late, ${money(overdue.reduce((sum, row) => sum + row.balance, 0), currency)} in all.` };
}

/** What is owed on every bill recorded, in the currency most are in: the finding and the footer's sums. */
async function owed(db: Db, companyId: string, today: string) {
  const open = await db.purchaseBill.findMany({
    where: { companyId, status: "RECEIVED" },
    select: { currency: true, dueDate: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, status: true, billDate: true, vendor: { select: { name: true } } },
  });
  const byCurrency = new Map<string, number>();
  for (const bill of open) byCurrency.set(bill.currency, (byCurrency.get(bill.currency) ?? 0) + 1);
  const currency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const sunday = comingSunday(today);
  const toPay = { amount: 0, bills: 0, bySunday: 0 };
  const overdue: Array<{ supplier: string; days: number; balance: number }> = [];
  for (const bill of open) {
    if (bill.currency !== currency) continue;
    const read = billState(bill, today);
    if (read.balance <= 0.005) continue;
    toPay.amount += read.balance;
    toPay.bills += 1;
    const due = bill.dueDate ? storedDay(bill.dueDate) : null;
    if (due && due <= sunday) toPay.bySunday += read.balance;
    if (read.state === "overdue" && due) {
      const days = Math.round((midnight(today).getTime() - midnight(due).getTime()) / 86_400_000);
      overdue.push({ supplier: bill.vendor.name, days, balance: read.balance });
    }
  }
  return { currency, toPay: { amount: round(toPay.amount), bills: toPay.bills, bySunday: round(toPay.bySunday) }, overdue };
}

async function tabCounts(db: Db, companyId: string, today: string): Promise<Record<BillView, number>> {
  const [toPay, overdue, paid, drafts, notes, voided] = await Promise.all([
    db.purchaseBill.count({ where: { companyId, status: "RECEIVED" } }),
    db.purchaseBill.count({ where: { companyId, status: "RECEIVED", dueDate: { lt: midnight(today) } } }),
    db.purchaseBill.count({ where: { companyId, status: "PAID" } }),
    db.purchaseBill.count({ where: { companyId, status: "DRAFT" } }),
    db.debitNote.count({ where: { companyId } }),
    db.purchaseBill.count({ where: { companyId, status: "VOIDED" } }),
  ]);
  return { "to-pay": toPay, overdue, paid, drafts, "debit-notes": notes, void: voided };
}

const NOTE_STATE: Record<string, { state: ExpenseState; label: string }> = {
  DRAFT: { state: "draft", label: "Draft" },
  ISSUED: { state: "paid", label: "Issued" },
  VOIDED: { state: "void", label: "Void" },
};

async function debitNoteRows(db: Db, companyId: string, query: BillQuery): Promise<{ rows: BillRow[]; of: number }> {
  const where: Prisma.DebitNoteWhereInput = {
    companyId,
    ...(query.supplier ? { bill: { vendorId: query.supplier } } : {}),
    ...(query.q
      ? { OR: [{ noteNumber: { contains: query.q, mode: "insensitive" } }, { bill: { vendor: { name: { contains: query.q, mode: "insensitive" } } } }, { reason: { contains: query.q, mode: "insensitive" } }] }
      : {}),
  };
  const [notes, of] = await Promise.all([
    db.debitNote.findMany({
      where,
      orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * BILLS_PAGE_SIZE,
      take: BILLS_PAGE_SIZE,
      select: { id: true, noteNumber: true, noteDate: true, status: true, total: true, currency: true, reason: true, bill: { select: { id: true, billNumber: true, vendor: { select: { id: true, name: true } } } } },
    }),
    db.debitNote.count({ where }),
  ]);
  return {
    of,
    rows: notes.map((note) => {
      const state = NOTE_STATE[note.status] ?? NOTE_STATE.DRAFT;
      return {
        id: note.id,
        href: `/books/bills/${note.bill.id}`,
        number: docLabel(note.noteNumber, "debit note"),
        supplier: note.bill.vendor,
        what: note.reason,
        fdms: null,
        fti: null,
        dated: shortDay(storedDay(note.noteDate)),
        due: null,
        vat: 0,
        toApprove: false,
        matches: { order: null, receipt: null, bill: docLabel(note.bill.billNumber, "bill") },
        state: state.state,
        stateLabel: state.label,
        when: shortDay(storedDay(note.noteDate)),
        balance: note.status === "VOIDED" ? 0 : note.total,
        total: note.total,
        currency: note.currency,
      };
    }),
  };
}

export async function readBills(db: Db, companyId: string, query: BillQuery, now = new Date()): Promise<BillsView> {
  const today = dayOf(now);
  const where = billWhere(companyId, query, today);
  const limit = (await moneyLimits(companyId)).paymentOwnerOver;
  const [listed, totals, counts, supplierRows, receiptDrafts] = await Promise.all([
    query.view === "debit-notes"
      ? debitNoteRows(db, companyId, query)
      : Promise.all([
          db.purchaseBill.findMany({
            where,
            select: billSelect,
            orderBy: query.sort === "due" && (query.view === "to-pay" || query.view === "overdue") ? [{ dueDate: { sort: "asc", nulls: "last" } }, { billNumber: "asc" }] : [{ billDate: "desc" }, { billNumber: "desc" }],
            skip: (query.page - 1) * BILLS_PAGE_SIZE,
            take: BILLS_PAGE_SIZE,
          }),
          db.purchaseBill.count({ where }),
        ]).then(([records, of]) => ({ rows: records.map((record) => toBillRow(record, today, limit)), of })),
    owed(db, companyId, today),
    tabCounts(db, companyId, today),
    db.purchaseBill.findMany({ where: { companyId }, select: { vendor: { select: { id: true, name: true } } }, distinct: ["vendorId"] }),
    db.purchaseBill.findMany({
      where: { companyId, status: "DRAFT", goodsReceiptId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, total: true, currency: true, vendor: { select: { name: true } }, goodsReceipt: { select: { receiptNo: true } } },
    }),
  ]);
  const from = listed.of === 0 ? 0 : (query.page - 1) * BILLS_PAGE_SIZE + 1;
  return {
    finding: billsFinding(totals.toPay, totals.overdue, totals.currency),
    rows: listed.rows,
    range: { from, to: from === 0 ? 0 : from + listed.rows.length - 1, of: listed.of },
    counts,
    toPay: totals.toPay.amount,
    dueBySunday: totals.toPay.bySunday,
    currency: totals.currency,
    suppliers: supplierRows.map((row) => row.vendor).sort((a, b) => a.name.localeCompare(b.name)),
    fromReceipts: receiptDrafts.map((bill) => ({ id: bill.id, receipt: bill.goodsReceipt?.receiptNo ?? "Goods receipt", supplier: bill.vendor.name, total: round(bill.total), currency: bill.currency })),
    query,
  };
}

/** The list as filtered, every page, for Export. */
export async function billsCsv(db: Db, companyId: string, query: BillQuery, now = new Date()): Promise<string> {
  const today = dayOf(now);
  const limit = (await moneyLimits(companyId)).paymentOwnerOver;
  const rows =
    query.view === "debit-notes"
      ? (await debitNoteRows(db, companyId, { ...query, page: 1 })).rows
      : (await db.purchaseBill.findMany({ where: billWhere(companyId, query, today), select: billSelect, orderBy: [{ billDate: "desc" }], take: 10_000 })).map((record) => toBillRow(record, today, limit));
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Bill", "Supplier", "For", "FDMS", "Order", "Goods received", "State", "When", "Currency", "Total", "Balance"].join(",")];
  for (const row of rows) {
    lines.push(
      [row.number, row.supplier.name, row.what ?? "", row.fdms ? FDMS_LABEL[row.fdms] : "", row.matches.order ?? "", row.matches.receipt ?? "", row.stateLabel, row.when, row.currency, row.total.toFixed(2), row.balance.toFixed(2)]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
