import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { MONEY_OUT_WHERE, type When } from "./core/money-out-where";
import { count, dayOf, money, monthName, monthStart, shortDay } from "./format";

/**
 * Books → Bills & spending → All spending (BkSpending): every document that
 * took money out this month, from every module, read by the same rule as
 * Money's money out (`MONEY_OUT_WHERE`, books-final §6.1 fix 13), so its total
 * is Money's "gone out". Read only: each row opens its own document.
 */

export const SPENDING_VIEWS = ["all", "bills", "requisitions", "claims", "till-payouts", "payroll", "other"] as const;
export type SpendingView = (typeof SPENDING_VIEWS)[number];
export type SpendingKind = Exclude<SpendingView, "all">;

export const SPENDING_TAB_LABEL: Record<SpendingView, string> = {
  all: "All",
  bills: "Bills",
  requisitions: "Requisitions",
  claims: "Claims & petty cash",
  "till-payouts": "Till payouts",
  payroll: "Payroll",
  other: "Other",
};

export const SPENDING_MODULES = ["Books", "CRM", "Retail", "Payroll"] as const;
export type SpendingModule = (typeof SPENDING_MODULES)[number];

/** Where a document was written, as the design names it in the Source column. */
export const SPENDING_SOURCES = ["Bills", "CRM", "Tender", "Floats", "Claims", "Payroll"] as const;
export type SpendingSource = (typeof SPENDING_SOURCES)[number];

/** What each kind of document is called in the Kind column. */
export const SPENDING_KIND_LABEL = { payment: "Supplier payment", requisition: "Requisition", claim: "Claim", voucher: "Petty cash", commission: "Commission", payout: "Till payout", payroll: "Pay run" } as const;
export type SpendingKindLabel = (typeof SPENDING_KIND_LABEL)[keyof typeof SPENDING_KIND_LABEL];

/** The Date chip: the month the list covers. */
export const SPENDING_MONTH_LABEL = { this: "This month", last: "Last month" } as const;

export const spendingQuerySchema = z.object({
  view: z.enum(SPENDING_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  from: z.enum(SPENDING_SOURCES).nullable().catch(null),
  account: z.string().trim().max(100).nullable().catch(null),
  month: z.enum(["this", "last"]).catch("this"),
  sort: z.enum(["newest", "largest"]).catch("newest"),
});
export type SpendingQuery = z.infer<typeof spendingQuerySchema>;

export function readSpendingQuery(params: URLSearchParams): SpendingQuery {
  return spendingQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    from: params.get("from") || null,
    account: params.get("account") || null,
    month: params.get("month") ?? undefined,
    sort: params.get("sort") ?? undefined,
  });
}

export type SpendingRow = {
  key: string;
  day: string;
  date: string;
  /** The "For" column: who or what the money went to. */
  what: string;
  module: SpendingModule;
  source: SpendingSource;
  kindLabel: SpendingKindLabel;
  /** "Paid", "Disbursed", "Posted": the document's own word once the money has left. */
  state: string;
  stateTone: "success" | "info";
  kind: SpendingKind;
  paidFrom: string | null;
  document: string | null;
  href: string | null;
  amount: number;
};

export type SpendingPage = {
  finding: { fact: string; rest: string | null };
  rows: SpendingRow[];
  counts: Record<SpendingView, number>;
  total: number;
  byKind: Record<SpendingKind, number>;
  monthName: string;
  /** The Date chip's value: "Since 1 Oct" this month, "1 Sep to 30 Sep" last month. */
  since: string;
  modules: number;
  currency: string;
  accounts: string[];
  can: { bill: boolean; claim: boolean; voucher: boolean; requisition: boolean };
  query: SpendingQuery;
};

type Db = Pick<PrismaClient, "purchasePayment" | "crmRequisition" | "expenseClaim" | "pettyCashVoucher" | "crmCommissionEntry" | "retailCashMovement" | "disbursementBatch">;

const round = (n: number) => Math.round(n * 100) / 100;
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);
/** "CBZ current, USD": the bank's name only where the account's own leaves it out. */
const account = (row: { name: string; bankName?: string | null; currency?: string } | null | undefined) =>
  row ? `${row.bankName && !row.name.toLowerCase().includes(row.bankName.toLowerCase()) ? `${row.bankName} ${row.name}` : row.name}${row.currency ? `, ${row.currency}` : ""}` : null;

