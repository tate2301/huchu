/**
 * Choose your own till PIN (80-admin 4.1, 5.14): after an issued PIN opened
 * the till ("Choose your own PIN"), or from the till's settings (Change my
 * PIN). `lib/retail/till-pin-attempt.ts` `chooseTillPin` holds the rules.
 *
 * 400 `fieldErrors.newPin` (`tillPinDenial`, or the PIN they were sent),
 * 400 `fieldErrors.currentPin` "That PIN is not right.", 423 while locked.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TillPinRefused, chooseTillPin, registerNameOf } from "@/lib/retail/till-pin-attempt";
import { requireRetailSession } from "../../../_helpers";

const changeSchema = z.object({
  currentPin: z.string().max(12).optional().nullable(),
  newPin: z.string().max(12),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fieldErrorResponse("Validation failed", { newPin: "Type four digits." });

  try {
    const result = await chooseTillPin({
      companyId: session.user.companyId,
      userId: session.user.id,
      userName: session.user.name ?? null,
      userRole: session.user.role ?? null,
      currentPin: parsed.data.currentPin,
      newPin: parsed.data.newPin,
      openedByIssuedPin: session.user.pinMustChange === true,
      place: { registerName: await registerNameOf(session.user.companyId, session.user.registerId) },
    });
    return successResponse({ data: result });
  } catch (error) {
    if (error instanceof TillPinRefused) {
      if (error.field) return fieldErrorResponse("Validation failed", { [error.field]: error.message });
      return errorResponse(error.message, error.status);
    }
    // Not echoed: an exception raised while a PIN is in scope must not reach a log with the digits.
    console.error("[API] POST /api/v2/retail/pos/pin/change failed");
    return errorResponse("That did not work. Your PIN is unchanged; try again.");
  }
}
