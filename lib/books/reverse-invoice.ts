import { createSalesCreditNote, CreditNoteRefused } from "@/lib/accounting/credit-notes";
import { docLabel } from "@/lib/books/doc-number";
import { salesInvoicePostingKey } from "@/lib/accounting/journals";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { money } from "./format";
import { canDo, type BooksActor } from "./core/can-do";
import { fiscalise } from "./core/fiscalise";
import { postMoney } from "./core/post-money";
import { markVoided } from "./core/void-money";
import { InvoiceChangeRefused, OWNER_ONLY, type InvoiceActor } from "./owner";
import { creditLines, REASON_MAX, REASON_MIN, wasFiscalised, type CreditChoice } from "./reversal";

/**
 * Reversing an issued or paid invoice from its page (Reverse), by the
 * workspace's owner only, with a reason that is kept:
 *
 * - **Void the whole invoice.** It becomes VOIDED and its posting is reversed
 *   the way Accounting → Sales always voided one: the invoice's rule posted
 *   again with every direction inverted, under `void:<id>`. The receivables
 *   sub-ledger stops counting it. Payments on it are taken off it and stay as
 *   the customer's money on account: the receipt and its posting are kept
 *   (bank up, receivable down), and its sub-ledger line keeps the customer
 *   with no invoice. That is new: the old void left the receipts pointing at
 *   the voided invoice.
 * - **Credit part of it.** A credit note through `createSalesCreditNote`,
 *   issued and posted at once, for chosen lines or an amount.
 *
 * Fiscal (P3, §4.1 rule 4, §4.17): a fiscalised invoice is never voided by a
 * bare mirror. Void raises a credit note for every line and sends it to the
 * device citing the invoice; a part credit is sent the same way. A failed
 * send waits in the fiscal register to be retried; it never undoes the note.
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
  /** A fiscalised invoice is voided through a full credit note, sent to the device (§4.1 rule 4). */
  creditNote?: { id: string; number: string; fiscalSent: boolean; fiscalReason: string | null };
  fiscalSent?: boolean;
};

/**
 * Voids an invoice: VOIDED, its posting reversed (`void:<id>`), its payments
 * left as the customer's credit. The reversal posts first, so a locked period
 * refuses the void with nothing changed; posting again finds it and goes on.
 * Refused while a credit note or a write-off stands against it: voiding
 * would reverse their part twice.
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
      revision: true,
      customerId: true,
      currency: true,
      total: true,
      subTotal: true,
      taxTotal: true,
      customer: { select: { name: true } },
      // A void payment stays with the invoice it was on; only the rest go on account.
      receipts: { where: { voidedAt: null }, select: { id: true, receiptNumber: true, amount: true } },
      creditNotes: { where: { status: "ISSUED" }, select: { noteNumber: true } },
      writeOffs: { where: { status: "POSTED" }, select: { id: true } },
      fiscalReceipt: { select: { status: true, receiptGlobalNo: true } },
    },
  });
  if (!invoice) throw new InvoiceChangeRefused("That invoice is not here any more.", 404);
  if (invoice.status === "VOIDED") throw new InvoiceChangeRefused(`${invoice.invoiceNumber} is void already.`);
  if (invoice.creditNotes.length > 0) {
    throw new InvoiceChangeRefused(`${invoice.invoiceNumber} has ${invoice.creditNotes.map((note) => note.noteNumber).join(", ")} against it. Credit the rest instead, or delete it.`);
  }
  if (invoice.writeOffs.length > 0) throw new InvoiceChangeRefused(`Part of ${invoice.invoiceNumber} is written off. Credit the rest instead, or delete it.`);
  // The fiscal device cannot take an invoice back: a fiscalised one is voided by a full credit note, fiscalised too.
  if (invoice.status !== "DRAFT" && wasFiscalised(invoice.fiscalReceipt)) return voidByCreditNote(actor, invoice, reason, input.source);

  const now = new Date();
  let reversalEntryId: string | null = null;
  if (invoice.status !== "DRAFT") {
    const posted = await prisma.journalEntry.findFirst({
      where: { companyId: actor.companyId, sourceType: "SALES_INVOICE", sourceId: salesInvoicePostingKey(invoice), status: "POSTED", reversedAt: null },
      select: { id: true },
    });
    if (posted) {
      // Through the core, so an invoice in another currency is reversed at its own frozen rate (D3, D4).
      const result = await postMoney(prisma, {
        companyId: actor.companyId,
        sourceType: "SALES_INVOICE",
        sourceId: `void:${invoice.id}`,
        date: now,
        description: `Void sales invoice ${invoice.invoiceNumber}`,
        actor: { userId: actor.userId, role: actor.role ?? null },
        periodOverrideReason: reason,
        amount: invoice.total,
        netAmount: invoice.subTotal,
        taxAmount: invoice.taxTotal,
        grossAmount: invoice.total,
        currency: invoice.currency,
        invertDirection: true,
      });
      if (!result.entryId) throw new InvoiceChangeRefused(`${invoice.invoiceNumber} was not voided: its reversal could not be posted (${result.error ?? "no journal was written"}).`);
      reversalEntryId = result.entryId;
      await markVoided(posted.id, result.entryId, actor.userId);
    }
  }

  const unlinked = invoice.receipts.map((receipt) => ({ id: receipt.id, number: receipt.receiptNumber, amount: round(receipt.amount) }));
  await prisma.$transaction(async (tx) => {
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { status: "VOIDED", amountPaid: 0 } });
    if (unlinked.length > 0) {
      await tx.salesReceipt.updateMany({ where: { companyId: actor.companyId, invoiceId: invoice.id, voidedAt: null }, data: { invoiceId: null } });
      // The customer's money on account: the receipt's line keeps the customer and loses the invoice.
      await tx.paymentLedgerEntry.updateMany({
        where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: { in: unlinked.map((receipt) => receipt.id) } },
        data: { invoiceId: null, partyId: invoice.customerId },
      });
    }
    // Aged debt reads the sub-ledger's POSTED lines: a void invoice is owed by nobody.
    await tx.paymentLedgerEntry.updateMany({
      where: { companyId: actor.companyId, sourceType: "SALES_INVOICE", invoiceId: invoice.id },
      data: { status: "VOIDED" },
    });
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
          reversalEntryId,
          // Whose money each payment is now: the Payments list reads it here when no sub-ledger line names the customer.
          receiptsOnAccount: unlinked.map((receipt) => ({ ...receipt, customerId: invoice.customerId })),
          source: input.source ?? "books",
        },
      },
      tx,
    );
  });

  return { number: docLabel(invoice.invoiceNumber), customer: invoice.customer.name, unlinked, fiscalised: wasFiscalised(invoice.fiscalReceipt) };
}

type VoidingInvoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  customerId: string;
  currency: string;
  total: number;
  customer: { name: string };
  receipts: Array<{ id: string; receiptNumber: string; amount: number }>;
  fiscalReceipt: { status: string; receiptGlobalNo: number | null } | null;
};

/**
 * Voiding a fiscalised invoice (books-final §4.1 rule 4, §4.17): a credit note
 * for every line, issued and posted now and sent to the fiscal device citing
 * the invoice; the invoice becomes VOIDED with its payments left as the
 * customer's money on account. Its own sub-ledger line stays: the credit
 * note's line takes it off.
 */
