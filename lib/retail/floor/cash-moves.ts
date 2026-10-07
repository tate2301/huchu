import { Prisma, type RetailCashMovementReason, type RetailCashMovementType } from "@prisma/client";
import type { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { exceeds, money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditCashMoved } from "@/lib/retail/audit";
import { buildCashMovementAmounts, cashMovementDelta, totalFromDenominations } from "@/lib/retail/cash-up";
import { approvalFor, approverSchema, tillRuleResponse, type Approval } from "@/lib/retail/manager-pin";
import { latestZigRate, loadPaymentSettings, NoZigRate } from "@/lib/retail/payment-settings";
import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permission-matrix";
import type { PinPlace } from "@/lib/retail/till-pin-attempt";
import { formatMoney } from "@/lib/workspace/format";
import { postRetailJournal, type RetailAccountingResult } from "@/app/api/v2/retail/_helpers";

import type { ShiftSession } from "./shifts";

/**
 * Cash in or out of a drawer mid-shift (50-floor W-38, FLR-03): a drop to
 * the safe, petty cash paid out, or a float top-up for change. Every movement
 * is approved — by the person recording it when they hold
 * `retail.cash-control:approve`, else by a manager's PIN — and moves what the
 * drawer should hold by its base value. The back office
 * (`POST /api/v2/retail/shifts/[id]/cash-movements`) and the till
 * (`POST /api/v2/retail/pos/shifts/[id]/cash-movements`) both record through
 * `recordCashMove`.
 *
 * No "Pay a supplier" (98-decisions C-33): a requisition is paid from a money
 * account, never from a drawer.
 */

/** Two decimals or fewer; nine whole digits at most, so the drawer's numeric(14,2) figures cannot overflow. */
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const NOTE_MESSAGE = "Keep it to 200 characters.";
const AMOUNT_MESSAGE = "Give the amount, like 200.00.";

export const cashMoveInput = z.object({
  direction: z.enum(["OUT", "IN"]),
  why: z.enum(["DROP", "PETTY", "TOP_UP"]),
  amount: z.string().trim().regex(AMOUNT, AMOUNT_MESSAGE),
  currency: z.enum(["USD", "ZWG"]).default("USD"),
  note: z.string().trim().max(200).optional(),
  approver: approverSchema.optional().nullable(),
  /** The till's counted bundle, when it offers one; it must come to the amount. */
  denominations: z
    .array(z.object({ denomination: z.string().regex(AMOUNT), count: z.number().int().min(0).max(100000) }))
    .max(40)
    .optional()
    .nullable(),
});

export type CashMoveInput = z.infer<typeof cashMoveInput>;
export type CashMoveWhy = CashMoveInput["why"];

/** What each why is stored as, and which way it goes. */
export const CASH_MOVE_WHYS: Record<CashMoveWhy, { type: RetailCashMovementType; reasonCode: RetailCashMovementReason; direction: "OUT" | "IN" }> = {
  DROP: { type: "DROP_TO_SAFE", reasonCode: "CASH_LEVEL_TOO_HIGH", direction: "OUT" },
  PETTY: { type: "PAYOUT", reasonCode: "PETTY_CASH", direction: "OUT" },
  TOP_UP: { type: "FLOAT_TOP_UP", reasonCode: "CHANGE_REQUIRED", direction: "IN" },
};

/** A refusal in the sheet's words, under the field it belongs to. */
export class CashMoveRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly field?: "why" | "amt" | "cur" | "note",
  ) {
    super(message);
    this.name = "CashMoveRefused";
  }
}

export const APPROVAL_REASON = "A manager has to approve this.";

export type CashMoveResult = {
  movement: { id: string; type: RetailCashMovementType; amount: number; currency: string; delta: number; approvedByName: string };
  shift: { id: string; shiftNo: string; expectedCash: number };
  accounting: RetailAccountingResult;
};

