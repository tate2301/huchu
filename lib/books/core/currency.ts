import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { resolveBaseCurrency, UnknownExchangeRateError } from "@/lib/money";

import { rateFor } from "./rate";

/**
 * Frozen rates and base amounts (D3, books-final §5.9). A document keeps its
 * own currency, the rate on its day and where that rate came from, and its
 * total in the base currency. Rates are quote units per one base unit, so
 * base = amount ÷ rate.
 *
 * - A credit note takes its invoice's rate, and a debit note its bill's: each
 *   corrects part of that document, so the receivable or payable comes off
 *   at what it went on at.
 * - A receipt or payment settles at its own rate; the difference between
 *   that and what the invoice or bill was carried at is the realised
 *   exchange gain or loss (`settle`).
 * - No rate on the day is never an invented number: the rate stays empty and
 *   the posting waits for one (the engine says so in Needs posting).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type RateSource = "BASE" | "MANUAL" | "RBZ";
export type Frozen = { exchangeRate: number | null; rateSource: RateSource | null; baseTotal: number | null };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The rate to freeze on a document of this currency, date and total. */
export async function freezeRate(companyId: string, currency: string | null | undefined, date: Date, total: number, knownAt?: Date): Promise<Frozen> {
  try {
    const frozen = await rateFor(companyId, currency, date, knownAt);
    return { exchangeRate: frozen.rate, rateSource: frozen.source, baseTotal: round2(total / frozen.rate) };
  } catch (error) {
    if (error instanceof UnknownExchangeRateError) return { exchangeRate: null, rateSource: null, baseTotal: null };
    throw error;
  }
}

/** The document a posting key names: `void:`, `fx:`, a CRM revision, a requisition round or a bill's FDMS move stripped. */
export function documentIdOf(sourceId: string): string {
  return sourceId
    .replace(/^void:/, "")
    .replace(/:revision-\d+$/, "")
    .replace(/:r\d+$/, "")
    .replace(/:fdms$/, "");
}

type DocRate = { currency: string; rate: number | null; source: RateSource | null; total: number; table: DocTable };
type DocTable = "salesInvoice" | "creditNote" | "salesReceipt" | "purchaseBill" | "debitNote" | "purchasePayment" | "crmRequisition" | "expenseClaim" | "crmDailyCostEntry";

const asSource = (value: string | null | undefined): RateSource | null => (value === "BASE" || value === "MANUAL" || value === "RBZ" ? value : null);

/** The rate frozen on the document behind a posting, when it has one; null for a source with no document of its own. */
export async function documentRate(db: Db, companyId: string, sourceType: AccountingSourceType, sourceId: string): Promise<DocRate | null> {
  const id = documentIdOf(sourceId);
  switch (sourceType) {
    case "SALES_INVOICE": {
      const row = await db.salesInvoice.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, total: true } });
      return row && { currency: row.currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: row.total, table: "salesInvoice" };
    }
    case "SALES_CREDIT_NOTE": {
      const row = await db.creditNote.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, total: true, invoice: { select: { exchangeRate: true, rateSource: true } } } });
      if (!row) return null;
      const rate = row.exchangeRate ?? row.invoice?.exchangeRate ?? null;
      return { currency: row.currency, rate, source: asSource(row.rateSource ?? row.invoice?.rateSource), total: row.total, table: "creditNote" };
    }
    case "SALES_RECEIPT": {
      const row = await db.salesReceipt.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, amount: true } });
      return row && row.currency ? { currency: row.currency, rate: row.exchangeRate, source: null, total: row.amount, table: "salesReceipt" } : null;
    }
    case "PURCHASE_BILL": {
      const row = await db.purchaseBill.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, total: true } });
      return row && { currency: row.currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: row.total, table: "purchaseBill" };
    }
    case "PURCHASE_DEBIT_NOTE": {
      const row = await db.debitNote.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, total: true, bill: { select: { exchangeRate: true, rateSource: true } } } });
      if (!row) return null;
      return { currency: row.currency, rate: row.exchangeRate ?? row.bill?.exchangeRate ?? null, source: asSource(row.rateSource ?? row.bill?.rateSource), total: row.total, table: "debitNote" };
    }
    case "PURCHASE_PAYMENT": {
      const row = await db.purchasePayment.findFirst({ where: { id, companyId }, select: { exchangeRate: true, rateSource: true, amount: true, bill: { select: { currency: true } }, bankAccount: { select: { currency: true } } } });
      if (!row) return null;
      const currency = row.bill?.currency ?? row.bankAccount?.currency ?? null;
      return currency ? { currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: row.amount, table: "purchasePayment" } : null;
    }
    case "CRM_REQUISITION_DISBURSEMENT":
    case "CRM_REQUISITION_REFUND":
    case "CRM_REQUISITION_TOPUP":
    case "REQUISITION_ACQUITTAL": {
      const row = await db.crmRequisition.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, amount: true } });
      return row && { currency: row.currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: Number(row.amount), table: "crmRequisition" };
    }
    case "EXPENSE_CLAIM":
    case "EXPENSE_CLAIM_PAYMENT": {
      const row = await db.expenseClaim.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, total: true } });
      return row && { currency: row.currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: Number(row.total), table: "expenseClaim" };
    }
    case "CRM_COST_ENTRY_SPEND": {
      const row = await db.crmDailyCostEntry.findFirst({ where: { id, companyId }, select: { currency: true, exchangeRate: true, rateSource: true, amount: true } });
      return row && { currency: row.currency, rate: row.exchangeRate, source: asSource(row.rateSource), total: Number(row.amount), table: "crmDailyCostEntry" };
    }
    default:
      return null;
  }
}

