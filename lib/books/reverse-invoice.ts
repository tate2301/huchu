import { createSalesCreditNote, CreditNoteRefused } from "@/lib/accounting/credit-notes";
import { docLabel } from "@/lib/books/doc-number";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { approvedCommissionOn, mirrorVoidedCommission } from "./core/commission";
import { money } from "./format";
import { canDo, type BooksActor } from "./core/can-do";
import { fiscalise } from "./core/fiscalise";
import { InvoiceChangeRefused, OWNER_ONLY, type InvoiceActor } from "./owner";
import { creditLines, REASON_MAX, REASON_MIN, wasFiscalised, type CreditChoice } from "./reversal";

/**
 * Reversing an issued or paid invoice from its page (Reverse), by the
 * workspace's owner or the outside accountant, with a reason
 * that is kept:
 *
 * - **Void the whole invoice** (books-final §4.1 rule 4, §4.3): never a bare
 *   mirror any more. A full credit note is issued and posted for what is left
 *   on it (all of it, less credit notes and write-offs already against it),
 *   and sent to the fiscal device citing it when the invoice was fiscalised.
 *   Payments on it are taken off it and stay as the customer's money on
 *   account: the receipt and its posting are kept (bank up, receivable down),
 *   and its sub-ledger line keeps the customer with no invoice. Commission
 *   not yet paid on it is voided (an approved one's posting mirrored). Books'
 *   invoice lines carry no product, so issuing one moves no stock and there
 *   is none to bring back. Invoices voided before this with a `void:<id>`
 *   mirror keep those entries; the VAT return reads both.
 * - **Credit part of it.** A credit note through `createSalesCreditNote`,
 *   issued and posted at once, for chosen lines or an amount.
 *
 * A failed fiscal send waits in the fiscal register to be retried; it never
 * undoes the note.
 */

function reasonOf(reason: string | null | undefined): string {
  const text = (reason ?? "").trim();
  if (text.length < REASON_MIN) throw new InvoiceChangeRefused("Say why, in a few words. The reason is kept with the invoice.", 400);
  return text.slice(0, REASON_MAX);
}

const round = (n: number) => Math.round(n * 100) / 100;

export type VoidResult = {
  number: string;
  customer: string;
  unlinked: Array<{ id: string; number: string; amount: number }>;
  fiscalised: boolean;
  /** The full credit note the void issued (§4.1 rule 4); none when earlier notes and write-offs had taken it all off. */
  creditNote?: { id: string; number: string; total: number; fiscalised: boolean; fiscalSent: boolean; fiscalReason: string | null };
  fiscalSent?: boolean;
  /** Commission not yet paid on it, voided with it. */
  commissionVoided: number;
};

/**
 * Voids an invoice (see the header). A draft has nothing posted and simply
 * becomes VOIDED. Anything issued is voided through a full credit note,
 * issued and posted now, whatever stands on it: its payments go on account,
 * earlier credit notes and write-offs keep their part and the note takes off
 * the rest.
 */
