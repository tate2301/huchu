import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { classHealthList } from "@/lib/schools/health";

const querySchema = z.object({
  classId: z.string().uuid().optional(),
  boardingOnly: z.coerce.boolean().optional(),
});

/**
 * The welfare list.
 *
 * `schools.welfare` rather than `schools.students`: this is medical information
 * about children, and the people who may read it are the ones responsible for
 * their welfare, not everybody who can see a class list. It is not
 * `schools.boarding` either — a day school has no boarding, and reading it as
 * boarding left such a school with no welfare list at all and the warden's
 * grant standing in for the nurse's.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.welfare", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      classId: searchParams.get("classId") ?? undefined,
      boardingOnly: searchParams.get("boardingOnly") ?? undefined,
    });

    const rows = await classHealthList({
      companyId: session.user.companyId,
      ...query,
    });
    return successResponse({ rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/health error:", error);
    return errorResponse("Failed to fetch the welfare list");
  }
}
