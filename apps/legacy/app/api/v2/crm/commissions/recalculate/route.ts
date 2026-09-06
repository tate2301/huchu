import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { recalculatePeriod } from "@corelithzw/module-crm/commission-recalc";
import { requireCrmCapability } from "../../_helpers";

const bodySchema = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/),
  repId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "commissions.manage")) return errorResponse("Manager access required", 403);

    const { periodKey, repId } = bodySchema.parse(await request.json());
    const result = await recalculatePeriod({
      companyId: session.user.companyId,
      periodKey,
      repId: repId ?? null,
    });
    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/commissions/recalculate error:", error);
    return errorResponse("Failed to recalculate commissions");
  }
}
