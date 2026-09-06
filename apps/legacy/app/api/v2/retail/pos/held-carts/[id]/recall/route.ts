import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@/lib/retail/permissions";
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

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const cart = await prisma.retailHeldCart.findFirst({
    where: { id, companyId: session.user.companyId },
  });
  if (!cart) {
    return errorResponse("Held cart not found", 404);
  }
  if (cart.cashierId !== session.user.id) {
    return errorResponse("You can only recall your own held carts", 403);
  }
  if (cart.status !== "HELD") {
    return errorResponse("Held cart has already been recalled", 409);
  }

  const openShift = await prisma.retailShift.findFirst({
    where: {
      companyId: session.user.companyId,
      cashierId: session.user.id,
      status: "OPEN",
    },
    select: { id: true },
  });
  if (!openShift) {
    return errorResponse("Open shift not found for this cashier", 409);
  }
  if (openShift.id !== cart.shiftId) {
    return errorResponse("Held cart belongs to a different shift", 409);
  }

  const recalled = await prisma.retailHeldCart.updateMany({
    where: {
      id: cart.id,
      companyId: session.user.companyId,
      status: "HELD",
    },
    data: {
      status: "RECALLED",
    },
  });
  if (recalled.count !== 1) {
    return errorResponse("Held cart has already been recalled", 409);
  }

  const updated = await prisma.retailHeldCart.findUnique({
    where: { id: cart.id },
  });
  if (!updated) {
    return errorResponse("Held cart not found", 404);
  }

  return successResponse({ data: updated });
}
