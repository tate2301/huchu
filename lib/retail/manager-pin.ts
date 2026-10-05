/**
 * A manager approving, with their till PIN, what the person asking may not do
 * alone (C-31: the one manager-PIN module; SET-06 builds it, STK-04, FLR-02,
 * FLR-09 and CUS-10 use it).
 *
 * A request carries `approver: { userId, pin }`. The approver must be an
 * active person of the shop who holds the act's approve right
 * (`retail.sell:approve` for refunds, voids, discounts and the drawer), and the
 * four digits must match their `RetailTillPin`, with the till's lockout: five
 * wrong tries and it is locked (423).
 *
 * A person who holds the approve right themselves is their own approval:
 * nothing is typed, and the act is theirs (`approvalFor`).
 *
 * ── Why a PIN can approve now ──────────────────────────────────────────────
 *
 * The till used to take a manager's password here, and `till-pin.ts` said a
 * PIN never authorises an override. The canvas reverses that (10-setup open
 * question 2): on the shop floor the manager taps their name and types four
 * digits. What makes four digits enough is everything around them — the till
 * is a paired device, the lockout stops a search, and every approval names
 * its approver on the record and in the audit chain.
 *
 * The attempt counter is written with the shared client, never the act's
 * transaction: a wrong PIN rolls the act back but must still count.
 */

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, type RetailAction, type RetailResource } from "@/lib/retail/permission-matrix";
import { evaluateTillPinAttempt } from "@/lib/retail/till-pin";
import { TillRuleRefused, type TillRuleDecision } from "@/lib/retail/till-rules";

export const approverSchema = z.object({
  userId: z.string().uuid({ message: "Pick a manager." }),
  pin: z.string().regex(/^\d{4}$/, { message: "Type the manager’s four-digit PIN." }),
});

export type ApproverInput = z.infer<typeof approverSchema>;

export type Approval = { id: string; name: string };

export const WRONG_PIN = "That PIN is not right.";
export const PIN_LOCKED = "Too many tries. Try again in 15 minutes.";
export const NOT_AN_APPROVER = "Pick someone who can approve this.";

/** 409: the rules ask for a manager and none (or nobody who may) was given. The till opens its PIN dialog. */
export class ApprovalNeeded extends Error {
  readonly status = 409;
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ApprovalNeeded";
  }
}

/** A manager was given and refused: 400 under `pin` or `approver`, or 423 while their PIN is locked. */
export class ApprovalRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 423,
    readonly field: "pin" | "approver" | null,
  ) {
    super(message);
    this.name = "ApprovalRefused";
  }
}

/**
 * Check one approval and say who gave it. Throws `ApprovalRefused` when the
 * person may not approve this act, has no PIN, is locked, or the digits are
 * wrong.
 */
export async function verifyManagerPin(input: {
  companyId: string;
  approver: ApproverInput;
  can?: [RetailResource, RetailAction];
  now?: Date;
}): Promise<Approval> {
  const [resource, action] = input.can ?? ["retail.sell", "approve"];
  const now = input.now ?? new Date();
  const record = await prisma.retailTillPin.findFirst({
    where: { companyId: input.companyId, userId: input.approver.userId, user: { isActive: true, companyId: input.companyId } },
    select: {
      id: true,
      pinHash: true,
      failedAttempts: true,
      lockedUntil: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!record || !canRetailRoleDo(record.user.role, resource, action)) {
    throw new ApprovalRefused(NOT_AN_APPROVER, 400, "approver");
  }

  const state = { failedAttempts: record.failedAttempts, lockedUntil: record.lockedUntil };
  // A locked PIN is refused before any hashing, so a script cannot time the difference.
  if (evaluateTillPinAttempt({ state, verified: null, now }).decision === "LOCKED") {
    throw new ApprovalRefused(PIN_LOCKED, 423, null);
  }
  const verified = await bcrypt.compare(input.approver.pin, record.pinHash);
  const outcome = evaluateTillPinAttempt({ state, verified, now });
  await prisma.retailTillPin.update({
    where: { id: record.id },
    data: { failedAttempts: outcome.next.failedAttempts, lockedUntil: outcome.next.lockedUntil },
    select: { id: true },
  });
  if (outcome.decision === "REJECTED_NOW_LOCKED") throw new ApprovalRefused(PIN_LOCKED, 423, null);
  if (outcome.decision !== "ACCEPTED") throw new ApprovalRefused(WRONG_PIN, 400, "pin");
  return { id: record.user.id, name: record.user.name || record.user.email || "A manager" };
}

/**
 * The approval an act needs, as the till rules decided it: none when the rule
 * does not ask or the person asking holds the approve right; else the given
 * approver, verified. Throws `ApprovalNeeded` when one is needed and none was
 * given.
 */
export async function approvalFor(input: {
  companyId: string;
  actorRole: string | null | undefined;
  decision: TillRuleDecision;
  approver?: ApproverInput | null;
  can?: [RetailResource, RetailAction];
}): Promise<Approval | null> {
  const [resource, action] = input.can ?? ["retail.sell", "approve"];
  if (!input.decision.needsApprover) return null;
  if (input.actorRole && canRetailRoleDo(input.actorRole, resource, action)) return null;
  if (!input.approver) throw new ApprovalNeeded(input.decision.reason);
  return verifyManagerPin({ companyId: input.companyId, approver: input.approver, can: input.can });
}

/**
 * The response for a refusal of the till rules or an approval, or null for
 * any other error: 409 `{ error, needsApprover: true, reason }`, 400
 * `{ error, fieldErrors }`, 423 `{ error }`.
 */
export function tillRuleResponse(error: unknown): NextResponse | null {
  if (error instanceof ApprovalNeeded) {
    markActivityFailed();
    return NextResponse.json({ error: error.reason, needsApprover: true, reason: error.reason }, { status: 409 });
  }
  if (error instanceof ApprovalRefused) {
    markActivityFailed();
    return NextResponse.json(
      { error: error.message, ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof TillRuleRefused) {
    markActivityFailed();
    return NextResponse.json({ error: error.message, fieldErrors: { [error.field]: error.message } }, { status: 400 });
  }
  return null;
}