export async function voidInvoice(actor: InvoiceActor | BooksActor, invoiceId: string, input: { reason: string; source?: string }): Promise<VoidResult> {
  if (!canDo(actor, "void", { kind: "invoice" }).allowed) throw new InvoiceChangeRefused(OWNER_ONLY, 403);
  const reason = reasonOf(input.reason);
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, companyId: actor.companyId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      customerId: true,
      currency: true,
      total: true,
      customer: { select: { name: true } },
      // A void payment stays with the invoice it was on; only the rest go on account.
      receipts: { where: { voidedAt: null }, select: { id: true, receiptNumber: true, amount: true } },
      creditNotes: { where: { status: "ISSUED" }, select: { total: true } },
      writeOffs: { where: { status: "POSTED" }, select: { amount: true } },
      fiscalReceipt: { select: { status: true, receiptGlobalNo: true } },
    },
  });
  if (!invoice) throw new InvoiceChangeRefused("That invoice is not here any more.", 404);
  if (invoice.status === "VOIDED") throw new InvoiceChangeRefused(`${docLabel(invoice.invoiceNumber)} is void already.`);
  const number = docLabel(invoice.invoiceNumber);
  const fiscalised = invoice.status !== "DRAFT" && wasFiscalised(invoice.fiscalReceipt);

  // The credit note first: a closed month or a refused note stops the void with nothing else changed.
  let creditNote: VoidResult["creditNote"];
  if (invoice.status !== "DRAFT") {
    const credited = round(invoice.creditNotes.reduce((sum, note) => sum + note.total, 0) + invoice.writeOffs.reduce((sum, row) => sum + row.amount, 0));
    const left = round(invoice.total - credited);
    if (left > 0.005) creditNote = await fullCreditNote(actor, { id: invoice.id, number, currency: invoice.currency, fiscalised, whole: credited <= 0.005, left }, reason);
  }

  const unlinked = invoice.receipts.map((receipt) => ({ id: receipt.id, number: receipt.receiptNumber, amount: round(receipt.amount) }));
  // Approved commission on it posted its expense (D19): mirrored once the invoice is void.
  const approved = await approvedCommissionOn(actor.companyId, { invoiceId: invoice.id });
  const commissionVoided = await prisma.$transaction(async (tx) => {
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { status: "VOIDED", amountPaid: 0 } });
    if (unlinked.length > 0) {
      await tx.salesReceipt.updateMany({ where: { companyId: actor.companyId, invoiceId: invoice.id, voidedAt: null }, data: { invoiceId: null } });
      // The customer's money on account: the receipt's line keeps the customer and loses the invoice.
      await tx.paymentLedgerEntry.updateMany({
        where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: { in: unlinked.map((receipt) => receipt.id) } },
        data: { invoiceId: null, partyId: invoice.customerId },
      });
    }
    // Commission not yet paid on it goes with it (§4.3).
    const docs = await tx.crmLeadDocument.findMany({ where: { companyId: actor.companyId, invoiceId: invoice.id }, select: { id: true } });
    const voided = docs.length
      ? await tx.crmCommissionEntry.updateMany({
          where: { companyId: actor.companyId, leadDocumentId: { in: docs.map((doc) => doc.id) }, status: { in: ["PENDING", "APPROVED"] } },
          data: { status: "VOIDED", voidedAt: new Date(), voidedById: actor.userId },
        })
      : { count: 0 };
    await writePlatformAuditEvent(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        eventType: "books.invoice.voided",
        entityType: "SalesInvoice",
        entityId: invoice.id,
        reason,
        payload: {
          number: invoice.invoiceNumber,
          was: invoice.status,
          total: invoice.total,
          currency: invoice.currency,
          creditNoteId: creditNote?.id ?? null,
          creditNote: creditNote?.number ?? null,
          fiscal: creditNote?.fiscalised ? { sent: creditNote.fiscalSent, reason: creditNote.fiscalReason } : null,
          // Whose money each payment is now: the Payments list reads it here when no sub-ledger line names the customer.
          receiptsOnAccount: unlinked.map((receipt) => ({ ...receipt, customerId: invoice.customerId })),
          commissionVoided: voided.count,
          source: input.source ?? "books",
        },
      },
      tx,
    );
    return voided.count;
  });
  if (approved.length) await mirrorVoidedCommission(actor as BooksActor, approved, `Invoice ${number} voided`).catch((error: unknown) => console.error("[Books] commission mirror failed:", error));

  return { number, customer: invoice.customer.name, unlinked, fiscalised, creditNote, fiscalSent: creditNote?.fiscalSent, commissionVoided };
}

/**
 * The void's credit note (books-final §4.1 rule 4): every line again when
 * nothing was credited before, else the amount left, issued and posted now,
 * and sent to the fiscal device citing the invoice when it was fiscalised.
 */
