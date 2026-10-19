import type { ApprovalActionType, ApprovalTargetType, Prisma, PrismaClient } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { formatMoney } from "@/lib/workspace/format";

import { canDo, tierOf, type BooksActor, type BooksDocKind, type Decision } from "./can-do";

/**
 * Maker-checker and limits for every money document (books-final §2.4).
 *
 * Pure decisions, so a test walks them rule by rule:
 * - **Nobody approves their own request**, and nobody pays out their own.
 *   The one way round it is a workspace where nobody else could: its owner,
 *   when no other person may approve (or pay) it, is let through and the
 *   approval says so, as a one-person shop must still be able to work.
 * - **The approver should not also pay** where two or more people may pay; a
 *   one-person shop may do both, and the record says "approved and paid by
 *   the same person".
 * - **Over the limit, the owner approves**: requisitions, orders and claims
 *   over `requisitionOwnerOver`, bills and supplier payments over
 *   `paymentOwnerOver` (D10), write-offs over `accountOwnerOver`. The limit is
 *   the one snapshotted when it was sent for approval, where it was.
 *
 * The limits are the company's money limits, the row retail's Approvals page
 * keeps (`RetailApprovalSettings`, `getApprovalLimits`). Every approve and
 * reject is written once to `ApprovalAction` (D9) with `recordApproval`.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type MoneyDocKind = "requisition" | "purchase-order" | "bill" | "payment" | "claim" | "voucher" | "commission" | "write-off";

/** Where each document's approvals are kept (D9). */
export const APPROVAL_TARGET: Record<MoneyDocKind, ApprovalTargetType> = {
  requisition: "REQUISITION",
  "purchase-order": "PURCHASE_ORDER",
  bill: "PURCHASE_BILL",
  payment: "SUPPLIER_PAYMENT",
  claim: "EXPENSE_CLAIM",
  voucher: "PETTY_CASH_VOUCHER",
  commission: "COMMISSION",
  "write-off": "WRITE_OFF",
};

const BOOKS_KIND: Record<MoneyDocKind, BooksDocKind> = {
  requisition: "requisition",
  "purchase-order": "purchase-order",
  bill: "bill",
  payment: "payment",
  claim: "claim",
  voucher: "voucher",
  commission: "commission",
  "write-off": "write-off",
};

export type MoneyLimits = {
  requisitionOwnerOver: number;
  paymentOwnerOver: number;
  journalSecondOver: number;
  voucherHolderUnder: number;
  accountOwnerOver: number;
  /** Who over-the-limit requests wait for: the owner named on the Approvals page, else the first active owner. */
  ownerApprover: { id: string; name: string } | null;
};

/** The company's money limits, as numbers (D10). */
export async function moneyLimits(companyId: string, db: Db = prisma): Promise<MoneyLimits> {
  const limits = await getApprovalLimits(companyId, db as Prisma.TransactionClient);
  return {
    requisitionOwnerOver: toNumberOrZero(limits.requisitionOwnerOver),
    paymentOwnerOver: toNumberOrZero(limits.paymentOwnerOver),
    journalSecondOver: toNumberOrZero(limits.journalSecondOver),
    voucherHolderUnder: toNumberOrZero(limits.voucherHolderUnder),
    accountOwnerOver: toNumberOrZero(limits.accountOwnerOver),
    ownerApprover: limits.ownerApprover ? { id: limits.ownerApprover.id, name: limits.ownerApprover.name } : null,
  };
}

/** The limit over which the owner approves, for a kind of document; null where none applies. */
export function ownerLimitFor(kind: MoneyDocKind, limits: Pick<MoneyLimits, "requisitionOwnerOver" | "paymentOwnerOver" | "accountOwnerOver">): number | null {
  switch (kind) {
    case "requisition":
    case "purchase-order":
    case "claim":
      return limits.requisitionOwnerOver;
    case "bill":
    case "payment":
      return limits.paymentOwnerOver;
    case "write-off":
      return limits.accountOwnerOver;
    default:
      return null;
  }
}

export type MoneyRequest = {
  kind: MoneyDocKind;
  module?: "books" | "crm" | "retail";
  /** Who asked for it (the requester, the claimant, the maker). */
  requestedById: string | null;
  amount: number;
  /** The owner limit snapshotted when it was sent; the current one when it was not. Null: none applies. */
  limit: number | null;
  currency?: string;
};

export type ApprovalDecision = Decision & { selfApproved?: boolean };

export const OWN_APPROVAL = "Somebody else has to approve your own request.";
export const OWN_PAYMENT = "Somebody else has to pay out your own request.";
export const APPROVER_PAYS = "You approved this, so somebody else pays it out.";
export const overLimit = (limit: number, currency = "USD", owner?: string | null) =>
  `Over ${formatMoney(limit, currency)} needs ${owner ?? "the owner"}.`;

const isOwnerTier = (actor: BooksActor) => tierOf(actor) === "owner";

/**
 * May this person approve (or reject) it? `othersWhoCanApprove` counts the
 * other people in the workspace who could, so a sole owner is not locked out
 * of their own shop.
 */
