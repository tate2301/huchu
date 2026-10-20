import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { ageLedgerLines, type LedgerLine, type PartyAging, type PartyKind } from "./aging-lines";

export type { AgingRow, Buckets, PartyAging, PartyKind } from "./aging-lines";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * One statement and one aging (books-final §6.1 fix 14): both read the
 * sub-ledger (`PaymentLedgerEntry`), its POSTED lines only, for customers and
 * suppliers alike, so Books, the CRM and reports cannot disagree.
 *
 * - Aging: what each party owes (or is owed), aged from each line's date into
 *   current, 31–60, 61–90, 91–120 and over 120 days, in each currency on its
 *   own, and in the base currency at each document's frozen rate (D3), so the
 *   base total equals the control account (1100, 2000) outside the month-end
 *   revaluation.
 * - Statement: the full activity for one party between two dates, with the
 *   opening balance, every line and the running balance, per currency.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The frozen rate behind each line: its invoice's or bill's, else its own document's (a receipt or payment on account). */
async function ratesFor(db: Db, companyId: string, lines: LedgerLine[]) {
  const invoiceIds = [...new Set(lines.map((line) => line.invoiceId).filter((id): id is string => Boolean(id)))];
  const billIds = [...new Set(lines.map((line) => line.billId).filter((id): id is string => Boolean(id)))];
  const receiptIds = lines.filter((line) => !line.invoiceId && line.sourceType === "SALES_RECEIPT").map((line) => line.sourceId);
  const paymentIds = lines.filter((line) => !line.billId && line.sourceType === "PURCHASE_PAYMENT").map((line) => line.sourceId);
  const [invoices, bills, receipts, payments] = await Promise.all([
    invoiceIds.length ? db.salesInvoice.findMany({ where: { companyId, id: { in: invoiceIds } }, select: { id: true, exchangeRate: true } }) : [],
    billIds.length ? db.purchaseBill.findMany({ where: { companyId, id: { in: billIds } }, select: { id: true, exchangeRate: true } }) : [],
    receiptIds.length ? db.salesReceipt.findMany({ where: { companyId, id: { in: receiptIds } }, select: { id: true, exchangeRate: true } }) : [],
    paymentIds.length ? db.purchasePayment.findMany({ where: { companyId, id: { in: paymentIds } }, select: { id: true, exchangeRate: true } }) : [],
  ]);
  const byId = new Map<string, number | null>([...invoices, ...bills, ...receipts, ...payments].map((row) => [row.id, row.exchangeRate]));
  return (line: LedgerLine) => byId.get(line.invoiceId ?? line.billId ?? line.sourceId) ?? null;
}

const SELECT = { partyId: true, entryDate: true, debit: true, credit: true, currency: true, sourceType: true, sourceId: true, invoiceId: true, billId: true } as const;

/** Who owes the business, or whom it owes, aged as at a date (fix 14). */
export async function partyAging(companyId: string, kind: PartyKind, asOf = new Date(), db: Db = prisma): Promise<PartyAging> {
  const lines = (await db.paymentLedgerEntry.findMany({
    where: { companyId, accountType: kind === "customer" ? "RECEIVABLE" : "PAYABLE", status: "POSTED", entryDate: { lte: asOf }, partyId: { not: null } },
    select: SELECT,
  })) as LedgerLine[];
  const ids = [...new Set(lines.map((line) => line.partyId!))];
  const parties = ids.length
    ? kind === "customer"
      ? await db.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : await db.vendor.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  // A school family's account is kept under the student (P4).
  const unnamed = kind === "customer" ? ids.filter((id) => !parties.some((party) => party.id === id)) : [];
  if (unnamed.length) {
    const students = await db.schoolStudent.findMany({ where: { id: { in: unnamed } }, select: { id: true, firstName: true, lastName: true } });
    for (const student of students) parties.push({ id: student.id, name: `${student.firstName} ${student.lastName}`.trim() });
  }
  const base = await resolveBaseCurrency(companyId);
  const rateOf = await ratesFor(db, companyId, lines);
  const aged = ageLedgerLines(kind, lines, new Map(parties.map((party) => [party.id, party.name])), asOf, base, rateOf);
  return { kind, asOf: asOf.toISOString().slice(0, 10), baseCurrency: base, ...aged };
}

export type StatementLine = {
  date: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  description: string;
  currency: string;
  /** What it adds to what is owed (a customer's invoice, a supplier's bill); negative for what takes it off. */
  amount: number;
  balance: number;
};

export type PartyStatement = {
  kind: PartyKind;
  partyId: string;
  from: string;
  to: string;
  currencies: Array<{ currency: string; opening: number; closing: number; lines: StatementLine[] }>;
};

/** One party's full activity between two dates, per currency, with the opening and running balance (fix 14). */
export async function partyStatement(companyId: string, kind: PartyKind, partyId: string, from: Date, to: Date, db: Db = prisma): Promise<PartyStatement> {
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999));
  const lines = await db.paymentLedgerEntry.findMany({
    where: { companyId, accountType: kind === "customer" ? "RECEIVABLE" : "PAYABLE", status: "POSTED", partyId, entryDate: { lte: end } },
    select: { ...SELECT, description: true, createdAt: true },
    orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
  });
  const groups = new Map<string, { currency: string; opening: number; closing: number; lines: StatementLine[] }>();
  for (const line of lines) {
    const currency = (line.currency || "USD").toUpperCase();
    const group = groups.get(currency) ?? { currency, opening: 0, closing: 0, lines: [] };
    const amount = round2(kind === "customer" ? line.debit - line.credit : line.credit - line.debit);
    if (line.entryDate < from) {
      group.opening = round2(group.opening + amount);
      group.closing = group.opening;
    } else {
      group.closing = round2(group.closing + amount);
      group.lines.push({ date: line.entryDate.toISOString().slice(0, 10), sourceType: line.sourceType, sourceId: line.sourceId, description: line.description ?? "", currency, amount, balance: group.closing });
    }
    groups.set(currency, group);
  }
  return { kind, partyId, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), currencies: [...groups.values()] };
}
