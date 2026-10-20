import type { PrismaClient } from "@prisma/client";

import { moneyLimits } from "@/lib/books/core/approvals";
import { MONEY_OUT_WHERE } from "@/lib/books/core/money-out-where";
import { resolveBaseCurrency } from "@/lib/money";

import { moneyInOut } from "./core/money-in-out";
import { addDays, asOf, count, dayOf, monthStart, shortDay, storedDay } from "./format";
import { openInvoicesByAge, owedAndOverdue } from "./invoices";
import { itf263State } from "./itf263";
import { blockingWhere } from "./needs-posting";
import { isMoneyIn } from "./money";
import {
  afterComingUp,
  MONEY_AGES,
  moneyAge,
  moneyBoardFinding,
  names,
  shortMonthSoFar,
  type MoneyAccountKind,
  type MoneyAccountRow,
  type MoneyBoard,
  type MoneyNeed,
  type MoneyShare,
  type MoneyUpcoming,
} from "./money-board-view";
import { readWhatsDue } from "./tax-due";

/**
 * Books → Money (bk-money): am I all right, and what needs me, in one screen.
 * The month's money in and out from the core's one read (`moneyInOut`), what
 * needs a person (each row opening its Books address), every money account in
 * the base currency, what is coming up over the next two weeks, and what is
 * owed either way. Books reads what the modules hold and keeps no copy.
 */

type Db = PrismaClient;

const round = (n: number) => Math.round(n * 100) / 100;
const num = (value: unknown) => Number(value ?? 0) || 0;
/** A Harare calendar day's first instant: Harare is UTC+2 all year. */
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);
const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Wed 7". */
const dayWord = (day: string) => `${WEEKDAY[midnight(day).getUTCDay()]} ${Number(day.slice(8, 10))}`;
/** How far ahead Coming up looks. */
const AHEAD_DAYS = 14;
const KIND_ORDER: MoneyAccountKind[] = ["BANK", "MOBILE", "CASH"];

type Accounts = { board: MoneyBoard["bank"]; rows: Array<MoneyAccountRow & { bankName: string | null; isFloat: boolean }> };

async function accounts(db: Db, companyId: string, base: string, now: Date): Promise<Accounts> {
  const rows = await db.bankAccount.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, bankName: true, currency: true, openingBalance: true, kind: true, isFloat: true },
    orderBy: { name: "asc" },
  });
  if (rows.length === 0) return { board: { total: 0, accounts: [], rate: null }, rows: [] };
  // Banks, then mobile money, then cash; the base currency first within each.
  const rank = (row: (typeof rows)[number]) => KIND_ORDER.indexOf(row.kind as MoneyAccountKind) * 2 + (row.currency.toUpperCase() === base ? 0 : 1);
  rows.sort((a, b) => rank(a) - rank(b));
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
  let rate: MoneyBoard["bank"]["rate"] = null;
  let total: number | null = 0;
  const list = rows.map((row) => {
    let native = row.openingBalance;
    for (const move of moves) {
      if (move.bankAccountId !== row.id) continue;
      const sum = move._sum.amount ?? 0;
      native += isMoneyIn({ direction: move.direction, sourceType: move.sourceType }) ? sum : -sum;
    }
    const currency = row.currency.toUpperCase();
    let balance: number | null = round(native);
    if (currency !== base) {
      const found = rates.find((entry) => entry.quoteCurrency.toUpperCase() === currency);
      balance = found ? round(native / found.rate) : null;
      if (found && !rate) rate = { code: currency, rate: found.rate, source: found.source === "MANUAL" ? "typed in" : "RBZ interbank", when: asOf(found.effectiveDate, now).toLowerCase() };
    }
    total = total === null || balance === null ? null : total + balance;
    const end = closed.find((entry) => entry.bankAccountId === row.id)?._max.endDate;
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as MoneyAccountKind,
      currency,
      reconciled: end ? shortDay(storedDay(end)) : null,
      balance,
      bankName: row.bankName,
      native: round(native),
      isFloat: row.isFloat,
    };
  });
  const board: MoneyBoard["bank"] = {
    total: total === null ? null : round(total),
    accounts: list.map(({ id, name, kind, currency, reconciled, balance, native }) => ({ id, name, kind, currency, reconciled, balance, native })),
    rate,
  };
  return { board, rows: list };
}

