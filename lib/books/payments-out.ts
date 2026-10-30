import type { Prisma, PrismaClient, PurchasePaymentStatus } from "@prisma/client";
import { z } from "zod";

import { imttOn } from "./core/bank";
import { MONEY_OUT_WHERE } from "./core/money-out-where";
import { taxSettings } from "./core/tax-settings";
import { quoteWithholding } from "./core/withholding";
import { docLabel } from "./doc-number";
import { count, dayOf, money, monthName, monthStart, shortDay, storedDay } from "./format";
import { itf263State } from "./itf263";
import { periodRange, PERIODS } from "./period";
import {
  PAYMENT_OUT_STATE,
  PAYMENT_OUT_TAB_LABEL,
  PAYMENT_OUT_VIEWS,
  PAYMENTS_OUT_PAGE_SIZE,
  type PaymentOutView,
} from "./payments-out-labels";

export {
  PAYMENT_OUT_STATE,
  PAYMENT_OUT_TAB_LABEL,
  PAYMENT_OUT_VIEWS,
  PAYMENTS_OUT_PAGE_SIZE,
  type PaymentOutView,
};

export const paymentOutQuerySchema = z.object({
  view: z.enum(PAYMENT_OUT_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  supplier: z.string().uuid().nullable().catch(null),
  account: z.string().uuid().nullable().catch(null),
  period: z.enum(PERIODS).catch("any"),
  sort: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type PaymentOutQuery = z.infer<typeof paymentOutQuerySchema>;

export function readPaymentOutQuery(params: URLSearchParams): PaymentOutQuery {
  return paymentOutQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    supplier: params.get("supplier") || null,
    account: params.get("account") || null,
    period: params.get("period") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type PaymentOutRow = {
  id: string;
  number: string;
  date: string;
  supplier: { id: string; name: string } | null;
  /** The bill it pays ("BILL-0220"), with its id; else its reference. */
  bill: { id: string; number: string } | null;
  forWhat: string;
  from: string | null;
  status: PurchasePaymentStatus;
  state: string;
  /** Gross: what the bills are cleared by. */
  amount: number;
  /** Withheld for ZIMRA (D17): what it did once paid; what it will while it waits. */
  withheld: number;
  /** What the supplier is paid: gross less withheld. */
  paid: number;
  /** One short fact: the missing ITF263 on one still to pay, the IMTT on one paid, the reason on a void. */
  note: { text: string; warn: boolean } | null;
  currency: string;
  createdById: string | null;
  voided: { on: string; reason: string | null } | null;
};

export type PaymentsOutView = {
  finding: { fact: string; rest: string | null };
  rows: PaymentOutRow[];
  range: { from: number; to: number; of: number };
  counts: Record<PaymentOutView, number>;
  month: { name: string; paid: number; imtt: number };
  waiting: number;
  currency: string;
  suppliers: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
  query: PaymentOutQuery;
};

type Db = Pick<PrismaClient, "purchasePayment" | "bankAccount" | "vendor" | "journalLine">;

const round = (n: number) => Math.round(n * 100) / 100;
/** A Harare calendar day's first instant: Harare is UTC+2 all year. */
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);

export function paymentOutWhere(companyId: string, query: PaymentOutQuery, today = dayOf(new Date())): Prisma.PurchasePaymentWhereInput {
  const where: Prisma.PurchasePaymentWhereInput = { companyId, requisitionId: null };
  const range = periodRange(query.period, today);
  if (range) where.paidAt = range;
  if (query.view === "to-approve") where.status = { in: ["TO_APPROVE", "APPROVED"] };
  if (query.view === "paid") where.status = "PAID";
  if (query.view === "void") where.status = "VOIDED";
  if (query.supplier) where.OR = [{ vendorId: query.supplier }, { bill: { vendorId: query.supplier } }];
  if (query.account) where.bankAccountId = query.account;
  if (query.q) {
    const q = { contains: query.q, mode: "insensitive" as const };
    where.AND = [{ OR: [{ paymentNumber: q }, { reference: q }, { vendor: { name: q } }, { bill: { billNumber: q } }, { bill: { vendor: { name: q } } }] }];
  }
  return where;
}

/** "$6,088.90 was paid out this month." / "$1,301.68 to Mutare Timber Works waits for approval." */
export function paymentsOutFinding(
  paid: number,
  waiting: Array<{ supplier: string | null; amount: number }>,
  currency = "USD",
): { fact: string; rest: string | null } {
  const fact = paid > 0.005 ? `${money(paid, currency)} was paid out this month.` : "Nothing has been paid to suppliers this month.";
  if (waiting.length === 0) return { fact, rest: null };
  if (waiting.length === 1) return { fact, rest: `${money(waiting[0].amount, currency)}${waiting[0].supplier ? ` to ${waiting[0].supplier}` : ""} waits for approval.` };
  return { fact, rest: `${count(waiting.length, "payment")} wait for approval, ${money(waiting.reduce((sum, row) => sum + row.amount, 0), currency)} in all.` };
}

const rowSelect = {
  id: true,
  paymentNumber: true,
  groupNo: true,
  status: true,
  paidAt: true,
  amount: true,
  reference: true,
  createdById: true,
  voidedAt: true,
  voidReason: true,
  exchangeRate: true,
  withholdingAmount: true,
  vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } },
  bankAccount: { select: { name: true, bankName: true, currency: true } },
  bill: { select: { id: true, billNumber: true, currency: true, vendor: { select: { id: true, name: true, itf263Number: true, itf263ExpiresAt: true } } } },
} satisfies Prisma.PurchasePaymentSelect;

type RowRecord = Prisma.PurchasePaymentGetPayload<{ select: typeof rowSelect }>;

/** What is worked out beside the stored row: the tax withheld and the IMTT, in money. */
type Worked = { withheld: number; imtt: number };

export function toPaymentOutRow(record: RowRecord, base: string, worked: Worked, now = new Date()): PaymentOutRow {
  const found = record.vendor ?? record.bill?.vendor ?? null;
  const supplier = found ? { id: found.id, name: found.name } : null;
  const currency = record.bill?.currency ?? record.bankAccount?.currency ?? base;
  const unpaid = record.status !== "PAID" && record.status !== "VOIDED";
  const clearance = found && unpaid ? itf263State(found, now) : null;
  const note: PaymentOutRow["note"] = record.status === "VOIDED"
    ? record.voidReason
      ? { text: record.voidReason, warn: false }
      : null
    : clearance && clearance.state !== "Valid"
      ? { text: clearance.state === "None" ? "No ITF263" : "ITF263 expired", warn: true }
      : record.status === "PAID" && worked.imtt > 0.004
        ? { text: `IMTT ${money(worked.imtt, currency)}`, warn: false }
        : null;
  return {
    id: record.id,
    // A number is given when it is paid: a draft says so, one approved or waiting has none yet.
    number: record.paymentNumber ?? record.groupNo ?? (record.status === "DRAFT" ? "Draft" : "—"),
    date: shortDay(storedDay(record.paidAt)),
    supplier,
    bill: record.bill ? { id: record.bill.id, number: docLabel(record.bill.billNumber, "bill") } : null,
    forWhat: record.bill ? docLabel(record.bill.billNumber, "bill") : (record.reference ?? "On account"),
    from: record.bankAccount?.name ?? null,
    status: record.status,
    state: PAYMENT_OUT_STATE[record.status],
    amount: round(record.amount),
    withheld: round(worked.withheld),
    paid: round(record.amount - worked.withheld),
    note,
    currency,
    createdById: record.createdById,
    voided: record.voidedAt ? { on: shortDay(dayOf(record.voidedAt)), reason: record.voidReason } : null,
  };
}

/**
 * The rows with what each withholds (D17) and the IMTT on it (§5.8.3): the
 * stored figure once paid, the core's quote while it waits.
 */
async function rowsOf(companyId: string, records: RowRecord[], base: string, now: Date): Promise<PaymentOutRow[]> {
  const settings = await taxSettings(companyId);
  return Promise.all(
    records.map(async (record) => {
      const currency = record.bill?.currency ?? record.bankAccount?.currency ?? base;
      const settled = record.status === "PAID" || record.status === "VOIDED";
      const withheld = settled
        ? round(record.withholdingAmount)
        : (await quoteWithholding(companyId, { vendorId: (record.vendor ?? record.bill?.vendor)?.id ?? null, billId: record.bill?.id ?? null, amount: record.amount, currency, date: now, exceptPaymentId: record.id })).total;
      const imtt = record.status === "PAID" ? imttOn(round(record.amount - withheld), currency, settings, base, record.exchangeRate) : 0;
      return toPaymentOutRow(record, base, { withheld, imtt }, now);
    }),
  );
}

export async function readPaymentsOut(db: Db, companyId: string, query: PaymentOutQuery, base = "USD", now = new Date()): Promise<PaymentsOutView> {
  const today = dayOf(now);
  const where = paymentOutWhere(companyId, query, today);
  const live = { companyId, requisitionId: null };
  const [records, matching, all, toApprove, paid, voided, month, waiting, vendors, accounts, imtt] = await Promise.all([
    db.purchasePayment.findMany({
      where,
      select: rowSelect,
      orderBy: [{ paidAt: query.sort === "oldest" ? "asc" : "desc" }, { createdAt: query.sort === "oldest" ? "asc" : "desc" }],
      skip: (query.page - 1) * PAYMENTS_OUT_PAGE_SIZE,
      take: PAYMENTS_OUT_PAGE_SIZE,
    }),
    db.purchasePayment.count({ where }),
    db.purchasePayment.count({ where: live }),
    db.purchasePayment.count({ where: { ...live, status: { in: ["TO_APPROVE", "APPROVED"] } } }),
    db.purchasePayment.count({ where: { ...live, status: "PAID" } }),
    db.purchasePayment.count({ where: { ...live, status: "VOIDED" } }),
    db.purchasePayment.aggregate({ where: MONEY_OUT_WHERE.supplierPayments(companyId, { gte: harareStart(monthStart(today)) }, base, true), _sum: { amount: true } }),
    db.purchasePayment.findMany({ where: { ...live, status: "TO_APPROVE" }, select: { amount: true, vendor: { select: { name: true } }, bill: { select: { vendor: { select: { name: true } } } } } }),
    db.vendor.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.bankAccount.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, bankName: true, currency: true }, orderBy: { name: "asc" } }),
    // §5.8.3: the IMTT the banks took this month, as bank entries to 5465.
    db.journalLine.aggregate({ where: { account: { code: "5465" }, entry: { companyId, status: "POSTED", voidedAt: null, entryDate: { gte: harareStart(monthStart(today)) } } }, _sum: { debit: true, credit: true } }),
  ]);
  const rows = await rowsOf(companyId, records, base, now);
  const from = matching === 0 ? 0 : (query.page - 1) * PAYMENTS_OUT_PAGE_SIZE + 1;
  const paidThisMonth = round(Number(month._sum.amount ?? 0));
  const waitingRows = waiting.map((row) => ({ supplier: row.vendor?.name ?? row.bill?.vendor.name ?? null, amount: row.amount }));
  return {
    finding: paymentsOutFinding(paidThisMonth, waitingRows, base),
    rows,
    range: { from, to: from === 0 ? 0 : from + rows.length - 1, of: matching },
    counts: { all, "to-approve": toApprove, paid, void: voided },
    month: { name: `Paid in ${monthName(today)}`, paid: paidThisMonth, imtt: round(Number(imtt._sum.debit ?? 0) - Number(imtt._sum.credit ?? 0)) },
    waiting: round(waitingRows.reduce((sum, row) => sum + row.amount, 0)),
    currency: base,
    suppliers: vendors,
    accounts: accounts.map((account) => ({ id: account.id, name: `${account.bankName && !account.name.toLowerCase().includes(account.bankName.toLowerCase()) ? `${account.bankName} ${account.name}` : account.name}, ${account.currency}` })),
    query,
  };
}

/** The list as filtered, every page, for Export. */
export async function paymentsOutCsv(db: Db, companyId: string, query: PaymentOutQuery, base = "USD"): Promise<string> {
  const records = await db.purchasePayment.findMany({ where: paymentOutWhere(companyId, query), select: rowSelect, orderBy: [{ paidAt: "desc" }], take: 10_000 });
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Number", "To", "State", "Date", "From", "Currency", "Gross", "Withheld", "Paid", "Note"].join(",")];
  for (const row of await rowsOf(companyId, records, base, new Date())) {
    lines.push([row.number, row.supplier?.name ?? "", row.state, row.date, row.from ?? "", row.currency, row.amount.toFixed(2), row.withheld.toFixed(2), row.paid.toFixed(2), row.note?.text ?? ""].map(cell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** The list as its page reads it, with what this person may do (`GET /api/books/payments-made`). */
export type PaymentsOutPage = PaymentsOutView & { can: { approve: boolean; pay: boolean; draft: boolean; void: boolean }; me: string };