export async function recordCashMove(input: {
  session: ShiftSession;
  shiftId: string;
  body: CashMoveInput;
  /** The till the approver typed their PIN at; none in the back office. */
  place?: PinPlace;
}): Promise<CashMoveResult> {
  const { session, body } = input;
  const companyId = session.user.companyId;

  const shift = await prisma.retailShift.findFirst({
    where: { id: input.shiftId, companyId },
    select: { id: true, shiftNo: true, status: true, cashierId: true, siteId: true, registerCode: true },
  });
  if (!shift) throw new CashMoveRefused(404, "Shift not found");

  // Your own drawer is selling; anyone else's is cash control.
  const [resource, action] =
    shift.cashierId === session.user.id ? (["retail.sell", "create"] as const) : (["retail.cash-control", "update"] as const);
  if (!canRetailSessionDo(session, resource, action)) {
    throw new CashMoveRefused(403, retailPermissionDenial(session, resource, action)!);
  }

  const kind = CASH_MOVE_WHYS[body.why];
  if (kind.direction !== body.direction) throw new CashMoveRefused(400, "Pick why the cash moved.", "why");
  if (shift.status !== "OPEN") throw new CashMoveRefused(409, `${shift.shiftNo} is closed.`);
  const note = body.note?.trim() || null;
  if (body.why === "PETTY" && (!note || note.length < 3)) throw new CashMoveRefused(400, "Say what it was for.", "note");

  const settings = await loadPaymentSettings(companyId);
  if (body.currency === "ZWG" && !settings.tenders.cashZig) throw new CashMoveRefused(400, "This shop does not take ZiG cash.", "cur");

  // The rate is the shop's own, stamped here; a client never sends one.
  let rate: Prisma.Decimal = new Prisma.Decimal(1);
  if (body.currency === "ZWG") {
    const zig = await latestZigRate(companyId);
    if (!zig) throw new NoZigRate();
    rate = new Prisma.Decimal(zig.value);
  }
  const amounts = buildCashMovementAmounts({ amount: body.amount, exchangeRate: rate });
  if (!exceeds(amounts.amount, 0)) throw new CashMoveRefused(400, AMOUNT_MESSAGE, "amt");

  const counted = (body.denominations ?? []).filter((line) => line.count > 0);
  if (counted.length > 0) {
    const total = totalFromDenominations(counted);
    if (!total.equals(amounts.amount)) {
      throw new CashMoveRefused(400, `The notes counted come to ${total.toFixed(2)}, not ${amounts.amount.toFixed(2)}.`, "amt");
    }
  }

  const delta = cashMovementDelta({ type: kind.type, baseAmount: amounts.baseAmount });
  const name = session.user.name || session.user.email || "Someone";

  // Every movement is approved. The attempt counter is written outside the transaction below.
  const approval: Approval =
    (await approvalFor({
      companyId,
      actorRole: session.user.role,
      decision: { needsApprover: true, reason: APPROVAL_REASON },
      approver: body.approver ?? null,
      can: ["retail.cash-control", "approve"],
      place: input.place ?? {},
    })) ?? { id: session.user.id, name };

  const actor = { companyId, userId: session.user.id, userName: name, userRole: session.user.role ?? null, userEmail: session.user.email ?? null };

  const { movement, expectedCash } = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ status: string; expectedCash: Prisma.Decimal }>>`
      SELECT "status", "expectedCash" FROM "RetailShift" WHERE "id" = ${shift.id} FOR UPDATE`;
    if (!locked || locked.status !== "OPEN") throw new CashMoveRefused(409, `${shift.shiftNo} is closed.`);
    const drawer = money(locked.expectedCash);
    if (delta.isNegative() && amounts.baseAmount.greaterThan(drawer)) {
      throw new CashMoveRefused(400, `Only ${formatMoney(toNumberOrZero(drawer))} should be in the drawer.`, "amt");
    }
    const created = await tx.retailCashMovement.create({
      data: {
        companyId,
        shiftId: shift.id,
        type: kind.type,
        reasonCode: kind.reasonCode,
        amount: amounts.amount,
        currency: body.currency,
        exchangeRate: amounts.exchangeRate,
        baseAmount: amounts.baseAmount,
        reason: note,
        denominations: counted.length > 0 ? { currency: body.currency, lines: counted } : Prisma.DbNull,
        recordedById: session.user.id,
        recordedByName: name,
        approvedById: approval.id,
        approvedByName: approval.name,
      },
    });
    const updated = await tx.retailShift.updateMany({
      where: { id: shift.id, companyId, status: "OPEN" },
      data: { expectedCash: { increment: delta } },
    });
    if (updated.count !== 1) throw new CashMoveRefused(409, `${shift.shiftNo} is closed.`);
    await auditCashMoved(tx, {
      actor,
      movementId: created.id,
      shiftId: shift.id,
      type: created.type,
      reasonCode: created.reasonCode,
      amount: created.amount,
      currency: created.currency,
      baseAmount: created.baseAmount,
      note,
      why: body.why,
      approvedBy: approval,
    });
    return { movement: created, expectedCash: drawer.plus(delta) };
  });

  const base = toNumberOrZero(amounts.baseAmount);
  const accounting = await postRetailJournal({
    companyId,
    sourceType: body.why === "PETTY" ? "RETAIL_PETTY_CASH" : "RETAIL_CASH_MOVEMENT",
    sourceId: movement.id,
    sourceSubtype: body.why === "PETTY" ? null : body.why,
    siteId: shift.siteId,
    registerCode: shift.registerCode,
    entryDate: movement.createdAt,
    description: `${JOURNAL_WORDS[body.why]} ${shift.shiftNo}`,
    createdById: session.user.id,
    actorRole: session.user.role ?? undefined,
    amount: base,
    netAmount: base,
    taxAmount: 0,
    grossAmount: base,
    // The till account the notes are in: dollars in 1000, ZiG in 1001.
    payload: { usd: body.currency === "USD" ? base : 0, zig: body.currency === "ZWG" ? base : 0 },
    invertDirection: body.why === "TOP_UP",
  });

  return {
    movement: {
      id: movement.id,
      type: movement.type,
      amount: toNumberOrZero(movement.amount),
      currency: movement.currency,
      delta: toNumberOrZero(delta),
      approvedByName: approval.name,
    },
    shift: { id: shift.id, shiftNo: shift.shiftNo, expectedCash: toNumberOrZero(expectedCash) },
    accounting,
  };
}

