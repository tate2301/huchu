import { Prisma } from "@prisma/client";
import { z } from "zod";

import { REQUISITION_CATEGORIES } from "@/lib/crm/requisitions";
import { prisma } from "@/lib/prisma";

import { approvalNote, approvedByOwner, decideApproval, decidePayment, moneyLimits, otherOwners, othersWhoCan, recordApproval } from "./approvals";
import { canDo, type BooksActor } from "./can-do";
import { numberAtIssue } from "./numbering";
import { postMoney, type PostMoneyResult } from "./post-money";
import { groupSpend } from "./requisitions";
import { voidMoney } from "./void-money";

/**
 * An expense claim (D13, books-final §4.12): what someone spent from their own
 * pocket, paid back. Draft → Submitted (numbered CLM-, with the limit) →
 * Approved (not the claimant; over the limit the owner) or Rejected → Paid
 * (reimbursed, not by the claimant). Approving posts each category's expense,
 * input VAT where the slip's FTI is valid, against 2190 Staff claims payable;
 * reimbursing pays 2190 out of a money account.
 *
 * The CRM cost tracker's spends with no requisition become a claim's lines
 * when the day is submitted (`claimFromDailyLog`), a draft flagged for the
 * claimant to check. A line already posted on its own before claims began
 * (`alreadyPostedEntryId`) is not expensed again: approving moves what it owes
 * from 2000 to 2190.
 */

export class ClaimRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "ClaimRefused";
  }
}

