import type { PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";

import { moneyInOut } from "./core/money-in-out";
import { customerFace, customerImage } from "./faces";
import { asOf, dayOf, money, monthName, monthSoFar, monthStart, shortDay, storedDay } from "./format";
import { owedAndOverdue } from "./invoices";
import { itf263State } from "./itf263";
import { blockingWhere } from "./needs-posting";
import { cameIn, isMoneyIn } from "./money";
import {
  dueNextMonth,
  ageBuckets,
  lowestPoint,
  moneyFinding,
  type MoneyUpcoming,
  nextQpd,
  nextTaxDate,
  shares,
  type MoneyAccountRow,
  type MoneyBoard,
  type MoneyNeed,
} from "./money-board-view";

/**
 * Books → Money (BkMoney): the month's money in and out from the core's one
 * read (`moneyInOut`), the tax coming due, what needs a person (weighted by
 * how urgent it is), every money account side by side, and what is owed
 * either way. Books reads what the modules hold and keeps no copy.
 */

type Db = PrismaClient;

const round = (n: number) => Math.round(n * 100) / 100;
/** A Harare calendar day's first instant: Harare is UTC+2 all year. */
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);

const KIND_LABEL: Record<string, string> = { BANK: "Bank", MOBILE: "Mobile money", CASH: "Cash" };

const IN_ROWS: Record<string, { icon: string; label: string }> = {
  tills: { icon: "showroom", label: "Till sales" },
  invoices: { icon: "invoice", label: "Payments received" },
  fees: { icon: "invoice", label: "School fees" },
};
const OUT_ROWS: Record<string, { icon: string; label: string }> = {
  "supplier-payments": { icon: "docs", label: "Bills" },
  payouts: { icon: "hand", label: "Requisitions" },
  "till-payouts": { icon: "takings", label: "Till payouts" },
  payroll: { icon: "person", label: "Payroll" },
};

async function accounts(db: Db, companyId: string, base: string, now: Date): Promise<MoneyBoard["bank"]> {
  const rows = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, bankName: true, currency: true, openingBalance: true, kind: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  if (rows.length === 0) return { accounts: [], currencies: [base], totals: {}, inBase: null, rateNote: null };
  const ids = rows.map((row) => row.id);
  const [moves, closed, rates] = await Promise.all([
    db.bankTransaction.groupBy({ by: ["bankAccountId", "direction", "sourceType"], where: { companyId, bankAccountId: { in: ids } }, _sum: { amount: true } }),
    db.bankReconciliation.groupBy({ by: ["bankAccountId"], where: { companyId, status: "CLOSED", bankAccountId: { in: ids } }, _max: { endDate: true } }),
    db.currencyRate.findMany({
      where: { companyId, baseCurrency: base },
      orderBy: { effectiveDate: "desc" },
      select: { quoteCurrency: true, rate: true, source: true, effectiveDate: true },
      take: 20,
    }),
  ]);
  const list: MoneyAccountRow[] = rows.map((row) => {
    let amount = row.openingBalance;
    for (const move of moves) {
      if (move.bankAccountId !== row.id) continue;
      const sum = move._sum.amount ?? 0;
      amount += isMoneyIn({ direction: move.direction, sourceType: move.sourceType }) ? sum : -sum;
    }
    const end = closed.find((entry) => entry.bankAccountId === row.id)?._max.endDate;
    return {
      id: row.id,
      // "CBZ current", not "CBZ CBZ current": the bank's name only where the account's own leaves it out.
      name: row.bankName && !row.name.toLowerCase().startsWith(row.bankName.toLowerCase()) ? `${row.bankName} ${row.name}` : row.name,
      kind: KIND_LABEL[row.kind] ?? row.kind,
      currency: row.currency.toUpperCase(),
      amount: round(amount),
      inBase: row.currency.toUpperCase() === base ? round(amount) : (() => { const rate = rates.find((entry) => entry.quoteCurrency === row.currency.toUpperCase()); return rate ? round(amount / rate.rate) : null; })(),
      reconciled: end ? shortDay(storedDay(end)) : null,
    };
  });
  const currencies = [base, ...new Set(list.map((row) => row.currency).filter((code) => code !== base))];
  const totals: Record<string, number> = {};
  for (const row of list) totals[row.currency] = round((totals[row.currency] ?? 0) + row.amount);
  let inBase: number | null = 0;
  const notes: string[] = [];
  for (const code of currencies) {
    const sum = totals[code] ?? 0;
    if (code === base) {
      inBase += sum;
      continue;
    }
    const rate = rates.find((entry) => entry.quoteCurrency === code);
    if (!rate) {
      inBase = null;
      break;
    }
    inBase += sum / rate.rate;
    notes.push(`${code} at ${rate.rate.toFixed(2)} to ${money(1, base).replace(/\.00$/, "")} (${rate.source === "MANUAL" ? "typed in" : "RBZ interbank"}, ${asOf(rate.effectiveDate, now).toLowerCase()})`);
  }
  return { accounts: list, currencies, totals, inBase: inBase === null ? null : round(inBase), rateNote: notes.length ? notes.join("; ") : null };
}

