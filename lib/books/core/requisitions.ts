import { Prisma, type AccountingSourceType, type PrismaClient } from "@prisma/client";

import { ADVANCE_ACCOUNT } from "@/lib/accounting/defaults";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { approvalNote, moneyLimits, recordApproval, type ApprovalDecision } from "./approvals";
import type { BooksActor } from "./can-do";
import { numberAtIssue } from "./numbering";
import { postMoney, type PostMoneyResult } from "./post-money";
import { voidMoney } from "./void-money";

/**
 * A requisition, CRM and retail as one (books-final §4.11): Draft → To approve
 * (Send for approval) → Approved or Rejected → Paid out → Accounted for. The
 * CRM's routes and retail's buying both move it through these functions; the
 * state machine itself is `lib/crm/requisitions.ts` (`assertTransition`).
 *
 * The money goes through the advance account: paying out debits 1150 Cash
 * advances to staff and credits the money account chosen; accounting for it
 * expenses each receipt's category (input VAT where its FTI is valid) out of
 * 1150; change handed back is Dr money account, Cr 1150; an overspend paid
 * to the requester is Dr 1150, Cr money account. Afterwards 1150 holds
 * nothing for it. A retail order's cash stays an advance to the supplier
 * (Dr 2000), as retail's rules say, and its acquittal posts only the change.
 *
 * Requisitions paid out before P2 were expensed as they left. Accounting for
 * one of those first moves its expense back onto the advance (`:legacy`), and
 * the drain settles any acquitted one whose events posted under both rules
 * (`settleAdvances`): whatever is left on 1150 for a requisition that is
 * accounted for goes to its category.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type RequisitionForMoney = {
  id: string;
  companyId: string;
  requisitionNo: string | null;
  category: string;
  currency: string;
  purpose: string;
  siteId: string | null;
  projectId: string | null;
  purchaseOrderId: string | null;
  amount: Prisma.Decimal | number;
  approvedAmount: Prisma.Decimal | number | null;
  paidAmount?: Prisma.Decimal | number | null;
  bankAccountId: string | null;
  disbursedAt: Date | null;
  acquittedAt: Date | null;
  changeAccountId?: string | null;
};

export const DISBURSE_SOURCES: readonly AccountingSourceType[] = ["CRM_REQUISITION_DISBURSEMENT", "RETAIL_REQUISITION_PAYOUT"];
const ACQUITTAL_SOURCES: readonly AccountingSourceType[] = [
  "REQUISITION_ACQUITTAL",
  "CRM_REQUISITION_REFUND",
  "CRM_REQUISITION_TOPUP",
  "RETAIL_REQUISITION_CHANGE",
];

export const isRetail = (requisition: Pick<RequisitionForMoney, "siteId">) => Boolean(requisition.siteId);
export const isOrderCash = (requisition: Pick<RequisitionForMoney, "siteId" | "purchaseOrderId">) => isRetail(requisition) && Boolean(requisition.purchaseOrderId);
export const moduleOf = (requisition: Pick<RequisitionForMoney, "siteId">) => (isRetail(requisition) ? ("retail" as const) : ("crm" as const));

/** What was handed over: the paid amount once paid out, else the approved amount, else what was asked. */
export function paidOutAmount(requisition: Pick<RequisitionForMoney, "amount" | "approvedAmount" | "paidAmount">): Prisma.Decimal {
  const figure = requisition.paidAmount ?? requisition.approvedAmount ?? requisition.amount;
  return new Prisma.Decimal(figure);
}

const label = (requisition: Pick<RequisitionForMoney, "requisitionNo">) => requisition.requisitionNo ?? "Requisition";

async function costCentreOf(db: Db, companyId: string, projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const project = await db.crmProject.findFirst({ where: { id: projectId, companyId }, select: { costCenterId: true } });
  return project?.costCenterId ?? null;
}

/**
 * Postings are idempotent on their source, so money posted again after a
 * void (paid out again after a reversal, accounted for again after a reopen)
 * takes the next round's key: the requisition's id, then `<id>:r2`, `<id>:r3`.
 */
async function roundSuffix(db: Db, companyId: string, sourceTypes: readonly AccountingSourceType[], requisitionId: string): Promise<string> {
  const voided = await db.journalEntry.findMany({
    where: { companyId, sourceType: { in: [...sourceTypes] }, OR: [{ sourceId: requisitionId }, { sourceId: { startsWith: `${requisitionId}:` } }], voidedAt: { not: null } },
    select: { sourceId: true },
  });
  if (voided.length === 0) return "";
  const rounds = voided.map((row) => Number(/^[^:]+:r(\d+)(?::|$)/.exec(row.sourceId ?? "")?.[1] ?? 1));
  return `:r${Math.max(...rounds) + 1}`;
}

