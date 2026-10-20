import { Prisma } from "@prisma/client";
import { z } from "zod";

import { REQUISITION_CATEGORIES } from "@/lib/crm/requisitions";
import { prisma } from "@/lib/prisma";

import { approvalNote, decideApproval, moneyLimits, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, tierOf, type BooksActor } from "./can-do";
import { nextNumber } from "./numbering";
import { moneyLedgerAccount, postMoney } from "./post-money";
import { voidMoney } from "./void-money";

/**
 * Petty cash (D13, books-final §4.12, §5.4). A float is a cash money account
 * with an imprest (say US$200) held by one person. A voucher spends from it:
 * under `voucherHolderUnder` the holder's word posts it, over it the holder's
 * manager approves first (never the one who wrote it). Posted: Dr the
 * category's expense (input VAT where the slip's FTI is valid), Cr the float.
 * A top-up brings the float back to its imprest: the amount spent since the
 * last one, from a bank account into the float.
 */

export class PettyCashRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "PettyCashRefused";
  }
}

export const floatSchema = z.object({ bankAccountId: z.string().uuid(), holderId: z.string().uuid(), imprestAmount: z.number().positive() });

export const voucherSchema = z.object({
  floatId: z.string().uuid(),
  category: z.enum(REQUISITION_CATEGORIES).default("OTHER"),
  description: z.string().trim().min(1).max(300),
  amount: z.number().positive(),
  taxAmount: z.number().min(0).default(0),
  ftiNumber: z.string().trim().max(60).nullable().optional(),
  fdmsStatus: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).default("NOT_CHECKED"),
  spentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().uuid().nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
});

export type VoucherInput = z.infer<typeof voucherSchema>;

/** Make a cash account a float: who holds it and what it is topped up to. The owner's or the accountant's (setup). */
export async function setUpFloat(actor: BooksActor, input: z.infer<typeof floatSchema>) {
  const allowed = canDo(actor, "setup");
  if (!allowed.allowed) throw new PettyCashRefused(allowed.reason, 403);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId }, select: { id: true, kind: true } });
  if (!account) throw new PettyCashRefused("That money account is not here any more.", 404);
  if (account.kind !== "CASH") throw new PettyCashRefused("A float is cash: choose a cash account.", 400);
  const holder = await prisma.user.findFirst({ where: { id: input.holderId, companyId: actor.companyId, isActive: true }, select: { id: true } });
  if (!holder) throw new PettyCashRefused("Choose who holds the float.", 400);
  return prisma.bankAccount.update({ where: { id: account.id }, data: { isFloat: true, holderId: holder.id, imprestAmount: input.imprestAmount } });
}

async function readFloat(companyId: string, id: string) {
  const float = await prisma.bankAccount.findFirst({ where: { id, companyId, isFloat: true }, select: { id: true, name: true, currency: true, holderId: true, imprestAmount: true, ledgerAccountId: true } });
  if (!float) throw new PettyCashRefused("That float is not here any more.", 404);
  return float;
}

/** A voucher for money spent from the float: posted at once under the holder's limit, else waiting for approval. */
export async function writeVoucher(actor: BooksActor, input: VoucherInput, at = new Date()) {
  const float = await readFloat(actor.companyId, input.floatId);
  const holds = float.holderId === actor.userId;
  if (!holds && !canDo(actor, "draft.create", { kind: "voucher" }).allowed) throw new PettyCashRefused("Only the float's holder, or someone who keeps the books, writes its vouchers.", 403);
  const limits = await moneyLimits(actor.companyId);
  const project = input.projectId ? await prisma.crmProject.findFirst({ where: { id: input.projectId, companyId: actor.companyId }, select: { costCenterId: true } }) : null;
  const postNow = holds && input.amount < limits.voucherHolderUnder - 0.004;
  const voucher = await prisma.pettyCashVoucher.create({
    data: {
      companyId: actor.companyId,
      kind: "SPEND",
      status: "TO_APPROVE",
      bankAccountId: float.id,
      category: input.category,
      description: input.description,
      amount: input.amount,
      taxAmount: input.taxAmount,
      ftiNumber: input.ftiNumber ?? null,
      fdmsStatus: input.fdmsStatus,
      projectId: input.projectId ?? null,
      costCenterId: project?.costCenterId ?? null,
      receiptUrl: input.receiptUrl ?? null,
      spentAt: new Date(`${input.spentAt}T00:00:00.000Z`),
      createdById: actor.userId,
    },
  });
  if (!postNow) {
    await recordApproval(prisma, { companyId: actor.companyId, kind: "voucher", entityId: voucher.id, action: "SUBMIT", from: "DRAFT", to: "TO_APPROVE", actedById: actor.userId });
    return voucher;
  }
  return postVoucher(actor, voucher.id, at);
}

