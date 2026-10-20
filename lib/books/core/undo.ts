import type { Prisma } from "@prisma/client";

import { recalcPurchaseBillBalance, recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { JournalReversalError, reverseJournalEntry } from "@/lib/accounting/journals";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { deleteDraftBill, voidBill } from "../bill-actions";
import { peekNumber } from "../form-options";
import { deleteInvoice } from "../delete-invoice";
import { InvoiceChangeRefused } from "../owner";
import { voidInvoice } from "../reverse-invoice";
import { voidReceipt } from "../void-receipt";
import { BankRefused, voidBankEntry } from "./bank";
import { BillRefusedError } from "./bills";
import { auditActor, canDo, type BooksAction, type BooksActor, type BooksDocKind } from "./can-do";
import { ClaimRefused, voidClaim } from "./claims";
import { erase, planErase } from "./erase";
import { nextNumber } from "./numbering";
import { PettyCashRefused, voidVoucher } from "./petty-cash";
import { cancelPurchaseOrder, PurchaseOrderRefused } from "./purchase-orders";
import { voidRequisitionDisbursement } from "./requisitions";
import { deleteUnpaidSupplierPayment, SupplierPaymentRefused, voidSupplierPayment } from "./supplier-payments";
import { contextFor, loadDoc, snapshotOf, type LoadedDoc, type Postings } from "./undo-docs";
import { deleteKeeps, deleteRefusal, MODULE_OWNED, reasonOf, REVISABLE, reviseRefusal, UNDO_NOUN, voidEffects, voidFiscalNote, voidRefusal, type UndoChoices, type UndoKind, type UndoRights } from "./undo-rules";
import { VoidRefused, voidMoney } from "./void-money";

/**
 * Undo everywhere (books-final §4.1, §2.5, §5.12; P4): Void, Revise and
 * Delete for every posted money document, through the core, with the guards
 * on the server.
 *
 * - `voidDocument`: the rules in `undo-rules.ts` first (closed month, closed
 *   reconciliation, later documents standing on it, each named), then the
 *   document's own void (which posts its mirror through `voidMoney`, or a
 *   fiscal credit note for a fiscalised invoice). The original stays, void.
 * - `reviseDocument`: Void, then a new draft linked back (`supersedesId`, D7)
 *   that takes its number at issue. Invoices, quotes, bills, credit notes.
 * - `deleteDocument`: a draft by whoever may edit it; anything posted by the
 *   owner alone, within §2.5, with its snapshot written to the audit trail
 *   in the same transaction before anything goes.
 *
 * Every one writes one `books.<document>.voided|revised|deleted` audit event
 * on the document (who, when, why, and the snapshot); its id is the
 * snapshot's reference.
 */

export class UndoRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "UndoRefused";
  }
}

type Refusal = { message: string; status?: number };
const KNOWN = [InvoiceChangeRefused, VoidRefused, BillRefusedError, SupplierPaymentRefused, ClaimRefused, PettyCashRefused, PurchaseOrderRefused, BankRefused, JournalReversalError] as const;

/** A refusal from one of the documents' own functions, in the core's terms; anything else is thrown on. */
export function asUndoRefused(error: unknown): UndoRefused | null {
  if (error instanceof UndoRefused) return error;
  for (const Known of KNOWN) {
    if (error instanceof Known) {
      const status = (error as unknown as Refusal).status;
      return new UndoRefused(error.message, status === 400 || status === 403 || status === 404 ? status : 409);
    }
  }
  return null;
}

const BOOKS_KIND: Partial<Record<UndoKind, BooksDocKind>> = {
  invoice: "invoice",
  "credit-note": "credit-note",
  receipt: "receipt",
  quote: "quotation",
  bill: "bill",
  "debit-note": "debit-note",
  payment: "payment",
  "purchase-order": "purchase-order",
  requisition: "requisition",
  claim: "claim",
  voucher: "voucher",
  journal: "journal",
  "bank-entry": "bank",
};

