import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { planShiftOpen } from "@/lib/retail/shift-open";
import { FLOAT_MESSAGE, openShiftSchema } from "@/lib/retail/shift-open-rules";
import { requireRetailSession } from "../_helpers";
import { ShiftElsewhere, openRetailShiftTransaction } from "../_services";

/**
 * Open a shift from the back office (`?sheet=shift-open`, 00-foundations
 * 5.7.8). `cashierId` opens it for somebody else: a manager opening the drawer
 * for a cashier. The shift's cashier is that person; the audit event's actor
 * is the caller.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Opening a drawer, with its float. `open-shift`, not `create`.
  const gate = requireRetailPermission(session, "retail.sell", "open-shift");
  if (gate) return gate;

  let input: z.infer<typeof openShiftSchema>;
  try {
    input = openShiftSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some((issue) => issue.path[0] === "openingFloat")) {
      return fieldErrorResponse(FLOAT_MESSAGE, { float: FLOAT_MESSAGE });
    }
    return errorResponse("Validation failed", 400, error instanceof z.ZodError ? error.issues : undefined);
  }

  try {
    const planned = await planShiftOpen({ session, registerId: input.registerId, cashierId: input.cashierId });
    if ("refused" in planned) {
      const { status, error, field } = planned.refused;
      return status === 400 && field ? fieldErrorResponse(error, { [field]: error }) : errorResponse(error, status);
    }
    const { register, cashier } = planned.plan;

    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      siteId: register.siteId,
      registerId: register.id,
      openingFloat: input.openingFloat,
      periodOverrideReason: input.periodOverrideReason ?? null,
      cashier,
    });

    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    if (error instanceof ShiftElsewhere) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/retail/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
