import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { docLabel } from "../doc-number";
import { wasFiscalised } from "../reversal";
import { holdFor } from "./holds";
import { type Dependent, type UndoContext, type UndoFacts, type UndoKind } from "./undo-rules";

/**
 * What undo needs to know about one document, read from the books: its
 * facts for the rules (`undo-rules.ts`), the postings it made (to mirror or
 * erase), and the context (closed months, closed reconciliations, finalised
 * VAT returns). Nothing changes here.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** The postings a document made: a source type and the ids it posted under (each also as `<id>:…` and `void:<id>…`). */
export type Postings = Array<{ sourceType: AccountingSourceType; ids: string[] }>;

export type LoadedDoc = UndoFacts & { postings: Postings; partyId?: string | null };

const round = (n: number) => Math.round(n * 100) / 100;

type FiscalRow = { status: string; receiptGlobalNo: number | null; fiscalDayId: string | null; providerKey: string | null; fiscalDay?: { providerConfig: { isTestDevice: boolean } } | null } | null;

/** Signed into a fiscal day or accepted by FDMS; and whether every such record is on a test device (D18). */
async function fiscalOf(db: Db, companyId: string, row: FiscalRow): Promise<{ fiscalised: boolean; testDevice: boolean }> {
  if (!row) return { fiscalised: false, testDevice: false };
  const fiscalised = wasFiscalised(row) || Boolean(row.fiscalDayId);
  if (!fiscalised) return { fiscalised, testDevice: false };
  let test = row.fiscalDay?.providerConfig.isTestDevice ?? null;
  if (test === null && row.providerKey) {
    const device = await db.fiscalisationProviderConfig.findFirst({ where: { companyId, providerKey: row.providerKey }, select: { isTestDevice: true } });
    test = device?.isTestDevice ?? false;
  }
  return { fiscalised, testDevice: Boolean(test) };
}

const FISCAL_SELECT = { status: true, receiptGlobalNo: true, fiscalDayId: true, providerKey: true, fiscalDay: { select: { providerConfig: { select: { isTestDevice: true } } } } } as const;

const base = (kind: UndoKind, id: string, label: string) => ({ kind, id, label, fiscalised: false, testDevice: false, ownerId: null, dependents: [] as Dependent[], blocked: null as string | null });