/** Which matrix cell (§2.2) a void, revise or draft delete of this kind needs. Quotes are Sales rights (§4.2); journals are reversed by journal rights (§4.14). */
function rightFor(kind: UndoKind, move: "void" | "revise"): BooksAction {
  if (kind === "quote") return "issue";
  if (kind === "journal") return "journal.post";
  return move;
}

function allowed(actor: BooksActor, action: BooksAction, doc: LoadedDoc) {
  const decision = canDo(actor, action, { kind: BOOKS_KIND[doc.kind], ownerId: doc.ownerId });
  if (!decision.allowed) throw new UndoRefused(decision.reason, 403);
}

async function load(actor: BooksActor, kind: UndoKind, id: string) {
  const doc = await loadDoc(actor.companyId, kind, id);
  if (!doc) throw new UndoRefused(`That ${UNDO_NOUN[kind].noun} is not here any more.`, 404);
  return doc;
}

const needReason = (reason: string | null | undefined) => {
  const text = reasonOf(reason);
  if (!text) throw new UndoRefused("Say why, in a few words. The reason is kept in the audit trail.", 400);
  return text;
};

export type UndoResult = {
  kind: UndoKind;
  id: string;
  label: string;
  /** The audit event that holds who, when, why and the snapshot. */
  auditEventId: string;
  detail?: string;
};

