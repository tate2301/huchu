import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  requireRetailSession,
} from "../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { openRetailShiftTransaction } from "../../_services";

const openPosShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  registerId: z.string().uuid(),
  openingFloat: z.number().min(0).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  try {
    const body = await request.json();
    const input = openPosShiftSchema.parse(body);
    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftNo: input.shiftNo ?? null,
      siteId: input.siteId,
      registerId: input.registerId,
      openingFloat: input.openingFloat ?? 0,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/pos/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