async function ledgerOf(db: Db, companyId: string, bankAccountId: string | null | undefined): Promise<string | null> {
  if (!bankAccountId) return null;
  const bank = await db.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: { ledgerAccountId: true } });
  return bank?.ledgerAccountId ?? null;
}

/* ── Send for approval ─────────────────────────────────────────────────── */

export type SentForApproval = { requisitionNo: string; approvalLimit: Prisma.Decimal; approverId: string | null; over: boolean };

/**
 * Send for approval, inside the caller's transaction: the number from the
 * series (D8; a draft has none), and the owner limit and who it waits for, as
 * they are now, so a later change to the limit does not move a request already
 * asked. Written to `ApprovalAction` as SUBMIT.
 */
export async function sendRequisitionForApproval(
  tx: Prisma.TransactionClient,
  input: { companyId: string; id: string; requisitionNo: string | null; amount: Prisma.Decimal | number; actorId: string; at?: Date; from?: string },
): Promise<SentForApproval> {
  const requisitionNo = await numberAtIssue(tx, input.companyId, "requisition", input.requisitionNo);
  const limits = await moneyLimits(input.companyId, tx);
  const approvalLimit = new Prisma.Decimal(limits.requisitionOwnerOver);
  const over = new Prisma.Decimal(input.amount).greaterThan(approvalLimit);
  const approverId = over ? (limits.ownerApprover?.id ?? null) : null;
  await recordApproval(tx, {
    companyId: input.companyId,
    kind: "requisition",
    entityId: input.id,
    action: "SUBMIT",
    from: input.from ?? "DRAFT",
    to: "SUBMITTED",
    actedById: input.actorId,
  });
  return { requisitionNo, approvalLimit, approverId, over };
}

/** Approve or reject, written once to `ApprovalAction` (D9), with the bent-rule note where it bent. */
export async function recordRequisitionDecision(
  tx: Db,
  input: { companyId: string; id: string; approve: boolean; actorId: string; decision: ApprovalDecision; note?: string | null },
) {
  return recordApproval(tx, {
    companyId: input.companyId,
    kind: "requisition",
    entityId: input.id,
    action: input.approve ? "APPROVE" : "REJECT",
    from: "SUBMITTED",
    to: input.approve ? "APPROVED" : "REJECTED",
    actedById: input.actorId,
    note: approvalNote(input.decision, input.note),
  });
}

/* ── Paying out ────────────────────────────────────────────────────────── */

/**
 * Paying out: Dr 1150 Cash advances (a retail order's cash: Dr 2000, an
 * advance to the supplier), Cr the money account it was paid from, with the
 * bank side. Never refuses: what cannot post waits for the drain.
 */
export async function postRequisitionDisbursement(db: Db, requisition: RequisitionForMoney, actor: { userId: string; role?: string | null }): Promise<PostMoneyResult | null> {
  const amount = paidOutAmount(requisition);
  if (!amount.greaterThan(0)) return null;
  const costCenterId = await costCentreOf(db, requisition.companyId, requisition.projectId);
  const sourceId = `${requisition.id}${await roundSuffix(db, requisition.companyId, DISBURSE_SOURCES, requisition.id)}`;
  if (isRetail(requisition)) {
    // Retail writes its own bank row as it pays out (BUY-05); the money account's ledger is named.
    return postMoney(db, {
      companyId: requisition.companyId,
      sourceType: "RETAIL_REQUISITION_PAYOUT",
      sourceId,
      sourceSubtype: requisition.purchaseOrderId ? "ORDER" : "EXPENSE",
      siteId: requisition.siteId,
      date: requisition.disbursedAt ?? new Date(),
      description: `${label(requisition)}: ${requisition.purpose}`,
      amount,
      currency: requisition.currency,
      costCenterId,
      accounts: { moneyAccount: await ledgerOf(db, requisition.companyId, requisition.bankAccountId) },
      actor,
      payload: { requisitionNo: requisition.requisitionNo },
    });
  }
  return postMoney(db, {
    companyId: requisition.companyId,
    sourceType: "CRM_REQUISITION_DISBURSEMENT",
    sourceId,
    sourceSubtype: requisition.category,
    date: requisition.disbursedAt ?? new Date(),
    description: `${label(requisition)}: ${requisition.purpose}`,
    amount,
    currency: requisition.currency,
    costCenterId,
    money: { bankAccountId: requisition.bankAccountId, direction: "OUT", reference: requisition.requisitionNo },
    actor,
    payload: { requisitionNo: requisition.requisitionNo, category: requisition.category, projectId: requisition.projectId, costCenterId },
  });
}