/** The audit event a document's own function wrote, newest first: its id is the snapshot's reference. */
async function ownEvent(companyId: string, eventType: string, entityType: string, entityId: string): Promise<string | null> {
  const row = await prisma.platformAuditEvent.findFirst({ where: { companyId, eventType, entityType, entityId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row?.id ?? null;
}

async function audit(
  db: Prisma.TransactionClient | typeof prisma,
  actor: BooksActor,
  doc: Pick<LoadedDoc, "kind" | "id" | "label">,
  verb: "voided" | "revised" | "deleted",
  reason: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  const noun = UNDO_NOUN[doc.kind];
  await writePlatformAuditEvent(
    {
      companyId: actor.companyId,
      actorId: actor.userId,
      eventType: `books.${noun.event}.${verb}`,
      entityType: noun.entity,
      entityId: doc.id,
      reason: reason ?? undefined,
      payload: { number: doc.label, by: auditActor(actor), at: new Date().toISOString(), ...payload },
    },
    db as Prisma.TransactionClient,
  );
  const row = await db.platformAuditEvent.findFirst({ where: { companyId: actor.companyId, eventType: `books.${noun.event}.${verb}`, entityId: doc.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return row!.id;
}

/* ── Void ─────────────────────────────────────────────────────────────── */

/** A posted credit or debit note's mirror, its status VOIDED, its document's balance worked out again. */
async function voidNote(actor: BooksActor, doc: LoadedDoc, reason: string) {
  const credit = doc.kind === "credit-note";
  const sourceType = credit ? "SALES_CREDIT_NOTE" : "PURCHASE_DEBIT_NOTE";
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType, sourceId: doc.id, status: "POSTED" }, select: { id: true } });
  if (posted) await voidMoney({ companyId: actor.companyId, sourceType, sourceId: doc.id, reason, actor, eventType: `books.${UNDO_NOUN[doc.kind].event}.mirrored` });
  if (credit) {
    const note = await prisma.creditNote.update({ where: { id: doc.id }, data: { status: "VOIDED" }, select: { invoiceId: true } });
    await recalcSalesInvoiceBalance(note.invoiceId);
  } else {
    const note = await prisma.debitNote.update({ where: { id: doc.id }, data: { status: "VOIDED" }, select: { billId: true } });
    await recalcPurchaseBillBalance(note.billId);
  }
}

/** Does the void the document's own way; says which audit event it wrote itself, if it did. */
async function performVoid(actor: BooksActor, doc: LoadedDoc, reason: string): Promise<{ ownAudit?: string; detail?: string }> {
  switch (doc.kind) {
    case "invoice": {
      const done = await voidInvoice(actor, doc.id, { reason, source: "books-core" });
      const note = done.creditNote;
      const fiscal = note?.fiscalised ? (note.fiscalSent ? ", signed by the fiscal device" : `; it waits in the fiscal register to be sent (${note.fiscalReason ?? "not sent"})`) : "";
      const onAccount = done.unlinked.length ? ` ${done.unlinked.map((row) => row.number).join(", ")} ${done.unlinked.length === 1 ? "stays" : "stay"} on account.` : "";
      return { ownAudit: "books.invoice.voided", detail: `${note ? `Voided through ${note.number}${fiscal}.` : "Voided; earlier credit notes had taken it all off."}${onAccount}` };
    }
    case "receipt":
      await voidReceipt(actor, doc.id, { reason, source: "books-core" });
      return { ownAudit: "books.receipt.voided" };
    case "credit-note":
    case "debit-note":
      await voidNote(actor, doc, reason);
      return {};
    case "quote":
      await prisma.salesQuotation.update({ where: { id: doc.id }, data: { status: "VOIDED" } });
      return {};
    case "bill":
      await voidBill(actor, doc.id, reason);
      return {};
    case "payment":
      await voidSupplierPayment(actor, doc.id, reason);
      return {};
    case "purchase-order":
      await cancelPurchaseOrder(actor, doc.id);
      return { detail: "Cancelled: an order never posts." };
    case "requisition": {
      const requisition = await prisma.crmRequisition.findUniqueOrThrow({ where: { id: doc.id }, select: { id: true, siteId: true, status: true } });
      if (requisition.status !== "DISBURSED") throw new UndoRefused(`${doc.label} has not been paid out, so nothing was posted.`);
      await voidRequisitionDisbursement({ companyId: actor.companyId, requisition, reason, actor });
      await prisma.crmRequisition.update({ where: { id: doc.id }, data: { status: "APPROVED", disbursedAt: null, disbursedById: null, bankAccountId: null, paidAmount: null } });
      return { detail: "Its payout is reversed; it is approved again." };
    }
    case "claim":
      await voidClaim(actor, doc.id, reason);
      return {};
    case "voucher":
      await voidVoucher(actor, doc.id, reason);
      return {};
    case "journal":
      await prisma.$transaction((tx) => reverseJournalEntry(tx, { companyId: actor.companyId, entryId: doc.id, actorId: actor.userId, actorRole: actor.role ?? null, reason }));
      return {};
    case "bank-entry":
      await voidBankEntry(actor, doc.id, reason);
      return {};
    default:
      throw new UndoRefused(MODULE_OWNED[doc.kind] ?? "This can't be voided from Books.");
  }
}

async function voidChecked(actor: BooksActor, doc: LoadedDoc, reason: string, now: Date): Promise<UndoResult> {
  const refusal = voidRefusal(doc, await contextFor(actor.companyId, doc, now));
  if (refusal) throw new UndoRefused(refusal);
  const snapshot = await snapshotOf(actor.companyId, doc.kind, doc.id);
  let done: Awaited<ReturnType<typeof performVoid>>;
  try {
    done = await performVoid(actor, doc, reason);
  } catch (error) {
    throw asUndoRefused(error) ?? error;
  }
  const noun = UNDO_NOUN[doc.kind];
  // Who voided it and why live in the audit trail, beside the snapshot of what it was.
  const auditEventId = done.ownAudit
    ? ((await ownEvent(actor.companyId, done.ownAudit, noun.entity, doc.id)) ?? (await audit(prisma, actor, doc, "voided", reason, { snapshot })))
    : await audit(prisma, actor, doc, "voided", reason, { snapshot });
  return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId, detail: done.detail };
}

/** Void one posted document (owner, or granted; quotes by Sales rights, journals by journal rights). */
export async function voidDocument(actor: BooksActor, kind: UndoKind, id: string, input: { reason: string | null | undefined }, now = new Date()): Promise<UndoResult> {
  const reason = needReason(input.reason);
  const doc = await load(actor, kind, id);
  if (!MODULE_OWNED[kind] && kind !== "purchase-order") allowed(actor, rightFor(kind, "void"), doc);
  return voidChecked(actor, doc, reason, now);
}

/* ── Revise ───────────────────────────────────────────────────────────── */

type Line = { description: string; quantity: number; unitPrice: number; taxCodeId: string | null; taxRate: number; taxAmount: number; lineTotal: number };

/** A line as written again on the new draft. */
const copyLine = (line: Line) => ({ description: line.description, quantity: line.quantity, unitPrice: line.unitPrice, taxCodeId: line.taxCodeId, taxRate: line.taxRate, taxAmount: line.taxAmount, lineTotal: line.lineTotal });

/** The new draft, a copy of the old one linked back to it, with no number until it is issued (§4.1 rules 2 and 8). */
async function draftCopy(tx: Prisma.TransactionClient, actor: BooksActor, kind: UndoKind, id: string): Promise<{ id: string; label: string }> {
  switch (kind) {
    case "invoice": {
      const old = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const copy = await tx.salesInvoice.create({
        data: {
          companyId: old.companyId,
          customerId: old.customerId,
          invoiceDate: old.invoiceDate,
          dueDate: old.dueDate,
          status: "DRAFT",
          currency: old.currency,
          subTotal: old.subTotal,
          taxTotal: old.taxTotal,
          total: old.total,
          notes: old.notes,
          quotationId: old.quotationId,
          createdById: actor.userId,
          supersedesId: old.id,
          lines: { create: old.lines.map((line) => ({ ...copyLine(line), debit: line.debit, credit: line.credit })) },
        },
        select: { id: true },
      });
      return { id: copy.id, label: "Draft invoice" };
    }
    case "quote": {
      const old = await tx.salesQuotation.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      // A quote is numbered when it is written; the revision takes the next number (§4.2).
      const quotationNumber = await nextNumber(tx, old.companyId, "quotation");
      const copy = await tx.salesQuotation.create({
        data: {
          companyId: old.companyId,
          customerId: old.customerId,
          quotationNumber,
          quotationDate: old.quotationDate,
          validUntil: old.validUntil,
          status: "DRAFT",
          currency: old.currency,
          subTotal: old.subTotal,
          taxTotal: old.taxTotal,
          total: old.total,
          notes: old.notes,
          createdById: actor.userId,
          supersedesId: old.id,
          lines: { create: old.lines.map((line) => ({ ...copyLine(line), productId: line.productId, knowledgePriceId: line.knowledgePriceId })) },
        },
        select: { id: true, quotationNumber: true },
      });
      return { id: copy.id, label: copy.quotationNumber };
    }
    case "bill": {
      const old = await tx.purchaseBill.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const copy = await tx.purchaseBill.create({
        data: {
          companyId: old.companyId,
          vendorId: old.vendorId,
          billDate: old.billDate,
          dueDate: old.dueDate,
          status: "DRAFT",
          currency: old.currency,
          subTotal: old.subTotal,
          taxTotal: old.taxTotal,
          total: old.total,
          notes: old.notes,
          purchaseOrderId: old.purchaseOrderId,
          supplierFtiNumber: old.supplierFtiNumber,
          createdById: actor.userId,
          supersedesId: old.id,
          lines: { create: old.lines.map((line) => ({ ...copyLine(line), debit: line.debit, credit: line.credit })) },
        },
        select: { id: true },
      });
      return { id: copy.id, label: "Draft bill" };
    }
    case "credit-note": {
      const old = await tx.creditNote.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const copy = await tx.creditNote.create({
        data: {
          companyId: old.companyId,
          invoiceId: old.invoiceId,
          noteDate: old.noteDate,
          status: "DRAFT",
          currency: old.currency,
          subTotal: old.subTotal,
          taxTotal: old.taxTotal,
          total: old.total,
          reason: old.reason,
          createdById: actor.userId,
          supersedesId: old.id,
          lines: { create: old.lines.map(copyLine) },
        },
        select: { id: true },
      });
      return { id: copy.id, label: "Draft credit note" };
    }
    default:
      throw new UndoRefused(`A ${UNDO_NOUN[kind].noun} is not revised: void it and make a new one.`);
  }
}

export type ReviseResult = UndoResult & { voided: UndoResult; draft: { kind: UndoKind; id: string; label: string } };

/** Revise (D7): void it, then a new draft linked back to it. The old one shows what replaced it. */
export async function reviseDocument(actor: BooksActor, kind: UndoKind, id: string, input: { reason: string | null | undefined }, now = new Date()): Promise<ReviseResult> {
  const reason = needReason(input.reason);
  const doc = await load(actor, kind, id);
  if (!REVISABLE.has(kind)) throw new UndoRefused(`A ${UNDO_NOUN[kind].noun} is not revised: void it and make a new one.`);
  allowed(actor, rightFor(kind, "revise"), doc);
  const refusal = reviseRefusal(doc, await contextFor(actor.companyId, doc, now));
  if (refusal) throw new UndoRefused(refusal);
  const voided = await voidChecked(actor, doc, reason, now);
  const result = await prisma.$transaction(async (tx) => {
    const draft = await draftCopy(tx, actor, kind, id);
    const auditEventId = await audit(tx, actor, doc, "revised", reason, { replacedBy: draft.id, voidEventId: voided.auditEventId });
    return { draft, auditEventId };
  });
  return { kind, id, label: doc.label, auditEventId: result.auditEventId, voided, draft: { kind, ...result.draft }, detail: `${doc.label} is void; the new draft replaces it.` };
}

/* ── Delete ───────────────────────────────────────────────────────────── */

const DRAFT_DELETE: Partial<Record<UndoKind, (tx: Prisma.TransactionClient, id: string) => Promise<unknown>>> = {
  "credit-note": (tx, id) => tx.creditNote.delete({ where: { id } }),
  "debit-note": (tx, id) => tx.debitNote.delete({ where: { id } }),
  quote: (tx, id) => tx.salesQuotation.delete({ where: { id } }),
  "purchase-order": (tx, id) => tx.retailPurchaseOrder.delete({ where: { id } }),
  requisition: (tx, id) => tx.crmRequisition.delete({ where: { id } }),
  claim: (tx, id) => tx.expenseClaim.delete({ where: { id } }),
  voucher: (tx, id) => tx.pettyCashVoucher.delete({ where: { id } }),
  journal: (tx, id) => tx.journalEntry.delete({ where: { id } }),
};

async function deleteDraft(actor: BooksActor, doc: LoadedDoc): Promise<UndoResult> {
  const noun = UNDO_NOUN[doc.kind];
  try {
    switch (doc.kind) {
      case "invoice":
        await deleteInvoice(actor, doc.id, {});
        return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId: (await ownEvent(actor.companyId, "books.invoice.deleted", noun.entity, doc.id)) ?? "" };
      case "bill": {
        const snapshot = await snapshotOf(actor.companyId, doc.kind, doc.id);
        await deleteDraftBill(actor, doc.id);
        return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId: await audit(prisma, actor, doc, "deleted", null, { draft: true, snapshot }) };
      }
      case "payment": {
        const snapshot = await snapshotOf(actor.companyId, doc.kind, doc.id);
        await deleteUnpaidSupplierPayment(actor, doc.id);
        return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId: await audit(prisma, actor, doc, "deleted", null, { draft: true, snapshot }) };
      }
    }
  } catch (error) {
    throw asUndoRefused(error) ?? error;
  }
  const remove = DRAFT_DELETE[doc.kind];
  if (!remove) throw new UndoRefused(MODULE_OWNED[doc.kind] ?? `A ${noun.noun} is not deleted from Books.`);
  allowed(actor, "draft.delete", doc);
  return prisma.$transaction(async (tx) => {
    const snapshot = await snapshotOf(actor.companyId, doc.kind, doc.id, tx);
    const auditEventId = await audit(tx, actor, doc, "deleted", null, { draft: true, snapshot });
    await remove(tx, doc.id);
    return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId };
  });
}

