import { recordPurchasePayment, recordSalesReceipt } from "@/lib/accounting/payments";
import { prisma } from "@/lib/prisma";

import { DraftInvoiceRefused, issueDraftInvoice } from "../issue-invoice";
import { sendInvoiceReminders } from "../reminders";
import { canDo, type BooksActor } from "./can-do";
import { ClaimRefused, reimburseClaim } from "./claims";
import { PurchaseOrderRefused, submitPurchaseOrder } from "./purchase-orders";
import { ReceiptRefused } from "./receipt-facts";
import { payNowRefusal } from "./supplier-payments";
import { asUndoRefused, deleteDocument, UndoRefused, voidDocument } from "./undo";
import { exportRow, loadDoc, type ExportRow } from "./undo-docs";
import { BULK_LIMIT, bulkDeleteWord, reasonOf, UNDO_NOUN, type BulkAction, type BulkResult, type UndoKind } from "./undo-rules";

/**
 * Mass actions in the core (books-final §5.13): Send, Remind, Void, Delete
 * permanently, Mark paid and Export, over up to 500 rows of one kind. Each
 * row is done on its own, through the same single-row function a person's
 * button uses, with that person's rights checked for that row ("if the user
 * role allows"), so one refusal never stops the rest. The answer says, per
 * row, done, skipped with why (a rule or a right said no, or it was not
 * there), or failed (something broke).
 *
 * Void and Delete permanently take one reason for all, and Delete also wants
 * "delete <count>" typed, as the owner's dialog asks. Both are the owner's
 * or the outside accountant's; drafts in a Delete go by
 * whoever may edit them.
 */

export type BulkOptions = {
  reason?: string | null;
  /** Delete: "delete 5", typed. */
  confirm?: string | null;
  /** Mark paid: the money account the money came into, or left. */
  bankAccountId?: string | null;
  now?: Date;
};

class Skip extends Error {}

const round = (n: number) => Math.round(n * 100) / 100;

const METHOD: Record<string, string> = { CASH: "Cash", BANK: "Bank transfer", MOBILE: "Mobile money" };

async function moneyAccount(actor: BooksActor, bankAccountId: string | null | undefined) {
  const account = bankAccountId
    ? await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, kind: true, currency: true } })
    : await prisma.accountingSettings.findUnique({ where: { companyId: actor.companyId }, select: { defaultBankAccount: { select: { id: true, kind: true, currency: true } } } }).then((row) => row?.defaultBankAccount ?? null);
  return account;
}

async function sendOne(actor: BooksActor, kind: UndoKind, id: string): Promise<string | undefined> {
  switch (kind) {
    case "invoice": {
      const invoice = await prisma.salesInvoice.findFirst({ where: { id, companyId: actor.companyId }, select: { status: true, createdById: true } });
      if (!invoice) throw new UndoRefused("It is not here any more.", 404);
      if (invoice.status !== "DRAFT") throw new Skip("It was sent already: send a reminder instead.");
      const may = canDo(actor, "issue", { kind: "invoice" });
      if (!may.allowed) throw new Skip(may.reason);
      const issued = await issueDraftInvoice(actor, id);
      return `Issued as ${issued.invoiceNumber}.`;
    }
    case "quote": {
      const quote = await prisma.salesQuotation.findFirst({ where: { id, companyId: actor.companyId }, select: { status: true } });
      if (!quote) throw new UndoRefused("It is not here any more.", 404);
      if (quote.status !== "DRAFT") throw new Skip("It was sent already.");
      const may = canDo(actor, "issue", { kind: "quotation" });
      if (!may.allowed) throw new Skip(may.reason);
      await prisma.salesQuotation.update({ where: { id }, data: { status: "SENT", issuedById: actor.userId, issuedAt: new Date() } });
      return undefined;
    }
    case "purchase-order":
      await submitPurchaseOrder(actor, id);
      return undefined;
    default:
      throw new Skip(`A ${UNDO_NOUN[kind].noun} is not sent.`);
  }
}

async function remindOne(actor: BooksActor, kind: UndoKind, id: string): Promise<string | undefined> {
  if (kind !== "invoice") throw new Skip(`Reminders go for invoices only.`);
  const may = canDo(actor, "issue", { kind: "invoice" });
  if (!may.allowed) throw new Skip(may.reason);
  const outcome = await sendInvoiceReminders(prisma, { companyId: actor.companyId, invoiceIds: [id] });
  if (outcome.sent.length) return "Reminder sent on WhatsApp.";
  const why = outcome.skipped[0]?.why ?? "it did not go";
  throw new Skip(`${why.charAt(0).toUpperCase()}${why.slice(1)}.`);
}

