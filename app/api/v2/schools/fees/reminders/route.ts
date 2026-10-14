import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { remindersPage } from "@/lib/schools/fee-reminders";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Remind families (PageVaneSchool): the fee reminder Vane drafted, waiting
 * for a person, with each family and what they owe now. Read only: sending is
 * approving Vane's action (`POST /api/vane/actions/[id]`), as the person.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const denied = schoolPermissionDenial(session, "schools.reports", "notify-families");
    if (denied) return errorResponse(denied, 403);
    return successResponse(await remindersPage(session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees/reminders error:", error);
    return errorResponse("Could not read the reminders");
  }
}