/** What else goes with a posted document: its notes and write-offs and their postings. Payments stay, on account. */
async function postedPlan(tx: Prisma.TransactionClient, doc: LoadedDoc): Promise<Postings> {
  if (doc.kind === "bill") {
    const [notes, writeOffs] = await Promise.all([
      tx.debitNote.findMany({ where: { billId: doc.id }, select: { id: true } }),
      tx.purchaseWriteOff.findMany({ where: { billId: doc.id }, select: { id: true } }),
    ]);
    return [
      ...doc.postings,
      ...(notes.length ? [{ sourceType: "PURCHASE_DEBIT_NOTE" as const, ids: notes.map((note) => note.id) }] : []),
      ...(writeOffs.length ? [{ sourceType: "PURCHASE_WRITE_OFF" as const, ids: writeOffs.map((writeOff) => writeOff.id) }] : []),
    ];
  }
  return doc.postings;
}

/** The row itself, once its postings are planned: its own way per document. Returns what to work out again after. */
async function removePosted(tx: Prisma.TransactionClient, actor: BooksActor, doc: LoadedDoc): Promise<{ invoiceId?: string | null; billId?: string | null }> {
  const { companyId } = actor;
  switch (doc.kind) {
    case "credit-note": {
      const note = await tx.creditNote.findUniqueOrThrow({ where: { id: doc.id }, select: { invoiceId: true } });
      await tx.fiscalReceipt.deleteMany({ where: { companyId, creditNoteId: doc.id } });
      await tx.creditNote.delete({ where: { id: doc.id } });
      return { invoiceId: note.invoiceId };
    }
    case "receipt": {
      const receipt = await tx.salesReceipt.findUniqueOrThrow({ where: { id: doc.id }, select: { invoiceId: true } });
      await tx.crmLeadDocument.deleteMany({ where: { companyId, receiptId: doc.id } });
      await tx.salesReceipt.delete({ where: { id: doc.id } });
      return { invoiceId: receipt.invoiceId };
    }
    case "quote":
      await tx.salesQuotation.delete({ where: { id: doc.id } });
      return {};
    case "bill": {
      // Payments are never deleted with it: they stay as the supplier's money on account (§2.5).
      const paid = await tx.purchasePayment.findMany({ where: { billId: doc.id }, select: { id: true } });
      if (paid.length) {
        await tx.purchasePayment.updateMany({ where: { billId: doc.id }, data: { billId: null } });
        await tx.paymentLedgerEntry.updateMany({ where: { companyId, sourceType: "PURCHASE_PAYMENT", sourceId: { in: paid.map((row) => row.id) } }, data: { billId: null } });
      }
      await tx.purchaseBill.updateMany({ where: { supersedesId: doc.id }, data: { supersedesId: null } });
      await tx.purchaseBill.delete({ where: { id: doc.id } });
      return {};
    }
    case "debit-note": {
      const note = await tx.debitNote.findUniqueOrThrow({ where: { id: doc.id }, select: { billId: true } });
      await tx.debitNote.delete({ where: { id: doc.id } });
      return { billId: note.billId };
    }
    case "payment": {
      const payment = await tx.purchasePayment.findUniqueOrThrow({ where: { id: doc.id }, select: { billId: true } });
      await tx.purchasePayment.delete({ where: { id: doc.id } });
      return { billId: payment.billId };
    }
    case "purchase-order":
      if (doc.dependents.some((dependent) => dependent.kind === "goods-receipt")) throw new UndoRefused(`Goods were received against ${doc.label}. Reverse the goods receipt first.`);
      await tx.retailPurchaseOrder.delete({ where: { id: doc.id } });
      return {};
    case "requisition":
      await tx.crmRequisition.delete({ where: { id: doc.id } });
      return {};
    case "claim":
      await tx.expenseClaim.delete({ where: { id: doc.id } });
      return {};
    case "voucher":
      await tx.pettyCashVoucher.delete({ where: { id: doc.id } });
      return {};
    case "journal": {
      const reversal = await tx.journalEntry.findFirst({ where: { reversalOfEntryId: doc.id }, select: { id: true } });
      if (reversal) await tx.journalEntry.delete({ where: { id: reversal.id } });
      await tx.journalEntry.delete({ where: { id: doc.id } });
      return {};
    }
    case "bank-entry":
      return {};
    default:
      throw new UndoRefused(MODULE_OWNED[doc.kind] ?? "This is not deleted from Books.");
  }
}

