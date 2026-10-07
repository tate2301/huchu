/**
 * A manager approving, with their till PIN, what the person asking may not do
 * alone (C-31: the one manager-PIN module; SET-06 builds it, STK-04, FLR-02,
 * FLR-09 and CUS-10 use it).
 *
 * A request carries `approver: { userId, pin }`. The approver must be an
 * active person of the shop who holds the act's approve right
 * (`retail.sell:approve` for refunds, voids, discounts and the drawer), and the
 * four digits must match their `RetailTillPin`, with the till's lockout: five
 * wrong tries and it is locked (423) until somebody sends them a new PIN
 * (ADM-03, `checkTillPin`).
 *
 * The answers (C-31): 409 `{ error, needsApprover: true, reason }` when an
 * approval is missing or wrong — a wrong PIN and a person who may not approve
 * also say which field under `fieldErrors` — and 423 `{ error }` while the
 * approver's PIN is locked.
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

import { NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { prisma } from "@/lib/prisma";
import { canRetailRoleDo, type RetailAction, type RetailResource } from "@/lib/retail/permission-matrix";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { checkTillPin, type PinPlace } from "@/lib/retail/till-pin-attempt";
import { TillRuleRefused, type TillRuleDecision } from "@/lib/retail/till-rules";

export const approverSchema = z.object({
  userId: z.string().uuid({ message: "Pick a manager." }),
  pin: z.string().regex(/^\d{4}$/, { message: "Type the manager’s four-digit PIN." }),
});

export type ApproverInput = z.infer<typeof approverSchema>;

export type Approval = { id: string; name: string };

export const WRONG_PIN = "That PIN is not right.";
export const NOT_AN_APPROVER = "Pick someone who can approve this.";

/** 409: the rules ask for a manager and none (or nobody who may) was given. The till opens its PIN dialog. */
export class ApprovalNeeded extends Error {
  readonly status = 409;
  constructor(readonly reason: string) {
    super(reason);
    this.name = "ApprovalNeeded";
  }
}

/** A manager was given and refused: 409 under `pin` or `approver` (C-31), or 423 while their PIN is locked. */
export class ApprovalRefused extends Error {
  constructor(
    message: string,
    readonly status: 409 | 423,
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
  /** The till it was typed at, for the lock's event and notification; none in the admin. */
  place?: PinPlace;
  now?: Date;
}): Promise<Approval> {
  const [resource, action] = input.can ?? ["retail.sell", "approve"];
  const approver = await prisma.user.findFirst({
    where: { id: input.approver.userId, companyId: input.companyId, isActive: true, retailTillPin: { isNot: null } },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!approver || !canRetailRoleDo(approver.role, resource, action)) {
    throw new ApprovalRefused(NOT_AN_APPROVER, 409, "approver");
  }

  // A locked PIN is refused before any hashing, so a script cannot time the difference.
  const checked = await checkTillPin({
    companyId: input.companyId,
    userId: approver.id,
    pin: input.approver.pin,
    place: input.place ?? {},
    opens: false,
    now: input.now,
  });
  if (checked.decision === "NO_PIN") throw new ApprovalRefused(NOT_AN_APPROVER, 409, "approver");
  if (checked.decision === "LOCKED" || checked.decision === "REJECTED_NOW_LOCKED") throw new ApprovalRefused(TILL_PIN_LOCKED, 423, null);
  if (checked.decision !== "ACCEPTED") throw new ApprovalRefused(WRONG_PIN, 409, "pin");
  return { id: approver.id, name: approver.name || approver.email || "A manager" };
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
  /** The till the approver typed their PIN at. */
  place?: PinPlace;
}): Promise<Approval | null> {
  const [resource, action] = input.can ?? ["retail.sell", "approve"];
  if (!input.decision.needsApprover) return null;
  if (input.actorRole && canRetailRoleDo(input.actorRole, resource, action)) return null;
  if (!input.approver) throw new ApprovalNeeded(input.decision.reason);
  return verifyManagerPin({ companyId: input.companyId, approver: input.approver, can: input.can, place: input.place });
}

/**
 * The approval for an act the till did offline and sends in late: the money
 * has already moved, so it is never refused for want of a manager. An
 * approver it carries who checks out approves it, as at the counter;
 * otherwise, when the rules asked for one that the person did not hold, it
 * goes in with `review` for a manager to look at. A locked PIN is treated as
 * no approval.
 */
export async function replayApproval(input: {
  companyId: string;
  actorRole: string | null | undefined;
  decision: TillRuleDecision;
  approver?: ApproverInput | null;
  /** The till the queue came from. */
  place?: PinPlace;
  /** The review line, from the reason the rules asked. */
  review: (reason: string) => string;
}): Promise<{ approvedBy: Approval | null; review: string | null }> {
  try {
    return { approvedBy: await approvalFor(input), review: null };
  } catch (error) {
    if (!(error instanceof ApprovalNeeded || error instanceof ApprovalRefused) || !input.decision.needsApprover) throw error;
    return { approvedBy: null, review: input.review(input.decision.reason) };
  }
}

/**
 * The response for a refusal of the till rules or an approval, or null for
 * any other error: 409 `{ error, needsApprover: true, reason }` for a missing
 * or wrong approval (with `fieldErrors.pin` or `fieldErrors.approver` when one
 * was given and refused), 423 `{ error }` while the PIN is locked, 400
 * `{ error, fieldErrors }` for a reason not on the list.
 */
export function tillRuleResponse(error: unknown): NextResponse | null {
  if (error instanceof ApprovalNeeded) {
    markActivityFailed();
    return NextResponse.json({ error: error.reason, needsApprover: true, reason: error.reason }, { status: 409 });
  }
  if (error instanceof ApprovalRefused) {
    markActivityFailed();
    if (error.status === 423) return NextResponse.json({ error: error.message }, { status: 423 });
    return NextResponse.json(
      {
        error: error.message,
        needsApprover: true,
        reason: error.message,
        ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}),
      },
      { status: 409 },
    );
  }
  if (error instanceof TillRuleRefused) {
    markActivityFailed();
    return NextResponse.json({ error: error.message, fieldErrors: { [error.field]: error.message } }, { status: 400 });
  }
  return null;
}