/** "$6,716.86 has gone out this month, from 5 modules." / "Bills are the most, $3,972.40." */
export function spendingFinding(total: number, modules: number, byKind: Record<SpendingKind, number>, currency = "USD"): { fact: string; rest: string | null } {
  if (total <= 0.005) return { fact: "Nothing has gone out this month.", rest: null };
  const fact = `${money(total, currency)} has gone out this month, from ${count(modules, "module")}.`;
  const [top] = (Object.entries(byKind) as Array<[SpendingKind, number]>).sort((a, b) => b[1] - a[1]);
  if (!top || top[1] <= 0.005) return { fact, rest: null };
  const word = SPENDING_TAB_LABEL[top[0]];
  return { fact, rest: `${word} ${word.endsWith("s") ? "are" : "is"} the most, ${money(top[1], currency)}.` };
}

/** Every money-out document in the month, newest first. */
export async function spendingRows(db: Db, companyId: string, when: When, currency: string, isBase: boolean): Promise<SpendingRow[]> {
  const out = MONEY_OUT_WHERE;
  const [payments, requisitions, claims, vouchers, commission, payouts, payroll] = await Promise.all([
    db.purchasePayment.findMany({
      where: out.supplierPayments(companyId, when, currency, isBase),
      select: { id: true, paymentNumber: true, groupNo: true, paidAt: true, amount: true, reference: true, vendor: { select: { name: true } }, bankAccount: { select: { name: true, bankName: true, currency: true } }, bill: { select: { id: true, billNumber: true, vendor: { select: { name: true } } } } },
    }),
    db.crmRequisition.findMany({
      where: out.requisitions(companyId, when, currency),
      select: { id: true, requisitionNo: true, siteId: true, purpose: true, disbursedAt: true, paidAmount: true, approvedAmount: true, amount: true, bankAccount: { select: { name: true, bankName: true, currency: true } } },
    }),
    db.expenseClaim.findMany({ where: out.claims(companyId, when, currency), select: { id: true, claimNo: true, notes: true, paidAt: true, total: true, claimant: { select: { name: true } }, bankAccount: { select: { name: true, bankName: true, currency: true } } } }),
    db.pettyCashVoucher.findMany({ where: out.vouchers(companyId, when, currency), select: { id: true, voucherNo: true, description: true, spentAt: true, amount: true, float: { select: { name: true } } } }),
    db.crmCommissionEntry.findMany({ where: out.commission(companyId, when, currency), select: { id: true, paidAt: true, amount: true, rep: { select: { name: true } } } }),
    db.retailCashMovement.findMany({ where: out.tillPayouts(companyId, when, currency), select: { id: true, createdAt: true, amount: true, reason: true, reasonCode: true, shift: { select: { registerName: true } } } }),
    db.disbursementBatch.findMany({ where: out.payroll(companyId, when, currency), select: { id: true, code: true, paidAt: true, totalAmount: true, method: true, payrollRun: { select: { period: { select: { periodKey: true } } } } } }).catch(() => []),
  ]);
  const rows: SpendingRow[] = [];
  const push = (row: Omit<SpendingRow, "day" | "date"> & { at: Date }) => {
    const { at, ...rest } = row;
    const day = dayOf(at);
    rows.push({ ...rest, day, date: shortDay(day) });
  };
  for (const payment of payments) {
    const supplier = payment.vendor?.name ?? payment.bill?.vendor.name ?? "A supplier";
    push({
      key: `pay:${payment.id}`,
      at: payment.paidAt,
      what: supplier,
      source: payment.groupNo ? "Tender" : "Bills",
      kindLabel: SPENDING_KIND_LABEL.payment,
      state: "Paid",
      stateTone: "success",
      // The shop writes its supplier money as a group of rows (`groupNo`); Books' payments are one row each.
      module: payment.groupNo ? "Retail" : "Books",
      kind: payment.bill ? "bills" : "other",
      paidFrom: account(payment.bankAccount),
      document: payment.paymentNumber ?? payment.groupNo,
      href: payment.bill ? `/books/bills/${payment.bill.id}` : `/books/payments-made?q=${encodeURIComponent(payment.paymentNumber ?? payment.groupNo ?? supplier)}`,
      amount: round(payment.amount),
    });
  }
  for (const requisition of requisitions) {
    push({
      key: `req:${requisition.id}`,
      at: requisition.disbursedAt ?? new Date(),
      what: requisition.purpose,
      source: requisition.siteId ? "Tender" : "CRM",
      kindLabel: SPENDING_KIND_LABEL.requisition,
      state: "Disbursed",
      stateTone: "info",
      module: requisition.siteId ? "Retail" : "CRM",
      kind: "requisitions",
      paidFrom: account(requisition.bankAccount),
      document: requisition.requisitionNo,
      href: `/books/requisitions/${requisition.id}`,
      amount: round(Number(requisition.paidAmount ?? requisition.approvedAmount ?? requisition.amount)),
    });
  }
  for (const claim of claims) {
    push({ key: `clm:${claim.id}`, at: claim.paidAt ?? new Date(), what: `${claim.claimant.name}, ${claim.notes ?? "claim"}`, source: "Claims", kindLabel: SPENDING_KIND_LABEL.claim, state: "Paid", stateTone: "success", module: "Books", kind: "claims", paidFrom: account(claim.bankAccount), document: claim.claimNo, href: "/books/claims", amount: round(Number(claim.total)) });
  }
  for (const voucher of vouchers) {
    push({ key: `pcv:${voucher.id}`, at: voucher.spentAt, what: voucher.description, source: "Floats", kindLabel: SPENDING_KIND_LABEL.voucher, state: "Posted", stateTone: "success", module: "Books", kind: "claims", paidFrom: voucher.float.name, document: voucher.voucherNo, href: "/books/claims?view=vouchers", amount: round(Number(voucher.amount)) });
  }
  for (const entry of commission) {
    push({ key: `com:${entry.id}`, at: entry.paidAt ?? new Date(), what: entry.rep.name, source: "CRM", kindLabel: SPENDING_KIND_LABEL.commission, state: "Paid", stateTone: "success", module: "CRM", kind: "other", paidFrom: null, document: null, href: null, amount: round(entry.amount) });
  }
  for (const payout of payouts) {
    push({
      key: `till:${payout.id}`,
      at: payout.createdAt,
      what: `${payout.shift.registerName}, ${payout.reason ?? payout.reasonCode.toLowerCase().replace(/_/g, " ")}`,
      source: "Tender",
      kindLabel: SPENDING_KIND_LABEL.payout,
      state: "Posted",
      stateTone: "success",
      module: "Retail",
      kind: "till-payouts",
      paidFrom: payout.shift.registerName,
      document: null,
      href: "/books/takings",
      amount: round(Number(payout.amount)),
    });
  }
  for (const batch of payroll) {
    push({ key: `pr:${batch.id}`, at: batch.paidAt ?? new Date(), what: batch.payrollRun?.period?.periodKey ?? "Pay run", source: "Payroll", kindLabel: SPENDING_KIND_LABEL.payroll, state: "Paid", stateTone: "success", module: "Payroll", kind: "payroll", paidFrom: batch.method === "CASH" ? "Cash" : batch.method.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), document: batch.code, href: null, amount: round(Number(batch.totalAmount)) });
  }
  return rows.sort((a, b) => b.day.localeCompare(a.day) || b.amount - a.amount);
}

