import { z } from "zod";

import { recalcPurchaseBillBalance } from "@/lib/accounting/balances";
import { prisma } from "@/lib/prisma";

import { approvalNote, approvedByOwner, decideApproval, decidePayment, moneyLimits, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, tierOf, type BooksActor } from "./can-do";
import { nextNumber } from "./numbering";
import { supplierPaymentFacts } from "./payment-posting";
import { postMoney } from "./post-money";
import { voidMoney } from "./void-money";

/**
 * A payment to a supplier (D5, books-final §4.10): Draft → Send for approval
 * → To approve (over the payments limit) or Approved → Pay → Paid → Void.
 *
 * - A draft carries no number; paying gives the next PAY- in the series.
 * - Over `paymentOwnerOver`, it waits for the owner; under it, sending it is
 *   its approval. The maker never approves their own.
 * - Paying posts `PURCHASE_PAYMENT` (Dr payables, Cr the money account) with
 *   its bank transaction and payables line; the approver does not pay where
 *   somebody else may.
 * - Void mirrors the posting, marks the payables line VOIDED, takes the bank
 *   side off and puts the bill's balance back.
 *
 * Retail's supplier money and Books' "Pay a supplier" form write payments
 * already Paid (the default), and keep doing so.
 */

export class SupplierPaymentRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "SupplierPaymentRefused";
  }
}

export const draftPaymentSchema = z.object({
  vendorId: z.string().uuid(),
  billId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid(),
  amount: z.number().positive(),
  /** When it is to be paid. */
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().min(1).max(100).optional(),
  reference: z.string().trim().max(200).optional(),
});

export type DraftPaymentInput = z.infer<typeof draftPaymentSchema>;

const METHOD: Record<string, string> = { CASH: "Cash", MOBILE: "Mobile money", BANK: "Bank transfer" };
const name = (payment: { paymentNumber: string | null }) => payment.paymentNumber ?? "This payment";

async function read(companyId: string, id: string) {
  const payment = await prisma.purchasePayment.findFirst({ where: { id, companyId }, include: { bill: { select: { id: true, currency: true, billNumber: true, vendorId: true } } } });
  if (!payment) throw new SupplierPaymentRefused("Payment not found", 404);
  return payment;
}

/** A draft payment: who, which bill, from which account, how much. Nothing moves. */
export async function draftSupplierPayment(actor: BooksActor, input: DraftPaymentInput) {
  const allowed = canDo(actor, "draft.create", { kind: "payment" });
  if (!allowed.allowed) throw new SupplierPaymentRefused(allowed.reason, 403);
  const vendor = await prisma.vendor.findFirst({ where: { id: input.vendorId, companyId: actor.companyId }, select: { id: true } });
  if (!vendor) throw new SupplierPaymentRefused("That supplier is not here any more.", 404);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true, kind: true } });
  if (!account) throw new SupplierPaymentRefused("That money account is not here any more.", 404);
  if (input.billId) {
    const bill = await prisma.purchaseBill.findFirst({ where: { id: input.billId, companyId: actor.companyId, vendorId: vendor.id, status: "RECEIVED" }, select: { total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, billNumber: true } });
    if (!bill) throw new SupplierPaymentRefused("That bill is not this supplier's open bill.", 400);
    const owing = bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal;
    if (input.amount > owing + 0.005) throw new SupplierPaymentRefused(`${bill.billNumber ?? "The bill"} owes less than that.`, 400);
  }
  return prisma.purchasePayment.create({
    data: {
      companyId: actor.companyId,
      vendorId: vendor.id,
      billId: input.billId ?? null,
      paymentNumber: null,
      status: "DRAFT",
      paidAt: new Date(`${input.paidAt}T00:00:00.000Z`),
      amount: input.amount,
      method: input.method ?? METHOD[account.kind] ?? "Bank transfer",
      reference: input.reference || null,
      bankAccountId: account.id,
      createdById: actor.userId,
    },
  });
}

