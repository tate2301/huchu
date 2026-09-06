/**
 * Cash in and out of one shift's drawer.
 *
 * S-7.1. A sub-resource of the shift rather than a till-only route, because the
 * till and the back office ask the same question of it: the cashier records the
 * $200 the manager took to the safe, and the manager reviewing cash-up reads the
 * same list to see why `expectedCash` is $200 lower than the receipts say.
 *
 * ── Who may call it ────────────────────────────────────────────────────────
 *
 * Two acts, not one, and `lib/retail/permissions.ts` already distinguishes them:
 *
 * - **Your own drawer** is selling. A cashier carrying notes to the safe mid-shift
 *   is doing the job, and putting a manager in front of it would mean the shop
 *   either stops trading or stops recording — and the second is what produced the
 *   wrong number this ticket exists to fix. So `retail.sell`, `view` and `create`,
 *   which CASHIER has.
 * - **Somebody else's drawer** is cash control. A movement written onto another
 *   cashier's shift moves a figure that person is held to at cash-up. That is the
 *   supervisory half of a shift, which is what `retail.cash-control` is for and
 *   what CASHIER deliberately does not have.
 *
 * Which of the two applies is read off the shift row, so a caller cannot assert it.
 * `recordRetailCashMovementTransaction` re-checks ownership behind an explicit
 * `allowOtherCashiers` flag rather than trusting this file.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { toNumberOrZero } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import {
  RETAIL_CASH_MOVEMENT_REASON_CODES,
  RETAIL_CASH_MOVEMENT_TYPES,
} from "@/lib/retail/cash-movements";
import { cashMovementDelta, sumCashMovementDeltas } from "@/lib/retail/cash-up";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";
import { recordRetailCashMovementTransaction } from "../../../_services";

const cashMovementSchema = z.object({
  type: z.enum(RETAIL_CASH_MOVEMENT_TYPES),
  /**
   * Positive. The direction is the type's job — see `RetailCashMovementType`.
   * `multipleOf(0.01)` rather than a silent round: a till that sends thirds of a
   * cent has a bug, and swallowing it here is how that bug stays hidden.
   */
  amount: z.number().positive().multipleOf(0.01),
  currency: z.string().trim().min(3).max(8).optional().nullable(),
  exchangeRate: z.number().positive().optional().nullable(),
  reasonCode: z.enum(RETAIL_CASH_MOVEMENT_REASON_CODES),
  /** The free-text note. Compulsory behind `OTHER`; the service enforces that. */
  reason: z.string().trim().max(500).optional().nullable(),
  /**
   * The counted bundle. The denomination is a string because `0.1` is not
   * representable in binary and this gets multiplied and summed against a
   * `Decimal(14,2)` column. The service recomputes the total from these lines and
   * refuses a bundle that does not come to `amount`.
   */
  denominations: z
    .array(
      z.object({
        denomination: z.string().regex(/^\d+(\.\d{1,2})?$/),
        count: z.number().int().min(0).max(100000),
      }),
    )
    .max(40)
    .optional()
    .nullable(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const shift = await prisma.retailShift.findFirst({
    where: { id, companyId: session.user.companyId },
    select: { id: true, cashierId: true },
  });
  if (!shift) {
    return errorResponse("Shift not found", 404);
  }

  // Own drawer is selling; anyone else's is cash control. See the header.
  const gate =
    shift.cashierId === session.user.id
      ? requireRetailPermission(session, "retail.sell", "view")
      : requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const movements = await prisma.retailCashMovement.findMany({
    where: { companyId: session.user.companyId, shiftId: shift.id },
    orderBy: { createdAt: "asc" },
  });

  return successResponse({
    data: movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: toNumberOrZero(movement.amount),
      currency: movement.currency,
      exchangeRate: toNumberOrZero(movement.exchangeRate),
      baseAmount: toNumberOrZero(movement.baseAmount),
      /**
       * The signed effect on `expectedCash`, decided once here. A till and a
       * back-office table that each work out their own sign are two chances to get
       * it backwards.
       */
      delta: toNumberOrZero(cashMovementDelta(movement)),
      reasonCode: movement.reasonCode,
      reason: movement.reason,
      denominations: movement.denominations,
      recordedByName: movement.recordedByName,
      createdAt: movement.createdAt,
    })),
    summary: {
      shiftId: shift.id,
      count: movements.length,
      /** What the movements have collectively done to the drawer. */
      net: toNumberOrZero(sumCashMovementDeltas(movements)),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const shift = await prisma.retailShift.findFirst({
    where: { id, companyId: session.user.companyId },
    select: { id: true, cashierId: true },
  });
  if (!shift) {
    return errorResponse("Shift not found", 404);
  }

  const isOwnDrawer = shift.cashierId === session.user.id;
  // Recording a movement on your own drawer is part of selling. Recording one on
  // another cashier's drawer moves a figure they will answer for, so it takes the
  // cash-control grant instead.
  const gate = isOwnDrawer
    ? requireRetailPermission(session, "retail.sell", "create")
    : requireRetailPermission(session, "retail.cash-control", "update");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = cashMovementSchema.parse(body);

    const { movement, shift: updated } = await recordRetailCashMovementTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftId: shift.id,
      type: input.type,
      amount: input.amount,
      currency: input.currency ?? null,
      exchangeRate: input.exchangeRate ?? null,
      reasonCode: input.reasonCode,
      reason: input.reason ?? null,
      denominations: input.denominations ?? null,
      allowOtherCashiers: !isOwnDrawer,
    });

    return successResponse(
      {
        data: {
          id: movement.id,
          type: movement.type,
          amount: toNumberOrZero(movement.amount),
          currency: movement.currency,
          baseAmount: toNumberOrZero(movement.baseAmount),
          delta: toNumberOrZero(cashMovementDelta(movement)),
          reasonCode: movement.reasonCode,
          reason: movement.reason,
          denominations: movement.denominations,
          recordedByName: movement.recordedByName,
          createdAt: movement.createdAt,
        },
        // The recomputed figure, so the till can show the new expected cash without
        // a second round trip and without adding it up itself.
        shift: {
          id: updated.id,
          shiftNo: updated.shiftNo,
          openingFloat: toNumberOrZero(updated.openingFloat),
          expectedCash: toNumberOrZero(updated.expectedCash),
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts/[id]/cash-movements error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to record cash movement",
      400,
    );
  }
}