/** The holder's manager approves a voucher over the holder's limit (never the one who wrote it), and it posts. */
export async function approveVoucher(actor: BooksActor, id: string, input: { approve: boolean; note?: string | null }, at = new Date()) {
  const voucher = await prisma.pettyCashVoucher.findFirst({ where: { id, companyId: actor.companyId } });
  if (!voucher) throw new PettyCashRefused("Voucher not found", 404);
  if (voucher.status !== "TO_APPROVE") throw new PettyCashRefused("This voucher is not waiting for approval.");
  const decision = decideApproval(
    actor,
    { kind: "voucher", requestedById: voucher.createdById, amount: Number(voucher.amount), limit: null },
    { othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { except: [voucher.createdById] }), otherOwners: await otherOwners(prisma, actor.companyId, [voucher.createdById]) },
  );
  if (!decision.allowed) throw new PettyCashRefused(decision.reason, 403);
  await recordApproval(prisma, { companyId: actor.companyId, kind: "voucher", entityId: id, action: input.approve ? "APPROVE" : "REJECT", from: "TO_APPROVE", to: input.approve ? "POSTED" : "DRAFT", actedById: actor.userId, note: approvalNote(decision, input.note) });
  if (!input.approve) return prisma.pettyCashVoucher.update({ where: { id }, data: { status: "DRAFT" } });
  await prisma.pettyCashVoucher.update({ where: { id }, data: { approvedById: actor.userId, approvedAt: at } });
  return postVoucher(actor, id, at);
}

/** Posted: numbered PCV-, Dr the expense (VAT where valid), Cr the float, with the float's bank side. */
async function postVoucher(actor: BooksActor, id: string, at: Date) {
  const voucher = await prisma.$transaction(async (tx) => {
    const voucherNo = await nextNumber(tx, actor.companyId, "voucher");
    return tx.pettyCashVoucher.update({ where: { id }, data: { status: "POSTED", voucherNo, postedAt: at } });
  });
  const tax = voucher.fdmsStatus === "VALID" ? voucher.taxAmount : new Prisma.Decimal(0);
  const float = await prisma.bankAccount.findUniqueOrThrow({ where: { id: voucher.bankAccountId }, select: { currency: true } });
  await postMoney(prisma, {
    companyId: voucher.companyId,
    sourceType: "PETTY_CASH_VOUCHER",
    sourceId: voucher.id,
    sourceSubtype: voucher.expenseAccountId ? "ACCOUNT" : voucher.category,
    date: voucher.spentAt,
    description: `${voucher.voucherNo}: ${voucher.description}`,
    amount: voucher.amount,
    netAmount: voucher.amount.minus(tax),
    taxAmount: tax,
    grossAmount: voucher.amount,
    currency: float.currency,
    costCenterId: voucher.costCenterId,
    accounts: voucher.expenseAccountId ? { expenseAccount: voucher.expenseAccountId } : undefined,
    money: { bankAccountId: voucher.bankAccountId, direction: "OUT", reference: voucher.voucherNo },
    actor: { userId: actor.userId, role: actor.role ?? null },
  });
  return voucher;
}

/** Void a posted voucher (owner or granted): its mirror; the float is that much fuller. */
export async function voidVoucher(actor: BooksActor, id: string, reason: string, at = new Date()) {
  const voucher = await prisma.pettyCashVoucher.findFirst({ where: { id, companyId: actor.companyId } });
  if (!voucher) throw new PettyCashRefused("Voucher not found", 404);
  if (voucher.status !== "POSTED") throw new PettyCashRefused("Only a posted voucher is voided; delete a draft instead.");
  const allowed = canDo(actor, "void", { kind: "voucher" });
  if (!allowed.allowed) throw new PettyCashRefused(allowed.reason, 403);
  const sourceType = voucher.kind === "TOP_UP" ? "PETTY_CASH_TOPUP" : "PETTY_CASH_VOUCHER";
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType, sourceId: id, status: "POSTED" }, select: { id: true } });
  if (posted) await voidMoney({ companyId: actor.companyId, sourceType, sourceId: id, reason, actor, eventType: "books.voucher.voided" });
  if (voucher.kind === "TOP_UP") await prisma.bankTransaction.deleteMany({ where: { companyId: actor.companyId, sourceType, sourceId: `${id}:float`, reconciliationId: null, reconciledAt: null } });
  return prisma.pettyCashVoucher.update({ where: { id }, data: { status: "VOIDED", voidedAt: at, voidedById: actor.userId, voidReason: reason } });
}

