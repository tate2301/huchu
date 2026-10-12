import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { approvalFor, replayApproval, tillRuleResponse, type Approval, type ApproverInput } from "@/lib/retail/manager-pin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { offlineReversalReview } from "@/lib/retail/till-rule-words";
import { reversalReason, TillRuleRefused, type TillRuleDecision, type TillRules } from "@/lib/retail/till-rules";
import { VoucherRefusal } from "@/lib/retail/vouchers/issue";

import { DrawerClosed } from "./drawer";

/**
 * What a refund (`refunds.ts`) and a void (`voids.ts`) share (FLR-02): the
 * refusal and its answer, the lock on the sale they reverse, the transaction
 * that tells a till to try again after a lost race, and the approval.
 */

export type ReversalActor = {
  companyId: string;
  userId: string;
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

/** The till a reversal is done at (SET-04): its shift is the drawer. */
export type ReversalDevice = { id: string; registerId: string };

/** A refusal in the sheet's words: one sentence, under a field, or with what to choose from. */
export class ReversalRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ReversalRefused";
  }
}

export const SALE_NOT_FOUND = "Sale not found";
export const REVERSAL_TRY_AGAIN = "Someone else was changing this sale at the same moment. Try again.";
export const SHIFT_NO_LONGER_OPEN = "Shift is no longer open.";
export const OPEN_A_SHIFT_HERE = "Open a shift on this till first: the money comes out of its drawer.";

export const actorName = (actor: ReversalActor) => actor.userName || actor.userEmail || "Cashier";

/**
 * Holds the sale a refund or void reverses for the rest of the transaction
 * (`SELECT ... FOR UPDATE`). Two reversals of one sale at the same moment then
 * run one after the other: the second reads what the first wrote, so a sale
 * cannot be handed back twice, or in pieces under the refund PIN limit.
 */
export async function lockSourceSale(tx: Prisma.TransactionClient, saleId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "RetailSale" WHERE "id" = ${saleId} FOR UPDATE`;
}

function lostRace(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /deadlock detected|could not serialize access|40P01|40001/.test(message);
}

/**
 * A refund's or void's transaction. A deadlock or a serialization failure
 * changed nothing, so the person is told to try again in plain words.
 */
export async function reversalTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work, { timeout: 20_000 });
  } catch (error) {
    if (lostRace(error)) throw new ReversalRefused(409, REVERSAL_TRY_AGAIN);
    throw error;
  }
}

/**
 * The sale a reversal is of: the company's, at a site the person works at
 * (404 otherwise, as a sale they cannot see).
 */
export async function assertSiteOf(actor: ReversalActor, siteId: string): Promise<void> {
  const scope = await siteScopeOf(actor.companyId, actor.userId);
  if (!scope.all && !scope.ids.includes(siteId)) throw new ReversalRefused(404, SALE_NOT_FOUND);
}

/** The listed reason, refused under the sheet's Why. */
export function reasonOf(rules: TillRules, kind: "refund" | "void", reason: string, replay: boolean) {
  try {
    return reversalReason(rules, kind, reason, replay);
  } catch (error) {
    if (error instanceof TillRuleRefused) throw new ReversalRefused(400, error.message, { why: error.message });
    throw error;
  }
}

/**
 * The manager a refund or void needs (SET-06, C-31): at the counter, the
 * approval or a 409; sent in late from an offline till, the approval if it
 * carries one that checks out, else the act goes in with a review line. The
 * person asking is their own approval when the rule asked and they hold the
 * approve right. The PIN's attempt counter is written outside the act's
 * transaction, so a wrong PIN still counts.
 */
export async function reversalApproval(
  input: { actor: ReversalActor; approver?: ApproverInput | null; offlineAt?: Date | null; deviceId?: string | null },
  rule: { decision: TillRuleDecision; kind: "refund" | "void" },
): Promise<{ approvedBy: Approval | null; review: string | null }> {
  const asked = {
    companyId: input.actor.companyId,
    actorRole: input.actor.userRole,
    decision: rule.decision,
    approver: input.approver,
    place: { deviceId: input.deviceId ?? null },
  };
  const own =
    rule.decision.needsApprover && canRetailRoleDo(input.actor.userRole, "retail.sell", "approve")
      ? { id: input.actor.userId, name: actorName(input.actor) }
      : null;
  if (input.offlineAt) {
    const replayed = await replayApproval({ ...asked, review: (reason) => offlineReversalReview(rule.kind, reason) });
    return { approvedBy: replayed.approvedBy ?? own, review: replayed.review };
  }
  return { approvedBy: (await approvalFor(asked)) ?? own, review: null };
}

/** The body's refusals under the sheet's fields: `reason` is Why, `customerId` is Customer. */
const FIELD_OF: Record<string, string> = { reason: "why", customerId: "customer", shiftId: "drawer", lines: "lines", to: "to", note: "note", notes: "note" };

export function bodyRefusal(error: z.ZodError): ReversalRefused {
  const issue = error.issues[0];
  const key = String(issue?.path[0] ?? "");
  const message = issue?.message ?? "Check what you typed.";
  return new ReversalRefused(400, message, FIELD_OF[key] ? { [FIELD_OF[key]!]: message } : undefined);
}

/** Every refusal of a refund or void, as the sheet and the till read it. */
export function reversalResponse(error: unknown, route: string): NextResponse {
  if (error instanceof ReversalRefused) {
    markActivityFailed();
    return NextResponse.json(
      { error: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}), ...error.extra },
      { status: error.status },
    );
  }
  if (error instanceof DrawerClosed) return errorResponse(error.message, 409);
  if (error instanceof z.ZodError) return reversalResponse(bodyRefusal(error), route);
  const refused = tillRuleResponse(error);
  if (refused) return refused;
  if (error instanceof VoucherRefusal) {
    markActivityFailed();
    return NextResponse.json(
      { error: error.message, ...(Object.keys(error.fieldErrors).length ? { fieldErrors: error.fieldErrors } : {}) },
      { status: error.status },
    );
  }
  console.error(`[API] ${route} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.", 500);
}

/** The person reversing, from the signed-in session. */
export function reversalActorOf(session: {
  user: { companyId: string; id: string; role?: string | null; name?: string | null; email?: string | null };
}): ReversalActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userRole: session.user.role ?? null,
    userName: session.user.name ?? null,
    userEmail: session.user.email ?? null,
  };
}