/* ── Accounting for it ─────────────────────────────────────────────────── */

/** One expense the money went on: a category, or an expense account of its own; VAT only from a valid FTI. */
export type SpendGroup = { category: string; amount: Prisma.Decimal | number; taxAmount?: Prisma.Decimal | number; expenseAccountId?: string | null; costCenterId?: string | null };

/** Spend lines, summed by where they post: one entry per category (or account), not one per slip. */
export function groupSpend(lines: SpendGroup[]): Array<{ key: string; subtype: string; amount: Prisma.Decimal; taxAmount: Prisma.Decimal; expenseAccountId: string | null; costCenterId: string | null }> {
  const groups = new Map<string, { key: string; subtype: string; amount: Prisma.Decimal; taxAmount: Prisma.Decimal; expenseAccountId: string | null; costCenterId: string | null }>();
  for (const line of lines) {
    const subtype = line.expenseAccountId ? "ACCOUNT" : line.category;
    const key = `${line.expenseAccountId ? `acct-${line.expenseAccountId}` : line.category}${line.costCenterId ? `@${line.costCenterId}` : ""}`;
    const row = groups.get(key) ?? { key, subtype, amount: new Prisma.Decimal(0), taxAmount: new Prisma.Decimal(0), expenseAccountId: line.expenseAccountId ?? null, costCenterId: line.costCenterId ?? null };
    row.amount = row.amount.plus(new Prisma.Decimal(line.amount));
    row.taxAmount = row.taxAmount.plus(new Prisma.Decimal(line.taxAmount ?? 0));
    groups.set(key, row);
  }
  return [...groups.values()].filter((row) => !row.amount.isZero());
}

/** Did the payout land on the advance account, or was it expensed as it left (before P2)? */
async function payoutTouchedAdvance(db: Db, requisition: RequisitionForMoney): Promise<"advance" | "expensed" | "not-posted"> {
  const entry = await db.journalEntry.findFirst({
    where: {
      companyId: requisition.companyId,
      sourceType: { in: [...DISBURSE_SOURCES] },
      OR: [{ sourceId: requisition.id }, { sourceId: { startsWith: `${requisition.id}:r` } }],
      status: "POSTED",
      voidedAt: null,
    },
    select: { lines: { select: { debit: true, account: { select: { code: true } } } } },
  });
  if (!entry) return "not-posted";
  return entry.lines.some((line) => line.account.code === ADVANCE_ACCOUNT && line.debit > 0) ? "advance" : "expensed";
}

export type AcquittalPosting = { spend: number; change: number; topUp: number; legacy: boolean; results: PostMoneyResult[] };

/**
 * Accounting for it: each spend group to its expense out of 1150; the change
 * handed back into a money account (Cr 1150); an overspend paid out to the
 * requester (Dr 1150). A retail order's cash posts only its change, against
 * the supplier's advance. Never refuses: what cannot post waits.
 */