const isForeignKey = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2003");

/** Delete for good, as if it was never written (owner; §2.5). The snapshot goes into the audit trail first, in the same transaction. */
async function deletePosted(actor: BooksActor, doc: LoadedDoc, reason: string, now: Date): Promise<UndoResult> {
  const noun = UNDO_NOUN[doc.kind];
  allowed(actor, "delete.posted", doc);
  const refusal = deleteRefusal(doc, await contextFor(actor.companyId, doc, now));
  if (refusal) throw new UndoRefused(refusal);
  if (doc.kind === "invoice") {
    try {
      await deleteInvoice(actor, doc.id, { reason, confirm: doc.label });
    } catch (error) {
      throw asUndoRefused(error) ?? error;
    }
    return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId: (await ownEvent(actor.companyId, "books.invoice.deleted", noun.entity, doc.id)) ?? "" };
  }
  let after: { invoiceId?: string | null; billId?: string | null };
  let auditEventId: string;
  try {
    ({ after, auditEventId } = await prisma.$transaction(
      async (tx) => {
        const postings = await postedPlan(tx, doc);
        const plan = await planErase(tx, actor.companyId, postings);
        const snapshot = await snapshotOf(actor.companyId, doc.kind, doc.id, tx);
        const auditEventId = await audit(tx, actor, doc, "deleted", reason, {
          snapshot,
          journalEntries: plan.journals,
          paymentLedgerEntries: plan.ledger,
          bankTransactions: plan.bank,
          testDevice: doc.fiscalised && doc.testDevice,
        });
        const after = await removePosted(tx, actor, doc);
        await erase(tx, plan);
        return { after, auditEventId };
      },
      { timeout: 30_000 },
    ));
  } catch (error) {
    if (isForeignKey(error)) throw new UndoRefused(`Other records still point at ${doc.label}, so it was not deleted. Void it instead.`);
    throw asUndoRefused(error) ?? error;
  }
  if (after.invoiceId) await recalcSalesInvoiceBalance(after.invoiceId);
  if (after.billId) await recalcPurchaseBillBalance(after.billId);
  return { kind: doc.kind, id: doc.id, label: doc.label, auditEventId };
}

