/**
 * Discarding a held sale: the customer is not coming back.
 *
 * Nothing was paid and no stock moved while it was held, so there is nothing to
 * undo. The cart is marked `RELEASED` with who and when, and leaves the Held list.
 * Irreversible, so the till asks first; a cashier discards their own, a manager anyone's.
 */

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@/lib/prisma";
import { requirePosDevice } from "@/lib/retail/devices";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../../_helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;

  const cart = await prisma.retailHeldCart.findFirst({
    where: { id, companyId: session.user.companyId },
    select: { id: true, holdNo: true, cashierId: true },
  });
  if (!cart) {
    return errorResponse("Held sale not found", 404);
  }
  if (cart.cashierId !== session.user.id && !canRetailSessionDo(session, "retail.sell", "approve")) {
    return errorResponse("Only the cashier who held it, or a manager, can discard it.", 403);
  }

  const released = await prisma.retailHeldCart.updateMany({
    where: { id: cart.id, companyId: session.user.companyId, status: "HELD" },
    data: { status: "RELEASED", releasedAt: new Date(), releasedById: session.user.id },
  });
  if (released.count !== 1) {
    return errorResponse(`${cart.holdNo} is no longer held.`, 409);
  }

  return successResponse({ data: { id: cart.id, holdNo: cart.holdNo, status: "RELEASED" } });
}