async function voidByCreditNote(actor: InvoiceActor | BooksActor, invoice: VoidingInvoice, reason: string, source?: string): Promise<VoidResult> {
  const number = docLabel(invoice.invoiceNumber);
  const lines = await prisma.salesInvoiceLine.findMany({
    where: { invoiceId: invoice.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, description: true, quantity: true, unitPrice: true, taxRate: true, taxCodeId: true },
  });
  const built = creditLines(number, lines, { lines: lines.map((line) => ({ lineId: line.id, quantity: line.quantity })) });
  if ("error" in built) throw new InvoiceChangeRefused(built.error, 400);
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
  const fiscal = await fiscalise(actor.companyId, { kind: "credit-note", creditNoteId: note.id }, actor.userId).catch((error: unknown) => ({
    sent: false,
    reason: error instanceof Error ? error.message : "The fiscal device could not be reached",
  }));

  const unlinked = invoice.receipts.map((receipt) => ({ id: receipt.id, number: receipt.receiptNumber, amount: round(receipt.amount) }));
  await prisma.$transaction(async (tx) => {
    await tx.salesInvoice.update({ where: { id: invoice.id }, data: { status: "VOIDED", amountPaid: 0 } });
    if (unlinked.length > 0) {
      await tx.salesReceipt.updateMany({ where: { companyId: actor.companyId, invoiceId: invoice.id, voidedAt: null }, data: { invoiceId: null } });
      await tx.paymentLedgerEntry.updateMany({
        where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: { in: unlinked.map((receipt) => receipt.id) } },
        data: { invoiceId: null, partyId: invoice.customerId },
      });
    }
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
          creditNoteId: note.id,
          creditNote: note.noteNumber,
          fiscal: { sent: fiscal.sent, reason: fiscal.reason ?? null },
          receiptsOnAccount: unlinked.map((receipt) => ({ ...receipt, customerId: invoice.customerId })),
          source: source ?? "books",
        },
      },
      tx,
    );
  });
  return {
    number,
    customer: invoice.customer.name,
    unlinked,
    fiscalised: true,
    fiscalSent: fiscal.sent,
    creditNote: { id: note.id, number: docLabel(note.noteNumber, "credit note"), fiscalSent: fiscal.sent, fiscalReason: fiscal.reason ?? null },
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
