/**
 * Cash in and out of one shift's drawer (50-floor W-38, FLR-03).
 *
 * GET lists the movements; POST records one through `recordCashMove`
 * (`lib/retail/floor/cash-moves.ts`), the same service and body the till's
 * `pos/shifts/[id]/cash-movements` uses. Your own drawer is selling
 * (`retail.sell`), anyone else's is cash control; the service decides which
 * from the shift row, and every movement is approved by a manager's PIN or by
 * the person recording it when they hold `retail.cash-control:approve`.
 */

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { cashMovementDelta, sumCashMovementDeltas } from "@/lib/retail/cash-up";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";
import { answerCashMove } from "@/lib/retail/floor/cash-moves";

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
      approvedByName: movement.approvedByName,
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
  // The door: recording cash is selling. Whose drawer it is (own `retail.sell`,
  // anybody else's `retail.cash-control:update`) is the service's to decide.
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const body = await request.json().catch(() => null);
  return answerCashMove({ session, shiftId: path.data.id, body });
}
