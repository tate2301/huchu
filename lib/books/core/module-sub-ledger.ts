import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";

/**
 * Sub-ledger lines for what other modules sell on credit (books-final §6.2
 * fixes 10 and 11, §4.19; P4): a till sale on account, a lay-by's deposits
 * and its hand-over, and school fees. Each is written by the post itself
 * (`syncPaymentLedgerEntryForSource`), in its transaction, so the one
 * statement and the one aging (`statement-aging.ts`) count them beside
 * invoices and receipts.
 *
 * - **Till sale** (`RETAIL_SALE`): what was put on the customer's account
 *   (the ON_ACCOUNT tender, 1100) and what their lay-by deposits paid (the
 *   LAYBY tender, 2260) is owed by, or taken from, that customer. A refund or
 *   a void of it gives that back. Cash sales write nothing.
 * - **Lay-by** (`RETAIL_LAYBY_PAYMENT`, `RETAIL_LAYBY_CANCEL`): each deposit or
 *   payment is the customer's money held (a credit); the cancel takes what was
 *   paid off again (paid back, and the fee kept).
 * - **School fees** (`SCHOOL_FEE_*`): the family's account, under the
 *   student: a fee invoice is owed, a receipt, waiver or write-off takes it
 *   off, a receipt's void and a refund put it back. A credit applied moves
 *   money inside the account, so it writes nothing. Amounts are what the
 *   entry posted, in the base currency the school posts in.
 *
 * Lines are in the base currency at the amounts the ledger posted, so their
 * total ties to 1100, 2260 and 1110.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type ModuleSeed = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  entryDate: Date;
  accountType: "RECEIVABLE";
  partyType: "CUSTOMER" | "STUDENT";
  partyId: string | null;
  debit: number;
  credit: number;
  currency: string;
  description: string;
  journalEntryId?: string | null;
};

export const RETAIL_SUB_LEDGER_TYPES: AccountingSourceType[] = ["RETAIL_SALE", "RETAIL_REFUND", "RETAIL_VOID", "RETAIL_LAYBY_PAYMENT", "RETAIL_LAYBY_CANCEL"];
export const SCHOOL_SUB_LEDGER_TYPES: AccountingSourceType[] = ["SCHOOL_FEE_INVOICE", "SCHOOL_FEE_RECEIPT", "SCHOOL_FEE_RECEIPT_VOID", "SCHOOL_FEE_WAIVER", "SCHOOL_FEE_WRITE_OFF", "SCHOOL_FEE_REFUND"];
export const MODULE_SUB_LEDGER_TYPES: AccountingSourceType[] = [...RETAIL_SUB_LEDGER_TYPES, ...SCHOOL_SUB_LEDGER_TYPES];

const round = (n: number) => Math.round(n * 100) / 100;

async function baseCurrency(db: Db, companyId: string) {
  const settings = await db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } });
  return settings?.baseCurrency?.trim().toUpperCase() || "USD";
}

/** What the entry posted: its debits, which equal its credits. */
async function posted(db: Db, journalEntryId: string | null | undefined): Promise<number> {
  if (!journalEntryId) return 0;
  const sum = await db.journalLine.aggregate({ where: { entryId: journalEntryId }, _sum: { debit: true } });
  return round(toNumberOrZero(sum._sum.debit ?? 0));
}

/** The document a school posting key names: `SCHOOL_FEE_INVOICE:<id>` and friends. */
const afterPrefix = (sourceId: string) => sourceId.slice(sourceId.indexOf(":") + 1);