async function fullCreditNote(
  actor: InvoiceActor | BooksActor,
  invoice: { id: string; number: string; currency: string; fiscalised: boolean; whole: boolean; left: number },
  reason: string,
): Promise<NonNullable<VoidResult["creditNote"]>> {
  const lines = await prisma.salesInvoiceLine.findMany({
    where: { invoiceId: invoice.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, description: true, quantity: true, unitPrice: true, taxRate: true, taxCodeId: true },
  });
  const built = invoice.whole
    ? creditLines(invoice.number, lines, { lines: lines.map((line) => ({ lineId: line.id, quantity: line.quantity })) })
    : creditLines(invoice.number, lines, { amount: invoice.left });
  if ("error" in built) throw new InvoiceChangeRefused(invoice.whole ? built.error : `${built.error} Then void it.`, 409);
  let note;
  try {
    note = await createSalesCreditNote(
      { companyId: actor.companyId, userId: actor.userId },
      { invoiceId: invoice.id, noteDate: new Date().toISOString(), currency: invoice.currency, reason, issueNow: true, lines: built.lines },
    );
  } catch (error) {
    if (error instanceof CreditNoteRefused) throw new InvoiceChangeRefused(error.message, 400);
    throw error;
  }
  const fiscal = invoice.fiscalised
    ? await fiscalise(actor.companyId, { kind: "credit-note", creditNoteId: note.id }, actor.userId).catch((error: unknown) => ({
        sent: false,
        reason: error instanceof Error ? error.message : "The fiscal device could not be reached",
      }))
    : null;
  return {
    id: note.id,
    number: docLabel(note.noteNumber, "credit note"),
    total: round(note.total),
    fiscalised: invoice.fiscalised,
    fiscalSent: fiscal?.sent ?? false,
    fiscalReason: fiscal ? (fiscal.reason ?? null) : null,
  };
}

export type CreditResult = { number: string; note: string; total: number; currency: string; fiscalised: boolean; fiscalSent?: boolean };

/** Credits part of an issued or paid invoice with a credit note, issued and posted now. */
export async function creditInvoice(actor: InvoiceActor | BooksActor, invoiceId: string, input: { reason: string; choice: CreditChoice }): Promise<CreditResult> {
  if (!canDo(actor, "void", { kind: "invoice" }).allowed) throw new InvoiceChangeRefused(OWNER_ONLY, 403);
  const reason = reasonOf(input.reason);
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, companyId: actor.companyId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      total: true,
      creditTotal: true,
      writeOffTotal: true,
      lines: { orderBy: { createdAt: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, taxRate: true, taxCodeId: true } },
      fiscalReceipt: { select: { status: true, receiptGlobalNo: true } },
    },
  });
  if (!invoice) throw new InvoiceChangeRefused("That invoice is not here any more.", 404);
  if (invoice.status !== "ISSUED" && invoice.status !== "PAID") {
    throw new InvoiceChangeRefused(invoice.status === "DRAFT" ? `${invoice.invoiceNumber} is a draft: change it or delete it instead.` : `${invoice.invoiceNumber} is void.`);
  }
  const built = creditLines(docLabel(invoice.invoiceNumber), invoice.lines, input.choice);
  if ("error" in built) throw new InvoiceChangeRefused(built.error, 400);
  const left = round(invoice.total - invoice.creditTotal - invoice.writeOffTotal);
  if (built.total > left + 0.005) {
    throw new InvoiceChangeRefused(`${money(built.total, invoice.currency)} is more than is left to credit on ${invoice.invoiceNumber} (${money(left, invoice.currency)}).`, 400);
  }

  let note;
  try {
    note = await createSalesCreditNote(
      { companyId: actor.companyId, userId: actor.userId },
      { invoiceId: invoice.id, noteDate: new Date().toISOString(), currency: invoice.currency, reason, issueNow: true, lines: built.lines },
    );
  } catch (error) {
    if (error instanceof CreditNoteRefused) throw new InvoiceChangeRefused(error.message, 400);
    throw error;
  }
  // A credit note on a fiscalised invoice goes to the device too, citing it (§4.17).
  const fiscalised = wasFiscalised(invoice.fiscalReceipt);
  const fiscal = fiscalised
    ? await fiscalise(actor.companyId, { kind: "credit-note", creditNoteId: note.id }, actor.userId).catch((error: unknown) => ({ sent: false, reason: error instanceof Error ? error.message : "The fiscal device could not be reached" }))
    : null;
  await writePlatformAuditEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    eventType: "books.invoice.credited",
    entityType: "SalesInvoice",
    entityId: invoice.id,
    reason,
    payload: { number: invoice.invoiceNumber, creditNoteId: note.id, creditNote: note.noteNumber, total: note.total, currency: note.currency, lines: built.lines },
  });
  return { number: docLabel(invoice.invoiceNumber), note: docLabel(note.noteNumber, "credit note"), total: round(note.total), currency: note.currency, fiscalised, fiscalSent: fiscal?.sent ?? false };
}