/** Writes the rate on a document that has none yet; never changes one already frozen. */
export async function stampRate(db: Db, companyId: string, doc: DocRate, id: string, rate: number, source: RateSource): Promise<void> {
  if (doc.rate) return;
  const data = { exchangeRate: rate, rateSource: source, baseTotal: round2(doc.total / rate) };
  const where = { id, companyId, exchangeRate: null };
  switch (doc.table) {
    case "salesInvoice": await db.salesInvoice.updateMany({ where, data }); return;
    case "creditNote": await db.creditNote.updateMany({ where, data }); return;
    case "salesReceipt": await db.salesReceipt.updateMany({ where, data: { exchangeRate: rate, baseAmount: data.baseTotal } }); return;
    case "purchaseBill": await db.purchaseBill.updateMany({ where, data }); return;
    case "debitNote": await db.debitNote.updateMany({ where, data }); return;
    case "purchasePayment": await db.purchasePayment.updateMany({ where, data }); return;
    case "crmRequisition": await db.crmRequisition.updateMany({ where, data }); return;
    case "expenseClaim": await db.expenseClaim.updateMany({ where, data }); return;
    case "crmDailyCostEntry": await db.crmDailyCostEntry.updateMany({ where, data }); return;
  }
}

export type PostingFx = { currency: string; rate: number | null; source: RateSource | null; base: string };

/**
 * The rate a posting converts at: the one given, else the document's frozen
 * one, else the rate on the day (frozen onto the document now). Null for the
 * base currency.
 */
export async function postingFx(
  db: Db,
  event: { companyId: string; sourceType: AccountingSourceType; sourceId: string; currency?: string | null; rate?: number | null; date: Date },
): Promise<PostingFx | null> {
  const base = (await resolveBaseCurrency(event.companyId)).toUpperCase();
  const doc = await documentRate(db, event.companyId, event.sourceType, event.sourceId);
  const currency = (event.currency ?? doc?.currency ?? base).trim().toUpperCase() || base;
  const id = documentIdOf(event.sourceId);
  if (currency === base) {
    if (doc && !doc.rate && doc.currency.toUpperCase() === base) await stampRate(db, event.companyId, doc, id, 1, "BASE");
    return null;
  }
  if (event.rate && event.rate > 0) return { currency, rate: event.rate, source: null, base };
  if (doc?.rate) return { currency, rate: doc.rate, source: doc.source, base };
  try {
    const frozen = await rateFor(event.companyId, currency, event.date);
    if (doc && doc.currency.toUpperCase() === currency) await stampRate(db, event.companyId, doc, id, frozen.rate, frozen.source);
    return { currency, rate: frozen.rate, source: frozen.source, base };
  } catch (error) {
    if (error instanceof UnknownExchangeRateError) return { currency, rate: null, source: null, base };
    throw error;
  }
}

export type Settlement = {
  /** What it takes off the invoice or bill, in that document's currency. */
  allocated: number;
  /** What came in or went out, in the base currency at its own rate. */
  settledBase: number;
  /** What that part of the invoice or bill was carried at, in the base currency. */
  carryingBase: number;
  /** settled − carrying for money in; carrying − settled for money out. Positive is a gain. */
  gain: number;
};