const JOURNAL_WORDS: Record<CashMoveWhy, string> = {
  DROP: "Cash to the safe",
  PETTY: "Petty cash",
  TOP_UP: "Float top-up",
};

/**
 * The answer both routes give (`shifts/[id]/cash-movements` in the back
 * office, `pos/shifts/[id]/cash-movements` at the till): 201 with the
 * movement and what the drawer should now hold, or the refusal in the sheet's
 * words — approvals as `tillRuleResponse` answers them (409 `needsApprover`,
 * `fieldErrors.pin`, 423 locked).
 */
export async function answerCashMove(input: {
  session: ShiftSession;
  shiftId: string;
  body: unknown;
  place?: PinPlace;
}): Promise<NextResponse> {
  const parsed = cashMoveInput.safeParse(input.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const top = String(issue?.path[0] ?? "");
    // A malformed approval lands under the manager's PIN, or the manager.
    const field = top === "approver" ? (issue?.path[1] === "pin" ? "pin" : "approver") : FIELD_OF[top];
    const message =
      field === "amt"
        ? AMOUNT_MESSAGE
        : field === "why"
          ? "Pick why the cash moved."
          : field === "cur"
            ? "Pick US$ or ZiG."
            : field === "note"
              ? NOTE_MESSAGE
              : (issue?.message ?? "Validation failed");
    return field ? fieldErrorResponse(message, { [field]: message }) : errorResponse(message, 400);
  }
  try {
    const result = await recordCashMove({ session: input.session, shiftId: input.shiftId, body: parsed.data, place: input.place });
    return successResponse(
      {
        data: {
          id: result.movement.id,
          type: result.movement.type,
          amount: result.movement.amount,
          currency: result.movement.currency,
          delta: result.movement.delta,
        },
        shift: { expectedCash: result.shift.expectedCash },
      },
      201,
    );
  } catch (error) {
    const approval = tillRuleResponse(error);
    if (approval) return approval;
    if (error instanceof CashMoveRefused) {
      return error.field ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status) : errorResponse(error.message, error.status);
    }
    if (error instanceof NoZigRate) return errorResponse(error.message, 409);
    throw error;
  }
}

const FIELD_OF: Record<string, "why" | "amt" | "cur" | "note" | undefined> = {
  direction: "why",
  why: "why",
  amount: "amt",
  currency: "cur",
  note: "note",
  denominations: "amt",
};
