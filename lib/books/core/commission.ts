import type { CrmCommissionEntryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { approvalNote, decideApproval, decidePayment, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, type BooksActor } from "./can-do";
import { postMoney } from "./post-money";
import { voidMoney } from "./void-money";

/**
 * Commission (D19, books-final §5.3): Pending → Approved → Paid, or Void.
 *
 * - **Approve**: someone who manages commission, never the rep who earned it.
 *   Posts Dr 5650 Commission expense, Cr 2195 Commission payable, on the
 *   deal's project cost centre where there is one.
 * - **Pay**: someone who may pay, not the earner (and not the approver where
 *   somebody else may). Dr 2195, Cr the money account. Without a money
 *   account it is paid through the next pay run, which clears 2195 itself.
 * - **Void**: a pending one simply; an approved one mirrors its posting. A
 *   paid one is refused: pay it back as a deduction or a receipt.
 * There is no reopen and no jump from any status to any other.
 */

export class CommissionRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "CommissionRefused";
  }
}

const MOVES: Record<CrmCommissionEntryStatus, readonly CrmCommissionEntryStatus[]> = {
  PENDING: ["APPROVED", "VOIDED"],
  APPROVED: ["PAID", "VOIDED"],
  PAID: [],
  VOIDED: [],
};

export function canMoveCommission(from: CrmCommissionEntryStatus, to: CrmCommissionEntryStatus): boolean {
  return MOVES[from].includes(to);
}

const WORDS: Record<CrmCommissionEntryStatus, string> = { PENDING: "pending", APPROVED: "approved", PAID: "paid", VOIDED: "void" };

function assertMove(from: CrmCommissionEntryStatus, to: CrmCommissionEntryStatus) {
  if (canMoveCommission(from, to)) return;
  if (from === "PAID" && to === "VOIDED") throw new CommissionRefused("This commission has been paid, so it is not voided: take it back as a deduction or a receipt.");
  throw new CommissionRefused(`This commission is ${WORDS[from]}, so it cannot be made ${WORDS[to]}.`);
}

async function read(companyId: string, id: string) {
  const entry = await prisma.crmCommissionEntry.findFirst({ where: { id, companyId }, include: { rep: { select: { name: true } }, lead: { select: { convertedDealId: true } } } });
  if (!entry) throw new CommissionRefused("Commission entry not found", 404);
  return entry;
}

async function costCentreOf(companyId: string, dealId: string | null | undefined) {
  if (!dealId) return null;
  const project = await prisma.crmProject.findFirst({ where: { companyId, dealId }, select: { costCenterId: true } });
  return project?.costCenterId ?? null;
}

/** Approve: posted to the commission expense and owed to the rep. `mayManage`: the CRM's `commissions.manage`. */
export async function approveCommission(actor: BooksActor, id: string, input: { mayManage: boolean; note?: string | null }, at = new Date()) {
  const entry = await read(actor.companyId, id);
  assertMove(entry.status, "APPROVED");
  const decision = decideApproval(
    actor,
    { kind: "commission", module: "crm", requestedById: entry.repId, amount: entry.amount, limit: null },
    { othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { module: "crm", except: [entry.repId] }), otherOwners: await otherOwners(prisma, actor.companyId, [entry.repId]), roleAllowed: input.mayManage },
  );
  if (!decision.allowed) throw new CommissionRefused(decision.reason === "Somebody else has to approve your own request." ? "Somebody else approves your own commission." : decision.reason, 403);
  await prisma.$transaction(async (tx) => {
    const moved = await tx.crmCommissionEntry.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: at, notes: input.note ?? undefined } });
    if (moved.count === 0) throw new CommissionRefused("This commission has changed. Open it again.");
    await recordApproval(tx, { companyId: actor.companyId, kind: "commission", entityId: id, action: "APPROVE", from: "PENDING", to: "APPROVED", actedById: actor.userId, note: approvalNote(decision, input.note) });
  });
  const posting = entry.amount > 0
    ? await postMoney(prisma, {
        companyId: actor.companyId,
        sourceType: "CRM_COMMISSION",
        sourceId: id,
        date: at,
        description: `Commission, ${entry.rep.name}, ${entry.periodKey}`,
        amount: entry.amount,
        currency: entry.currency,
        costCenterId: await costCentreOf(actor.companyId, entry.lead?.convertedDealId),
        actor: { userId: actor.userId, role: actor.role ?? null },
        payload: { repId: entry.repId, periodKey: entry.periodKey },
      })
    : null;
  return prisma.crmCommissionEntry.update({ where: { id }, data: { journalEntryId: posting?.entryId ?? null } });
}