async function needs(db: Db, companyId: string, today: string, now: Date, currency: string, overdue: { amount: number; invoices: number }): Promise<MoneyNeed[]> {
  const [approvals, askers, unsigned, unposted, lines, firstLine] = await Promise.all([
    db.crmRequisition.aggregate({ where: { companyId, status: "SUBMITTED" }, _count: true, _sum: { amount: true } }),
    db.crmRequisition.findMany({ where: { companyId, status: "SUBMITTED" }, select: { requestedBy: { select: { name: true, image: true } } }, distinct: ["requestedById"], take: 4 }),
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", fiscalStatus: "FAILED" },
      orderBy: { invoiceDate: "asc" },
      select: { invoiceNumber: true, total: true, currency: true, customer: { select: { name: true, ...customerFace } } },
      take: 20,
    }),
    db.accountingIntegrationEvent.count({ where: blockingWhere(companyId, now) }),
    db.bankStatementLine.count({ where: { matchedTransactionId: null, reconciliation: { companyId, status: "OPEN" } } }),
    db.bankStatementLine.findFirst({
      where: { matchedTransactionId: null, reconciliation: { companyId, status: "OPEN" } },
      orderBy: { txnDate: "asc" },
      select: { reconciliation: { select: { bankAccount: { select: { name: true, bankName: true, currency: true } } } } },
    }),
  ]);
  const list: MoneyNeed[] = [];
  if (approvals._count > 0) {
    list.push({
      key: "approve",
      icon: "hand",
      lead: "Requisitions to approve",
      count: approvals._count,
      detail: money(Number(approvals._sum.amount ?? 0), currency),
      people: askers.map((row) => ({ name: row.requestedBy.name, image: row.requestedBy.image })),
      urgency: "urgent",
      action: { label: "Review", icon: "eye", href: "/crm/requisitions" },
    });
  }
  if (unsigned.length > 0) {
    const first = unsigned[0];
    list.push({
      key: "fdms",
      icon: "fiscal",
      lead: "Not signed by FDMS",
      count: unsigned.length,
      detail: unsigned.length === 1 ? (first.invoiceNumber ?? first.customer.name) : money(unsigned.reduce((sum, row) => sum + row.total, 0), first.currency),
      people: [{ name: first.customer.name, image: customerImage(first.customer) }],
      urgency: "urgent",
      action: { label: "Retry", icon: "history", href: "/books/fiscal?tab=failed" },
    });
  }
  if (unposted > 0) {
    list.push({
      key: "posting",
      icon: "warn",
      lead: "Failed to post",
      count: unposted,
      detail: "",
      urgency: "routine",
      action: { label: "Fix it", icon: "posting", href: "/books/needs-posting" },
    });
  }
  if (lines > 0 && firstLine) {
    const bank = firstLine.reconciliation.bankAccount;
    list.push({
      key: "bank",
      icon: "bank",
      lead: "Bank lines to match",
      count: lines,
      detail: "",
      urgency: "routine",
      action: { label: "Match", icon: "check", href: "/books/bank" },
    });
  }
  // D17: suppliers paid this year or owed, with no valid ITF263: paying them withholds 30%.
  const vendors = await db.vendor.findMany({
    where: { companyId, isActive: true, OR: [{ payments: { some: { status: "PAID", paidAt: { gte: new Date(`${today.slice(0, 4)}-01-01T00:00:00.000Z`) } } } }, { bills: { some: { status: "RECEIVED" } } }] },
    select: { itf263Number: true, itf263ExpiresAt: true },
  });
  const missing = vendors.filter((vendor) => itf263State(vendor, now).state !== "Valid").length;
  if (missing > 0) {
    list.push({
      key: "itf263",
      icon: "store",
      lead: "Suppliers without an ITF263",
      count: missing,
      detail: "",
      urgency: "routine",
      action: { label: "Ask for it", icon: "send", href: "/books/suppliers?view=missing-itf263" },
    });
  }
  if (overdue.invoices > 0) {
    list.push({
      key: "overdue",
      icon: "invoice",
      lead: "Overdue invoices",
      count: overdue.invoices,
      detail: money(overdue.amount, currency),
      urgency: "routine",
      action: { label: "Remind", icon: "whatsapp", href: "/books/invoices?view=overdue" },
    });
  }
  const tax = nextTaxDate(today);
  list.push({
    key: "tax",
    icon: "calendar",
    lead: "Next tax date",
    count: 0,
    detail: `${shortDay(tax.day)}, ${tax.what}`,
    urgency: "look",
    action: { label: "What's due", icon: "chev", href: "/books/tax" },
  });
  return list;
}

async function vatSoFar(db: Db, companyId: string, today: string, currency: string): Promise<number> {
  const from = new Date(`${monthStart(today)}T00:00:00.000Z`);
  const [output, input] = await Promise.all([
    db.salesInvoice.aggregate({ where: { companyId, status: { in: ["ISSUED", "PAID"] }, currency, invoiceDate: { gte: from } }, _sum: { taxTotal: true } }),
    db.purchaseBill.aggregate({ where: { companyId, status: { in: ["RECEIVED", "PAID"] }, currency, billDate: { gte: from } }, _sum: { taxTotal: true } }),
  ]);
  return round((output._sum.taxTotal ?? 0) - (input._sum.taxTotal ?? 0));
}


