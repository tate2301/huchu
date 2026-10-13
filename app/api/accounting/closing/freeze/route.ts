import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { setClosingControls } from "@/lib/accounting/closing";

/** The closing controls on Periods: the freeze date, who may post before it, and retained earnings. */
const schema = z.object({
  freezeBeforeDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  periodLockPolicy: z.enum(["STRICT", "MANAGER_OVERRIDE", "SOFT_WARN"]).optional(),
  retainedEarningsAccountId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const settings = await setClosingControls({
      companyId: session.user.companyId,
      freezeBeforeDate:
        validated.freezeBeforeDate === undefined ? undefined : validated.freezeBeforeDate ? new Date(validated.freezeBeforeDate) : null,
      periodLockPolicy: validated.periodLockPolicy,
      retainedEarningsAccountId: validated.retainedEarningsAccountId,
    });

    return successResponse(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/closing/freeze error:", error);
    return errorResponse("Failed to update the closing controls");
  }
}