export async function moduleLedgerSeed(db: Db, companyId: string, sourceType: AccountingSourceType, sourceId: string, journalEntryId?: string | null): Promise<ModuleSeed | null> {
  if (!sourceId || sourceId.startsWith("void:")) return null;
  const line = (partyType: ModuleSeed["partyType"], partyId: string | null, entryDate: Date, owed: number, currency: string, description: string): ModuleSeed | null =>
    !partyId || Math.abs(owed) < 0.005
      ? null
      : { companyId, sourceType, sourceId, entryDate, accountType: "RECEIVABLE", partyType, partyId, debit: owed > 0 ? round(owed) : 0, credit: owed < 0 ? round(-owed) : 0, currency, description, journalEntryId };

  switch (sourceType) {
    case "RETAIL_SALE":
    case "RETAIL_REFUND":
    case "RETAIL_VOID": {
      const sale = await db.retailSale.findFirst({
        where: { id: sourceId, companyId },
        select: { saleNo: true, customerId: true, postedAt: true, createdAt: true, payments: { where: { tenderType: { in: ["ON_ACCOUNT", "LAYBY"] } }, select: { baseAmount: true } } },
      });
      if (!sale) return null;
      const amount = round(sale.payments.reduce((sum, payment) => sum + Math.abs(toNumberOrZero(payment.baseAmount)), 0));
      const sign = sourceType === "RETAIL_SALE" ? 1 : -1;
      const what = sourceType === "RETAIL_SALE" ? "Till sale" : sourceType === "RETAIL_REFUND" ? "Till refund" : "Till sale void";
      return line("CUSTOMER", sale.customerId, sale.postedAt ?? sale.createdAt, sign * amount, await baseCurrency(db, companyId), `${what} ${sale.saleNo}, on account`);
    }
    case "RETAIL_LAYBY_PAYMENT": {
      const payment = await db.retailLaybyPayment.findFirst({ where: { id: sourceId, companyId }, select: { baseAmount: true, createdAt: true, kind: true, layby: { select: { laybyNo: true, customerId: true } } } });
      if (!payment) return null;
      const held = toNumberOrZero(payment.baseAmount);
      return line("CUSTOMER", payment.layby.customerId, payment.createdAt, -held, await baseCurrency(db, companyId), `Lay-by ${payment.layby.laybyNo} ${payment.kind === "DEPOSIT" ? "deposit" : "payment"}`);
    }
    case "RETAIL_LAYBY_CANCEL": {
      const layby = await db.retailLayby.findFirst({ where: { id: sourceId, companyId }, select: { laybyNo: true, customerId: true, paid: true, cancelledAt: true, updatedAt: true } });
      if (!layby) return null;
      const amount = journalEntryId ? await posted(db, journalEntryId) : toNumberOrZero(layby.paid);
      return line("CUSTOMER", layby.customerId, layby.cancelledAt ?? layby.updatedAt, amount, await baseCurrency(db, companyId), `Lay-by ${layby.laybyNo} cancelled`);
    }
    case "SCHOOL_FEE_INVOICE": {
      const invoice = await db.schoolFeeInvoice.findFirst({ where: { id: afterPrefix(sourceId), companyId }, select: { invoiceNo: true, studentId: true, issueDate: true, baseAmount: true } });
      if (!invoice) return null;
      const amount = journalEntryId ? await posted(db, journalEntryId) : toNumberOrZero(invoice.baseAmount);
      return line("STUDENT", invoice.studentId, invoice.issueDate, amount, await baseCurrency(db, companyId), `Fee invoice ${invoice.invoiceNo}`);
    }
    case "SCHOOL_FEE_RECEIPT":
    case "SCHOOL_FEE_RECEIPT_VOID": {
      const receipt = await db.schoolFeeReceipt.findFirst({ where: { id: afterPrefix(sourceId), companyId }, select: { receiptNo: true, studentId: true, receiptDate: true, voidedAt: true, baseAmount: true } });
      if (!receipt) return null;
      const amount = journalEntryId ? await posted(db, journalEntryId) : toNumberOrZero(receipt.baseAmount);
      const voided = sourceType === "SCHOOL_FEE_RECEIPT_VOID";
      return line("STUDENT", receipt.studentId, voided ? (receipt.voidedAt ?? receipt.receiptDate) : receipt.receiptDate, voided ? amount : -amount, await baseCurrency(db, companyId), `Fee receipt ${receipt.receiptNo}${voided ? " voided" : ""}`);
    }
    case "SCHOOL_FEE_WAIVER": {
      const waiver = await db.schoolFeeWaiver.findFirst({ where: { id: afterPrefix(sourceId), companyId }, select: { studentId: true, baseAmount: true, createdAt: true, reason: true } });
      if (!waiver) return null;
      const amount = journalEntryId ? await posted(db, journalEntryId) : toNumberOrZero(waiver.baseAmount);
      return line("STUDENT", waiver.studentId, waiver.createdAt, -amount, await baseCurrency(db, companyId), "Fee waiver");
    }
    case "SCHOOL_FEE_WRITE_OFF": {
      const invoice = await db.schoolFeeInvoice.findFirst({ where: { id: afterPrefix(sourceId), companyId }, select: { invoiceNo: true, studentId: true, updatedAt: true } });
      if (!invoice) return null;
      return line("STUDENT", invoice.studentId, invoice.updatedAt, -(await posted(db, journalEntryId)), await baseCurrency(db, companyId), `Fee invoice ${invoice.invoiceNo} written off`);
    }
    case "SCHOOL_FEE_REFUND": {
      const refund = await db.schoolFeeRefund.findFirst({ where: { id: afterPrefix(sourceId), companyId }, select: { refundNo: true, studentId: true, baseAmount: true, createdAt: true } });
      if (!refund) return null;
      const amount = journalEntryId ? await posted(db, journalEntryId) : toNumberOrZero(refund.baseAmount);
      return line("STUDENT", refund.studentId, refund.createdAt, amount, await baseCurrency(db, companyId), `Fee refund ${refund.refundNo}`);
    }
    default:
      return null;
  }
}
