import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";
import { closeRetailShiftTransaction } from "../../../_services";

const closeShiftSchema = z.object({
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

  // R-2.4. Cashing up is `close-shift`, the action the matrix carved out of
  // `update` precisely because a shift is a cash drawer rather than a record.
  // Whose drawer it is stays a row-level question, enforced below.
  const gate = requireRetailPermission(session, "retail.sell", "close-shift");
  if (gate) return gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const input = closeShiftSchema.parse(body);
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
      allowManagerClose: true,
    });

    return successResponse({ ...shift, ...accounting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts/[id]/close error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to close shift", 400);
  }
}
