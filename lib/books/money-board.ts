import type { PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";

import { moneyInOut } from "./core/money-in-out";
import { asOf, count, dayOf, money, monthName, monthSoFar, monthStart, shortDay, storedDay } from "./format";
import { owedAndOverdue } from "./invoices";
import { blockingWhere } from "./needs-posting";
import { cameIn, isMoneyIn } from "./money";
import {
  dueNextMonth,
  moneyBoardFinding,
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
      name: row.bankName ? `${row.bankName} ${row.name === row.bankName ? "" : row.name}`.trim() : row.name,
      kind: KIND_LABEL[row.kind] ?? row.kind,
      currency: row.currency.toUpperCase(),
      amount: round(amount),
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
  const [approvals, unsigned, unposted, lines, firstLine] = await Promise.all([
    db.crmRequisition.aggregate({ where: { companyId, status: "SUBMITTED" }, _count: true, _sum: { amount: true } }),
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", fiscalStatus: "FAILED" },
      orderBy: { invoiceDate: "asc" },
      select: { invoiceNumber: true, total: true, currency: true, customer: { select: { name: true } } },
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
      lead: approvals._count === 1 ? "1 requisition to approve" : `${approvals._count} requisitions to approve`,
      detail: `${money(Number(approvals._sum.amount ?? 0), currency)} in all`,
      urgency: "urgent",
      action: { label: "Review", icon: "eye", href: "/crm/requisitions" },
    });
  }
  if (unsigned.length > 0) {
    const first = unsigned[0];
    list.push({
      key: "fdms",
      icon: "fiscal",
      lead: unsigned.length === 1 ? `${first.invoiceNumber ?? "An invoice"} is not signed by FDMS` : `${unsigned.length} invoices are not signed by FDMS`,
      detail: `${first.customer.name}, ${money(first.total, first.currency)}`,
      urgency: "urgent",
      action: { label: "Retry", icon: "history", href: "/accounting/fiscalisation" },
    });
  }
  if (unposted > 0) {
    list.push({
      key: "posting",
      icon: "warn",
      lead: unposted === 1 ? "A money event did not post" : `${unposted} money events did not post`,
      detail: "They wait in Needs posting",
      urgency: "routine",
      action: { label: "Fix it", icon: "posting", href: "/books/needs-posting" },
    });
  }
  if (lines > 0 && firstLine) {
    const bank = firstLine.reconciliation.bankAccount;
    list.push({
      key: "bank",
      icon: "bank",
      lead: `${count(lines, "bank line")} to match`,
      detail: `${bank.bankName || bank.name} ${bank.currency}`,
      urgency: "routine",
      action: { label: "Match", icon: "check", href: "/books/bank" },
    });
  }
  if (overdue.invoices > 0) {
    list.push({
      key: "overdue",
      icon: "invoice",
      lead: overdue.invoices === 1 ? "1 invoice is overdue" : `${overdue.invoices} invoices are overdue`,
      detail: `${money(overdue.amount, currency)} in all`,
      urgency: "routine",
      action: { label: "Remind", icon: "whatsapp", href: "/books/invoices?view=overdue" },
    });
  }
  const tax = nextTaxDate(today);
  list.push({
    key: "tax",
    icon: "calendar",
    lead: `Next tax date: ${shortDay(tax.day)}`,
    detail: tax.what,
    urgency: "look",
    action: { label: "What's due", icon: "chev", href: "/books/vat" },
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
  const [flows, sources, bank, needList, vat, suppliers, onAccount] = await Promise.all([
    moneyInOut(db, companyId, { from: harareStart(monthStart(today)) }, currency, base),
    cameIn(db, companyId, today, currency),
    accounts(db, companyId, base, now),
    needs(db, companyId, today, now, currency, totals.overdue),
    vatSoFar(db, companyId, today, currency),
    weOwe(db, companyId, currency),
    db.salesReceipt.aggregate({ where: { companyId, invoiceId: null, voidedAt: null, OR: [{ currency }, { currency: null }] }, _sum: { amount: true } }),
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
    finding: moneyBoardFinding(flows.totalIn, flows.totalOut, totals.overdue.amount, currency),
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
    owed: { total: totals.owed.amount, notDue: round(totals.owed.amount - totals.overdue.amount), overdue: totals.overdue.amount, onAccount: onAccountSum },
    owe: { total: round(suppliers + vatOwed), suppliers, claims: 0, vat: vatOwed, vatLabel: `VAT, ${month}` },
  };
}