export async function postRequisitionAcquittal(
  db: Db,
  requisition: RequisitionForMoney,
  input: { spend: SpendGroup[]; change: Prisma.Decimal | number; topUp?: Prisma.Decimal | number; changeAccountId?: string | null; actor: { userId: string; role?: string | null } },
): Promise<AcquittalPosting> {
  const results: PostMoneyResult[] = [];
  const change = new Prisma.Decimal(input.change);
  const topUp = new Prisma.Decimal(input.topUp ?? 0);
  const date = requisition.acquittedAt ?? new Date();
  const costCenterId = await costCentreOf(db, requisition.companyId, requisition.projectId);
  const no = label(requisition);
  const order = isOrderCash(requisition);
  const round = await roundSuffix(db, requisition.companyId, ACQUITTAL_SOURCES, requisition.id);
  const base = `${requisition.id}${round}`;
  let legacy = false;
  let spent = 0;

  if (!order) {
    // Paid out before P2 and expensed then: put it back on the advance first, so the receipts expense it once.
    if ((await payoutTouchedAdvance(db, requisition)) === "expensed") {
      legacy = true;
      results.push(
        await postMoney(db, {
          companyId: requisition.companyId,
          sourceType: "REQUISITION_ACQUITTAL",
          sourceId: `${base}:legacy`,
          sourceSubtype: requisition.category,
          siteId: requisition.siteId,
          date,
          description: `${no}: paid out before cash advances, moved onto the advance`,
          amount: paidOutAmount(requisition),
          currency: requisition.currency,
          costCenterId,
          invertDirection: true,
          actor: input.actor,
          payload: { requisitionNo: requisition.requisitionNo, invertDirection: true },
        }),
      );
    }
    for (const group of groupSpend(input.spend)) {
      spent += toNumberOrZero(group.amount);
      const net = group.amount.minus(group.taxAmount);
      results.push(
        await postMoney(db, {
          companyId: requisition.companyId,
          sourceType: "REQUISITION_ACQUITTAL",
          sourceId: `${base}:${group.key}`,
          sourceSubtype: group.subtype,
          siteId: requisition.siteId,
          date,
          description: `${no}: ${requisition.purpose}`,
          amount: group.amount,
          netAmount: net,
          taxAmount: group.taxAmount,
          grossAmount: group.amount,
          currency: requisition.currency,
          costCenterId: group.costCenterId ?? costCenterId,
          accounts: group.expenseAccountId ? { expenseAccount: group.expenseAccountId } : undefined,
          actor: input.actor,
          payload: { requisitionNo: requisition.requisitionNo, category: group.subtype },
        }),
      );
    }
  }

  if (change.greaterThan(0)) {
    if (isRetail(requisition)) {
      results.push(
        await postMoney(db, {
          companyId: requisition.companyId,
          sourceType: "RETAIL_REQUISITION_CHANGE",
          sourceId: base,
          sourceSubtype: order ? "ORDER" : "EXPENSE",
          siteId: requisition.siteId,
          date,
          description: `${no}: change back`,
          amount: change,
          currency: requisition.currency,
          accounts: { changeAccount: await ledgerOf(db, requisition.companyId, input.changeAccountId ?? requisition.changeAccountId ?? requisition.bankAccountId) },
          actor: input.actor,
          payload: { requisitionNo: requisition.requisitionNo },
        }),
      );
    } else {
      results.push(
        await postMoney(db, {
          companyId: requisition.companyId,
          sourceType: "CRM_REQUISITION_REFUND",
          sourceId: base,
          sourceSubtype: requisition.category,
          date,
          description: `${no}: change returned`,
          amount: change,
          currency: requisition.currency,
          costCenterId,
          money: { bankAccountId: input.changeAccountId ?? requisition.bankAccountId, direction: "IN", reference: requisition.requisitionNo },
          actor: input.actor,
          payload: { requisitionNo: requisition.requisitionNo, category: requisition.category },
        }),
      );
    }
  }
  if (topUp.greaterThan(0) && !isRetail(requisition)) {
    results.push(
      await postMoney(db, {
        companyId: requisition.companyId,
        sourceType: "CRM_REQUISITION_TOPUP",
        sourceId: base,
        sourceSubtype: requisition.category,
        date,
        description: `${no}: spent over the requisition, paid back`,
        amount: topUp,
        currency: requisition.currency,
        costCenterId,
        money: { bankAccountId: requisition.bankAccountId, direction: "OUT", reference: requisition.requisitionNo },
        actor: input.actor,
        payload: { requisitionNo: requisition.requisitionNo, category: requisition.category },
      }),
    );
  }
  return { spend: Math.round(spent * 100) / 100, change: toNumberOrZero(change), topUp: toNumberOrZero(topUp), legacy, results };
}

/* ── Undo ──────────────────────────────────────────────────────────────── */

/** Every posting an acquittal made, not yet voided. */
async function acquittalPostings(companyId: string, requisitionId: string) {
  return prisma.journalEntry.findMany({
    where: {
      companyId,
      sourceType: { in: [...ACQUITTAL_SOURCES] },
      OR: [{ sourceId: requisitionId }, { sourceId: { startsWith: `${requisitionId}:` } }],
      voidedAt: null,
      reversalOfEntryId: null,
      status: "POSTED",
    },
    select: { sourceType: true, sourceId: true },
  });
}

/** Reopen an acquittal (owner or granted): every posting it made is mirrored; the requisition is paid out again. */
export async function voidRequisitionAcquittal(input: { companyId: string; requisitionId: string; reason: string; actor: BooksActor }) {
  const postings = await acquittalPostings(input.companyId, input.requisitionId);
  for (const posting of postings) {
    if (!posting.sourceType || !posting.sourceId) continue;
    await voidMoney({ companyId: input.companyId, sourceType: posting.sourceType, sourceId: posting.sourceId, reason: input.reason, actor: input.actor, eventType: "books.requisition.reopened" });
  }
  return postings.length;
}