/** One document's facts and postings, or null when it is not in this workspace. */
export async function loadDoc(companyId: string, kind: UndoKind, id: string, db: Db = prisma): Promise<LoadedDoc | null> {
  switch (kind) {
    case "invoice": {
      const row = await db.salesInvoice.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          invoiceDate: true,
          createdById: true,
          customerId: true,
          receipts: { where: { voidedAt: null }, select: { id: true, receiptNumber: true } },
          fiscalReceipt: { select: FISCAL_SELECT },
        },
      });
      if (!row) return null;
      const fiscal = await fiscalOf(db, companyId, row.fiscalReceipt);
      const label = docLabel(row.invoiceNumber);
      return {
        ...base(kind, id, label),
        ...fiscal,
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.invoiceDate,
        ownerId: row.createdById,
        partyId: row.customerId,
        // Nothing stands in a void's way (§4.3): the full credit note takes off what earlier notes and write-offs left, and payments go on account.
        dependents: [],
        onAccount: row.receipts.map((receipt) => ({ kind: "receipt" as const, id: receipt.id, label: receipt.receiptNumber })),
        postings: [{ sourceType: "SALES_INVOICE", ids: [id] }],
      };
    }
    case "credit-note": {
      const row = await db.creditNote.findFirst({
        where: { id, companyId },
        select: { id: true, noteNumber: true, status: true, noteDate: true, createdById: true, fiscalReceipt: { select: FISCAL_SELECT }, invoice: { select: { customerId: true } } },
      });
      if (!row) return null;
      return {
        ...base(kind, id, docLabel(row.noteNumber, "credit note")),
        ...(await fiscalOf(db, companyId, row.fiscalReceipt)),
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.noteDate,
        ownerId: row.createdById,
        partyId: row.invoice.customerId,
        postings: [{ sourceType: "SALES_CREDIT_NOTE", ids: [id] }],
      };
    }
    case "receipt": {
      const row = await db.salesReceipt.findFirst({ where: { id, companyId }, select: { id: true, receiptNumber: true, voidedAt: true, receivedAt: true, createdById: true, customerId: true } });
      if (!row) return null;
      return {
        ...base(kind, id, row.receiptNumber),
        draft: false,
        voided: Boolean(row.voidedAt),
        posted: true,
        date: row.receivedAt,
        ownerId: row.createdById,
        partyId: row.customerId,
        postings: [{ sourceType: "SALES_RECEIPT", ids: [id] }],
      };
    }
    case "quote": {
      const row = await db.salesQuotation.findFirst({
        where: { id, companyId },
        select: { id: true, quotationNumber: true, status: true, quotationDate: true, createdById: true, customerId: true, invoicesRaised: { where: { status: { not: "VOIDED" } }, select: { id: true, invoiceNumber: true } } },
      });
      if (!row) return null;
      return {
        ...base(kind, id, row.quotationNumber),
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.quotationDate,
        ownerId: row.createdById,
        partyId: row.customerId,
        dependents: row.invoicesRaised.map((invoice) => ({ kind: "invoice" as const, id: invoice.id, label: docLabel(invoice.invoiceNumber) })),
        postings: [],
      };
    }
    case "bill": {
      const row = await db.purchaseBill.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          billNumber: true,
          status: true,
          billDate: true,
          createdById: true,
          vendorId: true,
          payments: { where: { status: "PAID" }, select: { id: true, paymentNumber: true } },
          debitNotes: { where: { status: "ISSUED" }, select: { id: true, noteNumber: true } },
          writeOffs: { where: { status: "POSTED" }, select: { id: true } },
        },
      });
      if (!row) return null;
      return {
        ...base(kind, id, docLabel(row.billNumber, "bill")),
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.billDate,
        ownerId: row.createdById,
        partyId: row.vendorId,
        // A bill voids by its mirror (§4.8): a debit note or write-off on it would be reversed twice, so they go first; payments go on account.
        onAccount: row.payments.map((payment) => ({ kind: "payment" as const, id: payment.id, label: payment.paymentNumber ?? "a payment" })),
        dependents: [
          ...row.debitNotes.map((note) => ({ kind: "debit-note" as const, id: note.id, label: docLabel(note.noteNumber, "debit note") })),
          ...row.writeOffs.map((writeOff) => ({ kind: "write-off" as const, id: writeOff.id, label: "a write-off" })),
        ],
        postings: [{ sourceType: "PURCHASE_BILL", ids: [id] }],
      };
    }
    case "debit-note": {
      const row = await db.debitNote.findFirst({ where: { id, companyId }, select: { id: true, noteNumber: true, status: true, noteDate: true, createdById: true, bill: { select: { vendorId: true } } } });
      if (!row) return null;
      return {
        ...base(kind, id, docLabel(row.noteNumber, "debit note")),
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.noteDate,
        ownerId: row.createdById,
        partyId: row.bill.vendorId,
        postings: [{ sourceType: "PURCHASE_DEBIT_NOTE", ids: [id] }],
      };
    }
    case "payment": {
      const row = await db.purchasePayment.findFirst({ where: { id, companyId }, select: { id: true, paymentNumber: true, status: true, paidAt: true, createdById: true, vendorId: true, requisitionId: true } });
      if (!row) return null;
      return {
        ...base(kind, id, row.paymentNumber ?? "Draft payment"),
        draft: row.status === "DRAFT" || row.status === "TO_APPROVE" || row.status === "APPROVED",
        voided: row.status === "VOIDED",
        posted: row.status === "PAID" || row.status === "VOIDED",
        date: row.paidAt,
        ownerId: row.createdById,
        partyId: row.vendorId,
        blocked: row.requisitionId ? `${row.paymentNumber ?? "This payment"} is cash from a requisition: reverse the requisition's payout instead.` : null,
        postings: [{ sourceType: "PURCHASE_PAYMENT", ids: [id] }],
      };
    }
    case "purchase-order": {
      const row = await db.retailPurchaseOrder.findFirst({
        where: { id, companyId },
        select: { id: true, poNo: true, status: true, createdAt: true, createdById: true, vendorId: true, bills: { where: { status: { not: "VOIDED" } }, select: { id: true, billNumber: true } } },
      });
      if (!row) return null;
      const received = await db.retailGoodsReceipt.findMany({ where: { companyId, purchaseOrderId: id, status: { not: "REVERSED" } }, select: { id: true, receiptNo: true } });
      return {
        ...base(kind, id, row.poNo),
        draft: row.status === "DRAFT" || row.status === "TO_APPROVE",
        voided: row.status === "CANCELLED",
        posted: !["DRAFT", "TO_APPROVE", "CANCELLED"].includes(row.status),
        date: row.createdAt,
        ownerId: row.createdById,
        partyId: row.vendorId,
        dependents: [
          ...received.map((receipt) => ({ kind: "goods-receipt" as const, id: receipt.id, label: receipt.receiptNo })),
          ...row.bills.map((bill) => ({ kind: "bill" as const, id: bill.id, label: docLabel(bill.billNumber, "bill") })),
        ],
        postings: [],
      };
    }
    case "requisition": {
      const row = await db.crmRequisition.findFirst({ where: { id, companyId }, select: { id: true, requisitionNo: true, status: true, createdAt: true, disbursedAt: true, requestedById: true, siteId: true } });
      if (!row) return null;
      const label = row.requisitionNo ?? "Draft requisition";
      return {
        ...base(kind, id, label),
        draft: !["DISBURSED", "ACQUITTED"].includes(row.status),
        voided: row.status === "CANCELLED" || row.status === "REJECTED",
        posted: row.status === "DISBURSED" || row.status === "ACQUITTED",
        date: row.disbursedAt ?? row.createdAt,
        ownerId: row.requestedById,
        blocked: row.siteId
          ? `${label} is a shop's requisition: its payout is reversed from Retail → Buying.`
          : row.status === "ACQUITTED"
            ? `${label} has been accounted for. Reopen it from its page first, then reverse its payout.`
            : null,
        postings: [
          { sourceType: "CRM_REQUISITION_DISBURSEMENT", ids: [id] },
          { sourceType: "CRM_REQUISITION_REFUND", ids: [id] },
          { sourceType: "CRM_REQUISITION_TOPUP", ids: [id] },
          { sourceType: "REQUISITION_ACQUITTAL", ids: [id] },
        ],
      };
    }
    case "claim": {
      const row = await db.expenseClaim.findFirst({ where: { id, companyId }, select: { id: true, claimNo: true, status: true, createdAt: true, approvedAt: true, claimantId: true, createdById: true } });
      if (!row) return null;
      const label = row.claimNo ?? "Draft claim";
      return {
        ...base(kind, id, label),
        draft: row.status === "DRAFT" || row.status === "SUBMITTED",
        voided: row.status === "VOIDED" || row.status === "REJECTED",
        posted: row.status === "APPROVED" || row.status === "PAID",
        date: row.approvedAt ?? row.createdAt,
        ownerId: row.createdById ?? row.claimantId,
        dependents: row.status === "PAID" ? [{ kind: "claim", id, label: `${label}'s reimbursement` }] : [],
        postings: [
          { sourceType: "EXPENSE_CLAIM", ids: [id] },
          { sourceType: "EXPENSE_CLAIM_PAYMENT", ids: [id] },
        ],
      };
    }
    case "voucher": {
      const row = await db.pettyCashVoucher.findFirst({ where: { id, companyId }, select: { id: true, voucherNo: true, kind: true, status: true, spentAt: true, createdById: true } });
      if (!row) return null;
      return {
        ...base(kind, id, row.voucherNo ?? "Draft voucher"),
        draft: row.status === "DRAFT" || row.status === "TO_APPROVE",
        voided: row.status === "VOIDED",
        posted: row.status === "POSTED" || row.status === "VOIDED",
        date: row.spentAt,
        ownerId: row.createdById,
        postings: [{ sourceType: row.kind === "TOP_UP" ? "PETTY_CASH_TOPUP" : "PETTY_CASH_VOUCHER", ids: [id] }],
      };
    }
    case "journal": {
      const row = await db.journalEntry.findFirst({ where: { id, companyId }, select: { id: true, entryNumber: true, status: true, entryDate: true, sourceType: true, createdById: true, reversedAt: true, voidedAt: true, reversalOfEntryId: true, reversalEntry: { select: { id: true } } } });
      if (!row) return null;
      const label = `JE-${row.entryNumber}`;
      return {
        ...base(kind, id, label),
        draft: row.status === "DRAFT",
        voided: Boolean(row.reversedAt || row.voidedAt || row.reversalEntry),
        posted: row.status === "POSTED",
        date: row.entryDate,
        ownerId: row.createdById,
        blocked:
          row.sourceType !== "MANUAL"
            ? `${label} was posted by a document. Undo it from that document, not here.`
            : row.reversalOfEntryId
              ? `${label} is itself a reversal. Post a new journal instead.`
              : null,
        postings: [],
      };
    }
    case "bank-entry": {
      const row = await db.journalEntry.findFirst({ where: { companyId, sourceType: "BANK_TRANSACTION", sourceId: id }, select: { id: true, entryNumber: true, entryDate: true, createdById: true, voidedAt: true, description: true } });
      if (!row) return null;
      return {
        ...base(kind, id, `Bank entry JE-${row.entryNumber}`),
        draft: false,
        voided: Boolean(row.voidedAt),
        posted: true,
        date: row.entryDate,
        ownerId: row.createdById,
        postings: [{ sourceType: "BANK_TRANSACTION", ids: [id] }],
      };
    }
    case "retail-sale": {
      const row = await db.retailSale.findFirst({ where: { id, companyId }, select: { id: true, saleNo: true, status: true, postedAt: true, createdAt: true, cashierId: true, customerId: true, fiscalReceipt: { select: FISCAL_SELECT } } });
      if (!row) return null;
      return {
        ...base(kind, id, row.saleNo),
        ...(await fiscalOf(db, companyId, row.fiscalReceipt)),
        draft: false,
        voided: row.status !== "POSTED",
        posted: true,
        date: row.postedAt ?? row.createdAt,
        ownerId: row.cashierId,
        partyId: row.customerId,
        postings: [{ sourceType: "RETAIL_SALE", ids: [id] }],
      };
    }
    case "layby": {
      const row = await db.retailLayby.findFirst({ where: { id, companyId }, select: { id: true, laybyNo: true, status: true, createdAt: true, createdById: true, customerId: true } });
      if (!row) return null;
      return { ...base(kind, id, row.laybyNo), draft: false, voided: row.status === "CANCELLED", posted: true, date: row.createdAt, ownerId: row.createdById, partyId: row.customerId, postings: [] };
    }
    case "school-fee-invoice": {
      const row = await db.schoolFeeInvoice.findFirst({ where: { id, companyId }, select: { id: true, invoiceNo: true, status: true, issueDate: true, createdById: true, studentId: true } });
      if (!row) return null;
      return { ...base(kind, id, row.invoiceNo), draft: row.status === "DRAFT", voided: row.status === "VOIDED", posted: row.status !== "DRAFT", date: row.issueDate, ownerId: row.createdById, partyId: row.studentId, postings: [] };
    }
    case "school-fee-receipt": {
      const row = await db.schoolFeeReceipt.findFirst({ where: { id, companyId }, select: { id: true, receiptNo: true, status: true, receiptDate: true, createdById: true, studentId: true, fiscalReceipt: { select: FISCAL_SELECT } } });
      if (!row) return null;
      return {
        ...base(kind, id, row.receiptNo),
        ...(await fiscalOf(db, companyId, row.fiscalReceipt)),
        draft: row.status === "DRAFT",
        voided: row.status === "VOIDED",
        posted: row.status !== "DRAFT",
        date: row.receiptDate,
        ownerId: row.createdById,
        partyId: row.studentId,
        postings: [],
      };
    }
  }
}