export async function readSpending(db: Db, companyId: string, query: SpendingQuery, base: string, can: SpendingPage["can"], now = new Date()): Promise<Omit<SpendingPage, never>> {
  const today = dayOf(now);
  const start = monthStart(today);
  const lastStart = monthStart(new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  const when: When = query.month === "last" ? { gte: harareStart(lastStart), lt: harareStart(start) } : { gte: harareStart(start) };
  const all = await spendingRows(db, companyId, when, base, true);
  const byKind = Object.fromEntries(SPENDING_VIEWS.filter((view) => view !== "all").map((kind) => [kind, 0])) as Record<SpendingKind, number>;
  const counts = Object.fromEntries(SPENDING_VIEWS.map((view) => [view, 0])) as Record<SpendingView, number>;
  for (const row of all) {
    byKind[row.kind] = round(byKind[row.kind] + row.amount);
    counts[row.kind] += 1;
    counts.all += 1;
  }
  const total = round(all.reduce((sum, row) => sum + row.amount, 0));
  const modules = new Set(all.map((row) => row.module)).size;
  const needle = query.q.toLowerCase();
  const rows = all
    .filter((row) => query.view === "all" || row.kind === query.view)
    .filter((row) => !query.from || row.source === query.from)
    .filter((row) => !query.account || row.paidFrom === query.account)
    .filter((row) => !needle || `${row.what} ${row.document ?? ""} ${row.paidFrom ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (query.sort === "largest" ? b.amount - a.amount : 0));
  return {
    finding: spendingFinding(total, modules, byKind, base),
    rows,
    counts,
    total,
    byKind,
    monthName: monthName(query.month === "last" ? lastStart : today),
    since: query.month === "last" ? `${shortDay(lastStart)} to ${shortDay(new Date(Date.parse(`${start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10))}` : `Since ${shortDay(start)}`,
    modules,
    currency: base,
    accounts: [...new Set(all.map((row) => row.paidFrom).filter((value): value is string => Boolean(value)))].sort(),
    can,
    query,
  };
}

/** The list as filtered, for Export. */
export function spendingCsv(rows: SpendingRow[]): string {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [["Document", "Kind", "For", "Date", "Paid from", "Source", "State", "Amount"].join(",")];
  for (const row of rows) lines.push([row.document ?? "", row.kindLabel, row.what, row.day, row.paidFrom ?? "", row.source, row.state, row.amount.toFixed(2)].map(cell).join(","));
  return `${lines.join("\n")}\n`;
}
