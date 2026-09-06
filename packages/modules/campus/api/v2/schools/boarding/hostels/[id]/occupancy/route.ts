import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "../../../../../../../permissions";
import { AllocationRefusedError, hostelOccupancy } from "../../../../../../../boarding";

/**
 * Every bed in a hostel and who is in it.
 *
 * Built from the beds outward, so an empty bed is a row rather than an absence
 * — which is the only thing a warden with a new boarder standing in front of
 * them is looking for.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const board = await hostelOccupancy({
      companyId: session.user.companyId,
      hostelId: id,
    });
    return successResponse(board);
  } catch (error) {
    if (error instanceof AllocationRefusedError) {
      return errorResponse(error.message, 404);
    }
    console.error(
      "[API] GET /api/v2/schools/boarding/hostels/[id]/occupancy error:",
      error,
    );
    return errorResponse("Failed to fetch the bed board");
  }
}