export const claimSchema = z.object({
  currency: z.string().trim().min(3).max(3).default("USD"),
  notes: z.string().trim().max(1000).nullable().optional(),
  lines: z
    .array(
      z.object({
        category: z.enum(REQUISITION_CATEGORIES).default("OTHER"),
        description: z.string().trim().min(1).max(300),
        spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        amount: z.number().positive(),
        taxAmount: z.number().min(0).default(0),
        ftiNumber: z.string().trim().max(60).nullable().optional(),
        fdmsStatus: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).default("NOT_CHECKED"),
        projectId: z.string().uuid().nullable().optional(),
        receiptUrl: z.string().url().nullable().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type ClaimInput = z.infer<typeof claimSchema>;

const label = (claim: { claimNo: string | null }) => claim.claimNo ?? "This claim";

async function read(companyId: string, id: string) {
  const claim = await prisma.expenseClaim.findFirst({ where: { id, companyId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!claim) throw new ClaimRefused("Claim not found", 404);
  return claim;
}

async function costCentres(companyId: string, projectIds: Array<string | null | undefined>) {
  const ids = [...new Set(projectIds.filter((id): id is string => Boolean(id)))];
  const projects = ids.length ? await prisma.crmProject.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, costCenterId: true } }) : [];
  return new Map(projects.map((project) => [project.id, project.costCenterId]));
}

/** A draft claim, for the person making it. */
export async function createClaim(actor: BooksActor, input: ClaimInput) {
  const centres = await costCentres(actor.companyId, input.lines.map((line) => line.projectId));
  const total = input.lines.reduce((sum, line) => sum + line.amount, 0);
  return prisma.expenseClaim.create({
    data: {
      companyId: actor.companyId,
      status: "DRAFT",
      claimantId: actor.userId,
      currency: input.currency.toUpperCase(),
      total: Math.round(total * 100) / 100,
      notes: input.notes ?? null,
      createdById: actor.userId,
      lines: {
        create: input.lines.map((line, index) => ({
          companyId: actor.companyId,
          category: line.category,
          description: line.description,
          spentOn: line.spentOn ? new Date(`${line.spentOn}T00:00:00.000Z`) : null,
          amount: line.amount,
          taxAmount: line.taxAmount,
          ftiNumber: line.ftiNumber ?? null,
          fdmsStatus: line.fdmsStatus,
          projectId: line.projectId ?? null,
          costCenterId: line.projectId ? (centres.get(line.projectId) ?? null) : null,
          receiptUrl: line.receiptUrl ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * A cost-tracker day submitted: its spends with no requisition become a draft
 * claim, flagged for the claimant to check, once per day. In the day's
 * transaction.
 */
export async function claimFromDailyLog(tx: Prisma.TransactionClient, companyId: string, logId: string) {
  const existing = await tx.expenseClaim.findUnique({ where: { dailyLogId: logId }, select: { id: true } });
  if (existing) return existing;
  const log = await tx.crmDailyLog.findFirst({
    where: { id: logId, companyId },
    select: {
      id: true,
      userId: true,
      logDate: true,
      entries: {
        where: { direction: "SPENT", requisitionId: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, category: true, description: true, amount: true, currency: true, projectId: true, receiptUrl: true, project: { select: { costCenterId: true } } },
      },
    },
  });
  if (!log || log.entries.length === 0) return null;
  const total = log.entries.reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
  return tx.expenseClaim.create({
    data: {
      companyId,
      status: "DRAFT",
      claimantId: log.userId,
      currency: log.entries[0]!.currency,
      total,
      notes: `Spent from their own pocket on ${log.logDate.toISOString().slice(0, 10)}, from the cost tracker.`,
      dailyLogId: log.id,
      needsReview: true,
      reviewNote: "From the cost tracker: check the lines and receipts, then send it for approval.",
      createdById: log.userId,
      lines: {
        create: log.entries.map((entry, index) => ({
          companyId,
          category: entry.category,
          description: entry.description,
          spentOn: log.logDate,
          amount: entry.amount,
          projectId: entry.projectId,
          costCenterId: entry.project?.costCenterId ?? null,
          receiptUrl: entry.receiptUrl,
          costEntryId: entry.id,
          sortOrder: index,
        })),
      },
    },
    select: { id: true },
  });
}

/** Submit: numbered CLM-, with the owner limit as it is now. The claimant's, or a manager for them. */
export async function submitClaim(actor: BooksActor, id: string, at = new Date()) {
  const claim = await read(actor.companyId, id);
  if (claim.status !== "DRAFT") throw new ClaimRefused(`${label(claim)} is not a draft.`);
  if (claim.claimantId !== actor.userId && !canDo(actor, "draft.edit", { kind: "claim", ownerId: claim.claimantId }).allowed) throw new ClaimRefused("Only the claimant can send it for approval.", 403);
  if (claim.lines.length === 0) throw new ClaimRefused("Add what was spent first.", 400);
  const limits = await moneyLimits(actor.companyId);
  return prisma.$transaction(async (tx) => {
    const claimNo = await numberAtIssue(tx, actor.companyId, "claim", claim.claimNo);
    const over = Number(claim.total) > limits.requisitionOwnerOver + 0.004;
    const moved = await tx.expenseClaim.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "SUBMITTED", claimNo, submittedAt: at, approvalLimit: limits.requisitionOwnerOver, approverId: over ? (limits.ownerApprover?.id ?? null) : null, needsReview: false },
    });
    if (moved.count === 0) throw new ClaimRefused(`${label(claim)} has changed. Open it again.`);
    await recordApproval(tx, { companyId: actor.companyId, kind: "claim", entityId: id, action: "SUBMIT", from: "DRAFT", to: "SUBMITTED", actedById: actor.userId });
    return tx.expenseClaim.findUniqueOrThrow({ where: { id } });
  });
}

/** The claim's lines as postings: one per category (or account), and one for lines posted before claims began. */
function claimGroups(lines: Awaited<ReturnType<typeof read>>["lines"]) {
  const fresh = lines.filter((line) => !line.alreadyPostedEntryId);
  const already = lines.filter((line) => line.alreadyPostedEntryId);
  const groups = groupSpend(
    fresh.map((line) => ({
      category: line.category,
      amount: line.amount,
      taxAmount: line.fdmsStatus === "VALID" ? line.taxAmount : 0,
      expenseAccountId: line.expenseAccountId,
      costCenterId: line.costCenterId,
    })),
  );
  const reclass = already.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
  return { groups, reclass };
}

/** Approve (posted against 2190) or reject: never the claimant's own; over the limit only the owner. */
export async function decideClaim(actor: BooksActor, id: string, input: { approve: boolean; note?: string | null }, at = new Date()) {
  const claim = await read(actor.companyId, id);
  if (claim.status !== "SUBMITTED") throw new ClaimRefused(`${label(claim)} is not waiting for approval.`);
  const limits = await moneyLimits(actor.companyId);
  const decision = decideApproval(
    actor,
    { kind: "claim", requestedById: claim.claimantId, amount: Number(claim.total), limit: claim.approvalLimit != null ? Number(claim.approvalLimit) : limits.requisitionOwnerOver, currency: claim.currency },
    {
      othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { except: [claim.claimantId] }),
      otherOwners: await otherOwners(prisma, actor.companyId, [claim.claimantId]),
      ownerName: limits.ownerApprover?.name ?? null,
    },
  );
  if (!decision.allowed) throw new ClaimRefused(decision.reason, 403);
  if (!input.approve && !input.note?.trim()) throw new ClaimRefused("Say why it is not approved.", 400);
  const to = input.approve ? "APPROVED" : "REJECTED";
  const decided = await prisma.$transaction(async (tx) => {
    const moved = await tx.expenseClaim.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: to, approvedById: actor.userId, approvedAt: at, decisionNote: input.note ?? null } });
    if (moved.count === 0) throw new ClaimRefused(`${label(claim)} has changed. Open it again.`);
    await recordApproval(tx, { companyId: actor.companyId, kind: "claim", entityId: id, action: input.approve ? "APPROVE" : "REJECT", from: "SUBMITTED", to, actedById: actor.userId, note: approvalNote(decision, input.note) });
    return tx.expenseClaim.findUniqueOrThrow({ where: { id } });
  });
  if (!input.approve) return { claim: decided, postings: [] as PostMoneyResult[] };
  const postings = await postClaim(claim, at, { userId: actor.userId, role: actor.role ?? null });
  return { claim: decided, postings };
}

async function postClaim(claim: Awaited<ReturnType<typeof read>>, at: Date, actor: { userId: string; role?: string | null }) {
  const { groups, reclass } = claimGroups(claim.lines);
  const results: PostMoneyResult[] = [];
  for (const group of groups) {
    results.push(
      await postMoney(prisma, {
        companyId: claim.companyId,
        sourceType: "EXPENSE_CLAIM",
        sourceId: `${claim.id}:${group.key}`,
        sourceSubtype: group.subtype,
        date: at,
        description: `${claim.claimNo ?? "Claim"}: ${group.subtype.toLowerCase()}`,
        amount: group.amount,
        netAmount: group.amount.minus(group.taxAmount),
        taxAmount: group.taxAmount,
        grossAmount: group.amount,
        currency: claim.currency,
        costCenterId: group.costCenterId,
        accounts: group.expenseAccountId ? { expenseAccount: group.expenseAccountId } : undefined,
        actor,
        payload: { claimNo: claim.claimNo, claimantId: claim.claimantId },
      }),
    );
  }
  if (reclass.greaterThan(0)) {
    results.push(
      await postMoney(prisma, {
        companyId: claim.companyId,
        sourceType: "EXPENSE_CLAIM",
        sourceId: `${claim.id}:reclass`,
        sourceSubtype: "RECLASS",
        date: at,
        description: `${claim.claimNo ?? "Claim"}: spends posted before claims, now owed to the claimant`,
        amount: reclass,
        currency: claim.currency,
        actor,
        payload: { claimNo: claim.claimNo },
      }),
    );
  }
  return results;
}

/** Reimburse: 2190 paid out of a money account, with the bank side. Not by the claimant; not the approver where someone else may. */
export async function reimburseClaim(actor: BooksActor, id: string, input: { bankAccountId: string }, at = new Date()) {
  const claim = await read(actor.companyId, id);
  if (claim.status !== "APPROVED") throw new ClaimRefused(claim.status === "PAID" ? `${label(claim)} has been paid.` : `${label(claim)} has not been approved.`);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId, isActive: true }, select: { id: true } });
  if (!account) throw new ClaimRefused("That money account is not here any more.", 404);
  const limits = await moneyLimits(actor.companyId);
  const decision = decidePayment(
    actor,
    {
      kind: "claim",
      requestedById: claim.claimantId,
      approvedById: claim.approvedById,
      ownerApproved: await approvedByOwner(prisma, actor.companyId, claim.approvedById),
      amount: Number(claim.total),
      limit: claim.approvalLimit != null ? Number(claim.approvalLimit) : limits.requisitionOwnerOver,
      currency: claim.currency,
    },
    { othersWhoCanPay: await othersWhoCan(prisma, actor.companyId, { except: [actor.userId, claim.claimantId] }) },
  );
  if (!decision.allowed) throw new ClaimRefused(decision.reason, 403);
  const paid = await prisma.$transaction(async (tx) => {
    const moved = await tx.expenseClaim.updateMany({ where: { id, status: "APPROVED" }, data: { status: "PAID", paidById: actor.userId, paidAt: at, bankAccountId: account.id } });
    if (moved.count === 0) throw new ClaimRefused(`${label(claim)} has changed. Open it again.`);
    const note = approvalNote(decision);
    if (note) await recordApproval(tx, { companyId: actor.companyId, kind: "claim", entityId: id, action: "ADJUST", from: "APPROVED", to: "PAID", actedById: actor.userId, note });
    return tx.expenseClaim.findUniqueOrThrow({ where: { id } });
  });
  const posting = await postMoney(prisma, {
    companyId: actor.companyId,
    sourceType: "EXPENSE_CLAIM_PAYMENT",
    sourceId: `${id}${await roundOf(actor.companyId, "EXPENSE_CLAIM_PAYMENT", id)}`,
    date: at,
    description: `${claim.claimNo ?? "Claim"} reimbursed`,
    amount: claim.total,
    currency: claim.currency,
    money: { bankAccountId: account.id, direction: "OUT", reference: claim.claimNo },
    actor: { userId: actor.userId, role: actor.role ?? null },
    payload: { claimNo: claim.claimNo, claimantId: claim.claimantId },
  });
  return { claim: paid, posting };
}

async function roundOf(companyId: string, sourceType: "EXPENSE_CLAIM_PAYMENT", id: string) {
  const voided = await prisma.journalEntry.count({ where: { companyId, sourceType, OR: [{ sourceId: id }, { sourceId: { startsWith: `${id}:r` } }], voidedAt: { not: null } } });
  return voided === 0 ? "" : `:r${voided + 1}`;
}

/** Void a reimbursement (owner or granted): its mirror; the claim is approved and owed again. */
export async function voidClaimReimbursement(actor: BooksActor, id: string, reason: string) {
  const claim = await read(actor.companyId, id);
  if (claim.status !== "PAID") throw new ClaimRefused(`${label(claim)} has not been paid.`);
  const allowed = canDo(actor, "void", { kind: "claim" });
  if (!allowed.allowed) throw new ClaimRefused(allowed.reason, 403);
  const posted = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "EXPENSE_CLAIM_PAYMENT", OR: [{ sourceId: id }, { sourceId: { startsWith: `${id}:r` } }], voidedAt: null, reversalOfEntryId: null }, select: { sourceId: true } });
  if (posted?.sourceId) await voidMoney({ companyId: actor.companyId, sourceType: "EXPENSE_CLAIM_PAYMENT", sourceId: posted.sourceId, reason, actor, eventType: "books.claim.reimbursement-voided" });
  return prisma.expenseClaim.update({ where: { id }, data: { status: "APPROVED", paidAt: null, paidById: null, bankAccountId: null } });
}

