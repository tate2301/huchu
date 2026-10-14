import type { PrismaClient } from "@prisma/client";

import { addDays, asOf, count, dayOf, longDay, money, monthName, monthSoFar, monthStart, sinceWhen, storedDay, weekday } from "./format";
import { owedAndOverdue } from "./invoices";

/**
 * Books → Money (design/core-modules/html/books-money.html): what has come in
 * this month and from where, what needs a person, and where the money stands:
 * in the bank and owed out. Books reads what the products hold (the tills, the
 * CRM's deals, the invoices) and does not keep a copy.
 */

export type MoneySource = {
  key: "tills" | "invoices";
  label: string;
  detail: string;
  amount: number;
  /** How many sales or payments. */
  count: number;
  /** Of everything that came in, 0 to 100. */
  share: number;
  /** Of the largest source, 0 to 100: the bar's length. */
  bar: number;
};

export type NeedsYou = {
  key: "cash-up" | "won-deal" | "overdue" | "bank";
  lead: string;
  detail: string;
  action: { label: string; href: string };
};

export type BankAccountPosition = { id: string; name: string; currency: string; amount: number };

export type MoneyView = {
  currency: string;
  finding: { fact: string; rest: string | null };
  /** "1 to 6 October". */
  period: string;
  sources: MoneySource[];
  needs: NeedsYou[];
  bank: {
    /** Every account in the main currency, the others at the latest rate; null when a rate is missing. */
    total: number | null;
    accounts: BankAccountPosition[];
    asOf: string | null;
  };
  owe: {
    rows: Array<{ label: string; amount: number; currency: string }>;
    vatDue: string | null;
  };
};

type Db = Pick<
  PrismaClient,
  | "salesInvoice"
  | "salesReceipt"
  | "retailSale"
  | "retailDayClose"
  | "retailShift"
  | "crmDeal"
  | "bankAccount"
  | "bankTransaction"
  | "bankStatementLine"
  | "purchaseBill"
  | "vatReturn"
  | "currencyRate"
  | "site"
>;

const round = (n: number) => Math.round(n * 100) / 100;
const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
/** A Harare calendar day's first instant: Harare is UTC+2 all year. */
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);

/**
 * Which way a recorded bank transaction moved the money. Money in is CREDIT,
 * as on the bank's statement, except the till's banked takings, which the day
 * close writes as DEBIT (the ledger's side of the same deposit).
 */
export function isMoneyIn(txn: { direction: "DEBIT" | "CREDIT"; sourceType: string | null }): boolean {
  if (txn.sourceType === "RETAIL_DAY_BANKED") return txn.direction === "DEBIT";
  return txn.direction === "CREDIT";
}

export function moneyFinding(cameIn: number, owed: number, overdue: number, currency: string): { fact: string; rest: string | null } {
  const fact = cameIn > 0 ? `${money(cameIn, currency)} has come in this month.` : "Nothing has come in this month yet.";
  if (owed <= 0) return { fact, rest: "Nothing is owed to you." };
  return {
    fact,
    rest:
      overdue > 0
        ? `${money(owed, currency)} is owed to you, ${money(overdue, currency)} of it overdue.`
        : `${money(owed, currency)} is owed to you, none of it overdue.`,
  };
}