/** Every journal source id a document posted under: itself, its rounds and parts (`<id>:…`), and their voids. */
export function postingWhere(companyId: string, postings: Postings): Prisma.JournalEntryWhereInput {
  return {
    companyId,
    OR: postings.flatMap((posting) =>
      posting.ids.flatMap((id) => [
        { sourceType: posting.sourceType, sourceId: id },
        { sourceType: posting.sourceType, sourceId: { startsWith: `${id}:` } },
        { sourceType: posting.sourceType, sourceId: `void:${id}` },
        { sourceType: posting.sourceType, sourceId: { startsWith: `void:${id}:` } },
      ]),
    ),
  };
}

const KINDS_WITH_VAT: ReadonlySet<UndoKind> = new Set<UndoKind>(["invoice", "credit-note", "bill", "debit-note", "voucher", "claim"]);

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** Where it stands: today's month, its own month, its bank lines, the VAT return that counts it. */
export async function contextFor(companyId: string, doc: LoadedDoc, now = new Date(), db: Db = prisma): Promise<UndoContext> {
  const [today, own] = await Promise.all([holdFor(companyId, now, db), holdFor(companyId, doc.date, db)]);
  const held = (hold: Awaited<ReturnType<typeof holdFor>>) =>
    hold ? (hold.kind === "closed" ? `${hold.month} is closed` : hold.reason.replace(/, so this was not posted on its own\..*$/, "")) : null;

  let closedReconciliation: string | null = null;
  if (doc.postings.length) {
    const locked = await db.bankTransaction.findFirst({
      where: {
        companyId,
        reconciliation: { status: "CLOSED" },
        OR: doc.postings.flatMap((posting) => posting.ids.flatMap((id) => [{ sourceType: posting.sourceType, sourceId: id }, { sourceType: posting.sourceType, sourceId: { startsWith: `${id}:` } }])),
      },
      select: { bankAccount: { select: { name: true } }, reconciliation: { select: { statementEndDate: true, endDate: true } } },
    });
    if (locked) {
      const end = locked.reconciliation?.statementEndDate ?? locked.reconciliation?.endDate;
      closedReconciliation = `${locked.bankAccount.name}${end ? ` to ${dayOf(end)}` : ""}`;
    }
  }

  let vatReturn: string | null = null;
  if (KINDS_WITH_VAT.has(doc.kind) && doc.posted) {
    const counted = await db.vatReturn.findFirst({
      where: { companyId, status: { in: ["FINALIZED", "FILED"] }, periodStart: { lte: doc.date }, periodEnd: { gte: new Date(Date.UTC(doc.date.getUTCFullYear(), doc.date.getUTCMonth(), doc.date.getUTCDate())) } },
      select: { periodStart: true, periodEnd: true, status: true },
    });
    if (counted) vatReturn = `the VAT return for ${dayOf(counted.periodStart)} to ${dayOf(counted.periodEnd)}`;
  }

  return { todayHeld: held(today), monthHeld: held(own), closedReconciliation, vatReturn };
}