/** Reverse a payout (owner or granted): its posting is mirrored and its bank side goes; the requisition is approved again. */
export async function voidRequisitionDisbursement(input: { companyId: string; requisition: Pick<RequisitionForMoney, "id" | "siteId">; reason: string; actor: BooksActor }) {
  const sourceType: AccountingSourceType = isRetail(input.requisition) ? "RETAIL_REQUISITION_PAYOUT" : "CRM_REQUISITION_DISBURSEMENT";
  const posted = await prisma.journalEntry.findFirst({
    where: {
      companyId: input.companyId,
      sourceType,
      OR: [{ sourceId: input.requisition.id }, { sourceId: { startsWith: `${input.requisition.id}:r` } }],
      status: "POSTED",
      voidedAt: null,
      reversalOfEntryId: null,
    },
    select: { id: true, sourceId: true },
  });
  if (!posted?.sourceId) {
    // Nothing posted yet: the waiting event goes with the payout, and the bank side with it.
    await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId: input.companyId, sourceType, sourceId: input.requisition.id, status: { in: ["PENDING", "FAILED"] } } });
    await prisma.bankTransaction.deleteMany({ where: { companyId: input.companyId, sourceType, sourceId: input.requisition.id, reconciliationId: null, reconciledAt: null } });
    return null;
  }
  return voidMoney({ companyId: input.companyId, sourceType, sourceId: posted.sourceId, reason: input.reason, actor: input.actor, eventType: "books.requisition.payout-reversed" });
}

/* ── Settling advances the drain left ──────────────────────────────────── */

/**
 * A requisition accounted for leaves nothing on 1150. One whose events were
 * captured before P2 and posted after it (D14) can: its payout or its change
 * went through the advance, but no acquittal was ever posted. Whatever is
 * left on 1150 for it goes to its category (`:settle`), once none of its
 * events are still waiting. Run by the drain; idempotent.
 */
export async function settleAdvances(companyId: string, actorId?: string | null): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: string; balance: number }>>`
    SELECT r."id", COALESCE(SUM(l."debit" - l."credit"), 0)::float8 AS balance
    FROM "CrmRequisition" r
    JOIN "JournalEntry" j ON j."companyId" = r."companyId"
      AND (j."sourceId" = r."id" OR j."sourceId" LIKE r."id" || ':%' OR j."sourceId" = 'void:' || r."id" OR j."sourceId" LIKE 'void:' || r."id" || ':%')
      AND j."sourceType"::text IN ('CRM_REQUISITION_DISBURSEMENT', 'RETAIL_REQUISITION_PAYOUT', 'CRM_REQUISITION_REFUND', 'CRM_REQUISITION_TOPUP', 'RETAIL_REQUISITION_CHANGE', 'REQUISITION_ACQUITTAL')
    JOIN "JournalLine" l ON l."entryId" = j."id"
    JOIN "ChartOfAccount" a ON a."id" = l."accountId" AND a."code" = ${ADVANCE_ACCOUNT}
    WHERE r."companyId" = ${companyId} AND r."status" = 'ACQUITTED' AND r."purchaseOrderId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "JournalEntry" x WHERE x."companyId" = r."companyId" AND x."sourceType" = 'REQUISITION_ACQUITTAL' AND x."sourceId" LIKE r."id" || ':%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "AccountingIntegrationEvent" e WHERE e."companyId" = r."companyId" AND e."status" IN ('PENDING', 'FAILED')
          AND (e."sourceId" = r."id" OR e."sourceId" LIKE r."id" || ':%')
      )
    GROUP BY r."id"
    HAVING ABS(SUM(l."debit" - l."credit")) >= 0.005`;
  let settled = 0;
  for (const row of rows) {
    const requisition = await prisma.crmRequisition.findUnique({ where: { id: row.id } });
    if (!requisition) continue;
    const by = actorId ?? requisition.acquittedById ?? requisition.disbursedById ?? requisition.requestedById;
    const result = await postMoney(prisma, {
      companyId,
      sourceType: "REQUISITION_ACQUITTAL",
      sourceId: `${requisition.id}:settle`,
      sourceSubtype: requisition.category,
      siteId: requisition.siteId,
      date: requisition.acquittedAt ?? new Date(),
      description: `${requisition.requisitionNo ?? "Requisition"}: accounted for before cash advances, settled`,
      amount: Math.abs(row.balance),
      currency: requisition.currency,
      costCenterId: await costCentreOf(prisma, companyId, requisition.projectId),
      invertDirection: row.balance < 0,
      actor: { userId: by },
      payload: { requisitionNo: requisition.requisitionNo, invertDirection: row.balance < 0 },
    });
    if (result.entryId) settled += 1;
  }
  return settled;
}