/** What the float has spent since its last top-up: what a top-up brings back. */
export async function spentSinceTopUp(companyId: string, floatId: string): Promise<{ since: Date | null; spent: number; vouchers: number }> {
  const last = await prisma.pettyCashVoucher.findFirst({ where: { companyId, bankAccountId: floatId, kind: "TOP_UP", status: "POSTED" }, orderBy: { postedAt: "desc" }, select: { postedAt: true } });
  const spent = await prisma.pettyCashVoucher.aggregate({
    where: { companyId, bankAccountId: floatId, kind: "SPEND", status: "POSTED", ...(last?.postedAt ? { postedAt: { gt: last.postedAt } } : {}) },
    _sum: { amount: true },
    _count: true,
  });
  return { since: last?.postedAt ?? null, spent: Math.round(Number(spent._sum.amount ?? 0) * 100) / 100, vouchers: spent._count };
}

/**
 * Top up: a transfer from a bank account into the float for what it spent
 * since the last top-up, so it is back at its imprest. Dr the float, Cr the
 * bank, a bank row on each side. Someone who may pay; not the holder alone
 * unless nobody else may.
 */
export async function topUpFloat(actor: BooksActor, input: { floatId: string; fromBankAccountId: string }, at = new Date()) {
  const float = await readFloat(actor.companyId, input.floatId);
  const from = await prisma.bankAccount.findFirst({ where: { id: input.fromBankAccountId, companyId: actor.companyId, isActive: true, isFloat: false }, select: { id: true, name: true, currency: true } });
  if (!from) throw new PettyCashRefused("Choose the account the money comes from.", 400);
  if (from.currency !== float.currency) throw new PettyCashRefused(`${from.name} holds ${from.currency}; the float holds ${float.currency}.`, 400);
  const allowed = canDo(actor, "pay", { kind: "voucher" });
  if (!allowed.allowed) throw new PettyCashRefused(allowed.reason, 403);
  if (float.holderId === actor.userId && tierOf(actor) !== "owner") throw new PettyCashRefused("Somebody else tops up the float you hold.", 403);
  const { spent } = await spentSinceTopUp(actor.companyId, float.id);
  if (spent <= 0) throw new PettyCashRefused("Nothing has been spent from the float since its last top-up.", 409);
  const floatLedger = await moneyLedgerAccount(actor.companyId, float.id);
  const voucher = await prisma.$transaction(async (tx) => {
    const voucherNo = await nextNumber(tx, actor.companyId, "voucher");
    return tx.pettyCashVoucher.create({
      data: {
        companyId: actor.companyId,
        voucherNo,
        kind: "TOP_UP",
        status: "POSTED",
        bankAccountId: float.id,
        fromBankAccountId: from.id,
        description: `Top-up of ${float.name} to its imprest`,
        amount: spent,
        spentAt: at,
        createdById: actor.userId,
        approvedById: actor.userId,
        approvedAt: at,
        postedAt: at,
      },
    });
  });
  await postMoney(prisma, {
    companyId: actor.companyId,
    sourceType: "PETTY_CASH_TOPUP",
    sourceId: voucher.id,
    date: at,
    description: `${voucher.voucherNo}: ${voucher.description}`,
    amount: spent,
    currency: float.currency,
    accounts: { floatAccount: floatLedger },
    money: { bankAccountId: from.id, direction: "OUT", reference: voucher.voucherNo },
    actor: { userId: actor.userId, role: actor.role ?? null },
  });
  // The float's side of the transfer: money in.
  await prisma.bankTransaction.create({
    data: { companyId: actor.companyId, bankAccountId: float.id, txnDate: at, description: voucher.description, reference: voucher.voucherNo, amount: spent, direction: "CREDIT", sourceType: "PETTY_CASH_TOPUP", sourceId: `${voucher.id}:float` },
  });
  await recordApproval(prisma, { companyId: actor.companyId, kind: "voucher", entityId: voucher.id, action: "APPROVE", from: "DRAFT", to: "POSTED", actedById: actor.userId, note: "Top-up to the imprest." });
  return voucher;
}