/** The whole document as it stands, for the audit trail's snapshot: the row with its lines. */
export async function snapshotOf(companyId: string, kind: UndoKind, id: string, db: Db = prisma): Promise<unknown> {
  switch (kind) {
    case "invoice":
      return db.salesInvoice.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "credit-note":
      return db.creditNote.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "receipt":
      return db.salesReceipt.findFirst({ where: { id, companyId } });
    case "quote":
      return db.salesQuotation.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "bill":
      return db.purchaseBill.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "debit-note":
      return db.debitNote.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "payment":
      return db.purchasePayment.findFirst({ where: { id, companyId } });
    case "purchase-order":
      return db.retailPurchaseOrder.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "requisition":
      return db.crmRequisition.findFirst({ where: { id, companyId } });
    case "claim":
      return db.expenseClaim.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "voucher":
      return db.pettyCashVoucher.findFirst({ where: { id, companyId } });
    case "journal":
      return db.journalEntry.findFirst({ where: { id, companyId }, include: { lines: true } });
    case "bank-entry":
      return db.journalEntry.findFirst({ where: { companyId, sourceType: "BANK_TRANSACTION", sourceId: id }, include: { lines: true } });
    case "retail-sale":
      return db.retailSale.findFirst({ where: { id, companyId } });
    case "layby":
      return db.retailLayby.findFirst({ where: { id, companyId } });
    case "school-fee-invoice":
      return db.schoolFeeInvoice.findFirst({ where: { id, companyId } });
    case "school-fee-receipt":
      return db.schoolFeeReceipt.findFirst({ where: { id, companyId } });
  }
}

