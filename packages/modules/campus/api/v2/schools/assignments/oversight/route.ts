import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "../../../../../permissions";
import { getCurrentTerm } from "../../../../../calendar";
import { assignmentOversight } from "../../../../../assignments";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  teacherProfileId: z.string().uuid().optional(),
});

/**
 * Every piece of homework in the term, school-wide, with the roll beside it.
 *
 * A separate route from `/api/v2/schools/assignments` rather than a flag on it,
 * because it answers a different question and pays a different price for the
 * answer: two extra aggregates to put "handed in of on roll" on every row. The
 * teacher's list does not need them and the child's portal must not pay for
 * them, so the office's question lives where the office asks it.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(
      Object.fromEntries(
        ["termId", "classId", "subjectId", "teacherProfileId"]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined),
      ),
    );

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const oversight = await assignmentOversight({
      companyId,
      termId,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.teacherProfileId
        ? { teacherProfileId: query.teacherProfileId }
        : {}),
    });

    return successResponse({ termId, ...oversight });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/assignments/oversight error:", error);
    return errorResponse("Failed to load the homework overview");
  }
}