/** Mark paid is never a status set by hand (§4.1 rule 7): it records the payment for what is owed. */
async function markPaidOne(actor: BooksActor, kind: UndoKind, id: string, options: BulkOptions): Promise<string | undefined> {
  const account = await moneyAccount(actor, options.bankAccountId);
  switch (kind) {
    case "invoice": {
      const may = canDo(actor, "issue", { kind: "receipt" });
      if (!may.allowed) throw new Skip(may.reason);
      const invoice = await prisma.salesInvoice.findFirst({ where: { id, companyId: actor.companyId }, select: { status: true, currency: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true } });
      if (!invoice) throw new UndoRefused("It is not here any more.", 404);
      if (invoice.status !== "ISSUED") throw new Skip(invoice.status === "PAID" ? "It is paid already." : invoice.status === "DRAFT" ? "It is a draft: issue it first." : "It is void.");
      const owed = round(invoice.total - invoice.amountPaid - invoice.creditTotal - invoice.writeOffTotal);
      if (owed <= 0.005) throw new Skip("Nothing is owed on it.");
      if (!account) throw new Skip("Choose the money account it came into.");
      if (account.currency.toUpperCase() !== invoice.currency.toUpperCase()) throw new Skip(`It is in ${invoice.currency}; that account holds ${account.currency}.`);
      const receipt = await recordSalesReceipt({ companyId: actor.companyId, userId: actor.userId, role: actor.role ?? null, invoiceId: id, receivedAt: options.now ?? new Date(), amount: owed, method: METHOD[account.kind] ?? "Bank transfer", bankAccountId: account.id });
      return `${receipt.receiptNumber} records ${owed.toFixed(2)}.`;
    }
    case "bill": {
      const may = canDo(actor, "pay", { kind: "bill" });
      if (!may.allowed) throw new Skip(may.reason);
      const bill = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId }, select: { status: true, currency: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true } });
      if (!bill) throw new UndoRefused("It is not here any more.", 404);
      if (bill.status !== "RECEIVED") throw new Skip(bill.status === "PAID" ? "It is paid already." : bill.status === "DRAFT" ? "It is a draft: record it first." : "It is void.");
      const owed = round(bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal);
      if (owed <= 0.005) throw new Skip("Nothing is owed on it.");
      const over = await payNowRefusal(actor, owed);
      if (over) throw new Skip(over);
      if (!account) throw new Skip("Choose the money account it is paid from.");
      if (account.currency.toUpperCase() !== bill.currency.toUpperCase()) throw new Skip(`It is in ${bill.currency}; that account holds ${account.currency}.`);
      const payment = await recordPurchasePayment({ companyId: actor.companyId, userId: actor.userId, role: actor.role ?? null, billId: id, paidAt: options.now ?? new Date(), amount: owed, method: METHOD[account.kind] ?? "Bank transfer", bankAccountId: account.id });
      return `${payment.paymentNumber ?? "A payment"} pays ${owed.toFixed(2)}.`;
    }
    case "claim": {
      if (!account) throw new Skip("Choose the money account it is paid from.");
      await reimburseClaim(actor, id, { bankAccountId: account.id });
      return "Reimbursed.";
    }
    default:
      throw new Skip(`A ${UNDO_NOUN[kind].noun} is not marked paid.`);
  }
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: ExportRow[]): string {
  const head = ["Number", "Date", "Status", "Party", "Currency", "Total", "Balance"];
  return [head, ...rows.map((row) => [row.number, row.date, row.status, row.party, row.currency, row.total.toFixed(2), row.balance === null ? "" : row.balance.toFixed(2)])].map((line) => line.map(csvCell).join(",")).join("\n");
}

/** Runs one action over the rows, each on its own. */
export async function bulkAction(actor: BooksActor, kind: UndoKind, action: BulkAction, ids: string[], options: BulkOptions = {}): Promise<BulkResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new UndoRefused("Choose at least one row.", 400);
  if (unique.length > BULK_LIMIT) throw new UndoRefused(`At most ${BULK_LIMIT} rows at a time.`, 400);
  if (action === "void" && !reasonOf(options.reason)) throw new UndoRefused("Say why, in a few words. One reason goes with every row.", 400);
  if (action === "delete") {
    const typed = (options.confirm ?? "").trim().toLowerCase();
    if (typed !== bulkDeleteWord(unique.length)) throw new UndoRefused(`Type "${bulkDeleteWord(unique.length)}" to delete them.`, 400);
  }

  const result: BulkResult = { action, kind, done: [], skipped: [], failed: [] };
  const exported: ExportRow[] = [];
  for (const id of unique) {
    const doc = await loadDoc(actor.companyId, kind, id).catch(() => null);
    const label = doc?.label ?? id;
    if (!doc) {
      result.skipped.push({ id, label, why: "Not found: it may have been deleted." });
      continue;
    }
    try {
      let detail: string | undefined;
      switch (action) {
        case "void":
          detail = (await voidDocument(actor, kind, id, { reason: options.reason }, options.now)).detail;
          break;
        case "delete": {
          const done = await deleteDocument(actor, kind, id, { reason: options.reason }, options.now);
          detail = done.draft ? "The draft is deleted." : "Deleted for good; its snapshot is in the audit trail.";
          break;
        }
        case "send":
          detail = await sendOne(actor, kind, id);
          break;
        case "remind":
          detail = await remindOne(actor, kind, id);
          break;
        case "mark-paid":
          detail = await markPaidOne(actor, kind, id, options);
          break;
        case "export": {
          const may = canDo(actor, "view", { area: kind === "bill" || kind === "payment" ? "bills" : "sales" });
          if (!may.allowed) throw new Skip(may.reason);
          const row = await exportRow(actor.companyId, kind, id);
          if (!row) throw new UndoRefused("It is not here any more.", 404);
          exported.push(row);
          break;
        }
      }
      result.done.push({ id, label, ...(detail ? { detail } : {}) });
    } catch (error) {
      if (error instanceof Skip) {
        result.skipped.push({ id, label, why: error.message });
        continue;
      }
      const refused =
        asUndoRefused(error) ??
        (error instanceof DraftInvoiceRefused || error instanceof ReceiptRefused || error instanceof PurchaseOrderRefused || error instanceof ClaimRefused ? new UndoRefused(error.message) : null);
      if (refused) result.skipped.push({ id, label, why: refused.status === 404 ? "Not found: it may have been deleted." : refused.message });
      else {
        console.error(`[Books] bulk ${action} on ${kind} ${id} failed:`, error);
        result.failed.push({ id, label, why: error instanceof Error ? error.message : "It did not work." });
      }
    }
  }
  if (action === "export") result.csv = toCsv(exported);
  return result;
}
