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

  const updated = await prisma.retailHeldCart.update({
    where: { id: cart.id },
    data: {
      status: "RECALLED",
    },
  });

  return successResponse({ data: updated });
}