/**
 * Delete: a draft by whoever may edit it, at once; anything posted (or void)
 * permanently, by the owner, with a reason. Posted documents never change in
 * place: they are revised.
 */
export async function deleteDocument(actor: BooksActor, kind: UndoKind, id: string, input: { reason?: string | null } = {}, now = new Date()): Promise<UndoResult & { draft: boolean }> {
  const doc = await load(actor, kind, id);
  if (MODULE_OWNED[kind]) throw new UndoRefused(deleteRefusal(doc) ?? MODULE_OWNED[kind]!);
  if (!doc.posted) return { ...(await deleteDraft(actor, doc)), draft: true };
  const reason = needReason(input.reason);
  return { ...(await deletePosted(actor, doc, reason, now)), draft: false };
}

/* ── What a person may do with a list's selection ─────────────────────── */

/** Which bulk undo a list offers this person, by their role alone ("if the user role allows"); each row is checked again on the server. */
export function undoRights(actor: BooksActor, kind: UndoKind): UndoRights {
  const doc = { kind: BOOKS_KIND[kind] };
  const owned = Boolean(MODULE_OWNED[kind]);
  return {
    kind,
    void: !owned && canDo(actor, rightFor(kind, "void"), doc).allowed,
    revise: !owned && REVISABLE.has(kind) && canDo(actor, rightFor(kind, "revise"), doc).allowed,
    deletePosted: !owned && canDo(actor, "delete.posted", doc).allowed,
    deleteDrafts: !owned && canDo(actor, "draft.delete", doc).allowed,
  };
}