/** One document's line for an export: number, date, status, currency and amount. */
export type ExportRow = { kind: UndoKind; number: string; date: string; status: string; party: string; currency: string; total: number; balance: number | null };

export async function exportRow(companyId: string, kind: UndoKind, id: string, db: Db = prisma): Promise<ExportRow | null> {
  switch (kind) {
    case "invoice": {
      const row = await db.salesInvoice.findFirst({ where: { id, companyId }, select: { invoiceNumber: true, invoiceDate: true, status: true, currency: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, customer: { select: { name: true } } } });
      return row
        ? { kind, number: docLabel(row.invoiceNumber), date: dayOf(row.invoiceDate), status: row.status, party: row.customer.name, currency: row.currency, total: round(row.total), balance: round(row.total - row.amountPaid - row.creditTotal - row.writeOffTotal) }
        : null;
    }
    case "bill": {
      const row = await db.purchaseBill.findFirst({ where: { id, companyId }, select: { billNumber: true, billDate: true, status: true, currency: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { name: true } } } });
      return row
        ? { kind, number: docLabel(row.billNumber, "bill"), date: dayOf(row.billDate), status: row.status, party: row.vendor.name, currency: row.currency, total: round(row.total), balance: round(row.total - row.amountPaid - row.debitNoteTotal - row.writeOffTotal) }
        : null;
    }
    case "quote": {
      const row = await db.salesQuotation.findFirst({ where: { id, companyId }, select: { quotationNumber: true, quotationDate: true, status: true, currency: true, total: true, customer: { select: { name: true } } } });
      return row ? { kind, number: row.quotationNumber, date: dayOf(row.quotationDate), status: row.status, party: row.customer.name, currency: row.currency, total: round(row.total), balance: null } : null;
    }
    case "credit-note": {
      const row = await db.creditNote.findFirst({ where: { id, companyId }, select: { noteNumber: true, noteDate: true, status: true, currency: true, total: true, invoice: { select: { customer: { select: { name: true } } } } } });
      return row ? { kind, number: docLabel(row.noteNumber, "credit note"), date: dayOf(row.noteDate), status: row.status, party: row.invoice.customer.name, currency: row.currency, total: round(row.total), balance: null } : null;
    }
    case "receipt": {
      const row = await db.salesReceipt.findFirst({ where: { id, companyId }, select: { receiptNumber: true, receivedAt: true, voidedAt: true, currency: true, amount: true, customer: { select: { name: true } } } });
      return row ? { kind, number: row.receiptNumber, date: dayOf(row.receivedAt), status: row.voidedAt ? "VOIDED" : "RECORDED", party: row.customer?.name ?? "", currency: row.currency ?? "", total: round(row.amount), balance: null } : null;
    }
    case "payment": {
      const row = await db.purchasePayment.findFirst({ where: { id, companyId }, select: { paymentNumber: true, paidAt: true, status: true, amount: true, vendor: { select: { name: true } }, bill: { select: { currency: true } } } });
      return row ? { kind, number: row.paymentNumber ?? "Draft", date: dayOf(row.paidAt), status: row.status, party: row.vendor?.name ?? "", currency: row.bill?.currency ?? "", total: round(row.amount), balance: null } : null;
    }
    default: {
      const doc = await loadDoc(companyId, kind, id, db);
      return doc ? { kind, number: doc.label, date: dayOf(doc.date), status: doc.voided ? "VOIDED" : doc.draft ? "DRAFT" : "POSTED", party: "", currency: "", total: 0, balance: null } : null;
    }
  }
}
