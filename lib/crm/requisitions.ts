/**
 * Requisitions: an employee asking for money.
 *
 * The lifecycle has three checkpoints that people often collapse into one, and
 * keeping them apart is most of the value here:
 *
 *   APPROVED   somebody with authority said yes.
 *   DISBURSED  the money actually left. A different day, usually a different
 *              person, and the only one accounting cares about.
 *   ACQUITTED  somebody accounted for what it went on. A requisition is not
 *              finished when the cash is handed over; it is finished here.
 *
 * Collapse approval into disbursement and you cannot answer "what has been
 * approved but not yet paid", which is the question that decides whether there
 * is enough in the account this week. Collapse disbursement into acquittal and
 * outstanding floats become invisible.
 *
 * `projectId` is optional throughout, deliberately. Fuel and airtime are asked
 * for by people who are not on a project that day. Requiring one would either
 * block the request or produce a fictional attribution, and a fictional
 * attribution makes every project's cost figure wrong.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";

export type Tx = Prisma.TransactionClient;

export const REQUISITION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "DISBURSED",
  "ACQUITTED",
  "CANCELLED",
] as const;

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_CATEGORIES = [
  "FUEL",
  "AIRTIME",
  "TRANSPORT",
  "MATERIALS",
  "EQUIPMENT",
  "LABOUR",
  "SUBSISTENCE",
  "ACCOMMODATION",
  "OTHER",
] as const;

export type RequisitionCategory = (typeof REQUISITION_CATEGORIES)[number];

/**
 * Categories that are about a person's day rather than a piece of work.
 *
 * Used only to stop the UI nagging for a project on a fuel request — never to
 * forbid one. A tank of diesel burned entirely on one site is legitimately
 * that project's cost, and somebody who says so should be believed.
 */
export const UNPROJECTED_CATEGORIES: readonly RequisitionCategory[] = [
  "FUEL",
  "AIRTIME",
] as const;

export function expectsProject(category: RequisitionCategory): boolean {
  return !UNPROJECTED_CATEGORIES.includes(category);
}

/**
 * Where each state can go.
 *
 * REJECTED and CANCELLED are terminal; ACQUITTED is terminal because reopening
 * a settled float should be a new requisition with its own paper trail rather
 * than an edit that makes last month's figure change.
 */
const TRANSITIONS: Record<RequisitionStatus, readonly RequisitionStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["DISBURSED", "CANCELLED"],
  REJECTED: [],
  DISBURSED: ["ACQUITTED"],
  ACQUITTED: [],
  CANCELLED: [],
};

export function canTransition(from: RequisitionStatus, to: RequisitionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class RequisitionTransitionError extends Error {
  constructor(from: RequisitionStatus, to: RequisitionStatus) {
    super(
      TRANSITIONS[from].length === 0
        ? `A ${from.toLowerCase()} requisition is finished and cannot be changed.`
        : `A ${from.toLowerCase()} requisition can only go to ${TRANSITIONS[from]
            .map((status) => status.toLowerCase())
            .join(" or ")}, not ${to.toLowerCase()}.`,
    );
    this.name = "RequisitionTransitionError";
  }
}

export function assertTransition(from: RequisitionStatus, to: RequisitionStatus): void {
  if (!canTransition(from, to)) throw new RequisitionTransitionError(from, to);
}

export const createRequisitionSchema = z.object({
  category: z.enum(REQUISITION_CATEGORIES),
  purpose: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Optional on purpose — see the note at the top of this file. */
  projectId: z.string().uuid().nullable().optional(),
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(1).max(10).default("USD"),
  neededBy: z.coerce.date().nullable().optional(),
  /** Submit straight away rather than leaving it as a draft. */
  submit: z.boolean().optional(),
});

export const decisionSchema = z.object({
  approve: z.boolean(),
  /** An approver may cut the amount without rejecting the request outright. */
  approvedAmount: z.number().finite().positive().nullable().optional(),
  decisionNote: z.string().trim().max(1000).nullable().optional(),
});

export const disburseSchema = z.object({
  bankAccountId: z.string().uuid().nullable().optional(),
  disbursedAt: z.coerce.date().optional(),
});

export const acquitSchema = z.object({
  acquittedAmount: z.number().finite().nonnegative(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/**
 * What is actually owed on a requisition.
 *
 * The approved amount when there is one, otherwise what was asked for. An
 * approver who cuts 400 to 250 has approved 250, and every downstream figure
 * should say 250.
 */
export function payableAmount(requisition: {
  amount: Prisma.Decimal | number;
  approvedAmount: Prisma.Decimal | number | null;
}): Prisma.Decimal {
  const approved = requisition.approvedAmount;
  if (approved !== null && approved !== undefined) return new Prisma.Decimal(approved);
  return new Prisma.Decimal(requisition.amount);
}

/**
 * What is still unaccounted for after an acquittal.
 *
 * Positive means the employee is holding change that belongs to the company;
 * negative means they are out of pocket. Both are real and both need saying
 * out loud rather than being rounded away.
 */
export function outstandingFloat(requisition: {
  amount: Prisma.Decimal | number;
  approvedAmount: Prisma.Decimal | number | null;
  acquittedAmount: Prisma.Decimal | number | null;
  status: RequisitionStatus;
}): Prisma.Decimal {
  if (requisition.status !== "DISBURSED" && requisition.status !== "ACQUITTED") {
    return new Prisma.Decimal(0);
  }
  const paid = payableAmount(requisition);
  const spent =
    requisition.acquittedAmount === null || requisition.acquittedAmount === undefined
      ? new Prisma.Decimal(0)
      : new Prisma.Decimal(requisition.acquittedAmount);
  return paid.minus(spent);
}

/** Statuses where the money has left the business and not yet been accounted for. */
export function isOutstanding(status: RequisitionStatus): boolean {
  return status === "DISBURSED";
}

/** Statuses an approver is waiting on. */
export function awaitsDecision(status: RequisitionStatus): boolean {
  return status === "SUBMITTED";
}
