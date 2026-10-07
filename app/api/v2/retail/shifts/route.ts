import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { openShift, shiftRefusal } from "@/lib/retail/floor/shifts";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { openShiftSchema } from "@/lib/retail/shift-open-rules";
import { requireRetailSession } from "../_helpers";

/**
 * Open a shift from the back office (`?sheet=shift-open`, 50-floor W-37).
 * `cashierId` opens it for somebody else: a manager opening the drawer for a
 * cashier. The shift's cashier is that person; the audit event's actor is the
 * caller. `openShift` (`lib/retail/floor/shifts.ts`) holds every rule.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Opening a drawer, with its float. `open-shift`, not `create`.
  const gate = requireRetailPermission(session, "retail.sell", "open-shift");
  if (gate) return gate;

  const parsed = openShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("Validation failed", 400, parsed.error.issues);
  }
  const input = parsed.data;

  try {
    const { shift } = await openShift({
      session,
      registerId: input.registerId,
      cashierId: input.cashierId,
      openingFloat: input.openingFloat,
      openingFloatZig: input.openingFloatZig,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });
    return successResponse(
      { data: { id: shift.id, shiftNo: shift.shiftNo, registerName: shift.registerName, cashierName: shift.cashierName } },
      201,
    );
  } catch (error) {
    return shiftRefusal(error);
  }
}
