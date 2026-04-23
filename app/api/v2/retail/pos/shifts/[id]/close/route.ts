import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRetailSession } from "../../../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { closeRetailShiftTransaction } from "../../../../_services";

const closePosShiftSchema = z.object({
  countedCash: z.number().min(0),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const input = closePosShiftSchema.parse(body);
    const { shift, accounting } = await closeRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftId: id,
      countedCash: input.countedCash,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
      allowManagerClose: false,
    });

    return successResponse({ ...shift, ...accounting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/pos/shifts/[id]/close error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to close shift", 400);
  }
}
