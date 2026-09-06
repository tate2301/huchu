import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { goalsOversight } from "@/lib/schools/goals-meetings";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

/**
 * Who has a target this term, and who has been missed.
 *
 * `/api/v2/schools/goals` answers for one named child, which is what a pupil's
 * portal and a teacher's meeting need. This one reads the roll, so the pupils
 * nobody has set anything for are rows rather than silence. It needs the
 * students grant for the same reason the named-child call does: it names every
 * child in the school.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(
      Object.fromEntries(
        ["termId", "classId", "subjectId"]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined),
      ),
    );

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const oversight = await goalsOversight({
      companyId,
      termId,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    });

    return successResponse({ termId, ...oversight });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/goals/oversight error:", error);
    return errorResponse("Failed to load the goals overview");
  }
}
