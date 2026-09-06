import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { classHealthList } from "@/lib/schools/health";

const querySchema = z.object({
  classId: z.string().uuid().optional(),
  boardingOnly: z.coerce.boolean().optional(),
});

/**
 * The welfare list.
 *
 * `schools.boarding` rather than `schools.students`: this is medical
 * information about children, and the persona that should read it is the one
 * responsible for their welfare, not everybody who can see a class list.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
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