/** Send for approval: over the limit it waits for the owner, with the limit as it is now; under it, it is approved. */
export async function submitSupplierPayment(actor: BooksActor, id: string, at = new Date()) {
  const payment = await read(actor.companyId, id);
  if (payment.status !== "DRAFT") throw new SupplierPaymentRefused(`${name(payment)} is not a draft.`);
  const limits = await moneyLimits(actor.companyId);
  const over = payment.amount > limits.paymentOwnerOver + 0.004 && tierOf(actor) !== "owner";
  const to = over ? "TO_APPROVE" : "APPROVED";
  return prisma.$transaction(async (tx) => {
    const moved = await tx.purchasePayment.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: to, submittedAt: at, approvalLimit: limits.paymentOwnerOver, approverId: over ? (limits.ownerApprover?.id ?? null) : null },
    });
    if (moved.count === 0) throw new SupplierPaymentRefused(`${name(payment)} has changed. Open it again.`);
    await recordApproval(tx, { companyId: actor.companyId, kind: "payment", entityId: id, action: "SUBMIT", from: "DRAFT", to, actedById: actor.userId });
    return tx.purchasePayment.findUniqueOrThrow({ where: { id } });
  });
}

/** Approve (Approved) or reject (back to a draft): never the maker's own, and over the limit only the owner. */
export async function decideSupplierPayment(actor: BooksActor, id: string, input: { approve: boolean; note?: string | null }, at = new Date()) {
  const payment = await read(actor.companyId, id);
  if (payment.status !== "TO_APPROVE") throw new SupplierPaymentRefused(`${name(payment)} is not waiting for approval.`);
  const limits = await moneyLimits(actor.companyId);
  const decision = decideApproval(
    actor,
    { kind: "payment", requestedById: payment.createdById, amount: payment.amount, limit: payment.approvalLimit != null ? Number(payment.approvalLimit) : limits.paymentOwnerOver, currency: payment.bill?.currency },
    {
      othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { except: [payment.createdById] }),
      otherOwners: await otherOwners(prisma, actor.companyId, [payment.createdById]),
      ownerName: limits.ownerApprover?.name ?? null,
    },
  );
  if (!decision.allowed) throw new SupplierPaymentRefused(decision.reason, 403);
  const to = input.approve ? "APPROVED" : "DRAFT";
  return prisma.$transaction(async (tx) => {
    const moved = await tx.purchasePayment.updateMany({
      where: { id, status: "TO_APPROVE" },
      data: input.approve ? { status: "APPROVED", approvedById: actor.userId, approvedAt: at } : { status: "DRAFT", submittedAt: null },
    });
    if (moved.count === 0) throw new SupplierPaymentRefused(`${name(payment)} has changed. Open it again.`);
    await recordApproval(tx, { companyId: actor.companyId, kind: "payment", entityId: id, action: input.approve ? "APPROVE" : "REJECT", from: "TO_APPROVE", to, actedById: actor.userId, note: approvalNote(decision, input.note) });
    return tx.purchasePayment.findUniqueOrThrow({ where: { id } });
  });
}

/**
 * Pay it: numbered, posted out of its money account with the bank side and
 * the payables line, the bill's balance worked out again.
 */