const FORTNIGHT = 14;

/** Bills due, invoices due and the next tax date in the coming fortnight, in date order. Money in is positive. */
async function comingUp(db: Db, companyId: string, today: string, currency: string): Promise<{ until: string; rows: MoneyUpcoming[] }> {
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(start.getTime() + FORTNIGHT * 86_400_000);
  const [bills, invoices] = await Promise.all([
    db.purchaseBill.findMany({
      where: { companyId, status: "RECEIVED", currency, dueDate: { gte: start, lt: end } },
      select: { billNumber: true, dueDate: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { name: true } } },
    }),
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", currency, dueDate: { gte: start, lt: end } },
      select: { invoiceNumber: true, dueDate: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, customer: { select: { name: true } } },
    }),
  ]);
  const rows: MoneyUpcoming[] = [];
  for (const bill of bills) {
    const left = Math.max(0, bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal);
    if (left > 0.005 && bill.dueDate) rows.push({ day: storedDay(bill.dueDate), label: `${bill.vendor.name}, ${bill.billNumber ?? "bill"}`, amount: -round(left) });
  }
  for (const invoice of invoices) {
    const left = Math.max(0, invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
    if (left > 0.005 && invoice.dueDate) rows.push({ day: storedDay(invoice.dueDate), label: `${invoice.customer.name}, ${invoice.invoiceNumber ?? "invoice"}`, amount: round(left) });
  }
  rows.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.amount - b.amount));
  return { until: shortDay(storedDay(new Date(end.getTime() - 86_400_000))), rows };
}

async function weOwe(db: Db, companyId: string, currency: string): Promise<number> {
  const bills = await db.purchaseBill.findMany({
    where: { companyId, status: "RECEIVED", currency },
    select: { total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true },
  });
  return round(bills.reduce((sum, bill) => sum + Math.max(0, bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal), 0));
}

export async function readMoneyBoard(db: Db, companyId: string, now = new Date()): Promise<MoneyBoard> {
  const today = dayOf(now);
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const totals = await owedAndOverdue(db, companyId, today);
  const currency = totals.currency;
  const [flows, sources, bank, needList, vat, suppliers, onAccount, upcoming] = await Promise.all([
    moneyInOut(db, companyId, { from: harareStart(monthStart(today)) }, currency, base),
    cameIn(db, companyId, today, currency),
    accounts(db, companyId, base, now),
    needs(db, companyId, today, now, currency, totals.overdue),
    vatSoFar(db, companyId, today, currency),
    weOwe(db, companyId, currency),
    db.salesReceipt.aggregate({ where: { companyId, invoiceId: null, voidedAt: null, OR: [{ currency }, { currency: null }] }, _sum: { amount: true } }),
    comingUp(db, companyId, today, currency),
  ]);
  const month = monthName(today);
  const qpd = nextQpd(today);
  const cameRows = shares(
    sources.map((source) => ({ key: source.key, icon: IN_ROWS[source.key]?.icon ?? "payments", label: source.key === "tills" ? source.label : (IN_ROWS[source.key]?.label ?? source.label), amount: source.amount })),
  );
  const wentRows = shares(flows.out.map((flow) => ({ key: flow.key, icon: OUT_ROWS[flow.key]?.icon ?? "expenses", label: OUT_ROWS[flow.key]?.label ?? flow.key, amount: flow.amount })));
  const onAccountSum = round(onAccount._sum.amount ?? 0);
  const vatOwed = Math.max(0, vat);
  return {
    currency,
    finding: moneyFinding(round(flows.totalIn - flows.totalOut), bank.inBase === null ? null : lowestPoint(bank.inBase, upcoming.rows), upcoming.until, currency),
    tax: [
      { label: `VAT, ${month} so far`, value: money(vat, currency), note: `Due ${dueNextMonth(today, 15)}` },
      { label: `PAYE, ${month}`, value: `After 25 ${month.slice(0, 3)}`, note: `Due ${dueNextMonth(today, 10)}` },
      { label: "30% withholding", value: "Not recorded", note: `Due ${dueNextMonth(today, 10)}` },
      { label: `Provisional tax, ${qpd.ordinal}`, value: "Not set", note: `Due ${shortDay(qpd.day)}` },
    ],
    needs: needList,
    period: monthSoFar(today),
    cameIn: { total: flows.totalIn, rows: cameRows },
    wentOut: { total: flows.totalOut, rows: wentRows },
    bank,
    age: ageBuckets(totals.ages),
    upcoming,
    owed: { total: totals.owed.amount, notDue: round(totals.owed.amount - totals.overdue.amount), overdue: totals.overdue.amount, onAccount: onAccountSum },
    owe: { total: round(suppliers + vatOwed), suppliers, claims: 0, vat: vatOwed, vatLabel: `VAT, ${month}` },
  };
}