/** What has come in this month, by where it came from: the tills and payments on invoices. */
export async function cameIn(db: Db, companyId: string, today: string, currency: string): Promise<MoneySource[]> {
  const from = harareStart(monthStart(today));
  const [sales, refunds, sites, receipts] = await Promise.all([
    db.retailSale.aggregate({
      where: { companyId, status: "POSTED", saleType: "SALE", currency, createdAt: { gte: from } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    db.retailSale.aggregate({
      where: { companyId, status: "POSTED", saleType: "REFUND", currency, createdAt: { gte: from } },
      _sum: { totalAmount: true },
    }),
    db.retailSale.groupBy({
      by: ["siteId"],
      where: { companyId, status: "POSTED", saleType: "SALE", createdAt: { gte: from } },
    }),
    db.salesReceipt.aggregate({
      where: { companyId, invoiceId: { not: null }, invoice: { currency }, receivedAt: { gte: midnight(monthStart(today)) } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const tills = round(Number(sales._sum.totalAmount ?? 0) - Math.abs(Number(refunds._sum.totalAmount ?? 0)));
  const invoices = round(receipts._sum.amount ?? 0);
  let tillsLabel = "Till sales";
  if (sites.length === 1) {
    const site = await db.site.findUnique({ where: { id: sites[0].siteId }, select: { name: true } });
    if (site) tillsLabel = `${site.name} sales`;
  }

  const total = tills + invoices;
  const largest = Math.max(tills, invoices);
  const sources: MoneySource[] = [];
  if (sales._count > 0) {
    sources.push({
      key: "tills",
      label: tillsLabel,
      detail: `${count(sales._count, "sale")} on the tills`,
      amount: tills,
      count: sales._count,
      share: 0,
      bar: 0,
    });
  }
  if (receipts._count > 0) {
    sources.push({
      key: "invoices",
      label: "Invoices",
      detail: `${count(receipts._count, "payment")} on invoices`,
      amount: invoices,
      count: receipts._count,
      share: 0,
      bar: 0,
    });
  }
  for (const source of sources) {
    source.share = total > 0 ? Math.round((source.amount / total) * 100) : 0;
    source.bar = largest > 0 ? (Math.max(0, source.amount) / largest) * 100 : 0;
  }
  return sources;
}

/**
 * What has gone out this month: the bills paid, as Payables records them.
 * Books keeps no copy.
 */
export async function wentOut(
  db: Pick<PrismaClient, "purchasePayment">,
  companyId: string,
  today: string,
): Promise<{ amount: number; payments: number }> {
  const paid = await db.purchasePayment.aggregate({
    where: { companyId, paidAt: { gte: midnight(monthStart(today)) } },
    _sum: { amount: true },
    _count: true,
  });
  return { amount: round(paid._sum.amount ?? 0), payments: paid._count };
}

async function cashUpShort(db: Db, companyId: string, today: string): Promise<NeedsYou | null> {
  const close = await db.retailDayClose.findFirst({
    where: { companyId, cashDifference: { lt: 0 }, businessDate: { gte: midnight(addDays(today, -6)) } },
    orderBy: { businessDate: "desc" },
    select: { businessDate: true, cashDifference: true, siteId: true },
  });
  if (!close) return null;
  const day = storedDay(close.businessDate);
  const short = Math.abs(Number(close.cashDifference));
  const worst = await db.retailShift.findFirst({
    where: {
      companyId,
      siteId: close.siteId,
      variance: { lt: 0 },
      openedAt: { gte: harareStart(day), lt: harareStart(addDays(day, 1)) },
    },
    orderBy: { variance: "asc" },
    select: { registerName: true, countedCash: true, expectedCash: true },
  });
  return {
    key: "cash-up",
    lead: `${weekday(day)}'s cash-up is ${money(short)} short`,
    detail:
      worst && worst.countedCash !== null
        ? `${worst.registerName} counted ${money(Number(worst.countedCash))} against ${money(Number(worst.expectedCash))} expected.`
        : `The tills counted ${money(short)} less than they should have.`,
    action: { label: "Review", href: "/books/takings" },
  };
}

async function wonWithoutInvoice(db: Db, companyId: string, now: Date): Promise<NeedsYou | null> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const deals = await db.crmDeal.findMany({
    where: { companyId, status: "WON", wonAt: { gte: since }, documents: { none: { type: "INVOICE" } } },
    orderBy: { wonAt: "asc" },
    select: { id: true, title: true, value: true, currency: true, client: { select: { name: true } } },
    take: 20,
  });
  if (deals.length === 0) return null;
  const first = deals[0];
  const parts = [first.client?.name, first.title, first.value ? money(first.value, first.currency) : null].filter(Boolean);
  return {
    key: "won-deal",
    lead: deals.length === 1 ? "A won deal has no invoice" : `${deals.length} won deals have no invoice`,
    detail: `${parts.join(", ")}.`,
    action: { label: "Write it", href: `/crm/deals/${first.id}` },
  };
}

async function bankLinesToMatch(db: Db, companyId: string, today: string): Promise<NeedsYou | null> {
  const where = { matchedTransactionId: null, reconciliation: { companyId, status: "OPEN" as const } };
  const [lines, first] = await Promise.all([
    db.bankStatementLine.count({ where }),
    db.bankStatementLine.findFirst({
      where,
      orderBy: { txnDate: "asc" },
      select: { txnDate: true, reconciliation: { select: { bankAccount: { select: { name: true, bankName: true } } } } },
    }),
  ]);
  if (!first || lines === 0) return null;
  const bank = first.reconciliation.bankAccount.bankName || first.reconciliation.bankAccount.name;
  const since = sinceWhen(storedDay(first.txnDate), today);
  return {
    key: "bank",
    lead: `${count(lines, "bank line")} to match`,
    detail: `${bank}, since ${since}.`,
    action: { label: "Match", href: "/books/bank" },
  };
}

async function bankPosition(db: Db, companyId: string, currency: string, now: Date): Promise<MoneyView["bank"]> {
  const accounts = await db.bankAccount.findMany({
    where: { companyId, isActive: true, kind: "BANK" },
    select: { id: true, name: true, bankName: true, currency: true, openingBalance: true },
    orderBy: { name: "asc" },
  });
  if (accounts.length === 0) return { total: null, accounts: [], asOf: null };
  const [moves, lastLine, rates] = await Promise.all([
    db.bankTransaction.groupBy({
      by: ["bankAccountId", "direction", "sourceType"],
      where: { companyId, bankAccountId: { in: accounts.map((account) => account.id) } },
      _sum: { amount: true },
    }),
    db.bankStatementLine.findFirst({
      where: { reconciliation: { companyId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    db.currencyRate.findMany({
      where: { companyId, baseCurrency: currency },
      orderBy: { effectiveDate: "desc" },
      select: { quoteCurrency: true, rate: true },
      take: 20,
    }),
  ]);
  const positions = accounts.map((account) => {
    let amount = account.openingBalance;
    for (const move of moves) {
      if (move.bankAccountId !== account.id) continue;
      const sum = move._sum.amount ?? 0;
      amount += isMoneyIn({ direction: move.direction, sourceType: move.sourceType }) ? sum : -sum;
    }
    const label = account.bankName ? `${account.bankName}, ${account.currency}` : account.name;
    return { id: account.id, name: label, currency: account.currency, amount: round(amount) };
  });
  let total: number | null = 0;
  for (const position of positions) {
    if (position.currency === currency) {
      total += position.amount;
      continue;
    }
    const rate = rates.find((row) => row.quoteCurrency === position.currency)?.rate;
    if (!rate) {
      total = null;
      break;
    }
    total += position.amount / rate;
  }
  return { total: total === null ? null : round(total), accounts: positions, asOf: lastLine ? asOf(lastLine.createdAt, now) : null };
}

async function weOwe(db: Db, companyId: string): Promise<MoneyView["owe"]> {
  const [bills, vat] = await Promise.all([
    db.purchaseBill.findMany({
      where: { companyId, status: "RECEIVED" },
      select: { currency: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { name: true } } },
    }),
    db.vatReturn.findFirst({
      where: { companyId, status: { in: ["DRAFT", "REVIEWED", "FINALIZED"] } },
      orderBy: { periodEnd: "asc" },
      select: { periodEnd: true, netTax: true, paymentDueDate: true, returnDueDate: true },
    }),
  ]);
  const byVendor = new Map<string, { amount: number; currency: string }>();
  for (const bill of bills) {
    const balance = bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal;
    if (balance <= 0.005) continue;
    const key = `${bill.vendor.name}|${bill.currency}`;
    const entry = byVendor.get(key) ?? { amount: 0, currency: bill.currency };
    entry.amount += balance;
    byVendor.set(key, entry);
  }
  const rows = [...byVendor.entries()]
    .map(([key, entry]) => ({ label: key.split("|")[0], amount: round(entry.amount), currency: entry.currency }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  let vatDue: string | null = null;
  if (vat && vat.netTax > 0) {
    rows.push({ label: `VAT, ${monthName(storedDay(vat.periodEnd))}`, amount: round(vat.netTax), currency: "USD" });
    const due = vat.paymentDueDate ?? vat.returnDueDate;
    if (due) vatDue = longDay(storedDay(due));
  }
  return { rows, vatDue };
}

export async function readMoney(db: Db, companyId: string, now = new Date()): Promise<MoneyView> {
  const today = dayOf(now);
  const totals = await owedAndOverdue(db, companyId, today);
  const currency = totals.currency;
  const [sources, cashUp, won, bank, bankView, owe] = await Promise.all([
    cameIn(db, companyId, today, currency),
    cashUpShort(db, companyId, today),
    wonWithoutInvoice(db, companyId, now),
    bankLinesToMatch(db, companyId, today),
    bankPosition(db, companyId, currency, now),
    weOwe(db, companyId),
  ]);
  const overdue: NeedsYou | null =
    totals.overdue.invoices > 0
      ? {
          key: "overdue",
          lead: totals.overdue.invoices === 1 ? "1 invoice is overdue" : `${totals.overdue.invoices} invoices are overdue`,
          detail: `${money(totals.overdue.amount, currency)} in all.${
            totals.overdue.latest ? ` ${totals.overdue.latest.customer} is ${count(totals.overdue.latest.days, "day")} late.` : ""
          }`,
          action: { label: "Remind", href: "/books/invoices?view=overdue" },
        }
      : null;
  const cameInTotal = round(sources.reduce((sum, source) => sum + source.amount, 0));
  return {
    currency,
    finding: moneyFinding(cameInTotal, totals.owed.amount, totals.overdue.amount, currency),
    period: monthSoFar(today),
    sources,
    needs: [cashUp, won, overdue, bank].filter((need): need is NeedsYou => need !== null),
    bank: bankView,
    owe,
  };
}