/** Pay: 2195 cleared out of a money account. Not by the rep; not the approver where somebody else may pay. */
export async function payCommission(actor: BooksActor, id: string, input: { bankAccountId?: string | null; mayManage: boolean }, at = new Date()) {
  const entry = await read(actor.companyId, id);
  assertMove(entry.status, "PAID");
  const decision = decidePayment(
    actor,
    { kind: "commission", module: "crm", requestedById: entry.repId, approvedById: entry.approvedById, amount: entry.amount, limit: null },
    { othersWhoCanPay: await othersWhoCan(prisma, actor.companyId, { module: "crm", except: [actor.userId, entry.repId] }), roleAllowed: input.mayManage || canDo(actor, "pay", { kind: "commission", module: "crm" }).allowed },
  );
  if (!decision.allowed) throw new CommissionRefused(decision.reason, 403);
  if (input.bankAccountId) {
    const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true } });
    if (!account) throw new CommissionRefused("That money account is not here any more.", 404);
  }
  await prisma.$transaction(async (tx) => {
    const moved = await tx.crmCommissionEntry.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidAt: at, paidById: actor.userId, paidBankAccountId: input.bankAccountId ?? null } });
    if (moved.count === 0) throw new CommissionRefused("This commission has changed. Open it again.");
    const note = approvalNote(decision);
    if (note) await recordApproval(tx, { companyId: actor.companyId, kind: "commission", entityId: id, action: "ADJUST", from: "APPROVED", to: "PAID", actedById: actor.userId, note });
  });
  // Paid through the pay run when no money account is named: payroll clears 2195 itself.
  if (input.bankAccountId && entry.amount > 0) {
    await postMoney(prisma, {
      companyId: actor.companyId,
      sourceType: "CRM_COMMISSION_PAYMENT",
      sourceId: id,
      date: at,
      description: `Commission paid, ${entry.rep.name}, ${entry.periodKey}`,
      amount: entry.amount,
      currency: entry.currency,
      money: { bankAccountId: input.bankAccountId, direction: "OUT", reference: entry.periodKey },
      actor: { userId: actor.userId, role: actor.role ?? null },
    });
  }
  return prisma.crmCommissionEntry.findUniqueOrThrow({ where: { id } });
}

/** Void: a pending one simply, an approved one with the mirror of its posting. A paid one is refused. */
export async function voidCommission(actor: BooksActor, id: string, input: { mayManage: boolean; reason: string }, at = new Date()) {
  const entry = await read(actor.companyId, id);
  assertMove(entry.status, "VOIDED");
  if (!input.mayManage) throw new CommissionRefused("Only someone who manages commission can void it.", 403);
  if (entry.status === "APPROVED") await mirrorCommissionPosting(actor, id, input.reason);
  return prisma.crmCommissionEntry.update({ where: { id }, data: { status: "VOIDED", voidedAt: at, voidedById: actor.userId, notes: input.reason } });
}

async function mirrorCommissionPosting(actor: BooksActor, id: string, reason: string) {
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "CRM_COMMISSION", sourceId: id, status: "POSTED", voidedAt: null }, select: { id: true } });
  if (posted) await voidMoney({ companyId: actor.companyId, sourceType: "CRM_COMMISSION", sourceId: id, reason, actor, eventType: "books.commission.voided" });
  else await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: actor.companyId, sourceType: "CRM_COMMISSION", sourceId: id, status: { in: ["PENDING", "FAILED"] } } });
}

/** Approved commission on these CRM documents, before they are voided with their invoice or receipt. */
export async function approvedCommissionOn(companyId: string, where: { invoiceId?: string; receiptId?: string }) {
  const rows = await prisma.crmCommissionEntry.findMany({ where: { companyId, status: "APPROVED", leadDocument: where }, select: { id: true } });
  return rows.map((row) => row.id);
}

/**
 * Commission voided with its invoice or receipt (`delete-invoice`,
 * `void-receipt` mark it VOIDED in their own transaction): the approval
 * posting of each is mirrored afterwards.
 */
export async function mirrorVoidedCommission(actor: BooksActor, ids: string[], reason: string) {
  for (const id of ids) await mirrorCommissionPosting(actor, id, reason);
}
