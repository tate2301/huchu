import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../../../_helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { id } = await params;
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
