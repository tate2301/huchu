/**
 * Unlocking a till that is already signed in.
 *
 * The session is already open — `requireRetailSession` has just proved it —
 * so this endpoint grants nothing. It answers one question: are these the four
 * digits that turn the lock screen off. It issues no token, sets no cookie, and
 * changes no permission.
 *
 * The lockout is ADM-03's (`checkTillPin`): five wrong in a row lock the PIN
 * until somebody sends a new one, 423 "Too many tries. Ask a manager to send
 * you a new PIN." with no time-out. The lock is checked **before** bcrypt runs.
 *
 * A right PIN that was issued answers `mustChange: true`: the lock screen
 * stays shut and the till asks the person to choose their own.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { TILL_PIN_LOCKED } from "@/lib/retail/till-pin";
import { pinPlaceOf } from "@/lib/retail/devices";
import { checkTillPin } from "@/lib/retail/till-pin-attempt";
import { requireRetailSession } from "../../../_helpers";

const unlockSchema = z.object({
  pin: z.string().min(1).max(12),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // The lock is a screen over an already-authenticated till; the row is the caller's own.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const parsed = unlockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Type your four-digit PIN.", 400);

  try {
    const checked = await checkTillPin({
      companyId: session.user.companyId,
      userId: session.user.id,
      pin: parsed.data.pin,
      place: await pinPlaceOf(request, session),
      opens: true,
    });
    if (checked.decision === "NO_PIN") return errorResponse("No PIN is set for this account.", 409);
    // An issued PIN does not open the till: the person chooses their own first (5.14).
    if (checked.decision === "ACCEPTED") return successResponse({ ok: true, mustChange: checked.mustChange });
    if (checked.decision === "LOCKED" || checked.decision === "REJECTED_NOW_LOCKED") {
      return errorResponse(TILL_PIN_LOCKED, 423, { attemptsRemaining: 0 });
    }
    return errorResponse("That PIN is not right.", 401, { attemptsRemaining: checked.attemptsRemaining });
  } catch {
    console.error("[API] POST /api/v2/retail/pos/pin/unlock failed");
    return errorResponse("Could not check that PIN");
  }
}