/**
 * A receipt or payment against a document (books-final §5.9.3), pure. In the
 * same currency it takes its own amount off; in another, its base value is
 * converted into the document's currency at the rate on the payment's day
 * (`crossRate`, the document currency's rate then).
 */
export function settle(input: {
  direction: "IN" | "OUT";
  docCurrency: string;
  docRate: number;
  payCurrency: string;
  payAmount: number;
  payRate: number;
  crossRate?: number | null;
}): Settlement {
  const settledBase = round2(input.payAmount / input.payRate);
  const same = input.docCurrency.toUpperCase() === input.payCurrency.toUpperCase();
  const allocated = same ? round2(input.payAmount) : round2((input.payAmount / input.payRate) * (input.crossRate ?? input.docRate));
  const carryingBase = round2(allocated / input.docRate);
  const gain = round2(input.direction === "IN" ? settledBase - carryingBase : carryingBase - settledBase);
  return { allocated, settledBase, carryingBase, gain };
}

export const REALISED_FX_ACCOUNT = "4210";
export const UNREALISED_FX_ACCOUNT = "4220";

/** The base-only lines that carry a realised difference on the receivable (1100) or payable (2000). */
export function realisedAdjustments(direction: "IN" | "OUT", gain: number): Array<{ accountCode: string; debit: number; credit: number; memo: string }> {
  const amount = round2(Math.abs(gain));
  if (amount < 0.01) return [];
  const control = direction === "IN" ? "1100" : "2000";
  const memo = gain > 0 ? "Realised exchange gain" : "Realised exchange loss";
  // Money in: a gain means the receivable was credited more than it was carried at, so it is debited back.
  // Money out: a gain means the payable was debited less than it was carried at, so it is debited the rest.
  return gain > 0
    ? [{ accountCode: control, debit: amount, credit: 0, memo }, { accountCode: REALISED_FX_ACCOUNT, debit: 0, credit: amount, memo }]
    : [{ accountCode: control, debit: 0, credit: amount, memo }, { accountCode: REALISED_FX_ACCOUNT, debit: amount, credit: 0, memo }];
}

/**
 * What a receipt takes off its invoice, in the invoice's currency: its own
 * amount in the same currency, else its base value at the invoice currency's
 * rate on the receipt's day, as the rates stood when it was recorded.
 */
export async function receiptAllocation(
  companyId: string,
  invoice: { currency: string; exchangeRate: number | null },
  receipt: { amount: number; currency: string | null; exchangeRate: number | null; receivedAt: Date; createdAt: Date },
): Promise<number> {
  const currency = (receipt.currency ?? invoice.currency).toUpperCase();
  if (currency === invoice.currency.toUpperCase()) return round2(receipt.amount);
  const payRate = receipt.exchangeRate ?? (await freezeRate(companyId, currency, receipt.receivedAt, receipt.amount, receipt.createdAt)).exchangeRate;
  const cross = (await freezeRate(companyId, invoice.currency, receipt.receivedAt, 1, receipt.createdAt)).exchangeRate ?? invoice.exchangeRate;
  if (!payRate || !cross) return round2(receipt.amount);
  return round2((receipt.amount / payRate) * cross);
}

/** The frozen fields to write on a document as it is created, empty where no rate is known yet (D3). */
export async function frozenFields(companyId: string, currency: string | null | undefined, date: Date, total: number) {
  const frozen = await freezeRate(companyId, currency, date, total);
  return frozen.exchangeRate ? { exchangeRate: frozen.exchangeRate, rateSource: frozen.rateSource, baseTotal: frozen.baseTotal } : {};
}

/**
 * The base currency is a setting, USD by default, and changing it after the
 * first posting is refused (§5.9.7): every base amount already posted would
 * read in the wrong currency. Null when it may change; else why not.
 */
export async function baseCurrencyChangeRefusal(db: Db, companyId: string, wanted: string): Promise<string | null> {
  const current = (await resolveBaseCurrency(companyId)).toUpperCase();
  if (current === wanted.trim().toUpperCase()) return null;
  const posted = await db.journalEntry.count({ where: { companyId } });
  return posted > 0 ? `The books already hold ${posted} entries in ${current}, so the base currency cannot change now.` : null;
}