/* ── What a person may do with one document ──────────────────────────── */

export type { UndoChoices, UndoRights };

/** Which of Void, Revise and Delete this person may press on it, and why not; who voided it, and what replaced it. */
export async function undoChoices(actor: BooksActor, kind: UndoKind, id: string, now = new Date()): Promise<UndoChoices | null> {
  const doc = await loadDoc(actor.companyId, kind, id);
  if (!doc) return null;
  const context = await contextFor(actor.companyId, doc, now);
  const right = (action: BooksAction) => canDo(actor, action, { kind: BOOKS_KIND[kind], ownerId: doc.ownerId });
  const pair = (rights: ReturnType<typeof right>, rule: string | null) => (rights.allowed ? { allowed: rule === null, why: rule } : { allowed: false, why: rights.reason });
  const permanent = doc.posted;
  const del = MODULE_OWNED[kind] ? { allowed: false, why: deleteRefusal(doc) } : permanent ? pair(right("delete.posted"), deleteRefusal(doc, context)) : pair(right("draft.delete"), null);
  const event = doc.voided
    ? await prisma.platformAuditEvent.findFirst({ where: { companyId: actor.companyId, entityType: UNDO_NOUN[kind].entity, entityId: id, eventType: `books.${UNDO_NOUN[kind].event}.voided` }, orderBy: { createdAt: "desc" }, select: { actor: true, createdAt: true, reason: true } })
    : null;
  const voider = event?.actor ? await prisma.user.findFirst({ where: { id: event.actor }, select: { name: true } }) : null;
  const links = REVISABLE.has(kind) ? await supersession(kind, id) : { supersededBy: null, supersedes: null };
  return {
    kind,
    id,
    label: doc.label,
    status: doc.voided ? "void" : doc.draft ? "draft" : "posted",
    void: MODULE_OWNED[kind] ? { allowed: false, why: MODULE_OWNED[kind]! } : pair(right(rightFor(kind, "void")), voidRefusal(doc, context)),
    revise: REVISABLE.has(kind) ? pair(right(rightFor(kind, "revise")), reviseRefusal(doc, context)) : { allowed: false, why: `A ${UNDO_NOUN[kind].noun} is not revised.` },
    delete: { ...del, permanent },
    voided: event ? { by: voider?.name ?? null, at: event.createdAt.toISOString(), reason: event.reason } : null,
    ...links,
    fiscalised: doc.fiscalised,
    effects: voidEffects(doc, now),
    fiscalNote: voidFiscalNote(doc),
    dependents: doc.dependents.map((dependent) => dependent.label),
    onAccount: (doc.onAccount ?? []).map((row) => row.label),
    // The number the void's credit note will take, read without taking it (§4.1 rule 4).
    nextNote: kind === "invoice" && doc.posted && !doc.voided ? await peekNumber(prisma, actor.companyId, "credit-note") : null,
    keeps: deleteKeeps(doc),
  };
}

async function supersession(kind: UndoKind, id: string): Promise<{ supersededBy: string | null; supersedes: string | null }> {
  const pick = async (find: () => Promise<{ supersedesId: string | null; supersededBy: Array<{ id: string }> } | null>) => {
    const row = await find();
    return { supersedes: row?.supersedesId ?? null, supersededBy: row?.supersededBy[0]?.id ?? null };
  };
  const select = { supersedesId: true, supersededBy: { select: { id: true }, orderBy: { createdAt: "desc" as const }, take: 1 } };
  switch (kind) {
    case "invoice":
      return pick(() => prisma.salesInvoice.findUnique({ where: { id }, select }));
    case "quote":
      return pick(() => prisma.salesQuotation.findUnique({ where: { id }, select }));
    case "bill":
      return pick(() => prisma.purchaseBill.findUnique({ where: { id }, select }));
    case "credit-note":
      return pick(() => prisma.creditNote.findUnique({ where: { id }, select }));
    default:
      return { supersededBy: null, supersedes: null };
  }
}