export async function paySupplierPayment(actor: BooksActor, id: string, at = new Date()) {
  const payment = await read(actor.companyId, id);
  if (payment.status !== "APPROVED") throw new SupplierPaymentRefused(payment.status === "PAID" ? `${name(payment)} has been paid.` : `${name(payment)} has not been approved.`);
  const limits = await moneyLimits(actor.companyId);
  const decision = decidePayment(
    actor,
    {
      kind: "payment",
      // A supplier payment is nobody's own request: the maker may pay one somebody else approved.
      requestedById: null,
      approvedById: payment.approvedById,
      ownerApproved: await approvedByOwner(prisma, actor.companyId, payment.approvedById),
      amount: payment.amount,
      limit: limits.paymentOwnerOver,
      currency: payment.bill?.currency,
    },
    { othersWhoCanPay: await othersWhoCan(prisma, actor.companyId, { except: [actor.userId] }) },
  );
  if (!decision.allowed) throw new SupplierPaymentRefused(decision.reason, 403);
  // Tax withheld and the rate frozen as it is paid (D3, D17).
  const facts = await supplierPaymentFacts(actor.companyId, { id, vendorId: payment.vendorId, billId: payment.billId, bankAccountId: payment.bankAccountId, amount: payment.amount, paidAt: at });
  const paid = await prisma.$transaction(async (tx) => {
    const paymentNumber = await nextNumber(tx, actor.companyId, "payment");
    const moved = await tx.purchasePayment.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paymentNumber, paidById: actor.userId, paidAt: at, ...facts.data } });
    if (moved.count === 0) throw new SupplierPaymentRefused(`${name(payment)} has changed. Open it again.`);
    const note = approvalNote(decision);
    if (note) await recordApproval(tx, { companyId: actor.companyId, kind: "payment", entityId: id, action: "ADJUST", from: "APPROVED", to: "PAID", actedById: actor.userId, note });
    const row = await tx.purchasePayment.findUniqueOrThrow({ where: { id } });
    const posting = await postMoney(tx, {
      companyId: actor.companyId,
      sourceType: "PURCHASE_PAYMENT",
      sourceId: row.id,
      date: row.paidAt,
      description: `Purchase payment ${paymentNumber}`,
      amount: row.amount,
      ...facts.posting,
      money: row.bankAccountId ? { bankAccountId: row.bankAccountId, direction: "OUT", reference: row.reference ?? paymentNumber, amount: facts.cash } : undefined,
      actor: { userId: actor.userId, role: actor.role ?? null },
    });
    if (posting.error) console.error(`[Books] Supplier payment ${paymentNumber} waits to post: ${posting.error}`);
    return row;
  });
  if (paid.billId) await recalcPurchaseBillBalance(paid.billId);
  return paid;
}

/** Void a paid payment (the owner, or someone the owner let): its mirror, its line VOIDED, the bank side off, the bill owing again. */
export async function voidSupplierPayment(actor: BooksActor, id: string, reason: string, at = new Date()) {
  const payment = await read(actor.companyId, id);
  if (payment.status !== "PAID") throw new SupplierPaymentRefused(payment.status === "VOIDED" ? `${name(payment)} is void already.` : `${name(payment)} has not been paid: withdraw or delete it instead.`);
  const allowed = canDo(actor, "void", { kind: "payment" });
  if (!allowed.allowed) throw new SupplierPaymentRefused(allowed.reason, 403);
  if (payment.requisitionId) throw new SupplierPaymentRefused(`${name(payment)} is cash from a requisition: reverse the requisition's payout instead.`);
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "PURCHASE_PAYMENT", sourceId: id, status: "POSTED" }, select: { id: true } });
  if (posted) await voidMoney({ companyId: actor.companyId, sourceType: "PURCHASE_PAYMENT", sourceId: id, reason, actor, eventType: "books.payment-made.voided" });
  const voided = await prisma.purchasePayment.update({ where: { id }, data: { status: "VOIDED", voidedAt: at, voidedById: actor.userId, voidReason: reason } });
  if (voided.billId) await recalcPurchaseBillBalance(voided.billId);
  return voided;
}

/** A draft, or one waiting or approved and not yet paid, goes back to nothing: delete it. Its maker, or someone who may approve. */
export async function deleteUnpaidSupplierPayment(actor: BooksActor, id: string) {
  const payment = await read(actor.companyId, id);
  if (payment.status === "PAID" || payment.status === "VOIDED") throw new SupplierPaymentRefused(`${name(payment)} has been paid: void it instead.`);
  if (payment.createdById !== actor.userId && !canDo(actor, "approve", { kind: "payment" }).allowed) throw new SupplierPaymentRefused("Only whoever made it, or someone who approves payments, can delete it.", 403);
  await prisma.purchasePayment.delete({ where: { id } });
  return { deleted: id };
}

/**
 * Paying at once, without a draft (Books' "Pay a supplier", Accounting's
 * payments): only at or under the payments limit, or by the owner. Over it a
 * payment is a draft sent for approval (books-final §2.4). Null when it may.
 */
export async function payNowRefusal(actor: BooksActor, amount: number): Promise<string | null> {
  if (tierOf(actor) === "owner") return null;
  const limits = await moneyLimits(actor.companyId);
  if (amount <= limits.paymentOwnerOver + 0.004) return null;
  return `Over ${limits.paymentOwnerOver.toFixed(2)} a payment waits for ${limits.ownerApprover?.name ?? "the owner"}: save it as a draft and send it for approval.`;
}