/** Void an approved claim (owner or granted): every posting it made is mirrored. A paid one is unpaid first. */
export async function voidClaim(actor: BooksActor, id: string, reason: string, at = new Date()) {
  const claim = await read(actor.companyId, id);
  if (claim.status === "PAID") throw new ClaimRefused(`${label(claim)} has been paid: void the reimbursement first.`);
  if (claim.status !== "APPROVED") throw new ClaimRefused(`${label(claim)} was not approved: nothing was posted. Reject or delete it instead.`);
  const allowed = canDo(actor, "void", { kind: "claim" });
  if (!allowed.allowed) throw new ClaimRefused(allowed.reason, 403);
  const postings = await prisma.journalEntry.findMany({ where: { companyId: actor.companyId, sourceType: "EXPENSE_CLAIM", sourceId: { startsWith: `${id}:` }, voidedAt: null, reversalOfEntryId: null, status: "POSTED" }, select: { sourceId: true } });
  for (const posting of postings) {
    if (posting.sourceId) await voidMoney({ companyId: actor.companyId, sourceType: "EXPENSE_CLAIM", sourceId: posting.sourceId, reason, actor, eventType: "books.claim.voided" });
  }
  return prisma.expenseClaim.update({ where: { id }, data: { status: "VOIDED", voidedAt: at, voidedById: actor.userId, voidReason: reason } });
}
