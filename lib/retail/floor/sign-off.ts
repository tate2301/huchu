import type { RetailShiftSignOff } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { money, toNumberOrZero } from "@/lib/money";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, auditAmount, writeRetailAuditEvent } from "@/lib/retail/audit";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { needsSignOff } from "@/lib/reports/loaders/retail/floor";
import { createApprovalAction } from "@/lib/workflow/approvals";
import { formatMoney } from "@/lib/workspace/format";
import { postRetailJournal } from "@/app/api/v2/retail/_helpers";

import { OWN_DRAWER } from "./sign-off-words";
import type { ShiftSession } from "./shifts";

/**
 * Signing off a drawer that closed short, over or without a count (50-floor
 * W-40, FLR-05). A manager reads the shift and decides: accept it (the
 * difference stays in Cash differences, 5420, where the close booked it),
 * recover a shortage from the cashier (5420 back to zero, the shortage owed
 * to the shop on 1150), or look into it (not final: the drawer stays on the
 * overview until a later accept or recover).
 *
 * The final decision happens once: the update is guarded on the decision
 * still being open, so two managers signing off together leave one sign-off.
 * Nobody signs off their own drawer except the owner.
 */

export const signOffInput = z.object({
  outcome: z.enum(["ACCEPT", "RECOVER", "LOOK_INTO"], { message: "Choose what happens to it." }),
  note: z.string().trim().max(500, { message: "Keep it to 500 characters." }).optional(),
});

export type SignOffInput = z.infer<typeof signOffInput>;

export type SignOffResult = { shiftNo: string; outcome: RetailShiftSignOff; amount: string | null };

/** A refusal in the sheet's words: the status, the sentence, and the field it belongs under. */
export class SignOffRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly field?: "do" | "note",
  ) {
    super(message);
    this.name = "SignOffRefused";
  }
}