export function decideApproval(
  actor: BooksActor,
  request: MoneyRequest,
  /**
   * `othersWhoCanApprove`: the other people who could approve it at or under the limit;
   * `otherOwners`: those who could over it. `roleAllowed`: the module's own permission (a
   * CRM capability) in place of the Books role matrix.
   */
  context: { othersWhoCanApprove: number; otherOwners?: number; ownerName?: string | null; roleAllowed?: boolean },
): ApprovalDecision {
  const own = Boolean(request.requestedById) && request.requestedById === actor.userId;
  if (actor.signInAs?.mode === "LOOK") return { allowed: false, reason: "You signed in to look only, so nothing can be changed." };
  if (own) {
    // Nobody else could say yes to this amount: the owner's own request is theirs to approve, marked.
    const over = request.limit != null && request.amount > request.limit + 0.004;
    const others = over ? (context.otherOwners ?? context.othersWhoCanApprove) : context.othersWhoCanApprove;
    if (isOwnerTier(actor) && others === 0) return { allowed: true, selfApproved: true };
    return { allowed: false, reason: OWN_APPROVAL };
  }
  const role =
    context.roleAllowed === undefined
      ? canDo(actor, "approve", { kind: BOOKS_KIND[request.kind], module: request.module ?? "books" })
      : context.roleAllowed
        ? ({ allowed: true } as const)
        : ({ allowed: false, reason: "You cannot approve this." } as const);
  if (!role.allowed) return role;
  if (!isOwnerTier(actor) && request.limit != null && request.amount > request.limit + 0.004) {
    return { allowed: false, reason: overLimit(request.limit, request.currency, context.ownerName) };
  }
  return { allowed: true };
}

export type PaymentDecision = Decision & { selfPaid?: boolean; sameAsApprover?: boolean };

/**
 * May this person pay it out? Not their own; not one they approved where
 * somebody else may pay; within their limit unless the owner approved it
 * (the owner's approval is the authority, paying is carrying it out).
 */
export function decidePayment(
  actor: BooksActor,
  request: MoneyRequest & { approvedById?: string | null; ownerApproved?: boolean },
  context: { othersWhoCanPay: number; roleAllowed?: boolean },
): PaymentDecision {
  if (actor.signInAs?.mode === "LOOK") return { allowed: false, reason: "You signed in to look only, so nothing can be changed." };
  const own = Boolean(request.requestedById) && request.requestedById === actor.userId;
  let selfPaid = false;
  if (own) {
    if (!(isOwnerTier(actor) && context.othersWhoCanPay === 0)) return { allowed: false, reason: OWN_PAYMENT };
    selfPaid = true;
  }
  let sameAsApprover = false;
  if (request.approvedById && request.approvedById === actor.userId) {
    if (context.othersWhoCanPay > 0) return { allowed: false, reason: APPROVER_PAYS };
    sameAsApprover = true;
  }
  const role =
    context.roleAllowed === undefined
      ? canDo(actor, "pay", { kind: BOOKS_KIND[request.kind], module: request.module ?? "books" })
      : context.roleAllowed
        ? ({ allowed: true } as const)
        : ({ allowed: false, reason: "You cannot pay this out." } as const);
  if (!role.allowed) return role;
  if (!isOwnerTier(actor) && !request.ownerApproved && request.limit != null && request.amount > request.limit + 0.004) {
    return { allowed: false, reason: overLimit(request.limit, request.currency) };
  }
  return { allowed: true, ...(selfPaid ? { selfPaid } : {}), ...(sameAsApprover ? { sameAsApprover } : {}) };
}

/** Roles that may approve and pay money out (§2.2), and the shop's manager for the shop's own. */
const MONEY_ROLES = ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"];

/** How many other active people could approve or pay this, besides `exceptUserIds`. */
export async function othersWhoCan(
  db: Db,
  companyId: string,
  input: { module?: "books" | "crm" | "retail"; except: Array<string | null | undefined> },
): Promise<number> {
  const roles = input.module === "retail" ? [...MONEY_ROLES, "SHOP_MANAGER"] : MONEY_ROLES;
  const except = input.except.filter((id): id is string => Boolean(id));
  return db.user.count({ where: { companyId, isActive: true, role: { in: roles as never }, ...(except.length ? { id: { notIn: except } } : {}) } });
}

/** The workspace's other active owners: who else could approve over the limit. */
export async function otherOwners(db: Db, companyId: string, except: Array<string | null | undefined>): Promise<number> {
  const ids = except.filter((id): id is string => Boolean(id));
  return db.user.count({ where: { companyId, isActive: true, role: "SUPERADMIN", ...(ids.length ? { id: { notIn: ids } } : {}) } });
}

/** Was it approved by one of the workspace's owners? Their approval lifts the payer's limit. */
export async function approvedByOwner(db: Db, companyId: string, approvedById: string | null | undefined): Promise<boolean> {
  if (!approvedById) return false;
  return (await db.user.count({ where: { id: approvedById, companyId, role: "SUPERADMIN" } })) > 0;
}

/** One `ApprovalAction` row for a Books approval (D9): who, what, from and to, and why. */
export async function recordApproval(
  db: Db,
  input: {
    companyId: string;
    kind: MoneyDocKind;
    entityId: string;
    action: ApprovalActionType;
    from?: string | null;
    to?: string | null;
    actedById: string;
    note?: string | null;
  },
) {
  return db.approvalAction.create({
    data: {
      companyId: input.companyId,
      entityType: APPROVAL_TARGET[input.kind],
      entityId: input.entityId,
      action: input.action,
      fromStatus: input.from ?? undefined,
      toStatus: input.to ?? undefined,
      note: input.note ?? undefined,
      actedById: input.actedById,
    },
  });
}

/** The note an approval carries when the maker-checker rule bent for a one-person shop. */
export function approvalNote(decision: ApprovalDecision | PaymentDecision, note?: string | null): string | null {
  const parts = [note?.trim() || null];
  if ("selfApproved" in decision && decision.selfApproved) parts.push("Approved their own request: nobody else in the workspace can.");
  if ("selfPaid" in decision && decision.selfPaid) parts.push("Paid out their own request: nobody else in the workspace can.");
  if ("sameAsApprover" in decision && decision.sameAsApprover) parts.push("Approved and paid by the same person.");
  const text = parts.filter(Boolean).join(" ");
  return text || null;
}