async function needs(
  db: Db,
  companyId: string,
  now: Date,
  limit: number,
  overdue: { amount: number; invoices: number },
  cashWithReps: { count: number; amount: number },
): Promise<MoneyNeed[]> {
  const today = dayOf(now);
  const [approvals, overLimit, lines, failed, firstFailed, unsigned, claims, vendors] = await Promise.all([
    db.crmRequisition.aggregate({ where: { companyId, status: "SUBMITTED" }, _count: true, _sum: { amount: true } }),
    db.purchaseBill.findMany({ where: { companyId, status: "DRAFT", total: { gt: limit } }, select: { total: true } }),
    db.bankStatementLine.count({ where: { matchedTransactionId: null, excludedAt: null, reconciliation: { companyId, status: "OPEN" } } }),
    db.accountingIntegrationEvent.count({ where: blockingWhere(companyId, now) }),
    db.accountingIntegrationEvent.findFirst({ where: blockingWhere(companyId, now), orderBy: { createdAt: "asc" }, select: { description: true } }),
    db.salesInvoice.findMany({ where: { companyId, status: { in: ["ISSUED", "PAID"] }, fiscalStatus: "FAILED" }, orderBy: { invoiceDate: "asc" }, select: { invoiceNumber: true }, take: 20 }),
    db.expenseClaim.aggregate({ where: { companyId, status: "APPROVED" }, _count: true, _sum: { total: true } }),
    // D17: suppliers paid this year or owed, with no valid ITF263: paying them withholds 30%.
    db.vendor.findMany({
      where: { companyId, isActive: true, OR: [{ payments: { some: { status: "PAID", paidAt: { gte: new Date(`${today.slice(0, 4)}-01-01T00:00:00.000Z`) } } } }, { bills: { some: { status: "RECEIVED" } } }] },
      select: { name: true, itf263Number: true, itf263ExpiresAt: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const missing = vendors.filter((vendor) => itf263State(vendor, now).state !== "Valid");
  const rows: MoneyNeed[] = [
    { key: "overdue", label: "Overdue invoices", count: overdue.invoices, amount: overdue.amount, fact: null, tone: "warn", href: "/books/invoices?view=overdue" },
    { key: "approve", label: "Requisitions to approve", count: approvals._count, amount: round(num(approvals._sum.amount)), fact: null, tone: null, href: "/books/requisitions?view=to-approve" },
    {
      key: "bill-limit",
      label: overLimit.length === 1 ? "Bill over your limit" : "Bills over your limit",
      count: overLimit.length,
      amount: round(overLimit.reduce((sum, bill) => sum + bill.total, 0)),
      fact: null,
      tone: null,
      href: "/books/bills?view=drafts",
    },
    { key: "bank", label: "Bank lines to match", count: lines, amount: null, fact: null, tone: null, href: "/books/bank" },
    { key: "posting", label: "Failed to post", count: failed, amount: null, fact: firstFailed?.description ?? null, tone: "bad", href: "/books/needs-posting" },
    { key: "fdms", label: "Not signed by FDMS", count: unsigned.length, amount: null, fact: unsigned.length === 1 ? unsigned[0]!.invoiceNumber : null, tone: "warn", href: "/books/fiscal?tab=failed" },
    {
      key: "itf263",
      label: missing.length === 1 ? "Supplier without an ITF263" : "Suppliers without an ITF263",
      count: missing.length,
      amount: null,
      fact: missing.length === 1 ? missing[0]!.name.split(" ")[0]! : null,
      tone: null,
      href: "/books/suppliers?view=missing-itf263",
    },
    { key: "cash", label: "Cash with reps, not banked", count: cashWithReps.count, amount: cashWithReps.amount, fact: null, tone: null, href: "/books/accounts" },
    { key: "claims", label: claims._count === 1 ? "Claim to reimburse" : "Claims to reimburse", count: claims._count, amount: round(num(claims._sum.total)), fact: null, tone: null, href: "/books/claims" },
  ];
  // A row shows only when something waits.
  return rows.filter((row) => row.count > 0);
}

async function comingUp(db: Db, companyId: string, today: string, until: string, limit: number): Promise<MoneyUpcoming[]> {
  const window = { gte: midnight(today), lte: midnight(until) };
  const [bills, drafts, invoices, due] = await Promise.all([
    db.purchaseBill.findMany({
      where: { companyId, status: "RECEIVED", dueDate: window },
      select: { billNumber: true, dueDate: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { name: true } } },
    }),
    db.purchaseBill.findMany({ where: { companyId, status: "DRAFT", dueDate: window, total: { gt: limit } }, select: { dueDate: true, total: true, notes: true, vendor: { select: { name: true } } } }),
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", dueDate: window },
      select: { invoiceNumber: true, dueDate: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, customer: { select: { name: true } } },
    }),
    readWhatsDue(db, companyId, { from: today, to: until }),
  ]);
  const lines: MoneyUpcoming[] = [];
  for (const bill of bills) {
    const balance = round(bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal);
    if (balance <= 0.005) continue;
    const day = storedDay(bill.dueDate!);
    lines.push({ day, when: dayWord(day), label: `${bill.vendor.name}, ${bill.billNumber ?? "bill"}`, amount: -balance, state: null });
  }
  for (const bill of drafts) {
    const day = storedDay(bill.dueDate!);
    const what = bill.notes?.split(/[.\n]/)[0]?.trim().toLowerCase();
    lines.push({ day, when: dayWord(day), label: `${bill.vendor.name}${what ? `, ${what}` : ""}, to approve`, amount: -round(bill.total), state: null });
  }
  for (const invoice of invoices) {
    const balance = round(invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
    if (balance <= 0.005) continue;
    const day = storedDay(invoice.dueDate!);
    lines.push({ day, when: dayWord(day), label: `${invoice.customer.name}, ${invoice.invoiceNumber ?? "invoice"}`, amount: balance, state: null });
  }
  for (const group of due.groups) {
    for (const row of group.rows) {
      if (row.state === "Paid" || row.state === "Filed" || !/^Pay/.test(row.what)) continue;
      lines.push({ day: row.date, when: dayWord(row.date), label: `${row.what.replace(/^Pay /, "")} for ${row.period.replace(/, so far$/, "")}`, amount: row.amount == null ? null : -row.amount, state: null });
    }
  }
  return lines.sort((a, b) => a.day.localeCompare(b.day));
}

async function flows(db: Db, companyId: string, today: string, currency: string, base: string): Promise<Pick<MoneyBoard, "cameIn" | "wentOut">> {
  const from = harareStart(monthStart(today));
  const when = { gte: from };
  const isBase = currency === base;
  const out = MONEY_OUT_WHERE;
  const [all, sites, vendors, requisitions, claims, vouchers, commission] = await Promise.all([
    moneyInOut(db, companyId, { from }, currency, base),
    db.retailSale.groupBy({ by: ["siteId"], where: { companyId, status: "POSTED", saleType: "SALE", createdAt: when } }),
    db.purchasePayment.findMany({ where: out.supplierPayments(companyId, when, currency, isBase), select: { vendor: { select: { name: true } } }, distinct: ["vendorId"], take: 2 }),
    db.crmRequisition.findMany({ where: out.requisitions(companyId, when, currency), select: { paidAmount: true, approvedAmount: true, amount: true } }),
    db.expenseClaim.aggregate({ where: out.claims(companyId, when, currency), _sum: { total: true }, _count: true }),
    db.pettyCashVoucher.aggregate({ where: out.vouchers(companyId, when, currency), _sum: { amount: true }, _count: true }),
    db.crmCommissionEntry.aggregate({ where: out.commission(companyId, when, currency), _sum: { amount: true }, _count: true }),
  ]);
  let tillLabel = "Till takings";
  if (sites.length === 1) {
    const site = await db.site.findUnique({ where: { id: sites[0]!.siteId }, select: { name: true } });
    if (site) tillLabel = `${site.name} takings`;
  }
  const inRows: MoneyShare[] = all.in.map((flow) =>
    flow.key === "tills"
      ? { key: flow.key, label: tillLabel, fact: `${count(flow.count, "sale")} on the tills`, amount: flow.amount }
      : flow.key === "invoices"
        ? { key: flow.key, label: "Invoices paid", fact: count(flow.count, "receipt"), amount: flow.amount }
        : { key: flow.key, label: "School fees", fact: count(flow.count, "receipt"), amount: flow.amount },
  );
  const outRows: MoneyShare[] = [];
  for (const flow of all.out) {
    if (flow.key === "supplier-payments") {
      const vendor = vendors.length === 1 ? vendors[0]!.vendor?.name : null;
      outRows.push({ key: flow.key, label: "Supplier payments", fact: `${count(flow.count, "payment")}${vendor ? `, ${vendor}` : ""}`, amount: flow.amount });
    } else if (flow.key === "payouts") {
      // The core sums payouts to people as one flow; the board draws each kind.
      const parts: MoneyShare[] = [
        { key: "requisitions", label: "Requisitions", fact: `${requisitions.length} disbursed`, amount: round(requisitions.reduce((sum, row) => sum + num(row.paidAmount ?? row.approvedAmount ?? row.amount), 0)) },
        { key: "claims", label: "Claims", fact: `${claims._count} reimbursed`, amount: round(num(claims._sum.total)) },
        { key: "petty-cash", label: "Petty cash", fact: count(vouchers._count, "voucher"), amount: round(num(vouchers._sum.amount)) },
        { key: "commission", label: "Commission", fact: `${commission._count} paid`, amount: round(num(commission._sum.amount)) },
      ];
      outRows.push(...parts.filter((part) => part.amount > 0));
    } else if (flow.key === "till-payouts") {
      outRows.push({ key: flow.key, label: "Till payouts", fact: `${flow.count} on the tills`, amount: flow.amount });
    } else if (flow.key === "payroll") {
      outRows.push({ key: flow.key, label: "Payroll", fact: count(flow.count, "pay run"), amount: flow.amount });
    }
  }
  return { cameIn: { total: all.totalIn, rows: inRows }, wentOut: { total: all.totalOut, rows: outRows } };
}

async function youOwe(db: Db, companyId: string, today: string, currency: string): Promise<MoneyBoard["owe"]> {
  const [bills, claims, due] = await Promise.all([
    db.purchaseBill.findMany({ where: { companyId, status: "RECEIVED", currency }, select: { total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true } }),
    db.expenseClaim.aggregate({ where: { companyId, status: "APPROVED", currency }, _sum: { total: true } }),
    readWhatsDue(db, companyId, { from: addDays(today, -60), to: addDays(today, 45) }),
  ]);
  const open = bills.map((bill) => Math.max(0, bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal)).filter((balance) => balance > 0.005);
  const zimra = due.groups.flatMap((group) => group.rows).filter((row) => /^Pay/.test(row.what) && row.state !== "Paid" && row.amount != null && (row.tax === "vat" || row.tax === "paye" || row.tax === "wht"));
  const rows = [
    { label: `Suppliers, ${count(open.length, "bill")}`, amount: round(open.reduce((sum, balance) => sum + balance, 0)) },
    { label: "ZIMRA, VAT and PAYE", amount: round(zimra.reduce((sum, row) => sum + (row.amount ?? 0), 0)) },
    { label: "Staff claims", amount: round(num(claims._sum.total)) },
  ].filter((row, index) => index === 0 || row.amount > 0.005);
  return { total: round(rows.reduce((sum, row) => sum + row.amount, 0)), rows };
}

export async function readMoneyBoard(db: Db, companyId: string, now = new Date()): Promise<MoneyBoard> {
  const today = dayOf(now);
  const until = addDays(today, AHEAD_DAYS);
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const totals = await owedAndOverdue(db, companyId, today);
  const currency = totals.currency;
  const [bank, limits, open] = await Promise.all([accounts(db, companyId, base, now), moneyLimits(companyId, db), openInvoicesByAge(db, companyId, now)]);
  // Cash a rep holds, never yet banked: a cash account that is not a float and was never reconciled.
  const reps = bank.rows.filter((row) => row.kind === "CASH" && !row.isFloat && row.reconciled === null && row.native > 0.005 && row.currency === base);
  const [needList, upcoming, money, owe] = await Promise.all([
    needs(db, companyId, now, limits.paymentOwnerOver, totals.overdue, { count: reps.length, amount: round(reps.reduce((sum, row) => sum + row.native, 0)) }),
    comingUp(db, companyId, today, until, limits.paymentOwnerOver),
    flows(db, companyId, today, currency, base),
    youOwe(db, companyId, today, currency),
  ]);
  const payers = bank.rows.filter((row) => (row.kind === "BANK" || row.kind === "MOBILE") && row.currency === base);
  const hold = round(payers.reduce((sum, row) => sum + row.native, 0));
  const ages = MONEY_AGES.map((label) => ({ label, amount: 0 }));
  for (const invoice of open) if (invoice.currency === currency) ages[moneyAge(invoice.daysOverdue)]!.amount += invoice.balance;
  return {
    currency,
    finding: moneyBoardFinding(money.cameIn.total, money.wentOut.total, totals.owed.amount, totals.overdue.amount, owe.total, currency),
    needs: needList,
    bank: bank.board,
    comingUp: {
      until: shortDay(until),
      weekEnd: addDays(today, 7),
      lines: upcoming,
      payers: payers.length ? { names: names(payers.map((row) => row.bankName || row.name)), now: hold, after: afterComingUp(hold, upcoming) } : null,
    },
    period: shortMonthSoFar(today),
    ...money,
    owed: { total: totals.owed.amount, overdue: totals.overdue.amount, ages: ages.map((age) => ({ ...age, amount: round(age.amount) })) },
    owe,
  };
}