/** The cashier's first name, for "Note how Chipo agreed.". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export async function signOffShift(actor: ShiftSession, shiftId: string, input: SignOffInput): Promise<SignOffResult> {
  const denied = retailPermissionDenial(actor, "retail.cash-control", "approve");
  if (denied) throw new SignOffRefused(403, denied);
  const companyId = actor.user.companyId;

  const shift = await prisma.retailShift.findFirst({
    where: { id: shiftId, companyId },
    select: { id: true, shiftNo: true, status: true, cashierId: true, cashierName: true, countedCash: true, variance: true, signOffOutcome: true },
  });
  if (!shift) throw new SignOffRefused(404, "Shift not found");
  if (shift.cashierId === actor.user.id && actor.user.role !== "SUPERADMIN") throw new SignOffRefused(403, OWN_DRAWER);

  const uncounted = shift.countedCash === null || shift.variance === null;
  const variance = uncounted ? null : money(shift.variance!);
  if (shift.status !== "CLOSED" || (variance !== null && variance.isZero())) {
    throw new SignOffRefused(409, `${shift.shiftNo} has nothing to sign off.`);
  }
  if (!needsSignOff(shift)) throw new SignOffRefused(409, `${shift.shiftNo} is signed off already.`);

  const { outcome } = input;
  const note = input.note?.trim() || null;
  if (outcome === "RECOVER" && (variance === null || !variance.isNegative())) {
    throw new SignOffRefused(400, "Only a short drawer can be recovered.", "do");
  }
  if (outcome !== "ACCEPT" && (!note || note.length < 3)) {
    throw new SignOffRefused(
      400,
      outcome === "RECOVER" ? `Note how ${firstName(shift.cashierName)} agreed.` : "Say what you are looking into.",
      "note",
    );
  }

  const recoverAmount = outcome === "RECOVER" ? variance!.abs() : null;
  const signedOffAt = new Date();
  const amount = auditAmount(variance);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.retailShift.updateMany({
      where: { id: shift.id, companyId, status: "CLOSED", OR: [{ signOffOutcome: null }, { signOffOutcome: "LOOK_INTO" }] },
      data: { signOffOutcome: outcome, signedOffAt, signedOffById: actor.user.id, signOffNote: note, recoverAmount },
    });
    if (updated.count !== 1) throw new SignOffRefused(409, `${shift.shiftNo} is signed off already.`);
    if (outcome !== "LOOK_INTO") {
      await createApprovalAction(tx, {
        companyId,
        entityType: "RETAIL_SHIFT",
        entityId: shift.id,
        action: "APPROVE",
        actedById: actor.user.id,
        fromStatus: "CLOSED",
        toStatus: "SIGNED_OFF",
        note,
      });
    }
    await writeRetailAuditEvent(tx, {
      actor: { companyId, userId: actor.user.id, userName: actor.user.name ?? null, userRole: actor.user.role ?? null },
      eventType: RETAIL_AUDIT_EVENTS.shiftSignedOff,
      entityType: "RetailShift",
      entityId: shift.id,
      reason: note,
      payload: { shiftNo: shift.shiftNo, outcome, amount, note },
    });
  });

  // The close booked the shortage to 5420; recovering it moves it to what the cashier owes. Posted after the
  // commit like the close's journals: a posting lost here is found by backfillRetailAccounting (a RECOVER shift
  // with no recovery journal).
  if (recoverAmount) {
    const value = toNumberOrZero(recoverAmount);
    const closed = await prisma.retailShift.findUniqueOrThrow({ where: { id: shift.id }, select: { siteId: true, registerCode: true } });
    await postRetailJournal({
      companyId,
      sourceType: "RETAIL_SHIFT_RECOVERY",
      sourceId: shift.id,
      siteId: closed.siteId,
      registerCode: closed.registerCode,
      entryDate: signedOffAt,
      createdById: actor.user.id,
      actorRole: actor.user.role ?? undefined,
      description: `Retail shift recovery ${shift.shiftNo}`,
      amount: value,
      netAmount: value,
      grossAmount: value,
      taxAmount: 0,
    });
  }

  const figure = variance === null ? null : formatMoney(toNumberOrZero(variance.abs()));
  const said = outcome === "RECOVER" ? `${figure} to be recovered.` : outcome === "ACCEPT" ? (figure ? `${figure} written off.` : "Accepted.") : "Being looked into.";
  await emitRetailNotification({
    companyId,
    recipientIds: [shift.cashierId],
    type: "RETAIL_SHIFT_SIGNED_OFF",
    title: `${shift.shiftNo} signed off`,
    summary: note ? `${said} ${note}` : said,
    entityType: "RETAIL_SHIFT",
    entityId: shift.id,
    viewPath: `/retail/shifts/${shift.id}`,
    severity: outcome === "RECOVER" ? "WARNING" : "INFO",
  });

  return { shiftNo: shift.shiftNo, outcome, amount: recoverAmount ? recoverAmount.toFixed(2) : variance === null ? null : variance.toFixed(2) };
}

/** `POST /api/v2/retail/shifts/[id]/sign-off`: the result, or the refusal in the sheet's words. */
export async function answerSignOff(input: { session: ShiftSession; shiftId: string; body: unknown }): Promise<NextResponse> {
  const denied = retailPermissionDenial(input.session, "retail.cash-control", "approve");
  if (denied) return errorResponse(denied, 403);
  const parsed = signOffInput.safeParse(input.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] === "note" ? "note" : "do";
    // A note too long reads the schema's own sentence; a note that is not text says so.
    const message = field === "do" ? "Choose what happens to it." : issue?.code === "too_big" ? issue.message : "Write the note as text.";
    return fieldErrorResponse(message, { [field]: message });
  }
  try {
    return successResponse({ data: await signOffShift(input.session, input.shiftId, parsed.data) });
  } catch (error) {
    if (error instanceof SignOffRefused) {
      return error.field ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status) : errorResponse(error.message, error.status);
    }
    throw error;
  }
}

